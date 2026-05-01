using System;
using System.IO;
using System.Text;

namespace PosSyncService;

public static class AppSettingsFile
{
    public const string FileName = "appsettings.txt";

    public static string GetPath(string contentRoot)
    {
        if (string.IsNullOrWhiteSpace(contentRoot))
        {
            return Path.Combine(AppContext.BaseDirectory, FileName);
        }

        return Path.Combine(contentRoot, FileName);
    }

    public static string Ensure(string contentRoot)
    {
        var root = string.IsNullOrWhiteSpace(contentRoot) ? AppContext.BaseDirectory : contentRoot;
        Directory.CreateDirectory(root);
        var path = GetPath(root);
        if (File.Exists(path))
        {
            return path;
        }

        var builder = new StringBuilder();
        builder.AppendLine("[PosDb]");
        builder.AppendLine("ConnectionString=Server=localhost;Database=POS;User Id=POSUSER;Password=CHANGE_ME;TrustServerCertificate=True");
        builder.AppendLine();
        builder.AppendLine("[Outlet]");
        builder.AppendLine("Id=00000000-0000-0000-0000-000000000000");
        builder.AppendLine();
        builder.AppendLine("[Supabase]");
        builder.AppendLine("Url=https://YOUR-PROJECT.supabase.co");
        builder.AppendLine("ServiceKey=SUPABASE_SERVICE_ROLE_KEY");
        builder.AppendLine();
        builder.AppendLine("[Sync]");
        builder.AppendLine("BatchSize=50");
        builder.AppendLine("SourceSystem=afterten-pos");
        builder.AppendLine();
        builder.AppendLine("[Logging]");
        builder.AppendLine("LogLevel.Default=Information");

        File.WriteAllText(path, builder.ToString());
        return path;
    }
}
