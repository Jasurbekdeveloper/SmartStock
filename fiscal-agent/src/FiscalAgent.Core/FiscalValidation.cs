using System.Text.RegularExpressions;

namespace FiscalAgent.Core;

/// <summary>Checks every provider needs; a bad line must never reach the tax office.</summary>
public static partial class FiscalValidation
{
    public static void Check(SaleRequest r)
    {
        CheckReceipt(r.Code, r.Lines);
        if (r.Payment.CardTiyin < 0 || r.Payment.CashTiyin < 0) throw Invalid("Payment can't be negative");
    }

    public static void Check(RefundRequest r)
    {
        CheckReceipt(r.Code, r.Lines);
        if (r.AmountTiyin < 0) throw Invalid("Amount can't be negative");
        if (!Uri.TryCreate(r.OriginalQrCodeUrl, UriKind.Absolute, out var url) || (url.Scheme != Uri.UriSchemeHttp && url.Scheme != Uri.UriSchemeHttps))
            throw Invalid("The QR code of the original receipt is required");
    }

    public static void Check(CreditRequest r)
    {
        CheckReceipt(r.Code, r.Lines);
        if (r.AmountTiyin <= 0) throw Invalid("Amount must be positive");
    }

    private static void CheckReceipt(string code, IReadOnlyList<FiscalLine> lines)
    {
        if (string.IsNullOrWhiteSpace(code)) throw Invalid("Receipt code is required");
        if (lines.Count == 0) throw Invalid("The receipt has no lines");
        foreach (var l in lines)
        {
            if (string.IsNullOrWhiteSpace(l.Name)) throw Invalid("A line has no name");
            if (l.PaidTiyin < 0 || l.DiscountTiyin < 0 || l.Quantity <= 0) throw Invalid($"{l.Name}: wrong amount or quantity");
            if (l.MxikCode is null || !MxikPattern().IsMatch(l.MxikCode.Trim())) throw Invalid($"{l.Name}: MXIK is missing or wrong");
            if (string.IsNullOrWhiteSpace(l.PackageCode)) throw Invalid($"{l.Name}: package code is missing");
        }
    }

    private static FiscalException Invalid(string message) => new(FiscalFailure.Invalid, FiscalException.InvalidRequest, message);

    [GeneratedRegex(@"^\d{17}$")]
    private static partial Regex MxikPattern();
}
