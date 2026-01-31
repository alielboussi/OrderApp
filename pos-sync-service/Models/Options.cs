namespace PosSyncService.Models;

public sealed class PosDbOptions
{
    public string ConnectionString { get; init; } = string.Empty;
}

public sealed class OutletOptions
{
    public Guid Id { get; init; }
}

public sealed class SupabaseOptions
{
    public string Url { get; init; } = string.Empty;
    public string ServiceKey { get; init; } = string.Empty;
}

public sealed class SyncOptions
{
    public int PollSeconds { get; init; } = 60;
    public int BatchSize { get; init; } = 50;
    public string SourceSystem { get; init; } = "afterten-pos";
    public DateTime? MinSaleDateUtc { get; init; }
    public DateTime? MaxSaleDateUtc { get; init; }
}
