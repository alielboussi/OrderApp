using System;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
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

var appSettingsPath = AppSettingsFile.Ensure(settings.ContentRootPath ?? AppContext.BaseDirectory);
builder.Configuration.AddIniFile(appSettingsPath, optional: false, reloadOnChange: true);

builder.Services.AddOptions<PosDbOptions>()
    .Bind(builder.Configuration.GetSection("PosDb"))
    .ValidateOnStart();

builder.Services.AddOptions<OutletOptions>()
    .Bind(builder.Configuration.GetSection("Outlet"))
    .Validate(o => o.Id != Guid.Empty, "Outlet:Id is required and must be a valid UUID from public.outlets")
    .ValidateOnStart();

builder.Services.AddOptions<SupabaseOptions>()
    .Bind(builder.Configuration.GetSection("Supabase"))
    .Validate(o => !string.IsNullOrWhiteSpace(o.Url), "Supabase:Url is required")
    .Validate(o => !string.IsNullOrWhiteSpace(o.ServiceKey), "Supabase:ServiceKey is required")
    .ValidateOnStart();

builder.Services.AddOptions<SyncOptions>()
    .Bind(builder.Configuration.GetSection("Sync"))
    .Validate(o => o.PollSeconds > 0, "Sync:PollSeconds must be > 0")
    .Validate(o => o.BatchSize > 0, "Sync:BatchSize must be > 0")
    .ValidateOnStart();
builder.Services.AddSingleton<PosRepository>();
builder.Services.AddSingleton<SupabaseClient>();
builder.Services.AddSingleton<SyncRunner>();
builder.Services.AddSingleton<ScpgtCoordinator>();
builder.Services.AddHttpClient("Supabase", client =>
{
    client.Timeout = TimeSpan.FromSeconds(180);
});
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
    // Default to Information; override via Logging:LogLevel in config.
    options.MinLevel = LogLevel.Information;
});

builder.Services.AddLogging(logging =>
{
    logging.AddSimpleConsole();
});

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
