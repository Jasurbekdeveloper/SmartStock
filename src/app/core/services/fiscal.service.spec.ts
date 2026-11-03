import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FiscalError, FiscalService, fiscalErrorText } from './fiscal.service';
import { FiscalLine } from '../utils/fiscal-receipt';

const line: FiscalLine = {
  productId: 'p1',
  name: 'Sut',
  quantity: 1,
  paidTiyin: 900000,
  discountTiyin: 0,
  vatRate: 0.12,
  barcode: null,
  mxikCode: '00401001001000000',
  packageCode: '1500001',
  unit: 'dona'
};

describe('FiscalService (fiscal agent)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const reply = (body: unknown, status = 200) =>
    Promise.resolve({ status, ok: status < 400, text: () => Promise.resolve(body === undefined ? '' : JSON.stringify(body)) } as Response);

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({});
  });

  afterEach(() => vi.unstubAllGlobals());

  it('sends a sale to the agent in its own format and reads the fiscal data', async () => {
    fetchMock.mockReturnValueOnce(
      reply({ provider: 'regos', id: 'r1', amountTiyin: 900000, qrCodeUrl: 'https://ofd.soliq.uz/check?t=VG1', terminalId: 'VG1', receiptNo: '759', dateTime: '2026-11-01 10:00:00', fiscalSign: '848035748636' })
    );
    const receipt = await TestBed.inject(FiscalService).sale({ code: 'R-1', lines: [line], payment: { cardTiyin: 0 } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:18348/v1/receipts/sale');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ code: 'R-1', lines: [line], payment: { cardTiyin: 0 } });
    expect(init.body).not.toMatch(/auth|password|login/i);
    expect(receipt).toEqual({ provider: 'regos', id: 'r1', amount: 900000, qrCodeUrl: 'https://ofd.soliq.uz/check?t=VG1', terminalId: 'VG1', receiptNo: '759', dateTime: '2026-11-01 10:00:00', fiscalSign: '848035748636' });
  });

  it('names the original receipt on a refund', async () => {
    fetchMock.mockReturnValueOnce(reply({ provider: 'regos', id: 'r2', amountTiyin: 100, qrCodeUrl: '', terminalId: '', receiptNo: '', dateTime: '', fiscalSign: '' }));
    const refund = { code: 'R-1-R1', lines: [line], method: 'card' as const, amountTiyin: 100, originalQrCodeUrl: 'https://ofd/x', originalReceiptId: 'r1' };
    await TestBed.inject(FiscalService).refund(refund);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(refund);
  });

  it('accepts the empty answer of a shift operation', async () => {
    fetchMock.mockReturnValueOnce(reply(undefined));
    await expect(TestBed.inject(FiscalService).openShift()).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:18348/v1/shift/open');
  });

  it('reports what the agent refused, with its code', async () => {
    fetchMock.mockReturnValueOnce(reply({ code: '705511', message: '705511: IKPU xatosi' }, 502));
    const err = await TestBed.inject(FiscalService).initialize().catch((e) => e);
    expect(err).toBeInstanceOf(FiscalError);
    expect(err.code).toBe('705511');
    expect(err.message).toBe('705511: IKPU xatosi');
  });

  it('tells apart a missing agent, a stopped register and a refusal', async () => {
    const t = (k: string) => `[${k}]`;
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const missing = await TestBed.inject(FiscalService).initialize().catch((e) => e);
    expect(fiscalErrorText(missing, t)).toBe('[fiscal.agentUnreachable]');
    expect(fiscalErrorText(new FiscalError('x', 'PROVIDER_UNREACHABLE'), t)).toBe('[fiscal.unreachable]');
    expect(fiscalErrorText(new FiscalError('x', 'NOT_CONFIGURED'), t)).toBe('[fiscal.notConfigured]');
    expect(fiscalErrorText(new FiscalError('x', 'RECEIPT_UNCONFIRMED'), t)).toBe('[fiscal.unconfirmed]');
    expect(fiscalErrorText(new FiscalError('x', 'WRONG_RECEIPT'), t)).toBe('[fiscal.wrongReceipt]');
    expect(fiscalErrorText(new FiscalError('705511: IKPU xatosi', '705511'), t)).toBe('705511: IKPU xatosi');
  });

  it('removes the old VCR password from the browser and keeps the on/off choice', () => {
    localStorage.setItem('markethisob_fiscal_vcr', JSON.stringify({ enabled: true, url: 'http://127.0.0.1:18347', login: 'kassa', password: 'kas123456' }));
    const s = TestBed.inject(FiscalService);
    expect(s.enabled()).toBe(true);
    expect(s.config()).toEqual({ enabled: true });
    expect(localStorage.getItem('markethisob_fiscal_vcr')).toBeNull();
    expect(JSON.stringify({ ...localStorage })).not.toContain('kas123456');
  });

  it('remembers the on/off choice on this device', () => {
    const s = TestBed.inject(FiscalService);
    expect(s.enabled()).toBe(false);
    s.saveConfig({ enabled: true });
    expect(s.enabled()).toBe(true);
    expect(JSON.parse(localStorage.getItem('markethisob_fiscal')!)).toEqual({ enabled: true });
  });
});
