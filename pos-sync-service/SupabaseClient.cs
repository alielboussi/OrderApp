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

        var request = new HttpRequestMessage(HttpMethod.Post, "/rest/v1/rpc/validate_pos_order")
        {
            Content = JsonContent.Create(new { payload }, options: JsonOptions)
        };

        try
        {
            var response = await client.SendAsync(request, cancellationToken);
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

        var request = new HttpRequestMessage(HttpMethod.Post, "/rest/v1/rpc/sync_pos_order")
        {
            // PostgREST expects RPC arguments by name; wrap the payload under the function parameter key
            Content = JsonContent.Create(new { payload }, options: JsonOptions)
        };

        try
        {
            var response = await client.SendAsync(request, cancellationToken);
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
                flavour_id = i.FlavourId
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
