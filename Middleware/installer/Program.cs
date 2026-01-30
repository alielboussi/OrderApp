using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security.Principal;

const string ServiceName = "UltraAutomaticScreenSaver";
const string DisplayName = "Ultra Automatic Screen Saver";
const string Description = "POS sync and stock update service";
const string InstallPath = "C:\\Program Files\\UltraAutomaticScreenSaver";
const string ConfigRootName = "Ultra Automatic Screen Saver";

if (!IsAdministrator())
{
    Console.WriteLine("ERROR: Run this installer as Administrator.");
    Environment.Exit(1);
}

var sourcePath = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
var configRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), ConfigRootName);
var exePath = Path.Combine(InstallPath, "UltraAutomaticScreenSaver.exe");
var templatePath = Path.Combine(sourcePath, "appsettings.template.json");

Directory.CreateDirectory(InstallPath);
CopyAll(sourcePath, InstallPath);

Directory.CreateDirectory(configRoot);
var configPath = Path.Combine(configRoot, "appsettings.json");
if (!File.Exists(configPath) && File.Exists(templatePath))
{
    File.Copy(templatePath, configPath, overwrite: true);
}

var binArgs = $"\"{exePath}\" --run-as-service --contentRoot \"{configRoot}\"";

if (ServiceExists(ServiceName))
{
    Run("sc.exe", $"stop {ServiceName}");
    Run("sc.exe", $"config {ServiceName} binPath= {binArgs}");
}
else
{
    Run("sc.exe", $"create {ServiceName} binPath= {binArgs} DisplayName= \"{DisplayName}\" start= auto");
    Run("sc.exe", $"description {ServiceName} \"{Description}\"");
}

Run("sc.exe", $"start {ServiceName}");
Console.WriteLine("Install complete. Edit appsettings.json and restart the service if needed.");

static bool IsAdministrator()
{
    var identity = WindowsIdentity.GetCurrent();
    var principal = new WindowsPrincipal(identity);
    return principal.IsInRole(WindowsBuiltInRole.Administrator);
}

static bool ServiceExists(string name)
{
    var output = Run("sc.exe", $"query {name}");
    return output.Contains("STATE", StringComparison.OrdinalIgnoreCase);
}

static string Run(string file, string args)
{
    var startInfo = new ProcessStartInfo
    {
        FileName = file,
        Arguments = args,
        UseShellExecute = false,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        CreateNoWindow = true
    };
    using var proc = Process.Start(startInfo);
    if (proc == null) return string.Empty;
    var output = proc.StandardOutput.ReadToEnd() + proc.StandardError.ReadToEnd();
    proc.WaitForExit();
    return output;
}

static void CopyAll(string sourceDir, string destDir)
{
    var source = new DirectoryInfo(sourceDir);
    foreach (var dir in source.GetDirectories())
    {
        if (dir.Name.Equals("installer", StringComparison.OrdinalIgnoreCase))
        {
            continue;
        }
        Directory.CreateDirectory(Path.Combine(destDir, dir.Name));
        CopyAll(dir.FullName, Path.Combine(destDir, dir.Name));
    }

    foreach (var file in source.GetFiles())
    {
        if (file.Name.EndsWith(".pdb", StringComparison.OrdinalIgnoreCase))
        {
            continue;
        }
        var target = Path.Combine(destDir, file.Name);
        file.CopyTo(target, overwrite: true);
    }
}
