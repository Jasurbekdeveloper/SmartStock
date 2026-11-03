namespace FiscalAgent.Core;

/// <summary>A cash register that sends receipts to the tax office. One adapter per provider.</summary>
public interface IFiscalProvider
{
    string Code { get; }
    Task<FiscalStatus> GetStatusAsync(CancellationToken ct);
    /// <summary>Opens the fiscal shift unless one is already open.</summary>
    Task OpenShiftAsync(CancellationToken ct);
    /// <summary>Closes the fiscal shift if one is open.</summary>
    Task CloseShiftAsync(CancellationToken ct);
    Task<FiscalReceipt> SaleAsync(SaleRequest request, CancellationToken ct);
    Task<FiscalReceipt> RefundAsync(RefundRequest request, CancellationToken ct);
    Task<CreditReceipt> CreditAsync(CreditRequest request, CancellationToken ct);
}

/// <summary>Payments run through the register (Click Pass, Payme Go…). Not every provider has them.</summary>
public interface IPaymentProvider
{
    Task<IReadOnlyList<PaymentSystem>> GetSystemsAsync(CancellationToken ct);
    Task<PaymentState> StartAsync(StartPaymentRequest request, CancellationToken ct);
    Task<PaymentState> ConfirmAsync(string paymentId, string token, CancellationToken ct);
    Task<PaymentState> GetAsync(string paymentId, CancellationToken ct);
    Task CancelAsync(string paymentId, CancellationToken ct);
}
