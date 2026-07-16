namespace PosSyncService.Models;

public sealed class PosDbOptions
{
    public string ConnectionString { get; init; } = string.Empty;
    public string Server { get; init; } = string.Empty;
    public string Database { get; init; } = string.Empty;
    public string Username { get; init; } = string.Empty;
    public string Password { get; init; } = string.Empty;
    public bool TrustServerCertificate { get; init; } = true;
    public bool IntegratedSecurity { get; init; } = false;
    public bool Encrypt { get; init; } = false;

    public string GetEffectiveConnectionString()
    {
        if (!string.IsNullOrWhiteSpace(ConnectionString))
        {
            return ConnectionString;
        }

        if (string.IsNullOrWhiteSpace(Server) || string.IsNullOrWhiteSpace(Database))
        {
            return string.Empty;
        }

        var builder = new Microsoft.Data.SqlClient.SqlConnectionStringBuilder
        {
            DataSource = Server,
            InitialCatalog = Database,
            TrustServerCertificate = TrustServerCertificate,
            IntegratedSecurity = IntegratedSecurity,
            Encrypt = Encrypt
        };

        if (!IntegratedSecurity)
        {
            builder.UserID = Username;
            builder.Password = Password;
        }

        return builder.ConnectionString;
    }
}

public sealed class OutletOptions
{
    public Guid Id { get; init; }
}

public sealed class SupabaseOptions
{
    public string Url { get; init; } = string.Empty;
    public string AnonKey { get; init; } = string.Empty;
    public string ServiceKey { get; init; } = string.Empty;
}

public sealed class SyncOptions
{
    public int PollSeconds { get; init; } = 60;
    public int BatchSize { get; init; } = 100;
    public string SourceSystem { get; init; } = "afterten-pos";
    public DateTime? MinSaleDateUtc { get; init; }
    public DateTime? MaxSaleDateUtc { get; init; }
    public bool IncludeProcessed { get; init; } = false;
    /// <summary>How many read/upload batches to run per poll cycle (clears backlogs without waiting for the next poll).</summary>
    public int MaxBatchesPerCycle { get; init; } = 20;
    /// <summary>How often to pull MintPOS SKUs into Supabase catalog (same poll loop as heartbeat).</summary>
    public int PosCatalogSyncMinutes { get; init; } = 5;
    /// <summary>
    /// Re-check recent MintPOS Processed bills against Supabase and re-queue any missing as Pending.
    /// Covers false Processed after shift changes / failed verifies.
    /// </summary>
    public int ReclaimProcessedLookbackDays { get; init; } = 3;
    /// <summary>Max Processed bills to verify against Supabase per reclaim pass.</summary>
    public int ReclaimProcessedBatchSize { get; init; } = 400;
}
