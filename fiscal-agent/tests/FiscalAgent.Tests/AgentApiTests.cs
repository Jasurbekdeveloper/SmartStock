using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FiscalAgent.Core;
using FiscalAgent.Host;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace FiscalAgent.Tests;

public class AgentApiTests
{
    private const string AppOrigin = "https://app.markethisob.uz";

    private static HttpClient Client(IFiscalProvider provider) =>
        new WebApplicationFactory<Program>()
            .WithWebHostBuilder(b => b.ConfigureTestServices(s => s.AddSingleton(provider)))
            .CreateClient();

    private static HttpRequestMessage Post(string url, object? body, string? origin = AppOrigin)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, url) { Content = body is null ? null : JsonContent.Create(body) };
        if (origin is not null) request.Headers.Add("Origin", origin);
        return request;
    }

    private static readonly object SaleBody = new
    {
        code = "R-1",
        lines = new[] { new { productId = "p1", name = "Sut", quantity = 1, paidTiyin = 900000, discountTiyin = 0, vatRate = 0.12, mxikCode = "00401001001000000", packageCode = "1500001" } },
        payment = new { cardTiyin = 0 }
    };

    [Fact]
    public async Task Issues_a_sale_through_the_provider_in_its_own_format()
    {
        var response = await Client(new FakeProvider()).SendAsync(Post("/v1/receipts/sale", SaleBody));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var receipt = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("fake", receipt.GetProperty("provider").GetString());
        Assert.Equal(900000, receipt.GetProperty("amountTiyin").GetInt64());
        Assert.Equal(AppOrigin, response.Headers.GetValues("Access-Control-Allow-Origin").Single());
    }

    [Fact]
    public async Task Answers_the_browser_preflight_with_private_network_access()
    {
        var request = new HttpRequestMessage(HttpMethod.Options, "/v1/receipts/sale");
        request.Headers.Add("Origin", AppOrigin);
        var response = await Client(new FakeProvider()).SendAsync(request);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal("true", response.Headers.GetValues("Access-Control-Allow-Private-Network").Single());
    }

    [Theory]
    [InlineData("https://evil.example")]
    [InlineData(null)]
    public async Task Refuses_writes_from_other_sites_and_from_outside_a_browser(string? origin)
    {
        var response = await Client(new FakeProvider()).SendAsync(Post("/v1/receipts/sale", SaleBody, origin));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task Status_can_be_read_without_an_origin()
    {
        var status = await Client(new FakeProvider()).GetFromJsonAsync<JsonElement>("/v1/status");
        Assert.Equal("FAKE-1", status.GetProperty("terminalId").GetString());
    }

    [Fact]
    public async Task Reports_a_line_without_mxik_as_a_bad_request()
    {
        var body = new { code = "R-1", lines = new[] { new { productId = "p1", name = "Sut", quantity = 1, paidTiyin = 1, discountTiyin = 0, vatRate = 0.12 } }, payment = new { cardTiyin = 0 } };
        var response = await Client(new FakeProvider()).SendAsync(Post("/v1/receipts/sale", body));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(FiscalException.InvalidRequest, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Reports_malformed_json_in_the_same_error_shape()
    {
        var response = await Client(new FakeProvider()).SendAsync(Post("/v1/receipts/sale", new { code = "R-1" }));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(FiscalException.InvalidRequest, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Says_when_no_cash_register_is_set_up()
    {
        var response = await Client(new NotConfiguredProvider()).GetAsync("/v1/status");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal(FiscalException.NotConfigured, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task A_provider_without_payment_systems_lists_none()
    {
        var client = Client(new FakeProvider());
        Assert.Empty(await client.GetFromJsonAsync<JsonElement[]>("/v1/payments/systems") ?? [new JsonElement()]);
        var response = await client.SendAsync(Post("/v1/payments", new { systemId = 1, amountTiyin = 100, externalId = "e1" }));
        Assert.Equal(HttpStatusCode.NotImplemented, response.StatusCode);
    }
}
