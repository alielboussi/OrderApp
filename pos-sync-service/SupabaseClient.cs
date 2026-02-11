using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
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
                _logger.LogWarning("Supabase validation RPC failed {Status}: {Body}", (int)response.StatusCode, body);
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
            _logger.LogWarning("Supabase RPC failed {Status}: {Body}", (int)response.StatusCode, body);
            return new SupabaseResult(false, $"RPC failed {(int)response.StatusCode}: {body}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error calling Supabase RPC");
            return new SupabaseResult(false, ex.Message);
        }
    }

    public async Task<DateTime?> GetPosSyncCutoffUtcAsync(CancellationToken cancellationToken)
    {
        return await GetCounterUtcAsync("pos_sync_cutoff", "cutoff", cancellationToken);
    }

    public async Task<DateTime?> GetPosSyncOpeningUtcAsync(CancellationToken cancellationToken)
    {
        return await GetCounterUtcAsync("pos_sync_opening", "opening", cancellationToken);
    }

    private async Task<DateTime?> GetCounterUtcAsync(string counterKey, string label, CancellationToken cancellationToken)
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
                $"/rest/v1/counter_values?select=last_value&counter_key=eq.{counterKey}&scope_id=eq.{_outlet.Id}&limit=1"
            );

            var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning("Supabase {Label} check failed {Status}: {Body}", label, (int)response.StatusCode, body);
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

            var lastValue = lastValueProp.GetInt64();
            if (lastValue <= 0)
            {
                return null;
            }

            return DateTimeOffset.FromUnixTimeSeconds(lastValue).UtcDateTime;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking POS sync {Label}", label);
            return null;
        }
    }

    private HttpClient CreateClient()
    {
        var client = _clientFactory.CreateClient("Supabase");
        client.BaseAddress = new Uri(_options.Url);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _options.ServiceKey);
        if (!client.DefaultRequestHeaders.Contains("apikey"))
        {
            client.DefaultRequestHeaders.Add("apikey", _options.ServiceKey);
        }
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return client;
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
            catch (HttpRequestException) when (attempt < RetryDelays.Length)
            {
                // Retry transient network errors.
            }
            catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested && attempt < RetryDelays.Length)
            {
                // Retry timeouts.
            }

            await Task.Delay(RetryDelays[attempt], cancellationToken);
        }

        throw new InvalidOperationException("Supabase request retry loop exited unexpectedly.");
    }

    private static bool IsTransientStatus(System.Net.HttpStatusCode statusCode)
    {
        var code = (int)statusCode;
        return code == 429 || code == 500 || code == 502 || code == 503 || code == 504;
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
                quantity = i.Quantity,
                sale_price = i.SalePrice,
                vat_exc_price = i.VatExclusivePrice,
                flavour_price = i.FlavourPrice,
                flavour_id = i.FlavourId,
                modifier_id = i.ModifierId
            }).ToList(),
            payments = order.Payments.Select(p => new { method = p.Method, amount = p.Amount }).ToList(),
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
