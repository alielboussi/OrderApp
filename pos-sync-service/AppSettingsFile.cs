using System;
using System.IO;
using System.Text;

namespace PosSyncService;

public static class AppSettingsFile
{
    public const string JsonFileName = "appsettings.json";
    public const string IniFileName = "appsettings.txt";

    public static string GetJsonPath(string contentRoot)
    {
        if (string.IsNullOrWhiteSpace(contentRoot))
        {
            return Path.Combine(AppContext.BaseDirectory, JsonFileName);
        }

        return Path.Combine(contentRoot, JsonFileName);
    }

    public static string GetIniPath(string contentRoot)
    {
        if (string.IsNullOrWhiteSpace(contentRoot))
        {
            return Path.Combine(AppContext.BaseDirectory, IniFileName);
        }

        return Path.Combine(contentRoot, IniFileName);
    }

    public static string EnsureJson(string contentRoot)
    {
        var root = string.IsNullOrWhiteSpace(contentRoot) ? AppContext.BaseDirectory : contentRoot;
        Directory.CreateDirectory(root);
        var path = GetJsonPath(root);
        if (File.Exists(path))
        {
            return path;
        }

        var builder = new StringBuilder();
        builder.AppendLine("{");
        builder.AppendLine("  \"PosDb\": {");
        builder.AppendLine("    \"ConnectionString\": \"\",");
        builder.AppendLine("    \"Server\": \"localhost\",");
        builder.AppendLine("    \"Database\": \"MINTPOS\",");
        builder.AppendLine("    \"Username\": \"mint\",");
        builder.AppendLine("    \"Password\": \"CHANGE_ME\",");
        builder.AppendLine("    \"TrustServerCertificate\": true,");
        builder.AppendLine("    \"IntegratedSecurity\": false,");
        builder.AppendLine("    \"Encrypt\": false");
        builder.AppendLine("  },");
        builder.AppendLine("  \"Outlet\": {");
        builder.AppendLine("    \"Id\": \"00000000-0000-0000-0000-000000000000\"");
        builder.AppendLine("  },");
        builder.AppendLine("  \"Supabase\": {");
        builder.AppendLine("    \"Url\": \"https://YOUR-PROJECT.supabase.co\",");
        builder.AppendLine("    \"AnonKey\": \"SUPABASE_ANON_KEY\",");
        builder.AppendLine("    \"ServiceKey\": \"SUPABASE_SERVICE_ROLE_KEY\"");
        builder.AppendLine("  },");
        builder.AppendLine("  \"Sync\": {");
        builder.AppendLine("    \"PollSeconds\": 60,");
        builder.AppendLine("    \"BatchSize\": 100,");
        builder.AppendLine("    \"SourceSystem\": \"afterten-pos\",");
        builder.AppendLine("    \"IncludeProcessed\": false,");
        builder.AppendLine("    \"MaxBatchesPerCycle\": 20,");
        builder.AppendLine("    \"PosCatalogSyncMinutes\": 30");
        builder.AppendLine("  },");
        builder.AppendLine("  \"Logging\": {");
        builder.AppendLine("    \"LogLevel\": {");
        builder.AppendLine("      \"Default\": \"Information\"");
        builder.AppendLine("    }");
        builder.AppendLine("  }");
        builder.AppendLine("}");

        File.WriteAllText(path, builder.ToString());
        return path;
    }
}
