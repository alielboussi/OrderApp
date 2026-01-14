using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using PosSyncService;
using PosSyncService.Models;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.Configure<PosDbOptions>(builder.Configuration.GetSection("PosDb"));
builder.Services.Configure<OutletOptions>(builder.Configuration.GetSection("Outlet"));
builder.Services.Configure<SupabaseOptions>(builder.Configuration.GetSection("Supabase"));
builder.Services.Configure<SyncOptions>(builder.Configuration.GetSection("Sync"));
builder.Services.AddSingleton<PosRepository>();
builder.Services.AddSingleton<SupabaseClient>();
builder.Services.AddHttpClient("Supabase");
builder.Services.AddHostedService<PosSyncWorker>();

builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "PosSupabaseSync";
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

var host = builder.Build();
await host.RunAsync();
