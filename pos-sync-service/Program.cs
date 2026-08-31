using System;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using PosSyncService;
using PosSyncService.Models;

var settings = new HostApplicationBuilderSettings { Args = args };
var contentRoot = GetArgValue(args, "--contentRoot");
if (!string.IsNullOrWhiteSpace(contentRoot))
{
    settings.ContentRootPath = contentRoot;
}
else
{
    contentRoot = AppContext.BaseDirectory;
    settings.ContentRootPath = contentRoot;
}

var builder = Host.CreateApplicationBuilder(settings);
var runAsService = args.Any(static a => string.Equals(a, "--run-as-service", StringComparison.OrdinalIgnoreCase));
var runListener = args.Any(static a => string.Equals(a, "--listener", StringComparison.OrdinalIgnoreCase));
var runUi = args.Any(static a => string.Equals(a, "--ui", StringComparison.OrdinalIgnoreCase));
var installService = args.Any(static a => string.Equals(a, "--install-service", StringComparison.OrdinalIgnoreCase));
var uninstallService = args.Any(static a => string.Equals(a, "--uninstall-service", StringComparison.OrdinalIgnoreCase));
var hasExplicitMode = runAsService || runListener || runUi || installService || uninstallService;

if (!hasExplicitMode && Environment.UserInteractive)
{
    Environment.ExitCode = ServiceInstaller.InteractiveSetup(settings.ContentRootPath ?? AppContext.BaseDirectory);
    return;
}

if (installService)
{
    Environment.ExitCode = ServiceInstaller.InstallFromArgs(args, settings.ContentRootPath ?? AppContext.BaseDirectory);
    return;
}

if (uninstallService)
{
    Environment.ExitCode = ServiceInstaller.Uninstall();
    return;
}

var configRoot = settings.ContentRootPath ?? AppContext.BaseDirectory;
ProgramDataLogWriter.Initialize(configRoot);
RegisterGlobalErrorHandlers(configRoot);

var legacyIniPath = AppSettingsFile.GetIniPath(configRoot);
var jsonPath = AppSettingsFile.GetJsonPath(configRoot);
if (!File.Exists(jsonPath) && !File.Exists(legacyIniPath))
{
    AppSettingsFile.EnsureJson(configRoot);
}

builder.Configuration
    .AddIniFile(legacyIniPath, optional: true, reloadOnChange: true)
    .AddJsonFile(jsonPath, optional: true, reloadOnChange: true);

builder.Services.AddOptions<PosDbOptions>()
    .Bind(builder.Configuration.GetSection("PosDb"))
    .Validate(
        o => !string.IsNullOrWhiteSpace(o.GetEffectiveConnectionString()),
        "PosDb requires ConnectionString, or Server + Database (+ Username/Password when not IntegratedSecurity)"
    )
    .ValidateOnStart();

builder.Services.AddOptions<OutletOptions>()
    .Bind(builder.Configuration.GetSection("Outlet"))
    .Validate(o => o.Id != Guid.Empty, "Outlet:Id is required and must be a valid UUID from public.outlets")
    .ValidateOnStart();

var cloudBackend = builder.Configuration.GetValue<string>("Cloud:Backend") ?? "Portal";
var useFirebase = cloudBackend.Equals("Firebase", StringComparison.OrdinalIgnoreCase);
var usePortal = cloudBackend.Equals("Portal", StringComparison.OrdinalIgnoreCase);

if (useFirebase)
{
    builder.Services.AddOptions<FirebaseOptions>()
        .Bind(builder.Configuration.GetSection("Firebase"))
        .Validate(o => !string.IsNullOrWhiteSpace(o.ProjectId), "Firebase:ProjectId is required when Cloud:Backend=Firebase")
        .ValidateOnStart();
    builder.Services.AddSingleton<FirebaseFirestoreAccess>();
    builder.Services.AddSingleton<IOutletCloudClient, FirebaseCloudClient>();
}
else if (usePortal)
{
    builder.Services.AddOptions<PortalOptions>()
        .Bind(builder.Configuration.GetSection("Portal"))
        .Validate(
            o =>
                !string.IsNullOrWhiteSpace(o.CredentialsPath) ||
                (!string.IsNullOrWhiteSpace(o.BaseUrl) && !string.IsNullOrWhiteSpace(o.MiddlewareToken)),
            "Portal requires CredentialsPath, or BaseUrl + MiddlewareToken")
        .ValidateOnStart();
    builder.Services.AddHttpClient("Portal", client =>
    {
        client.Timeout = TimeSpan.FromSeconds(120);
    });
    builder.Services.AddSingleton<IOutletCloudClient, PortalCloudClient>();
}
else
{
    throw new InvalidOperationException($"Unsupported Cloud:Backend '{cloudBackend}'. Use Portal or Firebase.");
}

builder.Services.AddOptions<SyncOptions>()
    .Bind(builder.Configuration.GetSection("Sync"))
    .Validate(o => o.PollSeconds > 0, "Sync:PollSeconds must be > 0")
    .Validate(o => o.BatchSize > 0, "Sync:BatchSize must be > 0")
    .ValidateOnStart();
builder.Services.AddSingleton<PosRepository>();
builder.Services.AddSingleton<PosCatalogRepository>();
builder.Services.AddSingleton<PosCashierRepository>();
builder.Services.AddSingleton<SyncRunner>();
builder.Services.AddSingleton<ScpgtCoordinator>();
if (runAsService)
{
    builder.Services.AddHostedService<PosSyncWorker>();
}

builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "SCPGT";
});

builder.Services.Configure<LoggerFilterOptions>(options =>
{
    options.MinLevel = LogLevel.Information;
});

builder.Services.AddLogging(logging =>
{
    logging.AddSimpleConsole();
    logging.AddProvider(new ProgramDataFileLoggerProvider(configRoot, LogLevel.Debug));
    logging.AddFilter("Microsoft", LogLevel.Warning);
    logging.AddFilter("System", LogLevel.Warning);
    logging.AddFilter("PosSyncService", LogLevel.Debug);
});

try
{
    using var host = builder.Build();

    if (runListener || (!runAsService && !runUi))
    {
        ConsoleWindowHelper.Hide();
        using var cts = new CancellationTokenSource();
        var listener = new ScpgtListener(settings.ContentRootPath ?? AppContext.BaseDirectory);
        listener.Run(cts.Token);
    }
    else if (runUi)
    {
        ConsoleWindowHelper.Hide();
        var uiThread = new Thread(() =>
        {
            ScpgtUi.Run(host);
        })
        {
            IsBackground = false
        };
        uiThread.SetApartmentState(ApartmentState.STA);
        uiThread.Start();
        uiThread.Join();
    }
    else
    {
        await host.RunAsync();
    }
}
catch (Exception ex)
{
    ProgramDataLogWriter.Write(LogLevel.Critical, "Program", "Middleware failed to start or run.", ex);
    throw;
}

static void RegisterGlobalErrorHandlers(string _)
{
    AppDomain.CurrentDomain.UnhandledException += (_, args) =>
    {
        ProgramDataLogWriter.Write(
            LogLevel.Critical,
            "AppDomain",
            "Unhandled exception — middleware may terminate.",
            args.ExceptionObject as Exception);
    };

    TaskScheduler.UnobservedTaskException += (_, args) =>
    {
        ProgramDataLogWriter.Write(
            LogLevel.Error,
            "TaskScheduler",
            "Unobserved task exception.",
            args.Exception);
        args.SetObserved();
    };
}

static string? GetArgValue(string[] args, string name)
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

static class ConsoleWindowHelper
{
    private const int SwHide = 0;

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetConsoleWindow();

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    public static void Hide()
    {
        var window = GetConsoleWindow();
        if (window != IntPtr.Zero)
        {
            ShowWindow(window, SwHide);
        }
    }
}
