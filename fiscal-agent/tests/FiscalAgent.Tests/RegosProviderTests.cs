using System.Net;
using System.Text;
using System.Text.Json;
using FiscalAgent.Core;
using FiscalAgent.Providers.Regos;

namespace FiscalAgent.Tests;

/// <summary>Same cases as src/app/core/services/fiscal.service.spec.ts, against a stand-in VCR.</summary>
public class RegosProviderTests
{
    private sealed class StubVcr(params string[] replies) : HttpMessageHandler
    {
        private int _next;
        public List<JsonElement> Requests { get; } = [];
        public string? Url { get; private set; }
        public Func<Task>? BeforeReply { get; init; }
        public Exception? Failure { get; init; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Url = request.RequestUri!.ToString();
            Requests.Add(JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct)).RootElement.Clone());
            if (Failure is not null) throw Failure;
            if (BeforeReply is not null) await BeforeReply();
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(replies[_next++], Encoding.UTF8, "application/json") };
        }
    }

    private static readonly FiscalLine Line = new("p1", "Sut", 1, 900000, 0, 0.12m, "4780069000130", "00401001001000000", "1500001", "dona");

    private static RegosVcrProvider Provider(StubVcr vcr, List<TimeSpan>? delays = null) => new(new RegosClient(
        new HttpClient(vcr),
        new RegosOptions("http://127.0.0.1:9000", "kassa", "kas123456"),
        t => { delays?.Add(t); return Task.CompletedTask; }));

    [Fact]
    public async Task Sends_a_json_rpc_sale_and_reads_the_fiscal_data()
    {
        var vcr = new StubVcr("""{"id":1,"ok":true,"result":{"Id":"r1","Amount":900000,"QRCodeURL":"https://ofd.soliq.uz/check?t=VG1","TerminalID":"VG1","ReceiptNo":"759","DateTime":"2026-11-01 10:00:00","FiscalSign":"848035748636"}}""");
        var receipt = await Provider(vcr).SaleAsync(new SaleRequest("R-1", [Line], new FiscalPayment()), default);

        var body = vcr.Requests.Single();
        Assert.Equal("http://127.0.0.1:9000/", vcr.Url);
        Assert.Equal("2.0", body.GetProperty("jsonrpc").GetString());
        Assert.Equal("Receipt.Sale", body.GetProperty("method").GetString());
        Assert.Equal(Convert.ToBase64String(Encoding.UTF8.GetBytes("kassa:kas123456")), body.GetProperty("auth").GetString());
        var parameters = body.GetProperty("params");
        Assert.Equal("R-1", parameters.GetProperty("code").GetString());
        Assert.False(parameters.TryGetProperty("cashier_name", out _));
        Assert.False(parameters.GetProperty("positions")[0].TryGetProperty("label", out _));
        Assert.Equal(900000, parameters.GetProperty("payments")[0].GetProperty("value").GetInt64());

        Assert.Equal("regos", receipt.Provider);
        Assert.Equal("https://ofd.soliq.uz/check?t=VG1", receipt.QrCodeUrl);
        Assert.Equal("848035748636", receipt.FiscalSign);
        Assert.Equal("759", receipt.ReceiptNo);
    }

    [Fact]
    public async Task Retries_while_vcr_is_busy_and_reports_other_errors()
    {
        var delays = new List<TimeSpan>();
        var vcr = new StubVcr(
            """{"ok":false,"result":{"code":704042,"message":"busy"}}""",
            """{"ok":true,"result":{"TerminalID":"VG1"}}""",
            """{"ok":false,"result":{"code":705511,"message":"IKPU xatosi"}}""");
        var provider = Provider(vcr, delays);

        Assert.Equal("VG1", (await provider.GetStatusAsync(default)).TerminalId);
        Assert.Single(delays);
        var error = await Assert.ThrowsAsync<FiscalException>(() => provider.OpenShiftAsync(default));
        Assert.Equal("705511: IKPU xatosi", error.Message);
        Assert.Equal("705511", error.Code);
    }

    [Fact]
    public async Task Does_not_resend_a_receipt_when_vcr_does_not_answer()
    {
        var vcr = new StubVcr { Failure = new HttpRequestException("refused") };
        var error = await Assert.ThrowsAsync<FiscalException>(() => Provider(vcr).SaleAsync(new SaleRequest("R-1", [Line], new FiscalPayment()), default));
        Assert.Equal(FiscalException.ProviderUnreachable, error.Code);
        Assert.Single(vcr.Requests);
    }

    [Fact]
    public async Task Handles_one_request_at_a_time()
    {
        var running = 0;
        var most = 0;
        var vcr = new StubVcr(
            """{"ok":true,"result":{"TerminalID":"A"}}""",
            """{"ok":true,"result":{"TerminalID":"B"}}""",
            """{"ok":true,"result":{"TerminalID":"C"}}""")
        {
            BeforeReply = async () =>
            {
                most = Math.Max(most, Interlocked.Increment(ref running));
                await Task.Delay(20);
                Interlocked.Decrement(ref running);
            }
        };
        var provider = Provider(vcr);
        await Task.WhenAll(provider.GetStatusAsync(default), provider.GetStatusAsync(default), provider.GetStatusAsync(default));
        Assert.Equal(1, most);
    }

    [Fact]
    public async Task Opens_a_shift_only_when_none_is_open()
    {
        var alreadyOpen = new StubVcr("""{"ok":true,"result":{"OpenTime":"2026-11-01 09:00:00","CloseTime":""}}""");
        await Provider(alreadyOpen).OpenShiftAsync(default);
        Assert.Single(alreadyOpen.Requests);

        var closed = new StubVcr("""{"ok":true,"result":{"OpenTime":"","CloseTime":""}}""", """{"ok":true,"result":{}}""");
        await Provider(closed).OpenShiftAsync(default);
        Assert.Equal("ZReport.Open", closed.Requests[1].GetProperty("method").GetString());
    }

    [Fact]
    public async Task Refund_never_pays_back_more_than_the_lines_and_names_the_original()
    {
        var vcr = new StubVcr("""{"ok":true,"result":{"Id":"r2"}}""");
        await Provider(vcr).RefundAsync(new RefundRequest("R-1-R1", [Line], MoneyMethod.Card, 99999999, "https://ofd/x"), default);
        var parameters = vcr.Requests.Single().GetProperty("params");
        Assert.Equal(2, parameters.GetProperty("payments")[0].GetProperty("type").GetInt32());
        Assert.Equal(900000, parameters.GetProperty("payments")[0].GetProperty("value").GetInt64());
        Assert.Equal("https://ofd/x", parameters.GetProperty("refund_info").GetProperty("QRCodeURL").GetString());
    }

    [Fact]
    public async Task Gives_no_fiscal_detail_when_vcr_hides_it()
    {
        var vcr = new StubVcr("""{"ok":true,"result":{"Id":"r1","Amount":900000,"QRCodeURL":"***","TerminalID":"VG1","ReceiptNo":"***","FiscalSign":"***"}}""");
        var receipt = await Provider(vcr).SaleAsync(new SaleRequest("R-1", [Line], new FiscalPayment()), default);
        Assert.Equal("", receipt.QrCodeUrl);
        Assert.Equal("", receipt.ReceiptNo);
        Assert.Equal("", receipt.FiscalSign);
        Assert.Equal("VG1", receipt.TerminalId);
    }

    [Theory]
    [InlineData("***")]
    [InlineData("")]
    [InlineData("ofd.soliq.uz/check")]
    public async Task Never_refunds_against_a_hidden_or_wrong_qr_code(string qr)
    {
        var vcr = new StubVcr();
        var error = await Assert.ThrowsAsync<FiscalException>(() => Provider(vcr).RefundAsync(new RefundRequest("R-1-R1", [Line], MoneyMethod.Cash, 100, qr), default));
        Assert.Equal(FiscalException.InvalidRequest, error.Code);
        Assert.Empty(vcr.Requests);
    }

    [Fact]
    public async Task Refunds_only_when_the_scanned_receipt_is_this_sales()
    {
        var right = new StubVcr("""{"ok":true,"result":{"Id":"r1"}}""", """{"ok":true,"result":{"Id":"r2"}}""");
        await Provider(right).RefundAsync(new RefundRequest("R-1-R1", [Line], MoneyMethod.Cash, 100, "https://ofd/x", "r1"), default);
        Assert.Equal("Receipt.GetInfo", right.Requests[0].GetProperty("method").GetString());
        Assert.Equal("https://ofd/x", right.Requests[0].GetProperty("params").GetProperty("QRCodeURL").GetString());
        Assert.Equal("Receipt.Refund", right.Requests[1].GetProperty("method").GetString());

        var other = new StubVcr("""{"ok":true,"result":{"Id":"another"}}""");
        var error = await Assert.ThrowsAsync<FiscalException>(() => Provider(other).RefundAsync(new RefundRequest("R-1-R1", [Line], MoneyMethod.Cash, 100, "https://ofd/x", "r1"), default));
        Assert.Equal(FiscalException.WrongReceipt, error.Code);
        Assert.Single(other.Requests);

        var foreign = new StubVcr("""{"ok":false,"result":{"error":705005,"description":"not found"}}""");
        error = await Assert.ThrowsAsync<FiscalException>(() => Provider(foreign).RefundAsync(new RefundRequest("R-1-R1", [Line], MoneyMethod.Cash, 100, "https://ofd/x", "r1"), default));
        Assert.Equal(FiscalException.WrongReceipt, error.Code);
    }

    [Fact]
    public async Task A_retried_sale_returns_the_receipt_that_was_already_issued()
    {
        var vcr = new StubVcr(
            """{"ok":false,"result":{"error":701003,"description":"code already exists"}}""",
            """{"ok":true,"result":{"Id":"r1","Code":"R-1","Amount":900000,"QRCodeURL":"***"}}""");
        var receipt = await Provider(vcr).SaleAsync(new SaleRequest("R-1", [Line], new FiscalPayment()), default);
        Assert.Equal("r1", receipt.Id);
        Assert.Equal("R-1", vcr.Requests[1].GetProperty("params").GetProperty("Code").GetString());
    }

    [Fact]
    public async Task A_retried_credit_returns_the_receipt_that_was_already_issued()
    {
        var vcr = new StubVcr(
            """{"ok":false,"result":{"error":701003,"description":"code already exists"}}""",
            """{"ok":true,"result":{"Id":"c1","Code":"Q-1","Amount":300000}}""");
        var receipt = await Provider(vcr).CreditAsync(new CreditRequest("Q-1", [Line], MoneyMethod.Cash, 300000), default);
        Assert.Equal("c1", receipt.Id);
        Assert.Equal("Receipt.GetInfo", vcr.Requests[1].GetProperty("method").GetString());
        Assert.Equal("Q-1", vcr.Requests[1].GetProperty("params").GetProperty("Code").GetString());
    }

    [Fact]
    public async Task Another_credit_under_the_same_code_stays_an_error()
    {
        var vcr = new StubVcr(
            """{"ok":false,"result":{"error":701003,"description":"code already exists"}}""",
            """{"ok":true,"result":{"Id":"c9","Amount":5}}""");
        var error = await Assert.ThrowsAsync<FiscalException>(() => Provider(vcr).CreditAsync(new CreditRequest("Q-1", [Line], MoneyMethod.Cash, 300000), default));
        Assert.Equal("701003: code already exists", error.Message);
    }

    [Fact]
    public async Task Another_receipt_under_the_same_code_stays_an_error()
    {
        var vcr = new StubVcr(
            """{"ok":false,"result":{"error":701003,"description":"code already exists"}}""",
            """{"ok":true,"result":{"Id":"r9","Amount":5}}""");
        var error = await Assert.ThrowsAsync<FiscalException>(() => Provider(vcr).SaleAsync(new SaleRequest("R-1", [Line], new FiscalPayment()), default));
        Assert.Equal("701003: code already exists", error.Message);
    }

    [Fact]
    public async Task A_bad_parameter_stays_an_error_when_no_receipt_has_that_code()
    {
        var vcr = new StubVcr(
            """{"ok":false,"result":{"error":701003,"description":"PackageCode"}}""",
            """{"ok":false,"result":{"error":705005,"description":"not found"}}""");
        var error = await Assert.ThrowsAsync<FiscalException>(() => Provider(vcr).SaleAsync(new SaleRequest("R-1", [Line], new FiscalPayment()), default));
        Assert.Equal("701003: PackageCode", error.Message);
    }

    [Fact]
    public async Task Reports_an_unconfirmed_earlier_receipt_in_its_own_words()
    {
        var vcr = new StubVcr("""{"ok":false,"result":{"error":704044,"description":"unconfirmed"}}""");
        var error = await Assert.ThrowsAsync<FiscalException>(() => Provider(vcr).SaleAsync(new SaleRequest("R-1", [Line], new FiscalPayment()), default));
        Assert.Equal(FiscalException.ReceiptUnconfirmed, error.Code);
        Assert.Single(vcr.Requests);
    }

    [Fact]
    public async Task Refuses_a_line_without_mxik_before_calling_vcr()
    {
        var vcr = new StubVcr();
        var error = await Assert.ThrowsAsync<FiscalException>(() => Provider(vcr).SaleAsync(new SaleRequest("R-1", [Line with { MxikCode = null }], new FiscalPayment()), default));
        Assert.Equal(FiscalException.InvalidRequest, error.Code);
        Assert.Empty(vcr.Requests);
    }

    [Fact]
    public async Task Lists_only_the_payment_systems_that_are_available_and_support_start()
    {
        var vcr = new StubVcr("""
            {"ok":true,"result":{"systems":[
              {"payment_system_id":1,"code":"clickpass","name":"Click Pass","available":true,"sort_order":2,
               "operations":[{"method":"Payment.Start","required_fields":["amount","external_id","token"],"polling":{"success_statuses":[3],"failure_statuses":[7]}}]},
              {"payment_system_id":2,"code":"paymego","name":"Payme Go","available":false,"operations":[{"method":"Payment.Start"}]},
              {"payment_system_id":-1,"code":"pax","name":"Terminal","available":true,"sort_order":1,"operations":[{"method":"Payment.Create"}]}
            ]}}
            """);
        var system = Assert.Single(await Provider(vcr).GetSystemsAsync(default));
        Assert.Equal(1, system.Id);
        Assert.Equal("clickpass", system.Code);
        Assert.Equal([3], system.Success);
        Assert.Equal([7], system.Failure);
        Assert.True(system.NeedsToken);
    }

    [Fact]
    public void Reads_vcr_errors_in_every_shape()
    {
        var error = RegosClient.Error(JsonDocument.Parse("""{"error":704016,"description":"Принтер не обнаружен."}""").RootElement);
        Assert.Equal("704016", error.Code);
        Assert.Equal("704016: Принтер не обнаружен.", error.Message);
        Assert.Equal("bad", RegosClient.Error(JsonDocument.Parse("""{"error":"bad"}""").RootElement).Message);
        Assert.Equal("704016", RegosClient.Error(JsonDocument.Parse("\"xato 704016\"").RootElement).Code);
    }

    [Fact]
    public void Encodes_the_login_as_utf8() =>
        Assert.Equal(Convert.ToBase64String(Encoding.UTF8.GetBytes("kassa:пароль")), RegosClient.Auth("kassa", "пароль"));
}
