using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security.Principal;
using System.Windows;
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
                CopyDirectory(sourceRoot, installPath);
            }

            EnsureConfig(configRoot, sourceRoot);

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
        var choice = MessageBox.Show(
            "SCPGT setup\n\nYes = Install/Update service\nNo = Uninstall service\nCancel = Close",
            "SCPGT",
            MessageBoxButton.YesNoCancel,
            MessageBoxImage.Question);

        return choice switch
        {
            MessageBoxResult.Yes => InstallFromArgs(["--install-service"], sourceRoot),
            MessageBoxResult.No => Uninstall(),
            _ => 0
        };
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

    private static void CopyDirectory(string sourceDir, string destinationDir)
    {
        Directory.CreateDirectory(destinationDir);

        foreach (var file in Directory.EnumerateFiles(sourceDir))
        {
            var fileName = Path.GetFileName(file);
            var target = Path.Combine(destinationDir, fileName);
            File.Copy(file, target, overwrite: true);
        }

        foreach (var subDir in Directory.EnumerateDirectories(sourceDir))
        {
            var name = Path.GetFileName(subDir);
            var target = Path.Combine(destinationDir, name);
            CopyDirectory(subDir, target);
        }
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
