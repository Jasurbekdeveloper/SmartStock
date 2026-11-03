using System.Text;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using FiscalAgent.Core;

namespace FiscalAgent.Providers.Regos;

public sealed record VcrPosition
{
    [JsonPropertyName("name")] public required string Name { get; init; }
    [JsonPropertyName("barcode")] public required string Barcode { get; init; }
    [JsonPropertyName("icps")] public required string Icps { get; init; }
    [JsonPropertyName("package_code")] public required string PackageCode { get; init; }
    [JsonPropertyName("owner_type")] public string OwnerType { get; init; } = "BuyingAndSelling";
    [JsonPropertyName("quantity")] public required long Quantity { get; init; }
    [JsonPropertyName("amount")] public required long Amount { get; init; }
    [JsonPropertyName("discount")] public required long Discount { get; init; }
    [JsonPropertyName("vat_value")] public required int VatValue { get; init; }
    [JsonPropertyName("label")] public string? Label { get; init; }
    [JsonPropertyName("code")] public string? Code { get; init; }
}

public sealed record VcrPayment(
    [property: JsonPropertyName("type")] int Type,
    [property: JsonPropertyName("value")] long? Value = null,
    [property: JsonPropertyName("payment_id")] string? PaymentId = null);

/// <summary>
/// MarketHisob receipt → REGOS: VCR receipt.
/// Docs: https://docs.regos.uz/ru/regos-vcr/operations/api-interface
///
/// VCR units: money in tiyin, quantity in grams / thousandths (1 piece = 1000), VAT rate
/// × 100 (12% = 1200, no VAT = -1). Each marked unit (Asl belgisi) is its own position
/// with quantity 1000 and its code in `label`.
/// </summary>
public static partial class RegosMapper
{
    private const char Gs = '\u001d';
    private const int Cash = 1;
    private const int Card = 2;

    /// <summary>VCR wants grams for weight and thousandths for everything else.</summary>
    public static long Quantity(decimal quantity, string? unit) =>
        Math.Max(1, (long)Math.Round(unit == "g" ? quantity : quantity * 1000, MidpointRounding.AwayFromZero));

    public static int VatValue(decimal vatRate) =>
        vatRate > 0 ? (int)Math.Round(vatRate * 10000, MidpointRounding.AwayFromZero) : -1;

    public static int Ean13CheckDigit(string first12)
    {
        var sum = 0;
        for (var i = 0; i < 12; i++) sum += (first12[i] - '0') * (i % 2 == 0 ? 1 : 3);
        return (10 - sum % 10) % 10;
    }

    /// <summary>EAN-13 only (VCR rejects other formats); for marked goods the GTIN inside the code works too.</summary>
    public static string Barcode(string? barcode, string? markingCode = null)
    {
        var b = (barcode ?? "").Trim();
        if (Ean13Pattern().IsMatch(b) && Ean13CheckDigit(b[..12]) == b[12] - '0') return b;
        var gtin = markingCode is null ? null : GtinPrefixPattern().Match(markingCode) is { Success: true } m ? m.Groups[1].Value : null;
        return gtin is not null && gtin.StartsWith('0') ? gtin[1..] : "";
    }

    /// <summary>
    /// Marking code as VCR takes it in `label`: GS separators are not allowed there, so the
    /// identification part (01 GTIN 21 serial) is sent without the crypto tail. A code
    /// scanned without its separators can't be split — then it goes whole, minus any
    /// characters VCR doesn't accept.
    /// </summary>
    public static string Label(string markingCode)
    {
        var code = NormalizeMarkingCode(markingCode);
        var match = MarkingPattern().Match(code);
        if (match.Success && code.Length >= 25 && code.Contains(Gs))
            return $"01{match.Groups[1].Value}21{match.Groups[2].Value}";
        return LabelForbiddenPattern().Replace(markingCode, "");
    }

    public static List<VcrPosition> Positions(IEnumerable<FiscalLine> lines)
    {
        var positions = new List<VcrPosition>();
        foreach (var l in lines)
        {
            var name = l.Name.Length > 255 ? l.Name[..255] : l.Name;
            var codes = l.MarkingCodes ?? [];
            VcrPosition Position(string barcode, long quantity, long amount, long discount, string? label) => new()
            {
                Name = name,
                Barcode = barcode,
                Icps = l.MxikCode ?? "",
                PackageCode = l.PackageCode ?? "",
                Quantity = quantity,
                Amount = amount,
                Discount = discount,
                VatValue = VatValue(l.VatRate),
                Label = label,
                Code = l.ProductId
            };
            if (codes.Count == 0)
            {
                positions.Add(Position(Barcode(l.Barcode), Quantity(l.Quantity, l.Unit), l.PaidTiyin + l.DiscountTiyin, l.DiscountTiyin, null));
                continue;
            }
            var paid = SplitEven(l.PaidTiyin, codes.Count);
            var discount = SplitEven(l.DiscountTiyin, codes.Count);
            for (var i = 0; i < codes.Count; i++)
                positions.Add(Position(Barcode(l.Barcode, codes[i]), 1000, paid[i] + discount[i], discount[i], Label(codes[i])));
        }
        return positions;
    }

    public static long Total(IEnumerable<VcrPosition> positions) => positions.Sum(p => p.Amount - p.Discount);

    /// <summary>Cash and card parts always add up to exactly what a fully paid receipt charges.</summary>
    public static List<VcrPayment> Payments(IReadOnlyList<VcrPosition> positions, FiscalPayment payment)
    {
        if (payment.PaymentId is { Length: > 0 } id) return [new VcrPayment(Card, PaymentId: id)];
        long card, cash;
        if (payment.CashTiyin is { } taken)
        {
            // Debt sale: only the money taken now; the rest gets its own credit receipt.
            cash = taken;
            card = payment.CardTiyin;
        }
        else
        {
            var total = Total(positions);
            card = Math.Min(total, Math.Max(0, payment.CardTiyin));
            cash = total - card;
        }
        var payments = new List<VcrPayment>();
        if (cash > 0) payments.Add(new VcrPayment(Cash, cash));
        if (card > 0) payments.Add(new VcrPayment(Card, card));
        if (payments.Count == 0) payments.Add(new VcrPayment(Cash, 0));
        return payments;
    }

    public static VcrPayment Single(MoneyMethod method, long value) => new(method == MoneyMethod.Card ? Card : Cash, value);

    /// <summary>
    /// Positions for a credit receipt when part of a debt is repaid: the goods of the
    /// original sale with their amounts scaled down so they add up exactly to `amountTiyin`.
    /// Marking codes are not repeated — they were closed by the sale receipt.
    /// </summary>
    public static List<VcrPosition> Scale(IReadOnlyList<VcrPosition> positions, long amountTiyin)
    {
        var nets = positions.Select(p => Math.Max(0, p.Amount - p.Discount)).ToList();
        var total = nets.Sum();
        if (total <= 0 || amountTiyin <= 0) return [];
        var target = Math.Min(amountTiyin, total);
        var scaled = nets.Select(n => (long)((Int128)n * target / total)).ToList();
        // Rounding leftovers go to the biggest line so the sum is exact.
        scaled[nets.IndexOf(nets.Max())] += target - scaled.Sum();
        return positions
            .Select((p, i) => p with { Amount = scaled[i], Discount = 0, Label = null })
            .Where(p => p.Amount > 0)
            .ToList();
    }

    /// <summary>Splits `total` tiyin into `n` parts that add up exactly (remainder on the last).</summary>
    private static long[] SplitEven(long total, int n)
    {
        var parts = new long[n];
        var share = total / n;
        for (var i = 0; i < n; i++) parts[i] = i == n - 1 ? total - share * (n - 1) : share;
        return parts;
    }

    /// <summary>Same clean-up as marking.ts: symbology prefix, separator variants, keyboard layout.</summary>
    private static string NormalizeMarkingCode(string raw)
    {
        var code = raw.Trim();
        if (code.StartsWith("]d2", StringComparison.Ordinal) || code.StartsWith("]C1", StringComparison.Ordinal) || code.StartsWith("]Q3", StringComparison.Ordinal))
            code = code[3..];
        code = GsVariantPattern().Replace(code, Gs.ToString());
        return CyrillicPattern().IsMatch(code) ? FromCyrillicLayout(code) : code;
    }

    private static string FromCyrillicLayout(string text)
    {
        var sb = new StringBuilder(text.Length);
        foreach (var ch in text)
        {
            var lower = char.ToLowerInvariant(ch);
            sb.Append(!RuLayout.TryGetValue(lower, out var mapped) ? ch : ch == lower ? mapped : char.ToUpperInvariant(mapped));
        }
        return sb.ToString();
    }

    /// <summary>ЙЦУКЕН → QWERTY for codes typed by a scanner while the OS layout is Russian/Uzbek Cyrillic.</summary>
    private static readonly Dictionary<char, char> RuLayout = new()
    {
        ['й'] = 'q', ['ц'] = 'w', ['у'] = 'e', ['к'] = 'r', ['е'] = 't', ['н'] = 'y', ['г'] = 'u', ['ш'] = 'i', ['щ'] = 'o', ['з'] = 'p', ['х'] = '[', ['ъ'] = ']',
        ['ф'] = 'a', ['ы'] = 's', ['в'] = 'd', ['а'] = 'f', ['п'] = 'g', ['р'] = 'h', ['о'] = 'j', ['л'] = 'k', ['д'] = 'l', ['ж'] = ';', ['э'] = '\'',
        ['я'] = 'z', ['ч'] = 'x', ['с'] = 'c', ['м'] = 'v', ['и'] = 'b', ['т'] = 'n', ['ь'] = 'm', ['б'] = ',', ['ю'] = '.', ['ё'] = '`',
        ['ў'] = 'o', ['қ'] = 'q', ['ғ'] = 'g', ['ҳ'] = 'h'
    };

    [GeneratedRegex(@"^\d{13}$")] private static partial Regex Ean13Pattern();
    [GeneratedRegex(@"^01(\d{14})")] private static partial Regex GtinPrefixPattern();
    [GeneratedRegex(@"^01(\d{14})21([^\u001d]+)")] private static partial Regex MarkingPattern();
    [GeneratedRegex(@"[^A-Za-z0-9!""%&'()*+,\-./_:;=<>?]")] private static partial Regex LabelForbiddenPattern();
    [GeneratedRegex(@"\\u001d|<GS>|\{GS\}|~1")] private static partial Regex GsVariantPattern();
    [GeneratedRegex(@"[\u0400-\u04FF]")] private static partial Regex CyrillicPattern();
}
