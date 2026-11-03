using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using FiscalAgent.Core;

namespace FiscalAgent.Providers.Regos;

public sealed record RegosOptions(string Url, string Login, string Password);

/// <summary>REGOS: VCR's JSON-RPC 2.0 over HTTP. VCR handles one request at a time; calls are queued.</summary>
public sealed partial class RegosClient(HttpClient http, RegosOptions options, Func<TimeSpan, Task>? delay = null)
{
    /// <summary>VCR answers "busy" while another operation runs; the docs say to retry.</summary>
    private const long Busy = 704042;
    /// <summary>The result of an earlier operation is unconfirmed; the docs say only repeating it unchanged can continue.</summary>
    private const long Unconfirmed = 704044;
    private const int MaxBusyRetries = 5;
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(60);
    private static readonly JsonSerializerOptions Json = new() { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly Func<TimeSpan, Task> _delay = delay ?? (t => Task.Delay(t));
    private int _requestId;

    private sealed record Envelope(
        [property: JsonPropertyName("id")] int Id,
        [property: JsonPropertyName("jsonrpc")] string JsonRpc,
        [property: JsonPropertyName("method")] string Method,
        [property: JsonPropertyName("params"), JsonIgnore(Condition = JsonIgnoreCondition.Never)] object? Params,
        [property: JsonPropertyName("auth")] string Auth);

    /// <summary>
    /// `ct` only covers waiting in the queue: a caller that is gone before its turn issues
    /// nothing. Once sent, a request runs to its end, because cutting it off would leave
    /// nobody knowing whether the receipt was issued.
    /// </summary>
    public async Task<JsonElement> CallAsync(string method, object? parameters, CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            for (var attempt = 0; ; attempt++)
            {
                try
                {
                    return await SendAsync(method, parameters);
                }
                catch (FiscalException e) when (e.Code == Busy.ToString(CultureInfo.InvariantCulture) && attempt < MaxBusyRetries)
                {
                    await _delay(TimeSpan.FromSeconds(1));
                }
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<JsonElement> SendAsync(string method, object? parameters)
    {
        // Optional fields are left out, not sent as null (the ignore option skips dictionaries).
        if (parameters is Dictionary<string, object?> fields)
            parameters = fields.Where(f => f.Value is not null).ToDictionary(f => f.Key, f => f.Value);
        var envelope = new Envelope(Interlocked.Increment(ref _requestId), "2.0", method, parameters, Auth(options.Login, options.Password));
        using var content = new StringContent(JsonSerializer.Serialize(envelope, Json), Encoding.UTF8, "application/json");
        using var timeout = new CancellationTokenSource(RequestTimeout);
        HttpResponseMessage response;
        string text;
        try
        {
            response = await http.PostAsync(options.Url, content, timeout.Token);
            text = await response.Content.ReadAsStringAsync(timeout.Token);
        }
        catch (Exception e) when (e is HttpRequestException or OperationCanceledException)
        {
            throw new FiscalException(FiscalFailure.Unreachable, FiscalException.ProviderUnreachable, "VCR is not reachable");
        }
        using (response)
        {
            JsonElement body;
            try
            {
                using var doc = JsonDocument.Parse(text);
                body = doc.RootElement.Clone();
            }
            catch (JsonException)
            {
                throw new FiscalException(FiscalFailure.Provider, FiscalException.ProviderError, $"HTTP {(int)response.StatusCode}");
            }
            var result = body.ValueKind == JsonValueKind.Object && body.TryGetProperty("result", out var r) ? r : default;
            if (body.ValueKind == JsonValueKind.Object && body.TryGetProperty("ok", out var ok) && ok.ValueKind == JsonValueKind.True) return result;
            throw Error(result);
        }
    }

    /// <summary>HTTP Basic-style `auth` value, UTF-8.</summary>
    public static string Auth(string login, string password) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes($"{login}:{password}"));

    /// <summary>Pulls a readable message and numeric code out of VCR's error object (format varies).</summary>
    public static FiscalException Error(JsonElement result)
    {
        long? code;
        string message;
        if (result.ValueKind == JsonValueKind.Object)
        {
            // VCR answers { error: 704016, description: "…" }; other shapes are tolerated too.
            code = NumberOf(First(result, "error", "code", "Code", "error_code"));
            var text = First(result, "description", "message", "Message");
            var error = First(result, "error");
            message = text is { } t ? AsText(t)
                : error is { ValueKind: JsonValueKind.String } e ? e.GetString()!
                : result.GetRawText();
        }
        else
        {
            message = result.ValueKind == JsonValueKind.Undefined || result.ValueKind == JsonValueKind.Null ? "VCR error" : AsText(result);
            var match = SixDigits().Match(message);
            code = match.Success ? long.Parse(match.Value, CultureInfo.InvariantCulture) : null;
            if (code is not null) return new FiscalException(FiscalFailure.Provider, match.Value, message);
        }
        if (code == Unconfirmed) return new FiscalException(FiscalFailure.Provider, FiscalException.ReceiptUnconfirmed, $"{code}: {message}");
        return code is { } c
            ? new FiscalException(FiscalFailure.Provider, c.ToString(CultureInfo.InvariantCulture), $"{c}: {message}")
            : new FiscalException(FiscalFailure.Provider, FiscalException.ProviderError, message);
    }

    /// <summary>The first of `names` that is present and not null.</summary>
    internal static JsonElement? First(JsonElement obj, params string[] names)
    {
        if (obj.ValueKind != JsonValueKind.Object) return null;
        foreach (var name in names)
            if (obj.TryGetProperty(name, out var value) && value.ValueKind != JsonValueKind.Null) return value;
        return null;
    }

    internal static string AsText(JsonElement value) => value.ValueKind == JsonValueKind.String ? value.GetString()! : value.GetRawText();

    /// <summary>A number, or a string holding one.</summary>
    internal static long? NumberOf(JsonElement? value) => value switch
    {
        { ValueKind: JsonValueKind.Number } n => n.TryGetInt64(out var l) ? l : (long)n.GetDouble(),
        { ValueKind: JsonValueKind.String } s => long.TryParse(s.GetString(), NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var l) ? l : null,
        _ => null
    };

    [GeneratedRegex(@"\d{6}")]
    private static partial Regex SixDigits();
}
