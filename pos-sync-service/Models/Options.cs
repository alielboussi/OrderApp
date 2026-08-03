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

public sealed class FirebaseOptions
{
    public string ProjectId { get; init; } = string.Empty;
    /// <summary>Path to service account JSON, or leave empty to use GOOGLE_APPLICATION_CREDENTIALS.</summary>
    public string CredentialsPath { get; init; } = string.Empty;
    /// <summary>Optional Cloud Functions base URL for validate/sync RPC equivalents.</summary>
    public string FunctionsBaseUrl { get; init; } = string.Empty;
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
    /// <summary>How often to pull MintPOS SKUs into Firestore catalog (same poll loop as heartbeat).</summary>
    public int PosCatalogSyncMinutes { get; init; } = 5;
    /// <summary>
    /// Re-check MintPOS Processed bills against the cloud and re-queue any missing as Pending.
    /// 0 = no day cap (use full history from pos_sync_opening when set).
    /// </summary>
    public int ReclaimProcessedLookbackDays { get; init; } = 0;
    /// <summary>Max Processed bills to verify against the cloud per reclaim pass.</summary>
    public int ReclaimProcessedBatchSize { get; init; } = 500;
    /// <summary>How many reclaim passes to run per sync cycle (scans the full Processed queue over time).</summary>
    public int ReclaimProcessedMaxPassesPerCycle { get; init; } = 30;
    /// <summary>Retries when verifying outlet_sales immediately after upload/mark.</summary>
    public int PostMarkVerifyRetries { get; init; } = 3;
    /// <summary>Delay between post-mark verify retries (milliseconds).</summary>
    public int PostMarkVerifyRetryDelayMs { get; init; } = 250;
    /// <summary>When true, stop processing newer pending bills after a hard sync failure (queue head blocks).</summary>
    public bool BlockOnSaleSyncFailure { get; init; } = true;
    /// <summary>Retries for the same bill before blocking the queue for this cycle.</summary>
    public int SaleSyncFailureRetries { get; init; } = 2;
    /// <summary>Delay between sale sync retries (milliseconds).</summary>
    public int SaleSyncFailureRetryDelayMs { get; init; } = 500;
}
