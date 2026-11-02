import { Injectable, computed, signal } from '@angular/core';
import { FiscalLineInput, VcrPayment, VcrPosition } from '../utils/vcr-receipt';

/**
 * REGOS: VCR — the virtual cash register (Windows program + fiscal module) that signs
 * receipts and sends them to the Tax Committee (OFD). It also runs Click Pass / Payme
 * Go / Uzum / terminal payments. JSON-RPC 2.0 over HTTP.
 * Docs: https://docs.regos.uz/ru/regos-vcr/operations/api-interface
 *
 * VCR runs on the shop's computer, so its address and the cashier login are stored on
 * this device only (each till has its own VCR), never in Firestore.
 */
const STORAGE_KEY = 'markethisob_fiscal_vcr';
/** VCR answers "busy" while another operation runs; the docs say to retry. */
const BUSY = 704042;

export interface FiscalConfig {
  enabled: boolean;
  /** VCR API address (or the local bridge in front of it), e.g. http://127.0.0.1:18347 */
  url: string;
  login: string;
  password: string;
}

export const DEFAULT_FISCAL_CONFIG: FiscalConfig = { enabled: false, url: 'http://127.0.0.1:18347', login: '', password: '' };

/** What a fiscal receipt returns; kept on the sale so returns and the receipt can use it. */
export interface FiscalReceipt {
  id: string;
  amount: number;
  qrCodeUrl: string;
  terminalId: string;
  receiptNo: string;
  fiscalSign: string;
  dateTime: string;
}

export interface PaymentSystem {
  id: number;
  code: string;
  name: string;
  /** Payment.Get statuses that mean "paid" / "failed" (from the system's polling contract). */
  success: number[];
  failure: number[];
  needsToken: boolean;
}

export interface VcrPaymentState {
  id: string;
  status: number;
  amount: number;
  qrText?: string;
  pollAfter?: number;
  needsToken?: boolean;
}

export class FiscalError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
  }
}

function load(): FiscalConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_FISCAL_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_FISCAL_CONFIG };
  } catch {
    return { ...DEFAULT_FISCAL_CONFIG };
  }
}

/** Pulls a readable message and numeric code out of VCR's error object (format varies). */
export function vcrError(result: unknown): FiscalError {
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    // VCR answers { error: 704016, description: "…" }; other shapes are tolerated too.
    const code = Number(r['error'] ?? r['code'] ?? r['Code'] ?? r['error_code'] ?? NaN);
    const message = String(r['description'] ?? r['message'] ?? r['Message'] ?? (typeof r['error'] === 'string' ? r['error'] : null) ?? JSON.stringify(result));
    return new FiscalError(Number.isFinite(code) ? `${code}: ${message}` : message, Number.isFinite(code) ? code : undefined);
  }
  const text = String(result ?? 'VCR error');
  const code = Number(/(\d{6})/.exec(text)?.[1]);
  return new FiscalError(text, Number.isFinite(code) ? code : undefined);
}

/** HTTP Basic-style `auth` value; UTF-8 safe (a Cyrillic password must not break btoa). */
export function vcrAuth(login: string, password: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(`${login}:${password}`)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * An https page may not call a plain-http address on another computer (the browser
 * blocks it as mixed content). Only this computer (127.0.0.1 / localhost) is allowed —
 * so a remote or test VCR has to go through the local bridge.
 */
export function blockedAsMixedContent(url: string, pageProtocol = typeof location === 'undefined' ? 'https:' : location.protocol): boolean {
  try {
    const u = new URL(url);
    return pageProtocol === 'https:' && u.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}

@Injectable({ providedIn: 'root' })
export class FiscalService {
  readonly config = signal<FiscalConfig>(load());
  readonly enabled = computed(() => this.config().enabled && !!this.config().url && !!this.config().login);
  private requestId = 0;
  /** VCR handles one request at a time; calls are queued. */
  private queue: Promise<unknown> = Promise.resolve();

  saveConfig(config: FiscalConfig) {
    this.config.set({ ...config, url: config.url.trim().replace(/\/+$/, '') });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config()));
    } catch {
      // Private mode etc.: works for this session only.
    }
  }

  call<T>(method: string, params: unknown = null, config = this.config()): Promise<T> {
    const run = () => this.send<T>(method, params, config);
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async send<T>(method: string, params: unknown, config: FiscalConfig, attempt = 0): Promise<T> {
    if (blockedAsMixedContent(config.url)) throw new FiscalError('VCR_UNREACHABLE');
    let response: Response;
    try {
      response = await fetch(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=utf-8' },
        body: JSON.stringify({ id: ++this.requestId, jsonrpc: '2.0', method, params, auth: vcrAuth(config.login, config.password) }),
        signal: AbortSignal.timeout(60_000)
      });
    } catch {
      throw new FiscalError('VCR_UNREACHABLE');
    }
    let body: { ok?: boolean; result?: unknown };
    try {
      body = await response.json();
    } catch {
      throw new FiscalError(`HTTP ${response.status}`);
    }
    if (body.ok) return body.result as T;
    const err = vcrError(body.result);
    if (err.code === BUSY && attempt < 5) {
      await new Promise((r) => setTimeout(r, 1000));
      return this.send<T>(method, params, config, attempt + 1);
    }
    throw err;
  }

  /** Checks VCR is reachable, logged in and the fiscal module is ready. */
  initialize(config = this.config()) {
    return this.call<{ TerminalID: string; ReceiptCount: number; ReceiptMaxCount: number; ZReportCount: number; ZReportMaxCount: number }>(
      'Sys.Initialize',
      null,
      config
    );
  }

  zReportInfo() {
    return this.call<{ OpenTime: string; CloseTime: string; Number: number }>('ZReport.GetInfo', { PrintReceipt: false });
  }

  /** Opens the fiscal shift unless one is already open. */
  async openShift(): Promise<void> {
    const info = await this.zReportInfo();
    if (info.OpenTime && !info.CloseTime) return;
    await this.call('ZReport.Open');
  }

  /** Closes the fiscal shift (prints the Z-report on the VCR printer). */
  async closeShift(): Promise<void> {
    const info = await this.zReportInfo();
    if (!info.OpenTime || info.CloseTime) return;
    await this.call('ZReport.Close');
  }

  private static toReceipt(r: Record<string, unknown>): FiscalReceipt {
    return {
      id: String(r['Id'] ?? r['id'] ?? ''),
      amount: Number(r['Amount'] ?? 0),
      qrCodeUrl: String(r['QRCodeURL'] ?? ''),
      terminalId: String(r['TerminalID'] ?? ''),
      receiptNo: String(r['ReceiptNo'] ?? ''),
      fiscalSign: String(r['FiscalSign'] ?? ''),
      dateTime: String(r['DateTime'] ?? '')
    };
  }

  async sale(opts: { code: string; positions: VcrPosition[]; payments: VcrPayment[]; cashierName?: string; sessionCode?: string; phone?: string }): Promise<FiscalReceipt> {
    const result = await this.call<Record<string, unknown>>('Receipt.Sale', {
      code: opts.code,
      ...(opts.cashierName ? { cashier_name: opts.cashierName } : {}),
      ...(opts.sessionCode ? { session_code: opts.sessionCode } : {}),
      ...(opts.phone ? { phone: opts.phone } : {}),
      positions: opts.positions,
      payments: opts.payments
    });
    return FiscalService.toReceipt(result);
  }

  /**
   * Credit receipt (Receipt.Credit) for a repayment of goods sold on debt. The goods
   * were already fiscalised by the sale receipt; this one is not registered in the
   * fiscal module and can't use payment systems (cash or card only).
   */
  async credit(opts: { code: string; positions: VcrPosition[]; payments: VcrPayment[]; cashierName?: string; phone?: string }): Promise<{ id: string }> {
    const result = await this.call<Record<string, unknown>>('Receipt.Credit', {
      code: opts.code,
      ...(opts.cashierName ? { cashier_name: opts.cashierName } : {}),
      ...(opts.phone ? { phone: opts.phone } : {}),
      positions: opts.positions,
      payments: opts.payments
    });
    return { id: String(result?.['id'] ?? result?.['Id'] ?? '') };
  }

  async refund(opts: { code: string; positions: VcrPosition[]; payments: VcrPayment[]; original: FiscalReceipt; cashierName?: string }): Promise<FiscalReceipt> {
    const result = await this.call<Record<string, unknown>>('Receipt.Refund', {
      code: opts.code,
      ...(opts.cashierName ? { cashier_name: opts.cashierName } : {}),
      positions: opts.positions,
      payments: opts.payments,
      refund_info: { QRCodeURL: opts.original.qrCodeUrl }
    });
    return FiscalService.toReceipt(result);
  }

  // ---------------------------------------------------------------- payment systems

  /** Click Pass, Payme Go, Uzum, terminals… that this VCR has switched on and set up. */
  async paymentSystems(): Promise<PaymentSystem[]> {
    const result = await this.call<{ systems?: Record<string, unknown>[] }>('Payment.Systems.Get', {});
    return (result.systems ?? [])
      .filter((s) => s['available'] === true)
      .map((s) => {
        const ops = (s['operations'] as Record<string, unknown>[] | undefined) ?? [];
        const start = ops.find((o) => o['method'] === 'Payment.Start');
        const polling = (start?.['polling'] as Record<string, unknown> | undefined) ?? {};
        const required = (start?.['required_fields'] as string[] | undefined) ?? [];
        return {
          id: Number(s['payment_system_id']),
          code: String(s['code'] ?? ''),
          name: String(s['name'] ?? ''),
          success: ((polling['success_statuses'] as number[] | undefined) ?? [3]).map(Number),
          failure: ((polling['failure_statuses'] as number[] | undefined) ?? [-1, 7, 8]).map(Number),
          needsToken: required.includes('token'),
          sort: Number(s['sort_order'] ?? 0),
          hasStart: !!start
        };
      })
      .filter((s) => s.hasStart)
      .sort((a, b) => a.sort - b.sort)
      .map(({ sort: _sort, hasStart: _hasStart, ...s }) => s);
  }

  private static toPayment(r: Record<string, unknown>): VcrPaymentState {
    const confirmation = r['confirmation'] as { type?: string; required?: boolean } | undefined;
    return {
      id: String(r['id'] ?? ''),
      status: Number(r['status'] ?? 0),
      amount: Number(r['amount'] ?? 0),
      qrText: (r['qr_text'] as string | undefined) || undefined,
      pollAfter: Number(r['poll_after'] ?? 2),
      needsToken: confirmation?.type === 'token' && !!confirmation.required
    };
  }

  /** Starts a payment; `externalId` makes a retry safe (same id → same payment). */
  async startPayment(systemId: number, amountTiyin: number, externalId: string, token?: string): Promise<VcrPaymentState> {
    const r = await this.call<Record<string, unknown>>('Payment.Start', {
      payment_system_id: systemId,
      amount: amountTiyin,
      external_id: externalId,
      ...(token ? { token } : {})
    });
    return FiscalService.toPayment(r);
  }

  async confirmPayment(paymentId: string, token: string): Promise<VcrPaymentState> {
    return FiscalService.toPayment(await this.call<Record<string, unknown>>('Payment.Confirm', { payment_id: paymentId, token }));
  }

  async getPayment(paymentId: string): Promise<VcrPaymentState> {
    return FiscalService.toPayment(await this.call<Record<string, unknown>>('Payment.Get', { payment_id: paymentId }));
  }

  async cancelPayment(paymentId: string): Promise<void> {
    await this.call('Payment.Cancel', { payment_id: paymentId });
  }
}

export type { FiscalLineInput };
