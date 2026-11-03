using FiscalAgent.Core;

namespace FiscalAgent.Host;

/// <summary>The only API MarketHisob knows. Nothing here is specific to a provider.</summary>
public static class Endpoints
{
    public static void MapFiscalEndpoints(this IEndpointRouteBuilder app)
    {
        var v1 = app.MapGroup("/v1");

        v1.MapGet("/status", (IFiscalProvider p, CancellationToken ct) => p.GetStatusAsync(ct));
        v1.MapPost("/shift/open", (IFiscalProvider p, CancellationToken ct) => p.OpenShiftAsync(ct));
        v1.MapPost("/shift/close", (IFiscalProvider p, CancellationToken ct) => p.CloseShiftAsync(ct));

        v1.MapPost("/receipts/sale", (SaleRequest r, IFiscalProvider p, CancellationToken ct) => p.SaleAsync(r, ct));
        v1.MapPost("/receipts/refund", (RefundRequest r, IFiscalProvider p, CancellationToken ct) => p.RefundAsync(r, ct));
        v1.MapPost("/receipts/credit", (CreditRequest r, IFiscalProvider p, CancellationToken ct) => p.CreditAsync(r, ct));

        // A provider without payment systems simply lists none.
        v1.MapGet("/payments/systems", (IFiscalProvider p, CancellationToken ct) =>
            p is IPaymentProvider payments ? payments.GetSystemsAsync(ct) : Task.FromResult<IReadOnlyList<PaymentSystem>>([]));
        v1.MapPost("/payments", (StartPaymentRequest r, IFiscalProvider p, CancellationToken ct) => Payments(p).StartAsync(r, ct));
        v1.MapGet("/payments/{id}", (string id, IFiscalProvider p, CancellationToken ct) => Payments(p).GetAsync(id, ct));
        v1.MapPost("/payments/{id}/confirm", (string id, ConfirmPaymentRequest r, IFiscalProvider p, CancellationToken ct) => Payments(p).ConfirmAsync(id, r.Token, ct));
        v1.MapPost("/payments/{id}/cancel", (string id, IFiscalProvider p, CancellationToken ct) => Payments(p).CancelAsync(id, ct));
    }

    private static IPaymentProvider Payments(IFiscalProvider provider) =>
        provider as IPaymentProvider
        ?? throw new FiscalException(FiscalFailure.Unsupported, FiscalException.PaymentsUnsupported, "This provider has no payment systems");
}
