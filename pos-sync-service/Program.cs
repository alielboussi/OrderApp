using System;
using System.Linq;
using System.Threading;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using PosSyncService;
using PosSyncService.Models;

var builder = Host.CreateApplicationBuilder(args);
var runAsService = args.Any(static a => string.Equals(a, "--run-as-service", StringComparison.OrdinalIgnoreCase));
var runStatusUi = args.Any(static a => string.Equals(a, "--status-ui", StringComparison.OrdinalIgnoreCase)) || !runAsService;

builder.Services.Configure<PosDbOptions>(builder.Configuration.GetSection("PosDb"));
builder.Services.Configure<OutletOptions>(builder.Configuration.GetSection("Outlet"));
builder.Services.Configure<SupabaseOptions>(builder.Configuration.GetSection("Supabase"));
builder.Services.Configure<SyncOptions>(builder.Configuration.GetSection("Sync"));
builder.Services.AddSingleton<PosRepository>();
builder.Services.AddSingleton<SupabaseClient>();
builder.Services.AddSingleton<SyncRunner>();
builder.Services.AddSingleton<StatusUi>();
builder.Services.AddHttpClient("Supabase");
builder.Services.AddHostedService<PosSyncWorker>();

builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "TimeSettingsLock";
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

if (runStatusUi)
{
    using var scope = host.Services.CreateScope();
    var ui = scope.ServiceProvider.GetRequiredService<StatusUi>();
    await ui.RunAsync(CancellationToken.None);
}
else
{
    await host.RunAsync();
}
