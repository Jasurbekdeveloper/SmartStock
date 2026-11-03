namespace FiscalAgent.Core;

/// <summary>
/// One receipt line in MarketHisob's own terms; adapters turn it into their provider's format.
/// Money is in tiyin, VAT included. Quantity is in the product's unit. VatRate is a fraction (0.12).
/// </summary>
public sealed record FiscalLine(
    string ProductId,
    string Name,
    decimal Quantity,
    long PaidTiyin,
    long DiscountTiyin,
    decimal VatRate,
    string? Barcode = null,
    string? MxikCode = null,
    string? PackageCode = null,
    string? Unit = null,
    IReadOnlyList<string>? MarkingCodes = null);

public enum MoneyMethod { Cash, Card }

/// <summary>
/// How a sale is paid. CashTiyin null means "the rest is cash" (fully paid sale); a value
/// means only that much was taken now (debt sale). PaymentId is an integrated payment
/// (Click Pass, Payme Go…) that covers the whole receipt.
/// </summary>
public sealed record FiscalPayment(long CardTiyin = 0, long? CashTiyin = null, string? PaymentId = null);

public sealed record SaleRequest(
    string Code,
    IReadOnlyList<FiscalLine> Lines,
    FiscalPayment Payment,
    string? CashierName = null,
    string? SessionCode = null,
    string? Phone = null);

public sealed record RefundRequest(
    string Code,
    IReadOnlyList<FiscalLine> Lines,
    MoneyMethod Method,
    long AmountTiyin,
    string OriginalQrCodeUrl,
    string? OriginalReceiptId = null,
    string? CashierName = null);

/// <summary>Repayment of goods sold on debt: the sale's lines, scaled down to AmountTiyin.</summary>
public sealed record CreditRequest(
    string Code,
    IReadOnlyList<FiscalLine> Lines,
    MoneyMethod Method,
    long AmountTiyin,
    string? CashierName = null,
    string? Phone = null);

public sealed record FiscalReceipt(
    string Provider,
    string Id,
    long AmountTiyin,
    string QrCodeUrl,
    string TerminalId,
    string ReceiptNo,
    string FiscalSign,
    string DateTime);

public sealed record CreditReceipt(string Provider, string Id);

public sealed record FiscalStatus(
    string Provider,
    string TerminalId,
    long ReceiptCount,
    long ReceiptMaxCount,
    long ZReportCount,
    long ZReportMaxCount);

public sealed record PaymentSystem(
    int Id,
    string Code,
    string Name,
    IReadOnlyList<int> Success,
    IReadOnlyList<int> Failure,
    bool NeedsToken);

public sealed record PaymentState(
    string Id,
    int Status,
    long AmountTiyin,
    int PollAfter,
    bool NeedsToken,
    string? QrText = null);

public sealed record StartPaymentRequest(int SystemId, long AmountTiyin, string ExternalId, string? Token = null);

public sealed record ConfirmPaymentRequest(string Token);
