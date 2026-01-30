using System;
using System.Globalization;
using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace PosSyncService;

public static class ConfigStore
{
    public static DateTime? LoadMinSaleDateUtc(string contentRoot)
    {
        var path = ResolveConfigPath(contentRoot);
        if (path == null || !File.Exists(path))
        {
            return null;
        }

        try
        {
            var root = JsonNode.Parse(File.ReadAllText(path)) as JsonObject;
            var sync = root?["Sync"] as JsonObject;
            var raw = sync?["MinSaleDateUtc"]?.GetValue<string>();
            if (DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal, out var parsed))
            {
                return DateTime.SpecifyKind(parsed, DateTimeKind.Utc);
            }
        }
        catch
        {
            return null;
        }

        return null;
    }

    public static void SaveMinSaleDateUtc(string contentRoot, DateTime utc)
    {
        var path = ResolveConfigPath(contentRoot, ensureDirectory: true);
        if (path == null)
        {
            throw new InvalidOperationException("Unable to resolve appsettings.json path.");
        }

        JsonObject root;
        try
        {
            root = (JsonNode.Parse(File.ReadAllText(path)) as JsonObject) ?? new JsonObject();
        }
        catch
        {
            root = new JsonObject();
        }

        var sync = root["Sync"] as JsonObject ?? new JsonObject();
        sync["MinSaleDateUtc"] = utc.ToString("O", CultureInfo.InvariantCulture);
        root["Sync"] = sync;

        var options = new JsonSerializerOptions { WriteIndented = true };
        File.WriteAllText(path, root.ToJsonString(options));
    }

    private static string? ResolveConfigPath(string contentRoot, bool ensureDirectory = false)
    {
        if (string.IsNullOrWhiteSpace(contentRoot))
        {
            return null;
        }

        if (ensureDirectory)
        {
            Directory.CreateDirectory(contentRoot);
        }

        return Path.Combine(contentRoot, "appsettings.json");
    }
}
