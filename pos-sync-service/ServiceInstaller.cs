using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security.Principal;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Windows;
using Microsoft.VisualBasic;
using Microsoft.Win32;

namespace PosSyncService;

public static class ServiceInstaller
{
    private const string ServiceName = "SCPGT";
    private const string DisplayName = "SCPGT";
    private const string Description = "Background sync service";
    private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";

    public static int InstallFromArgs(string[] args, string sourceRoot)
    {
        var installPath = GetArgValue(args, "--installPath")
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "SCPGT");
        var configRoot = GetArgValue(args, "--configRoot")
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "SCPGT");
        var skipCopy = HasFlag(args, "--skip-copy");

        var elevation = EnsureElevated(args);
        if (elevation == ElevationResult.Relaunched)
        {
            return 0;
        }

        if (elevation == ElevationResult.Failed)
        {
            return 1;
        }

        try
        {
            Directory.CreateDirectory(installPath);
            Directory.CreateDirectory(configRoot);

            StopServiceIfExists();
            StopKnownProcesses();

            if (!skipCopy && !PathsEqual(sourceRoot, installPath))
            {
                CopyServiceExecutable(sourceRoot, installPath);
            }

            EnsureConfig(configRoot, sourceRoot);
            ApplyConfigOverrides(configRoot, args);

            var serviceExe = Path.Combine(installPath, "SCPGT.exe");
            if (!File.Exists(serviceExe))
            {
                throw new FileNotFoundException($"Service executable not found: {serviceExe}");
            }

            CreateOrUpdateService(serviceExe, configRoot);
            RegisterListener(serviceExe, configRoot);
            StartService();

            Console.WriteLine($"[{ServiceName}] installed successfully at {installPath}");
            Console.WriteLine($"Config root: {configRoot}");
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[{ServiceName}] install failed: {ex.Message}");
            return 1;
        }
    }

    public static int Uninstall()
    {
        var elevation = EnsureElevated(["--uninstall-service"]);
        if (elevation == ElevationResult.Relaunched)
        {
            return 0;
        }

        if (elevation == ElevationResult.Failed)
        {
            return 1;
        }

        try
        {
            StopServiceIfExists();
            _ = RunSc($"delete \"{ServiceName}\"", allowFailure: true);
            RemoveListenerRegistration();
            Console.WriteLine($"[{ServiceName}] service removed.");
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[{ServiceName}] uninstall failed: {ex.Message}");
            return 1;
        }
    }

    public static int InteractiveSetup(string sourceRoot)
    {
        var defaultInstallPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "SCPGT");
        var defaultConfigRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "SCPGT");
        var wizardState = RunInstallerWizard(defaultInstallPath, defaultConfigRoot);
        if (wizardState is null || !wizardState.Confirmed)
        {
            return 0;
        }

        if (!wizardState.InstallMode)
        {
            return Uninstall();
        }

        var args = new List<string>
        {
            "--install-service",
            "--no-prompt",
            "--installPath", wizardState.InstallPath,
            "--configRoot", wizardState.ConfigRoot,
            "--outlet-id", wizardState.OutletId,
            "--firebase-project-id", wizardState.FirebaseProjectId,
            "--firebase-credentials-path", wizardState.FirebaseCredentialsPath,
            "--pos-server", wizardState.PosServer,
            "--pos-database", wizardState.PosDatabase,
            "--pos-username", wizardState.PosUsername,
            "--pos-password", wizardState.PosPassword
        };

        return InstallFromArgs(args.ToArray(), sourceRoot);
    }

    private static InstallerWizardResult? RunInstallerWizard(string defaultInstallPath, string defaultConfigRoot)
    {
        InstallerWizardResult? wizardResult = null;
        Exception? uiException = null;

        var uiThread = new Thread(() =>
        {
            try
            {
                var app = new Application
                {
                    ShutdownMode = ShutdownMode.OnExplicitShutdown
                };
                var wizard = new InstallerWizardWindow(defaultInstallPath, defaultConfigRoot);
                var accepted = wizard.ShowDialog() == true;
                if (accepted && wizard.Result is { Confirmed: true })
                {
                    wizardResult = wizard.Result;
                }
            }
            catch (Exception ex)
            {
                uiException = ex;
            }
        })
        {
            IsBackground = false
        };
        uiThread.SetApartmentState(ApartmentState.STA);
        uiThread.Start();
        uiThread.Join();

        if (uiException is not null)
        {
            MessageBox.Show(
                $"SCPGT setup UI failed to start: {uiException.Message}",
                "SCPGT Setup",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            return null;
        }

        return wizardResult;
    }

    private static void EnsureConfig(string configRoot, string sourceRoot)
    {
        var target = AppSettingsFile.GetJsonPath(configRoot);
        if (File.Exists(target))
        {
            return;
        }

        var source = AppSettingsFile.GetJsonPath(sourceRoot);
        if (File.Exists(source))
        {
            File.Copy(source, target, overwrite: false);
            return;
        }

        AppSettingsFile.EnsureJson(configRoot);
    }

    private static void ApplyConfigOverrides(string configRoot, string[] args)
    {
        var path = AppSettingsFile.GetJsonPath(configRoot);
        var root = LoadJson(path);
        var posDb = root["PosDb"] as JsonObject ?? new JsonObject();
        var outlet = root["Outlet"] as JsonObject ?? new JsonObject();
        var firebase = root["Firebase"] as JsonObject ?? new JsonObject();

        SetStringIfProvided(posDb, "ConnectionString", GetArgValue(args, "--pos-connection-string"));
        SetStringIfProvided(posDb, "Server", GetArgValue(args, "--pos-server"));
        SetStringIfProvided(posDb, "Database", GetArgValue(args, "--pos-database"));
        SetStringIfProvided(posDb, "Username", GetArgValue(args, "--pos-username"));
        SetStringIfProvided(posDb, "Password", GetArgValue(args, "--pos-password"));
        SetStringIfProvided(outlet, "Id", GetArgValue(args, "--outlet-id"));
        SetStringIfProvided(firebase, "ProjectId", GetArgValue(args, "--firebase-project-id"));
        SetStringIfProvided(firebase, "CredentialsPath", GetArgValue(args, "--firebase-credentials-path"));

        var canPrompt = Environment.UserInteractive && !HasFlag(args, "--no-prompt");
        if (canPrompt)
        {
            PromptForRequiredValues(posDb, outlet, firebase);
        }

        root["PosDb"] = posDb;
        root["Outlet"] = outlet;
        root["Firebase"] = firebase;

        File.WriteAllText(path, root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }

    private static JsonObject LoadJson(string path)
    {
        try
        {
            return (JsonNode.Parse(File.ReadAllText(path)) as JsonObject) ?? new JsonObject();
        }
        catch
        {
            return new JsonObject();
        }
    }

    private static void PromptForRequiredValues(JsonObject posDb, JsonObject outlet, JsonObject firebase)
    {
        outlet["Id"] = PromptIfMissing(
            outlet,
            "Id",
            "Outlet UUID (public.outlets.id)",
            static value => Guid.TryParse(value, out _),
            "Outlet UUID must be a valid GUID.");

        firebase["ProjectId"] = PromptIfMissing(
            firebase,
            "ProjectId",
            "Firebase Project ID",
            static value => !string.IsNullOrWhiteSpace(value),
            "Firebase Project ID is required.");

        firebase["CredentialsPath"] = PromptIfMissing(
            firebase,
            "CredentialsPath",
            "Firebase credentials JSON path",
            static value => !string.IsNullOrWhiteSpace(value) && File.Exists(value),
            "Firebase credentials file must exist.");

        var currentServer = ReadString(posDb, "Server");
        if (IsPlaceholder(currentServer))
        {
            posDb["Server"] = PromptWithDefault("POS SQL Server", "localhost");
        }

        var currentDb = ReadString(posDb, "Database");
        if (IsPlaceholder(currentDb))
        {
            posDb["Database"] = PromptWithDefault("POS SQL Database", "MINTPOS");
        }

        var currentUser = ReadString(posDb, "Username");
        if (IsPlaceholder(currentUser))
        {
            posDb["Username"] = PromptWithDefault("POS SQL Username", "mint");
        }

        var currentPassword = ReadString(posDb, "Password");
        if (IsPlaceholder(currentPassword))
        {
            posDb["Password"] = PromptWithDefault("POS SQL Password", string.Empty);
        }
    }

    private static string PromptIfMissing(
        JsonObject section,
        string key,
        string label,
        Func<string, bool> validator,
        string invalidMessage)
    {
        var current = ReadString(section, key);
        if (!IsPlaceholder(current))
        {
            return current!;
        }

        while (true)
        {
            var value = Interaction.InputBox(label, "SCPGT Setup", string.Empty).Trim();
            if (validator(value))
            {
                return value;
            }

            _ = MessageBox.Show(invalidMessage, "SCPGT Setup", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    private static string PromptWithDefault(string label, string defaultValue)
    {
        var value = Interaction.InputBox(label, "SCPGT Setup", defaultValue);
        return string.IsNullOrWhiteSpace(value) ? defaultValue : value.Trim();
    }

    private static string? ReadString(JsonObject section, string key)
    {
        return section[key]?.GetValue<string>()?.Trim();
    }

    private static bool IsPlaceholder(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        return value.Contains("YOUR-PROJECT", StringComparison.OrdinalIgnoreCase)
            || value.Contains("CHANGE_ME", StringComparison.OrdinalIgnoreCase)
            || value == "00000000-0000-0000-0000-000000000000";
    }

    private static void SetStringIfProvided(JsonObject section, string key, string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            section[key] = value.Trim();
        }
    }

    private static void StopKnownProcesses()
    {
        var names = new[] { "SCPGT", "PosSyncService", "TimeSettingsLock" };
        foreach (var name in names)
        {
            foreach (var process in Process.GetProcessesByName(name))
            {
                try
                {
                    process.Kill(entireProcessTree: true);
                }
                catch
                {
                    // Best effort.
                }
            }
        }
    }

    private static void CreateOrUpdateService(string serviceExe, string configRoot)
    {
        var binPath = $"\\\"{serviceExe}\\\" --run-as-service --contentRoot \\\"{configRoot}\\\"";
        if (ServiceExists())
        {
            _ = RunSc($"config \"{ServiceName}\" binPath= \"{binPath}\" start= auto");
        }
        else
        {
            _ = RunSc($"create \"{ServiceName}\" binPath= \"{binPath}\" start= auto DisplayName= \"{DisplayName}\"");
        }

        _ = RunSc($"description \"{ServiceName}\" \"{Description}\"", allowFailure: true);
    }

    private static void StartService()
    {
        _ = RunSc($"start \"{ServiceName}\"", allowFailure: true);
    }

    private static void StopServiceIfExists()
    {
        if (!ServiceExists())
        {
            return;
        }

        _ = RunSc($"stop \"{ServiceName}\"", allowFailure: true);
    }

    private static bool ServiceExists()
    {
        var result = RunSc($"query \"{ServiceName}\"", allowFailure: true);
        return result.ExitCode == 0;
    }

    private static void RegisterListener(string serviceExe, string configRoot)
    {
        var value = $"\"{serviceExe}\" --listener --contentRoot \"{configRoot}\"";
        using var runKey = Registry.LocalMachine.CreateSubKey(RunKeyPath, writable: true);
        runKey?.SetValue(ServiceName, value);
    }

    private static void RemoveListenerRegistration()
    {
        using var runKey = Registry.LocalMachine.CreateSubKey(RunKeyPath, writable: true);
        runKey?.DeleteValue(ServiceName, throwOnMissingValue: false);
    }

    private static (int ExitCode, string StdOut, string StdErr) RunSc(string arguments, bool allowFailure = false)
    {
        var result = RunProcess("sc.exe", arguments);
        if (!allowFailure && result.ExitCode != 0)
        {
            throw new InvalidOperationException($"sc.exe {arguments} failed: {result.StdErr}");
        }

        return result;
    }

    private static (int ExitCode, string StdOut, string StdErr) RunProcess(string fileName, string arguments)
    {
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            }
        };

        process.Start();
        var stdOut = process.StandardOutput.ReadToEnd();
        var stdErr = process.StandardError.ReadToEnd();
        process.WaitForExit();
        return (process.ExitCode, stdOut, stdErr);
    }

    private static ElevationResult EnsureElevated(string[] args)
    {
        if (IsAdministrator())
        {
            return ElevationResult.AlreadyElevated;
        }

        try
        {
            var exePath = Environment.ProcessPath ?? Path.Combine(AppContext.BaseDirectory, "SCPGT.exe");
            var argText = string.Join(" ", args.Select(QuoteArg));
            var startInfo = new ProcessStartInfo
            {
                FileName = exePath,
                Arguments = argText,
                UseShellExecute = true,
                Verb = "runas"
            };
            Process.Start(startInfo);
            return ElevationResult.Relaunched;
        }
        catch
        {
            Console.Error.WriteLine("Administrator permission is required.");
            return ElevationResult.Failed;
        }
    }

    private static bool IsAdministrator()
    {
        using var identity = WindowsIdentity.GetCurrent();
        var principal = new WindowsPrincipal(identity);
        return principal.IsInRole(WindowsBuiltInRole.Administrator);
    }

    private static string QuoteArg(string arg)
    {
        if (string.IsNullOrEmpty(arg))
        {
            return "\"\"";
        }

        if (!arg.Contains(' ') && !arg.Contains('"'))
        {
            return arg;
        }

        return "\"" + arg.Replace("\"", "\\\"") + "\"";
    }

    private static string? GetArgValue(string[] args, string name)
    {
        for (var i = 0; i < args.Length; i++)
        {
            var arg = args[i];
            if (string.Equals(arg, name, StringComparison.OrdinalIgnoreCase))
            {
                return i + 1 < args.Length ? args[i + 1] : null;
            }

            if (arg.StartsWith(name + "=", StringComparison.OrdinalIgnoreCase))
            {
                return arg.Substring(name.Length + 1);
            }
        }

        return null;
    }

    private static bool HasFlag(string[] args, string name)
    {
        return args.Any(arg => string.Equals(arg, name, StringComparison.OrdinalIgnoreCase));
    }

    private static void CopyServiceExecutable(string sourceRoot, string destinationDir)
    {
        Directory.CreateDirectory(destinationDir);

        var sourceExe = ResolveServiceExecutablePath(sourceRoot);
        var targetExe = Path.Combine(destinationDir, "SCPGT.exe");
        File.Copy(sourceExe, targetExe, overwrite: true);
    }

    private static string ResolveServiceExecutablePath(string sourceRoot)
    {
        var fromRoot = Path.Combine(sourceRoot, "SCPGT.exe");
        if (File.Exists(fromRoot))
        {
            return fromRoot;
        }

        var runningExe = Environment.ProcessPath;
        if (!string.IsNullOrWhiteSpace(runningExe) && File.Exists(runningExe))
        {
            return runningExe;
        }

        throw new FileNotFoundException("SCPGT.exe not found next to the installer.", fromRoot);
    }

    private static bool PathsEqual(string left, string right)
    {
        var l = Path.GetFullPath(left).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var r = Path.GetFullPath(right).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        return string.Equals(l, r, StringComparison.OrdinalIgnoreCase);
    }

    private enum ElevationResult
    {
        AlreadyElevated,
        Relaunched,
        Failed
    }
}
