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
        return LoadSyncDateUtc(contentRoot, "MinSaleDateUtc");
    }

    public static DateTime? LoadMaxSaleDateUtc(string contentRoot)
    {
        return LoadSyncDateUtc(contentRoot, "MaxSaleDateUtc");
    }

    public static void SaveMinSaleDateUtc(string contentRoot, DateTime utc)
    {
        SaveSyncWindow(contentRoot, utc, null);
    }

    public static void SaveMaxSaleDateUtc(string contentRoot, DateTime utc)
    {
        SaveSyncWindow(contentRoot, null, utc);
    }

    public static void ClearMaxSaleDateUtc(string contentRoot)
    {
        ClearSyncValue(contentRoot, "MaxSaleDateUtc");
    }

    public static void SaveSyncWindow(string contentRoot, DateTime? minUtc, DateTime? maxUtc)
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

        if (minUtc.HasValue)
        {
            sync["MinSaleDateUtc"] = minUtc.Value.ToString("O", CultureInfo.InvariantCulture);
        }

        if (maxUtc.HasValue)
        {
            sync["MaxSaleDateUtc"] = maxUtc.Value.ToString("O", CultureInfo.InvariantCulture);
        }

        root["Sync"] = sync;

        var options = new JsonSerializerOptions { WriteIndented = true };
        File.WriteAllText(path, root.ToJsonString(options));
    }

    private static void ClearSyncValue(string contentRoot, string key)
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
        if (sync.ContainsKey(key))
        {
            sync.Remove(key);
            root["Sync"] = sync;

            var options = new JsonSerializerOptions { WriteIndented = true };
            File.WriteAllText(path, root.ToJsonString(options));
        }
    }

    private static DateTime? LoadSyncDateUtc(string contentRoot, string key)
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
            var raw = sync?[key]?.GetValue<string>();
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
