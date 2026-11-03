using FiscalAgent.Core;

namespace FiscalAgent.Host;

/// <summary>Until `configure` has run: the service stays up and says so.</summary>
public sealed class NotConfiguredProvider : IFiscalProvider
{
    public string Code => "none";

    private static FiscalException Error() => new(FiscalFailure.NotConfigured, FiscalException.NotConfigured, "The agent has no cash register set up");

    public Task<FiscalStatus> GetStatusAsync(CancellationToken ct) => throw Error();
    public Task OpenShiftAsync(CancellationToken ct) => throw Error();
    public Task CloseShiftAsync(CancellationToken ct) => throw Error();
    public Task<FiscalReceipt> SaleAsync(SaleRequest request, CancellationToken ct) => throw Error();
    public Task<FiscalReceipt> RefundAsync(RefundRequest request, CancellationToken ct) => throw Error();
    public Task<CreditReceipt> CreditAsync(CreditRequest request, CancellationToken ct) => throw Error();
}

/// <summary>
/// Development only: lets the till be exercised without a cash register. Its receipts say
/// `provider: fake` and nothing is sent anywhere.
/// </summary>
public sealed class FakeProvider : IFiscalProvider
{
    private int _receiptNo;

    public string Code => "fake";

    public Task<FiscalStatus> GetStatusAsync(CancellationToken ct) =>
        Task.FromResult(new FiscalStatus(Code, "FAKE-1", _receiptNo, 1000, 0, 100));

    public Task OpenShiftAsync(CancellationToken ct) => Task.CompletedTask;

    public Task CloseShiftAsync(CancellationToken ct) => Task.CompletedTask;

    public Task<FiscalReceipt> SaleAsync(SaleRequest request, CancellationToken ct)
    {
        FiscalValidation.Check(request);
        return Task.FromResult(Receipt(request.Lines.Sum(l => l.PaidTiyin)));
    }

    public Task<FiscalReceipt> RefundAsync(RefundRequest request, CancellationToken ct)
    {
        FiscalValidation.Check(request);
        return Task.FromResult(Receipt(request.AmountTiyin));
    }

    public Task<CreditReceipt> CreditAsync(CreditRequest request, CancellationToken ct)
    {
        FiscalValidation.Check(request);
        return Task.FromResult(new CreditReceipt(Code, $"fake-credit-{Interlocked.Increment(ref _receiptNo)}"));
    }

    private FiscalReceipt Receipt(long amount)
    {
        var no = Interlocked.Increment(ref _receiptNo);
        return new FiscalReceipt(Code, $"fake-{no}", amount, $"https://fake.invalid/check?n={no}", "FAKE-1", no.ToString(), "000000000000", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
    }
}
