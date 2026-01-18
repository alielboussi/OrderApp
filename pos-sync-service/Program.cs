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
