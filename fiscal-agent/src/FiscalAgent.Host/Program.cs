using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using FiscalAgent.Core;
using FiscalAgent.Host;
using FiscalAgent.Providers.Regos;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Hosting.WindowsServices;

if (args is ["configure", ..]) return ConfigureCommand.Run(args[1..]);

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = WindowsServiceHelpers.IsWindowsService() ? AppContext.BaseDirectory : null
});
builder.Host.UseWindowsService(o => o.ServiceName = "MarketHisobFiscalAgent");
builder.Configuration.AddInMemoryCollection([new("AllowedHosts", "127.0.0.1;localhost;[::1]")]);

// Loopback only: the agent must not be reachable from the shop's network.
builder.WebHost.ConfigureKestrel((context, kestrel) =>
    kestrel.Listen(IPAddress.Loopback, context.Configuration.GetValue("FiscalAgent:Port", 18348)));

builder.Services.Configure<RouteHandlerOptions>(o => o.ThrowOnBadRequest = true);
builder.Services.Configure<JsonOptions>(o =>
{
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
    o.SerializerOptions.RespectNullableAnnotations = true;
    o.SerializerOptions.RespectRequiredConstructorParameters = true;
});
builder.Services.AddSingleton<ConfigStore>();
builder.Services.AddHttpClient();
builder.Services.AddSingleton<IFiscalProvider>(services =>
{
    var environment = services.GetRequiredService<IHostEnvironment>();
    var configuration = services.GetRequiredService<IConfiguration>();
    // Fake receipts never reach the tax office, so a shop's service can't be switched to them.
    if (environment.IsDevelopment() && configuration["FiscalAgent:Provider"] == "fake") return new FakeProvider();
    var config = services.GetRequiredService<ConfigStore>().Load();
    return config?.Regos is { } regos
        ? new RegosVcrProvider(new RegosClient(
            services.GetRequiredService<IHttpClientFactory>().CreateClient("regos"),
            new RegosOptions(regos.Url, regos.Login, ConfigStore.Unprotect(regos.ProtectedPassword))))
        : new NotConfiguredProvider();
});
builder.Services.ConfigureHttpClientDefaults(http => http.ConfigureHttpClient(c => c.Timeout = Timeout.InfiniteTimeSpan));

var app = builder.Build();
app.UseMiddleware<OriginGuard>();
app.UseMiddleware<ErrorResponses>();
app.MapFiscalEndpoints();
app.Run();
return 0;

public partial class Program;
