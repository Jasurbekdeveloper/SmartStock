using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace FiscalAgent.Host;

public sealed record RegosSection(string Url, string Login, string ProtectedPassword);

public sealed record AgentConfig(RegosSection? Regos);

/// <summary>
/// Settings of this computer's agent. The password is encrypted with Windows DPAPI for
/// this machine, because the service and the administrator running `configure` are
/// different accounts; install.ps1 limits the folder to SYSTEM and administrators.
/// </summary>
public sealed class ConfigStore
{
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("MarketHisob.FiscalAgent");
    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true };

    public static string DefaultPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "MarketHisob", "FiscalAgent", "agent.json");

    private readonly string _path;

    public ConfigStore() : this(DefaultPath) { }

    public ConfigStore(string path) => _path = path;

    public AgentConfig? Load() =>
        File.Exists(_path) ? JsonSerializer.Deserialize<AgentConfig>(File.ReadAllText(_path)) : null;

    public void Save(AgentConfig config)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        File.WriteAllText(_path, JsonSerializer.Serialize(config, Json));
    }

    public static string Protect(string password) =>
        Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(password), Entropy, DataProtectionScope.LocalMachine));

    public static string Unprotect(string protectedPassword) =>
        Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(protectedPassword), Entropy, DataProtectionScope.LocalMachine));
}

/// <summary>
/// FiscalAgent.exe configure --url http://127.0.0.1:PORT --login NAME
/// The password is asked for on the console so it never lands in a command history.
/// </summary>
public static class ConfigureCommand
{
    public static int Run(string[] args)
    {
        var url = Option(args, "--url")?.Trim().TrimEnd('/');
        var login = Option(args, "--login");
        if (string.IsNullOrEmpty(url) || string.IsNullOrEmpty(login))
        {
            Console.Error.WriteLine("Foydalanish: FiscalAgent.exe configure --url <VCR manzili> --login <login>");
            return 1;
        }
        Console.Write("VCR paroli: ");
        var password = ReadPassword();
        new ConfigStore().Save(new AgentConfig(new RegosSection(url, login, ConfigStore.Protect(password))));
        Console.WriteLine($"Saqlandi: {ConfigStore.DefaultPath}");
        return 0;
    }

    private static string? Option(string[] args, string name)
    {
        var i = Array.IndexOf(args, name);
        return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
    }

    private static string ReadPassword()
    {
        if (Console.IsInputRedirected) return Console.ReadLine() ?? "";
        var password = new StringBuilder();
        while (true)
        {
            var key = Console.ReadKey(intercept: true);
            if (key.Key == ConsoleKey.Enter) break;
            if (key.Key == ConsoleKey.Backspace) { if (password.Length > 0) password.Length--; }
            else if (!char.IsControl(key.KeyChar)) password.Append(key.KeyChar);
        }
        Console.WriteLine();
        return password.ToString();
    }
}
