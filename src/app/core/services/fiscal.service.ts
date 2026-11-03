import { Injectable, computed, signal } from '@angular/core';
import { FiscalLine, FiscalPayment, MoneyMethod } from '../utils/fiscal-receipt';

/**
 * The fiscal agent: a Windows service on this computer (fiscal-agent/) that signs receipts
 * and sends them to the Tax Committee through whichever provider it is set up with. It
 * also runs Click Pass / Payme Go / Uzum / terminal payments. This is the only fiscal API
 * the app knows; the provider and its login stay inside the agent.
 *
 * Whether this till sends receipts is stored on this device only, never in Firestore.
 */
const AGENT_URL = 'http://127.0.0.1:18348/v1';
const STORAGE_KEY = 'markethisob_fiscal';
/** Held the VCR address and password before the agent existed. */
const LEGACY_STORAGE_KEY = 'markethisob_fiscal_vcr';
/** Longer than the agent's own limit, so it is the agent that reports a stuck register. */
const REQUEST_TIMEOUT_MS = 90_000;

export interface FiscalConfig {
  enabled: boolean;
}

export const DEFAULT_FISCAL_CONFIG: FiscalConfig = { enabled: false };

/** What a fiscal receipt returns; kept on the sale so returns and the receipt can use it. */
export interface FiscalReceipt {
  /** Missing on receipts from before the agent: those are REGOS. */
  provider?: string;
  id: string;
  amount: number;
  /** These three are empty when the provider keeps them to the paper receipt (REGOS does). */
  qrCodeUrl: string;
  terminalId: string;
  receiptNo: string;
  fiscalSign: string;
  dateTime: string;
}

export interface FiscalStatus {
  provider: string;
  terminalId: string;
  receiptCount: number;
  receiptMaxCount: number;
  zReportCount: number;
  zReportMaxCount: number;
}

export interface PaymentSystem {
  id: number;
  code: string;
  name: string;
  /** Payment statuses that mean "paid" / "failed". */
  success: number[];
  failure: number[];
  needsToken: boolean;
}

export interface FiscalPaymentState {
  id: string;
  status: number;
  amountTiyin: number;
  qrText?: string;
  pollAfter?: number;
  needsToken?: boolean;
}

export class FiscalError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

/** The agent isn't running on this computer. */
const AGENT_UNREACHABLE = 'AGENT_UNREACHABLE';
const ERROR_KEYS: Record<string, string> = {
  [AGENT_UNREACHABLE]: 'fiscal.agentUnreachable',
  PROVIDER_UNREACHABLE: 'fiscal.unreachable',
  NOT_CONFIGURED: 'fiscal.notConfigured',
  RECEIPT_UNCONFIRMED: 'fiscal.unconfirmed',
  WRONG_RECEIPT: 'fiscal.wrongReceipt'
};

/** What to tell the cashier: our own words for known failures, else the register's message. */
export function fiscalErrorText(err: Error, translate: (key: string) => string): string {
  const key = err instanceof FiscalError && err.code ? ERROR_KEYS[err.code] : undefined;
  return key ? translate(key) : err.message;
}

function load(): FiscalConfig {
  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy !== null) {
      // Only the on/off choice carries over: the password must not stay in the browser.
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      const config = { enabled: !!JSON.parse(legacy)?.enabled };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      return config;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_FISCAL_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_FISCAL_CONFIG };
  } catch {
    return { ...DEFAULT_FISCAL_CONFIG };
  }
}

@Injectable({ providedIn: 'root' })
export class FiscalService {
  readonly config = signal<FiscalConfig>(load());
  readonly enabled = computed(() => this.config().enabled);

  saveConfig(config: FiscalConfig) {
    this.config.set(config);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // Private mode etc.: works for this session only.
    }
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let response: Response;
    let text: string;
    try {
      response = await fetch(`${AGENT_URL}${path}`, {
        method,
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json;charset=utf-8' }, body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      text = await response.text();
    } catch {
      throw new FiscalError(AGENT_UNREACHABLE, AGENT_UNREACHABLE);
    }
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      throw new FiscalError(`HTTP ${response.status}`);
    }
    if (response.ok) return parsed as T;
    const error = parsed as { code?: string; message?: string } | undefined;
    throw new FiscalError(error?.message ?? `HTTP ${response.status}`, error?.code);
  }

  private static toReceipt(r: Omit<FiscalReceipt, 'amount'> & { amountTiyin: number }): FiscalReceipt {
    const { amountTiyin, ...receipt } = r;
    return { ...receipt, amount: amountTiyin };
  }

  /** Checks the agent is running and its cash register is ready. */
  initialize() {
    return this.request<FiscalStatus>('GET', '/status');
  }

  /** Opens the fiscal shift unless one is already open. */
  openShift() {
    return this.request<void>('POST', '/shift/open');
  }

  /** Closes the fiscal shift (prints the Z-report on the register's printer). */
  closeShift() {
    return this.request<void>('POST', '/shift/close');
  }

  async sale(opts: { code: string; lines: FiscalLine[]; payment: FiscalPayment; cashierName?: string; sessionCode?: string; phone?: string }): Promise<FiscalReceipt> {
    return FiscalService.toReceipt(await this.request('POST', '/receipts/sale', opts));
  }

  /**
   * Credit receipt for a repayment of goods sold on debt: the sale's lines, which the agent
   * scales down to `amountTiyin`. Cash or card only.
   */
  credit(opts: { code: string; lines: FiscalLine[]; method: MoneyMethod; amountTiyin: number; cashierName?: string; phone?: string }): Promise<{ provider: string; id: string }> {
    return this.request('POST', '/receipts/credit', opts);
  }

  /** `originalQrCodeUrl`: scanned from the paper receipt; the agent checks it is `originalReceiptId`'s. */
  async refund(opts: { code: string; lines: FiscalLine[]; method: MoneyMethod; amountTiyin: number; originalQrCodeUrl: string; originalReceiptId?: string; cashierName?: string }): Promise<FiscalReceipt> {
    return FiscalService.toReceipt(await this.request('POST', '/receipts/refund', opts));
  }

  // ---------------------------------------------------------------- payment systems

  /** Click Pass, Payme Go, Uzum, terminals… that this register has switched on and set up. */
  paymentSystems() {
    return this.request<PaymentSystem[]>('GET', '/payments/systems');
  }

  /** Starts a payment; `externalId` makes a retry safe (same id → same payment). */
  startPayment(systemId: number, amountTiyin: number, externalId: string, token?: string) {
    return this.request<FiscalPaymentState>('POST', '/payments', { systemId, amountTiyin, externalId, token });
  }

  confirmPayment(paymentId: string, token: string) {
    return this.request<FiscalPaymentState>('POST', `/payments/${encodeURIComponent(paymentId)}/confirm`, { token });
  }

  getPayment(paymentId: string) {
    return this.request<FiscalPaymentState>('GET', `/payments/${encodeURIComponent(paymentId)}`);
  }

  cancelPayment(paymentId: string) {
    return this.request<void>('POST', `/payments/${encodeURIComponent(paymentId)}/cancel`);
  }
}
