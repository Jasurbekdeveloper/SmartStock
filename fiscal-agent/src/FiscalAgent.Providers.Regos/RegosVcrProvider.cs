using System.Text.Json;
using FiscalAgent.Core;

namespace FiscalAgent.Providers.Regos;

public sealed class RegosVcrProvider(RegosClient client) : IFiscalProvider, IPaymentProvider
{
    /// <summary>VCR always answers this for QRCodeURL, ReceiptNo and FiscalSign; the real ones are only on the paper receipt.</summary>
    private const string Masked = "***";
    /// <summary>Wrong parameter, which includes a receipt code that was already used.</summary>
    private const string BadRequest = "701003";
    private const string ReceiptNotFound = "705005";

    public string Code => "regos";

    public async Task<FiscalStatus> GetStatusAsync(CancellationToken ct)
    {
        var r = await client.CallAsync("Sys.Initialize", null, ct);
        return new FiscalStatus(
            Code,
            Text(r, "TerminalID"),
            Number(r, "ReceiptCount"),
            Number(r, "ReceiptMaxCount"),
            Number(r, "ZReportCount"),
            Number(r, "ZReportMaxCount"));
    }

    private async Task<(string Open, string Close)> ZReportInfoAsync(CancellationToken ct)
    {
        var r = await client.CallAsync("ZReport.GetInfo", new { PrintReceipt = false }, ct);
        return (Text(r, "OpenTime"), Text(r, "CloseTime"));
    }

    public async Task OpenShiftAsync(CancellationToken ct)
    {
        var (open, close) = await ZReportInfoAsync(ct);
        if (open.Length > 0 && close.Length == 0) return;
        await client.CallAsync("ZReport.Open", null, ct);
    }

    public async Task CloseShiftAsync(CancellationToken ct)
    {
        var (open, close) = await ZReportInfoAsync(ct);
        if (open.Length == 0 || close.Length > 0) return;
        await client.CallAsync("ZReport.Close", null, ct);
    }

    public async Task<FiscalReceipt> SaleAsync(SaleRequest request, CancellationToken ct)
    {
        FiscalValidation.Check(request);
        var positions = RegosMapper.Positions(request.Lines);
        return await IssueAsync("Receipt.Sale", new Dictionary<string, object?>
        {
            ["code"] = request.Code,
            ["cashier_name"] = NullIfEmpty(request.CashierName),
            ["session_code"] = NullIfEmpty(request.SessionCode),
            ["phone"] = NullIfEmpty(request.Phone),
            ["positions"] = positions,
            ["payments"] = RegosMapper.Payments(positions, request.Payment)
        }, request.Code, RegosMapper.Total(positions), ct);
    }

    /// <summary>
    /// VCR refuses a receipt code it has already used. When a retry follows an attempt whose
    /// answer never reached us, that receipt exists: it is returned instead of an error, so
    /// the sale gets saved with it. A different receipt under the same code stays an error.
    /// </summary>
    private async Task<FiscalReceipt> IssueAsync(string method, Dictionary<string, object?> parameters, string code, long total, CancellationToken ct)
    {
        try
        {
            return ToReceipt(await client.CallAsync(method, parameters, ct));
        }
        catch (FiscalException e) when (e.Code == BadRequest)
        {
            if (await FindByCodeAsync(code, ct) is { } issued && issued.AmountTiyin == total) return issued;
            throw;
        }
    }

    private async Task<FiscalReceipt?> FindByCodeAsync(string code, CancellationToken ct)
    {
        try
        {
            return ToReceipt(await client.CallAsync("Receipt.GetInfo", new Dictionary<string, object?> { ["Code"] = code }, ct));
        }
        catch (FiscalException)
        {
            // Not found, or no answer: the original refusal is what the cashier should see.
            return null;
        }
    }

    /// <summary>The cashier scans the paper receipt, so make sure it is this sale's before money goes back.</summary>
    private async Task CheckOriginalAsync(RefundRequest request, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(request.OriginalReceiptId)) return;
        JsonElement original;
        try
        {
            original = await client.CallAsync("Receipt.GetInfo", new Dictionary<string, object?> { ["QRCodeURL"] = request.OriginalQrCodeUrl }, ct);
        }
        catch (FiscalException e) when (e.Code == ReceiptNotFound)
        {
            throw WrongReceipt();
        }
        if (Text(original, "Id", "id") != request.OriginalReceiptId) throw WrongReceipt();
    }

    private static FiscalException WrongReceipt() =>
        new(FiscalFailure.Invalid, FiscalException.WrongReceipt, "The scanned receipt is not this sale's receipt");

    public async Task<FiscalReceipt> RefundAsync(RefundRequest request, CancellationToken ct)
    {
        FiscalValidation.Check(request);
        await CheckOriginalAsync(request, ct);
        var positions = RegosMapper.Positions(request.Lines);
        var value = Math.Min(RegosMapper.Total(positions), request.AmountTiyin);
        return await IssueAsync("Receipt.Refund", new Dictionary<string, object?>
        {
            ["code"] = request.Code,
            ["cashier_name"] = NullIfEmpty(request.CashierName),
            ["positions"] = positions,
            ["payments"] = new[] { RegosMapper.Single(request.Method, value) },
            ["refund_info"] = new Dictionary<string, string> { ["QRCodeURL"] = request.OriginalQrCodeUrl }
        }, request.Code, RegosMapper.Total(positions), ct);
    }

    /// <summary>
    /// Credit receipt (Receipt.Credit) for a repayment of goods sold on debt. The goods
    /// were already fiscalised by the sale receipt; this one is not registered in the
    /// fiscal module and can't use payment systems (cash or card only).
    /// </summary>
    public async Task<CreditReceipt> CreditAsync(CreditRequest request, CancellationToken ct)
    {
        FiscalValidation.Check(request);
        var positions = RegosMapper.Scale(RegosMapper.Positions(request.Lines), request.AmountTiyin);
        if (positions.Count == 0) throw new FiscalException(FiscalFailure.Invalid, FiscalException.InvalidRequest, "Nothing to put on the credit receipt");
        var paid = positions.Sum(p => p.Amount);
        var receipt = await IssueAsync("Receipt.Credit", new Dictionary<string, object?>
        {
            ["code"] = request.Code,
            ["cashier_name"] = NullIfEmpty(request.CashierName),
            ["phone"] = NullIfEmpty(request.Phone),
            ["positions"] = positions,
            ["payments"] = new[] { RegosMapper.Single(request.Method, paid) }
        }, request.Code, paid, ct);
        return new CreditReceipt(Code, receipt.Id);
    }

    private FiscalReceipt ToReceipt(JsonElement r) => new(
        Code,
        Text(r, "Id", "id"),
        Number(r, "Amount"),
        Detail(r, "QRCodeURL"),
        Text(r, "TerminalID"),
        Detail(r, "ReceiptNo"),
        Detail(r, "FiscalSign"),
        Text(r, "DateTime"));

    /// <summary>A fiscal detail, or empty when VCR hid it.</summary>
    private static string Detail(JsonElement r, string name)
    {
        var value = Text(r, name);
        return value == Masked ? "" : value;
    }

    // ---------------------------------------------------------------- payment systems

    /// <summary>Click Pass, Payme Go, Uzum, terminals… that this VCR has switched on and set up.</summary>
    public async Task<IReadOnlyList<PaymentSystem>> GetSystemsAsync(CancellationToken ct)
    {
        var r = await client.CallAsync("Payment.Systems.Get", new { }, ct);
        var systems = new List<(long Sort, PaymentSystem System)>();
        foreach (var s in Items(RegosClient.First(r, "systems")))
        {
            if (RegosClient.First(s, "available") is not { ValueKind: JsonValueKind.True }) continue;
            var start = Items(RegosClient.First(s, "operations"))
                .Where(o => RegosClient.First(o, "method") is { ValueKind: JsonValueKind.String } m && m.GetString() == "Payment.Start")
                .Cast<JsonElement?>()
                .FirstOrDefault();
            if (start is not { } operation) continue;
            var polling = RegosClient.First(operation, "polling");
            systems.Add((Number(s, "sort_order"), new PaymentSystem(
                (int)Number(s, "payment_system_id"),
                Text(s, "code"),
                Text(s, "name"),
                Statuses(polling, "success_statuses", [3]),
                Statuses(polling, "failure_statuses", [-1, 7, 8]),
                Items(RegosClient.First(operation, "required_fields")).Any(f => f.ValueKind == JsonValueKind.String && f.GetString() == "token"))));
        }
        return systems.OrderBy(s => s.Sort).Select(s => s.System).ToList();
    }

    /// <summary>`ExternalId` makes a retry safe (same id → same payment).</summary>
    public async Task<PaymentState> StartAsync(StartPaymentRequest request, CancellationToken ct) =>
        ToPayment(await client.CallAsync("Payment.Start", new Dictionary<string, object?>
        {
            ["payment_system_id"] = request.SystemId,
            ["amount"] = request.AmountTiyin,
            ["external_id"] = request.ExternalId,
            ["token"] = NullIfEmpty(request.Token)
        }, ct));

    public async Task<PaymentState> ConfirmAsync(string paymentId, string token, CancellationToken ct) =>
        ToPayment(await client.CallAsync("Payment.Confirm", new Dictionary<string, object?> { ["payment_id"] = paymentId, ["token"] = token }, ct));

    public async Task<PaymentState> GetAsync(string paymentId, CancellationToken ct) =>
        ToPayment(await client.CallAsync("Payment.Get", new Dictionary<string, object?> { ["payment_id"] = paymentId }, ct));

    public Task CancelAsync(string paymentId, CancellationToken ct) =>
        client.CallAsync("Payment.Cancel", new Dictionary<string, object?> { ["payment_id"] = paymentId }, ct);

    private static PaymentState ToPayment(JsonElement r)
    {
        var confirmation = RegosClient.First(r, "confirmation");
        var needsToken = confirmation is { } c && Text(c, "type") == "token" && RegosClient.First(c, "required") is { ValueKind: JsonValueKind.True };
        var qr = Text(r, "qr_text");
        var pollAfter = RegosClient.NumberOf(RegosClient.First(r, "poll_after")) ?? 2;
        return new PaymentState(Text(r, "id"), (int)Number(r, "status"), Number(r, "amount"), (int)pollAfter, needsToken, qr.Length > 0 ? qr : null);
    }

    private static List<int> Statuses(JsonElement? polling, string name, int[] fallback)
    {
        var list = polling is { } p ? RegosClient.First(p, name) : null;
        return list is { ValueKind: JsonValueKind.Array } ? Items(list).Select(s => (int)(RegosClient.NumberOf(s) ?? 0)).ToList() : [.. fallback];
    }

    private static IEnumerable<JsonElement> Items(JsonElement? array) =>
        array is { ValueKind: JsonValueKind.Array } a ? a.EnumerateArray() : [];

    private static string Text(JsonElement obj, params string[] names) =>
        RegosClient.First(obj, names) is { } value ? RegosClient.AsText(value) : "";

    private static long Number(JsonElement obj, string name) => RegosClient.NumberOf(RegosClient.First(obj, name)) ?? 0;

    private static string? NullIfEmpty(string? value) => string.IsNullOrEmpty(value) ? null : value;
}
