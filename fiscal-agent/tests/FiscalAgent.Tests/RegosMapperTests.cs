using FiscalAgent.Core;
using FiscalAgent.Providers.Regos;

namespace FiscalAgent.Tests;

/// <summary>Same cases and numbers as src/app/core/utils/vcr-receipt.spec.ts.</summary>
public class RegosMapperTests
{
    private static FiscalLine Sut(decimal quantity, long paid, long discount, string barcode = "4780069000130", string[]? codes = null, string productId = "p1", string name = "Sut 1L") =>
        new(productId, name, quantity, paid, discount, 0.12m, barcode, "00401001001000000", "1500001", "dona", codes);

    [Fact]
    public void Converts_pieces_to_thousandths_and_vat_to_x100()
    {
        var p = RegosMapper.Positions([Sut(2, 2200000, 200000)]).Single();
        Assert.Equal(2400000, p.Amount);
        Assert.Equal(200000, p.Discount);
        Assert.Equal(2000, p.Quantity);
        Assert.Equal(1200, p.VatValue);
        Assert.Equal("00401001001000000", p.Icps);
        Assert.Equal("1500001", p.PackageCode);
        Assert.Equal("4780069000130", p.Barcode);
        Assert.Equal(-1, RegosMapper.VatValue(0));
        Assert.Equal(1250, RegosMapper.Quantity(1.25m, "kg"));
        Assert.Equal(250, RegosMapper.Quantity(250, "g"));
    }

    [Fact]
    public void Puts_every_marked_unit_on_its_own_position_with_its_code()
    {
        string[] codes = ["0104780069000130215AAA\u001d93xx", "0104780069000130215BBB\u001d93yy", "0104780069000130215CCC\u001d93zz"];
        var ps = RegosMapper.Positions([Sut(3, 1000000, 100, "", codes)]);
        Assert.Equal(3, ps.Count);
        // GS isn't allowed in VCR's label: the identification part goes, without the crypto tail.
        Assert.Equal(codes.Select(c => c.Split('\u001d')[0]), ps.Select(p => p.Label));
        Assert.All(ps, p => Assert.Equal(1000, p.Quantity));
        Assert.Equal(1000000, RegosMapper.Total(ps));
        Assert.Equal("4780069000130", ps[0].Barcode);
    }

    [Fact]
    public void Splits_payments_so_they_add_up_exactly()
    {
        var ps = RegosMapper.Positions([Sut(1, 1234567, 0)]);
        Assert.Equal([new VcrPayment(1, 734567), new VcrPayment(2, 500000)], RegosMapper.Payments(ps, new FiscalPayment(CardTiyin: 500000)));
        Assert.Equal([new VcrPayment(1, 1234567)], RegosMapper.Payments(ps, new FiscalPayment()));
        Assert.Equal([new VcrPayment(2, PaymentId: "pay-1")], RegosMapper.Payments(ps, new FiscalPayment(PaymentId: "pay-1")));
    }

    [Theory]
    [InlineData("0104780069000130215AAA93xyz", "0104780069000130215AAA93xyz")]
    [InlineData("0104780069000130215AAA\u001d93ab~c", "0104780069000130215AAA")]
    [InlineData("01047800690001302 1x~y", "010478006900013021xy")]
    public void Cleans_marking_codes(string raw, string label) => Assert.Equal(label, RegosMapper.Label(raw));

    [Fact]
    public void A_debt_sale_only_pays_what_was_taken_now()
    {
        var ps = RegosMapper.Positions([Sut(1, 9000000, 0)]);
        Assert.Equal([new VcrPayment(1, 3000000)], RegosMapper.Payments(ps, new FiscalPayment(CashTiyin: 3000000)));
        Assert.Equal([new VcrPayment(1, 1000000), new VcrPayment(2, 500000)], RegosMapper.Payments(ps, new FiscalPayment(CardTiyin: 500000, CashTiyin: 1000000)));
        Assert.Equal([new VcrPayment(1, 0)], RegosMapper.Payments(ps, new FiscalPayment(CashTiyin: 0)));
    }

    [Fact]
    public void Scales_the_sale_goods_to_a_debt_repayment_exactly_without_marking_codes()
    {
        string[] codes = ["0104780069000130215AAA\u001d93xx", "0104780069000130215BBB\u001d93yy"];
        var sale = RegosMapper.Positions([Sut(2, 2000000, 0, codes: codes), Sut(1, 333333, 50000, productId: "p2", name: "Non")]);
        var credit = RegosMapper.Scale(sale, 1000001);
        Assert.Equal(1000001, credit.Sum(p => p.Amount));
        Assert.All(credit, p => { Assert.Equal(0, p.Discount); Assert.Null(p.Label); });
        Assert.Equal(2333333, RegosMapper.Scale(sale, 999999999).Sum(p => p.Amount));
        Assert.Empty(RegosMapper.Scale(sale, 0));
    }

    [Fact]
    public void Scaling_big_amounts_does_not_overflow()
    {
        var sale = RegosMapper.Positions([Sut(1, 4_000_000_000_000, 0), Sut(1, 6_000_000_000_000, 0, productId: "p2")]);
        Assert.Equal(9_000_000_000_001, RegosMapper.Scale(sale, 9_000_000_000_001).Sum(p => p.Amount));
    }

    [Fact]
    public void Rejects_barcodes_vcr_does_not_accept() => Assert.Equal("", RegosMapper.Barcode("123"));
}
