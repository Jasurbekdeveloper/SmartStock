using FiscalAgent.Core;

namespace FiscalAgent.Host;

/// <summary>
/// Only MarketHisob's own pages may use the agent: other websites open in the same browser
/// are refused. Anything that changes state must come from a browser page with an allowed
/// Origin; a plain GET without one is fine for checking the service.
/// </summary>
public sealed class OriginGuard(RequestDelegate next)
{
    private static readonly HashSet<string> AllowedOrigins = new(StringComparer.Ordinal)
    {
        "https://app.markethisob.uz",
        "https://smartstock-d737f.web.app",
        "https://smartstock-d737f.firebaseapp.com",
        "http://localhost:4200"
    };

    public async Task InvokeAsync(HttpContext context)
    {
        var origin = context.Request.Headers.Origin.ToString();
        if (origin.Length > 0)
        {
            if (!AllowedOrigins.Contains(origin))
            {
                await Forbid(context);
                return;
            }
            var headers = context.Response.Headers;
            headers.AccessControlAllowOrigin = origin;
            headers.Vary = "Origin";
            headers.AccessControlAllowMethods = "GET, POST, OPTIONS";
            headers.AccessControlAllowHeaders = "Content-Type";
            // Chrome's Private Network Access: a public site calling 127.0.0.1.
            headers["Access-Control-Allow-Private-Network"] = "true";
            headers.AccessControlMaxAge = "600";
        }
        if (HttpMethods.IsOptions(context.Request.Method))
        {
            context.Response.StatusCode = StatusCodes.Status204NoContent;
            return;
        }
        if (origin.Length == 0 && !HttpMethods.IsGet(context.Request.Method))
        {
            await Forbid(context);
            return;
        }
        await next(context);
    }

    private static Task Forbid(HttpContext context)
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return context.Response.WriteAsJsonAsync(new { code = "ORIGIN_FORBIDDEN", message = "Origin not allowed" });
    }
}

/// <summary>Every failure reaches MarketHisob as { code, message }.</summary>
public sealed class ErrorResponses(RequestDelegate next, ILogger<ErrorResponses> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (FiscalException e)
        {
            await Write(context, StatusOf(e.Failure), e.Code, e.Message);
        }
        catch (BadHttpRequestException e)
        {
            await Write(context, StatusCodes.Status400BadRequest, FiscalException.InvalidRequest, e.Message);
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            // The caller left while waiting in the queue; nothing was sent to the provider.
        }
        catch (Exception e)
        {
            logger.LogError(e, "Unexpected failure");
            await Write(context, StatusCodes.Status500InternalServerError, "INTERNAL", "Internal error");
        }
    }

    private static int StatusOf(FiscalFailure failure) => failure switch
    {
        FiscalFailure.Invalid => StatusCodes.Status400BadRequest,
        FiscalFailure.Provider => StatusCodes.Status502BadGateway,
        FiscalFailure.Unsupported => StatusCodes.Status501NotImplemented,
        _ => StatusCodes.Status503ServiceUnavailable
    };

    private static Task Write(HttpContext context, int status, string code, string message)
    {
        context.Response.StatusCode = status;
        return context.Response.WriteAsJsonAsync(new { code, message });
    }
}
