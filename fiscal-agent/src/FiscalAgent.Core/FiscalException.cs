namespace FiscalAgent.Core;

public enum FiscalFailure
{
    /// <summary>The request itself is wrong.</summary>
    Invalid,
    /// <summary>The provider answered and refused.</summary>
    Provider,
    /// <summary>The provider didn't answer. For a receipt, it may or may not have been issued.</summary>
    Unreachable,
    /// <summary>The agent has no provider set up yet.</summary>
    NotConfigured,
    /// <summary>This provider doesn't offer the operation.</summary>
    Unsupported
}

public sealed class FiscalException(FiscalFailure failure, string code, string message) : Exception(message)
{
    public const string InvalidRequest = "INVALID_REQUEST";
    public const string ProviderError = "PROVIDER_ERROR";
    public const string ProviderUnreachable = "PROVIDER_UNREACHABLE";
    public const string NotConfigured = "NOT_CONFIGURED";
    public const string PaymentsUnsupported = "PAYMENTS_UNSUPPORTED";
    /// <summary>An earlier receipt's result is unknown; only repeating that same receipt can settle it.</summary>
    public const string ReceiptUnconfirmed = "RECEIPT_UNCONFIRMED";
    /// <summary>The scanned paper receipt isn't the sale being refunded.</summary>
    public const string WrongReceipt = "WRONG_RECEIPT";

    public FiscalFailure Failure { get; } = failure;
    public string Code { get; } = code;
}
