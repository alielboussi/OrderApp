using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PosSyncService.Models;

namespace PosSyncService;

public sealed class SupabaseClient
{
    private readonly SupabaseOptions _options;
    private readonly OutletOptions _outlet;
    private readonly IHttpClientFactory _clientFactory;
    private readonly ILogger<SupabaseClient> _logger;
    private bool _warnedAnon;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly TimeSpan[] RetryDelays =
    {
        TimeSpan.FromSeconds(2),
        TimeSpan.FromSeconds(5),
        TimeSpan.FromSeconds(10)
    };

    public SupabaseClient(IOptions<SupabaseOptions> options,
                          IOptions<OutletOptions> outlet,
                          IHttpClientFactory clientFactory,
                          ILogger<SupabaseClient> logger)
    {
        _options = options.Value;
        _outlet = outlet.Value;
        _clientFactory = clientFactory;
        _logger = logger;
    }

    public async Task<SupabaseResult> ValidateOrderAsync(PosOrder order, CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty)
        {
            _logger.LogError("Outlet Id is not configured; set Outlet:Id to the outlet UUID in Supabase");
            return new SupabaseResult(false, "Outlet Id is not configured");
        }

        var client = CreateClient();
        var payload = BuildPayload(order);

        try
        {
            var response = await SendWithRetryAsync(
                () => new HttpRequestMessage(HttpMethod.Post, "/rest/v1/rpc/validate_pos_order")
                {
                    Content = JsonContent.Create(new { payload }, options: JsonOptions)
                },
                cancellationToken
            );
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogError("Supabase validation RPC failed {Status}: {Body}", (int)response.StatusCode, body);
                return new SupabaseResult(false, $"Validation RPC failed {(int)response.StatusCode}: {body}");
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var ok = root.TryGetProperty("ok", out var okProp) && okProp.GetBoolean();
            if (ok)
            {
                return new SupabaseResult(true);
            }

            var errors = root.TryGetProperty("errors", out var errorsProp) ? errorsProp.ToString() : "Unknown validation error";
            return new SupabaseResult(false, errors);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error calling Supabase validation RPC");
            return new SupabaseResult(false, ex.Message);
        }
    }

    public async Task LogFailureAsync(PosOrder order, string stage, string errorMessage, object? details, CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty)
        {
            return;
        }

        var client = CreateClient();
        var payload = new
        {
            outlet_id = _outlet.Id,
            source_event_id = order.SourceEventId,
            pos_order_id = order.PosOrderId,
            sale_id = order.PosSaleId,
            stage,
            error_message = errorMessage,
            details
        };

        var request = new HttpRequestMessage(HttpMethod.Post, "/rest/v1/rpc/log_pos_sync_failure")
        {
            Content = JsonContent.Create(new { payload }, options: JsonOptions)
        };

        try
        {
            var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning("Supabase log failure RPC failed {Status}: {Body}", (int)response.StatusCode, body);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error calling Supabase log failure RPC");
        }
    }

    public async Task<bool> OrderExistsAsync(string sourceEventId, CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty || string.IsNullOrWhiteSpace(sourceEventId))
        {
            return false;
        }

        var existing = await GetExistingSourceEventIdsAsync(new[] { sourceEventId }, cancellationToken);
        return existing.Contains(sourceEventId);
    }

    public async Task<HashSet<string>> GetExistingSourceEventIdsAsync(
        IReadOnlyCollection<string> sourceEventIds,
        CancellationToken cancellationToken)
    {
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (_outlet.Id == Guid.Empty || sourceEventIds.Count == 0)
        {
            return result;
        }

        var distinct = sourceEventIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        foreach (var chunk in Chunk(distinct, 40))
        {
            var quoted = string.Join(",", chunk.Select(id => $"\"{id.Replace("\"", "\"\"")}\""));
            var path =
                $"/rest/v1/orders?select=source_event_id&outlet_id=eq.{_outlet.Id}&source_event_id=in.({quoted})";
            var rows = await GetAsync<SourceEventRow[]>(path, cancellationToken);
            if (rows is null)
            {
                continue;
            }

            foreach (var row in rows)
            {
                if (!string.IsNullOrWhiteSpace(row.SourceEventId))
                {
                    result.Add(row.SourceEventId);
                }
            }
        }

        return result;
    }

    public async Task<SupabaseResult> SendOrderAsync(PosOrder order, CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty)
        {
            _logger.LogError("Outlet Id is not configured; set Outlet:Id to the outlet UUID in Supabase");
            return new SupabaseResult(false, "Outlet Id is not configured");
        }

        var client = CreateClient();
        var payload = BuildPayload(order);

        try
        {
            var response = await SendWithRetryAsync(
                () => new HttpRequestMessage(HttpMethod.Post, "/rest/v1/rpc/sync_pos_order")
                {
                    // PostgREST expects RPC arguments by name; wrap the payload under the function parameter key
                    Content = JsonContent.Create(new { payload }, options: JsonOptions)
                },
                cancellationToken
            );
            if (response.IsSuccessStatusCode)
            {
                return new SupabaseResult(true);
            }

            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogError("Supabase RPC failed {Status}: {Body}", (int)response.StatusCode, body);
            return new SupabaseResult(false, $"RPC failed {(int)response.StatusCode}: {body}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error calling Supabase RPC");
            return new SupabaseResult(false, ex.Message);
        }
    }

    public async Task<string[]> GetOutletWarehouseIdsAsync(Guid outletId, CancellationToken cancellationToken)
    {
        if (outletId == Guid.Empty)
        {
            return Array.Empty<string>();
        }

        var path = $"/rest/v1/outlet_warehouses?select=warehouse_id&outlet_id=eq.{outletId}";
        var data = await GetAsync<OutletWarehouseRow[]>(path, cancellationToken);
        return data
            ?.Select(row => row.WarehouseId)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray()
            ?? Array.Empty<string>();
    }

    public async Task<WarehouseRow?> GetWarehouseAsync(string warehouseId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(warehouseId))
        {
            return null;
        }

        var path = $"/rest/v1/warehouses?select=id,name&limit=1&id=eq.{warehouseId}";
        var data = await GetAsync<WarehouseRow[]>(path, cancellationToken);
        return data?.FirstOrDefault();
    }

    public async Task<OutletSyncContext?> GetOutletSyncContextAsync(CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty)
        {
            return null;
        }

        var warehouseIds = await GetOutletWarehouseIdsAsync(_outlet.Id, cancellationToken);
        var warehouseId = warehouseIds.FirstOrDefault();
        SupabaseClient.WarehouseRow? warehouse = null;
        if (!string.IsNullOrWhiteSpace(warehouseId))
        {
            warehouse = await GetWarehouseAsync(warehouseId, cancellationToken);
        }

        var outlet = await GetOutletRowAsync(_outlet.Id, cancellationToken);
        if (outlet is null)
        {
            return null;
        }

        var opening = await GetPosSyncOpeningUtcAsync(cancellationToken);
        var cutoff = await GetPosSyncCutoffUtcAsync(cancellationToken);

        return new OutletSyncContext(
            HasPosMiddleware: outlet.HasPosMiddleware ?? false,
            UsesOrdersApp: outlet.UsesOrdersApp ?? false,
            SyncOpeningUtc: opening,
            SyncCutoffUtc: cutoff,
            WarehouseId: warehouseId,
            WarehouseName: warehouse?.Name
        );
    }

    private async Task<OutletRow?> GetOutletRowAsync(Guid outletId, CancellationToken cancellationToken)
    {
        var path = $"/rest/v1/outlets?select=id,name,has_pos_middleware,uses_orders_app&id=eq.{outletId}&limit=1";
        var data = await GetAsync<OutletRow[]>(path, cancellationToken);
        return data?.FirstOrDefault();
    }

    private sealed record OutletRow(
        [property: JsonPropertyName("id")] Guid Id,
        [property: JsonPropertyName("name")] string? Name,
        [property: JsonPropertyName("has_pos_middleware")] bool? HasPosMiddleware,
        [property: JsonPropertyName("uses_orders_app")] bool? UsesOrdersApp
    );

    public async Task<WarehousePeriodRow?> GetOpenStockPeriodAsync(string warehouseId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(warehouseId))
        {
            return null;
        }

        var path = $"/rest/v1/warehouse_stock_periods?select=id,warehouse_id,status,opened_at,closed_at&warehouse_id=eq.{warehouseId}&status=eq.open&order=opened_at.desc&limit=1";
        var data = await GetAsync<WarehousePeriodRow[]>(path, cancellationToken);
        return data?.FirstOrDefault();
    }

    public async Task<bool> HasStockCountsAsync(string periodId, string kind, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(periodId))
        {
            return false;
        }

        var normalizedKind = string.IsNullOrWhiteSpace(kind) ? "opening" : kind;
        var path = $"/rest/v1/warehouse_stock_counts?select=id&period_id=eq.{periodId}&kind=eq.{normalizedKind}&limit=1";
        var data = await GetAsync<CountRow[]>(path, cancellationToken);
        return data != null && data.Length > 0;
    }

    public async Task<SupabaseResult> StartStockPeriodAsync(string warehouseId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(warehouseId))
        {
            return new SupabaseResult(false, "Warehouse id is required");
        }

        return await PostRpcAsync("/rest/v1/rpc/start_stock_period", new { p_warehouse_id = warehouseId }, cancellationToken);
    }

    public async Task<SupabaseResult> CloseStockPeriodAsync(string periodId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(periodId))
        {
            return new SupabaseResult(false, "Period id is required");
        }

        return await PostRpcAsync("/rest/v1/rpc/close_stock_period", new { p_period_id = periodId }, cancellationToken);
    }

    public async Task<DateTime?> GetPosSyncCutoffUtcAsync(CancellationToken cancellationToken)
    {
        return await GetCounterUtcAsync("pos_sync_cutoff", "cutoff", cancellationToken);
    }

    public async Task<DateTime?> GetPosSyncOpeningUtcAsync(CancellationToken cancellationToken)
    {
        return await GetCounterUtcAsync("pos_sync_opening", "opening", cancellationToken);
    }

    public async Task<DateTime?> GetLastHeartbeatUtcAsync(CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty)
        {
            return null;
        }

        var client = CreateClient();
        try
        {
            var request = new HttpRequestMessage(
                HttpMethod.Get,
                $"/rest/v1/outlet_pos_heartbeats?select=last_seen_at&outlet_id=eq.{_outlet.Id}&limit=1"
            );
            var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array || doc.RootElement.GetArrayLength() == 0)
            {
                return null;
            }

            var root = doc.RootElement[0];
            if (!root.TryGetProperty("last_seen_at", out var seenProp))
            {
                return null;
            }

            if (seenProp.ValueKind != JsonValueKind.String)
            {
                return null;
            }

            if (DateTimeOffset.TryParse(seenProp.GetString(), out var parsed))
            {
                return parsed.UtcDateTime;
            }

            return null;
        }
        catch
        {
            return null;
        }
    }

    public async Task SendHeartbeatAsync(CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty)
        {
            return;
        }

        var payload = new
        {
            outlet_id = _outlet.Id,
            middleware_version = typeof(SupabaseClient).Assembly.GetName().Version?.ToString() ?? "1.0",
            host_name = Environment.MachineName
        };

        try
        {
            var result = await PostRpcAsync("/rest/v1/rpc/upsert_outlet_heartbeat", new { payload }, cancellationToken);
            if (!result.IsSuccess)
            {
                _logger.LogWarning(
                    "Heartbeat RPC failed for outlet {OutletId}: {Error}",
                    _outlet.Id,
                    result.ErrorMessage ?? "Unknown error");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to send outlet heartbeat");
        }
    }

    public async Task<IReadOnlyList<CatalogSyncEvent>> FetchPendingCatalogSyncAsync(CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty)
        {
            return Array.Empty<CatalogSyncEvent>();
        }

        try
        {
            var client = CreateClient();
            var response = await client.PostAsync(
                "/rest/v1/rpc/fetch_outlet_catalog_sync",
                JsonContent.Create(new { p_outlet_id = _outlet.Id, p_limit = 50 }, options: JsonOptions),
                cancellationToken
            );
            if (!response.IsSuccessStatusCode)
            {
                return Array.Empty<CatalogSyncEvent>();
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            var rows = JsonSerializer.Deserialize<CatalogSyncRow[]>(json, JsonOptions) ?? Array.Empty<CatalogSyncRow>();
            return rows.Select(row => new CatalogSyncEvent(
                row.Id,
                row.EntityType,
                row.EntityId,
                row.Payload ?? new CatalogSyncPayload()
            )).ToArray();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch catalog sync events");
            return Array.Empty<CatalogSyncEvent>();
        }
    }

    public async Task MarkCatalogSyncDeliveredAsync(IEnumerable<Guid> eventIds, CancellationToken cancellationToken)
    {
        var ids = eventIds.ToArray();
        if (ids.Length == 0)
        {
            return;
        }

        await PostRpcAsync("/rest/v1/rpc/mark_catalog_sync_delivered", new { p_event_ids = ids }, cancellationToken);
    }

    public async Task<SupabaseResult> SyncPosCatalogSkuMapAsync(
        IReadOnlyList<PosCatalogSkuMapRow> rows,
        bool syncProducts,
        bool syncVariants,
        CancellationToken cancellationToken)
    {
        if (rows.Count == 0)
        {
            return new SupabaseResult(true);
        }

        var payloadRows = rows.Select(row => new
        {
            item_sku = row.ItemSku,
            item_name = syncProducts ? row.ItemName : null,
            variant_name = syncVariants ? row.VariantName : null,
            variant_sku = syncVariants ? row.VariantSku : null
        }).ToArray();

        return await PostRpcAsync(
            "/rest/v1/rpc/sync_pos_catalog_from_middleware",
            new { p_rows = payloadRows },
            cancellationToken
        );
    }

    public async Task<SupabaseResult> SyncOutletPosCatalogBindingsAsync(
        IReadOnlyList<PosCatalogSkuMapRow> rows,
        CancellationToken cancellationToken)
    {
        if (rows.Count == 0 || _outlet.Id == Guid.Empty)
        {
            return new SupabaseResult(true);
        }

        var payloadRows = rows.Select(row => new
        {
            item_sku = row.ItemSku,
            item_name = row.ItemName,
            variant_name = row.VariantName,
            variant_sku = row.VariantSku
        }).ToArray();

        return await PostRpcAsync(
            "/rest/v1/rpc/sync_outlet_pos_catalog_bindings",
            new { p_outlet_id = _outlet.Id, p_rows = payloadRows },
            cancellationToken
        );
    }

    public async Task<SupabaseResult> SyncPosMenuGroupsAsync(
        IReadOnlyList<PosMenuGroupMapRow> rows,
        CancellationToken cancellationToken)
    {
        if (rows.Count == 0)
        {
            return new SupabaseResult(true);
        }

        var payloadRows = rows.Select(row => new
        {
            group_name = row.GroupName,
            pos_menu_group_id = row.PosMenuGroupId,
            item_sku = row.ItemSku
        }).ToArray();

        return await PostRpcAsync(
            "/rest/v1/rpc/sync_pos_menu_groups_from_middleware",
            new { p_rows = payloadRows },
            cancellationToken
        );
    }

    private sealed record CatalogSyncRow(
        [property: JsonPropertyName("id")] Guid Id,
        [property: JsonPropertyName("entity_type")] string? EntityType,
        [property: JsonPropertyName("entity_id")] string EntityId,
        [property: JsonPropertyName("payload")] CatalogSyncPayload? Payload
    );

    private async Task<DateTime?> GetCounterUtcAsync(string counterKey, string label, CancellationToken cancellationToken)
    {
        if (_outlet.Id == Guid.Empty)
        {
            return null;
        }

        var lastValue = await TryReadCounterLastValueAsync(counterKey, label, cancellationToken);
        if (!lastValue.HasValue)
        {
            lastValue = await TryReadCounterLastValueViaRpcAsync(counterKey, label, cancellationToken);
        }

        if (!lastValue.HasValue || lastValue.Value < 0)
        {
            return null;
        }

        return DateTimeOffset.FromUnixTimeSeconds(lastValue.Value).UtcDateTime;
    }

    private async Task<long?> TryReadCounterLastValueAsync(
        string counterKey,
        string label,
        CancellationToken cancellationToken)
    {
        var client = CreateClient();

        try
        {
            var request = new HttpRequestMessage(
                HttpMethod.Get,
                $"/rest/v1/counter_values?select=last_value&counter_key=eq.{counterKey}&scope_id=eq.{_outlet.Id}&limit=1"
            );

            var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogError(
                    "Supabase counter read failed for {Label} {Status}: {Body}",
                    label,
                    (int)response.StatusCode,
                    body);
                return null;
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array || doc.RootElement.GetArrayLength() == 0)
            {
                _logger.LogWarning("Supabase counter read returned no rows for {Label} key={CounterKey}.", label, counterKey);
                return null;
            }

            var entry = doc.RootElement[0];
            if (!entry.TryGetProperty("last_value", out var lastValueProp))
            {
                _logger.LogWarning("Supabase counter read missing last_value for {Label} key={CounterKey}.", label, counterKey);
                return null;
            }

            return lastValueProp.GetInt64();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Supabase counter read crashed for {Label} key={CounterKey}.", label, counterKey);
            return null;
        }
    }

    private async Task<long?> TryReadCounterLastValueViaRpcAsync(
        string counterKey,
        string label,
        CancellationToken cancellationToken)
    {
        try
        {
            var response = await SendWithRetryAsync(
                () => new HttpRequestMessage(HttpMethod.Post, "/rest/v1/rpc/debug_pos_sync_counter")
                {
                    Content = JsonContent.Create(
                        new { p_scope_id = _outlet.Id, p_counter_key = counterKey },
                        options: JsonOptions)
                },
                cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogError(
                    "Supabase {Label} RPC check failed {Status}: {Body}",
                    label,
                    (int)response.StatusCode,
                    body);
                return null;
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array || doc.RootElement.GetArrayLength() == 0)
            {
                return null;
            }

            var entry = doc.RootElement[0];
            if (!entry.TryGetProperty("last_value", out var lastValueProp))
            {
                return null;
            }

            return lastValueProp.GetInt64();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking POS sync {Label} via RPC", label);
            return null;
        }
    }

    private HttpClient CreateClient()
    {
        var client = _clientFactory.CreateClient("Supabase");
        client.BaseAddress = new Uri(NormalizeSupabaseBaseUrl(_options.Url));
        var key = ResolveAuthKey();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", key);
        if (!client.DefaultRequestHeaders.Contains("apikey"))
        {
            client.DefaultRequestHeaders.Add("apikey", key);
        }
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return client;
    }

    private static string NormalizeSupabaseBaseUrl(string? url)
    {
        var value = (url ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(value))
        {
            return "https://localhost/";
        }

        value = value.TrimEnd('/');
        const string restV1 = "/rest/v1";
        if (value.EndsWith(restV1, StringComparison.OrdinalIgnoreCase))
        {
            value = value[..^restV1.Length];
        }

        return value + "/";
    }

    private string ResolveAuthKey()
    {
        if (!string.IsNullOrWhiteSpace(_options.ServiceKey))
        {
            return _options.ServiceKey;
        }

        if (!string.IsNullOrWhiteSpace(_options.AnonKey))
        {
            if (!_warnedAnon)
            {
                _logger.LogWarning("Supabase using AnonKey; ensure RPCs are accessible to anon role.");
                _warnedAnon = true;
            }

            return _options.AnonKey;
        }

        return string.Empty;
    }

    private async Task<HttpResponseMessage> SendWithRetryAsync(
        Func<HttpRequestMessage> requestFactory,
        CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt <= RetryDelays.Length; attempt++)
        {
            try
            {
                using var request = requestFactory();
                var response = await CreateClient().SendAsync(request, cancellationToken);
                if (response.IsSuccessStatusCode || !IsTransientStatus(response.StatusCode) || attempt == RetryDelays.Length)
                {
                    return response;
                }

                response.Dispose();
            }
            catch (HttpRequestException ex) when (attempt < RetryDelays.Length)
            {
                _logger.LogWarning(
                    ex,
                    "Supabase request attempt {Attempt} failed; retrying.",
                    attempt + 1);
            }
            catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested && attempt < RetryDelays.Length)
            {
                _logger.LogWarning(
                    ex,
                    "Supabase request attempt {Attempt} timed out; retrying.",
                    attempt + 1);
            }

            await Task.Delay(RetryDelays[attempt], cancellationToken);
        }

        throw new InvalidOperationException("Supabase request retry loop exited unexpectedly.");
    }

    private async Task<T?> GetAsync<T>(string path, CancellationToken cancellationToken)
    {
        try
        {
            var client = CreateClient();
            var response = await client.GetAsync(path, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogError(
                    "Supabase GET failed {Status} {Path}: {Body}",
                    (int)response.StatusCode,
                    path,
                    body);
                return default;
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            return JsonSerializer.Deserialize<T>(json, JsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Supabase GET crashed {Path}", path);
            return default;
        }
    }

    private async Task<SupabaseResult> PostRpcAsync(string path, object payload, CancellationToken cancellationToken)
    {
        try
        {
            var client = CreateClient();
            var response = await client.PostAsync(
                path,
                JsonContent.Create(payload, options: JsonOptions),
                cancellationToken
            );

            if (response.IsSuccessStatusCode)
            {
                return new SupabaseResult(true);
            }

            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogError("Supabase RPC call failed {Path} {Status}: {Body}", path, (int)response.StatusCode, body);
            return new SupabaseResult(false, body);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Supabase RPC call failed: {Path}", path);
            return new SupabaseResult(false, ex.Message);
        }
    }

    private sealed record SourceEventRow(
        [property: JsonPropertyName("source_event_id")] string? SourceEventId
    );

    private sealed record OutletWarehouseRow(
        [property: JsonPropertyName("warehouse_id")] string WarehouseId
    );

    public sealed record WarehouseRow(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("name")] string? Name
    );

    public sealed record WarehousePeriodRow(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("warehouse_id")] string WarehouseId,
        [property: JsonPropertyName("status")] string Status,
        [property: JsonPropertyName("opened_at")] DateTimeOffset OpenedAt,
        [property: JsonPropertyName("closed_at")] DateTimeOffset? ClosedAt
    );

    private sealed record CountRow(
        [property: JsonPropertyName("id")] string Id
    );

    private static bool IsTransientStatus(System.Net.HttpStatusCode statusCode)
    {
        var code = (int)statusCode;
        return code == 429 || code == 500 || code == 502 || code == 503 || code == 504;
    }

    private static IEnumerable<T[]> Chunk<T>(IReadOnlyList<T> items, int size)
    {
        for (var i = 0; i < items.Count; i += size)
        {
            var length = Math.Min(size, items.Count - i);
            var chunk = new T[length];
            for (var j = 0; j < length; j++)
            {
                chunk[j] = items[i + j];
            }

            yield return chunk;
        }
    }

    private object BuildPayload(PosOrder order)
    {
        return new
        {
            source_event_id = order.SourceEventId,
            sale_id = order.PosSaleId,
            outlet_id = _outlet.Id,
            branch_id = order.BranchId,
            occurred_at = order.OccurredAt,
            order_type = order.OrderType,
            bill_type = order.BillType,
            total_discount = order.TotalDiscount,
            total_discount_amount = order.TotalDiscountAmount,
            total_gst = order.TotalGst,
            service_charges = order.ServiceCharges,
            delivery_charges = order.DeliveryCharges,
            tip = order.Tip,
            pos_fee = order.PosFee,
            price_type = order.PriceType,
            items = order.Items.Select(i => new
            {
                pos_item_id = i.PosItemId,
                name = i.Name,
                item_sku = i.ItemSku,
                variant_sku = i.VariantSku,
                flavour_name = i.FlavourName,
                quantity = i.Quantity,
                sale_price = i.SalePrice,
                vat_exc_price = i.VatExclusivePrice,
                flavour_price = i.FlavourPrice,
                flavour_id = i.FlavourId,
                modifier_id = i.ModifierId
            }).ToList(),
            payments = order.Payments.Select(p => new { method = p.Method, amount = p.Amount }).ToList(),
            terminal = order.Shift?.Terminal,
            shift = order.Shift is null ? null : new
            {
                shift_id = order.Shift.ShiftId,
                shift_name = order.Shift.ShiftName,
                shift_session_id = order.Shift.SessionId,
                terminal = order.Shift.Terminal,
                session_start = order.Shift.SessionStart,
                session_end = order.Shift.SessionEnd,
                session_status = order.Shift.SessionStatus,
                opened_by = order.Shift.OpenedBy
            },
            customer = order.Customer is null ? null : new
            {
                name = order.Customer.Name,
                phone = order.Customer.Phone,
                email = order.Customer.Email
            },
            inventory_consumed = order.Inventory.Select(ic => new
            {
                pos_id = ic.PosId,
                raw_item_id = ic.RawItemId,
                quantity_consumed = ic.QuantityConsumed,
                remaining_quantity = ic.RemainingQuantity,
                occurred_at = ic.PosDate ?? order.OccurredAt,
                pos_date = ic.PosDate,
                kdsid = ic.KdsId,
                typec = ic.Typec,
                branch_missing_note = ic.BranchMissingNote
            }).ToList()
        };
    }
}
