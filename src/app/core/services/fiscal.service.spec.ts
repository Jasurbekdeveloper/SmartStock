import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FiscalService, blockedAsMixedContent, vcrAuth, vcrError } from './fiscal.service';

describe('FiscalService (REGOS: VCR JSON-RPC)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const reply = (body: unknown) => Promise.resolve({ status: 200, json: () => Promise.resolve(body) } as Response);

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({});
  });

  afterEach(() => vi.unstubAllGlobals());

  function service() {
    const s = TestBed.inject(FiscalService);
    s.saveConfig({ enabled: true, url: 'http://127.0.0.1:18347/', login: 'kassa', password: 'kas123456' });
    return s;
  }

  it('sends a JSON-RPC sale with Base64 login:password and reads the fiscal data', async () => {
    fetchMock.mockReturnValueOnce(
      reply({ id: 1, ok: true, result: { Id: 'r1', Amount: 900000, QRCodeURL: 'https://ofd.soliq.uz/check?t=VG1', TerminalID: 'VG1', ReceiptNo: '759', DateTime: '2026-11-01 10:00:00', FiscalSign: '848035748636' } })
    );
    const s = service();
    expect(s.enabled()).toBe(true);
    const receipt = await s.sale({ code: 'R-1', positions: [], payments: [{ type: 1, value: 900000 }] });
    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toBe('http://127.0.0.1:18347');
    expect(body).toMatchObject({ jsonrpc: '2.0', method: 'Receipt.Sale', auth: btoa('kassa:kas123456') });
    expect(body.params.code).toBe('R-1');
    expect(receipt).toMatchObject({ qrCodeUrl: 'https://ofd.soliq.uz/check?t=VG1', fiscalSign: '848035748636', receiptNo: '759' });
  });

  it('retries while VCR is busy and reports other errors', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockReturnValueOnce(reply({ ok: false, result: { code: 704042, message: 'busy' } }))
      .mockReturnValueOnce(reply({ ok: true, result: { TerminalID: 'VG1' } }))
      .mockReturnValueOnce(reply({ ok: false, result: { code: 705511, message: 'IKPU xatosi' } }));
    const s = service();
    const init = s.initialize();
    await vi.advanceTimersByTimeAsync(1100);
    await expect(init).resolves.toMatchObject({ TerminalID: 'VG1' });
    await expect(s.zReportInfo()).rejects.toThrow('705511: IKPU xatosi');
    vi.useRealTimers();
  });

  it('says when VCR cannot be reached', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(service().initialize()).rejects.toThrow('VCR_UNREACHABLE');
  });

  it('lists only the payment systems that are available and support Payment.Start', async () => {
    fetchMock.mockReturnValueOnce(
      reply({
        ok: true,
        result: {
          systems: [
            { payment_system_id: 1, code: 'clickpass', name: 'Click Pass', available: true, sort_order: 2,
              operations: [{ method: 'Payment.Start', required_fields: ['amount', 'external_id', 'token'], polling: { success_statuses: [3], failure_statuses: [7] } }] },
            { payment_system_id: 2, code: 'paymego', name: 'Payme Go', available: false, operations: [{ method: 'Payment.Start' }] },
            { payment_system_id: -1, code: 'pax', name: 'Terminal', available: true, sort_order: 1, operations: [{ method: 'Payment.Create' }] }
          ]
        }
      })
    );
    const systems = await service().paymentSystems();
    expect(systems).toEqual([{ id: 1, code: 'clickpass', name: 'Click Pass', success: [3], failure: [7], needsToken: true }]);
  });

  it('encodes the login UTF-8 safely and spots addresses an https page cannot call', () => {
    expect(vcrAuth('kassa', 'kas123456')).toBe(btoa('kassa:kas123456'));
    expect(atob(vcrAuth('kassa', 'пароль'))).toBe(String.fromCharCode(...new TextEncoder().encode('kassa:пароль')));
    expect(blockedAsMixedContent('http://vcr-test.regos.uz', 'https:')).toBe(true);
    expect(blockedAsMixedContent('http://127.0.0.1:18347', 'https:')).toBe(false);
    expect(blockedAsMixedContent('https://vcr.example.uz', 'https:')).toBe(false);
    expect(blockedAsMixedContent('http://vcr-test.regos.uz', 'http:')).toBe(false);
  });

  it('reads VCR errors in the { error, description } shape', () => {
    const err = vcrError({ error: 704016, description: 'Принтер не обнаружен.' });
    expect(err.code).toBe(704016);
    expect(err.message).toBe('704016: Принтер не обнаружен.');
    expect(vcrError({ error: 'bad' }).message).toBe('bad');
  });
});
