using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using PosSyncService.Models;

namespace PosSyncService;

internal static class FirebaseOrderPayload
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    // Firestore .NET SDK cannot serialize System.Decimal — use double.
    private static double N(decimal value) => (double)value;

    private static double N(decimal? value) => value.HasValue ? (double)value.Value : 0.0;

    public static Dictionary<string, object> BuildRawPayload(PosOrder order, Guid outletId)
    {
        var payload = new Dictionary<string, object>
        {
            ["source_event_id"] = order.SourceEventId,
            ["sale_id"] = order.PosSaleId,
            ["outlet_id"] = outletId.ToString(),
            ["branch_id"] = order.BranchId ?? (object)"",
            ["occurred_at"] = order.OccurredAt.UtcDateTime,
            ["order_type"] = order.OrderType ?? "",
            ["bill_type"] = order.BillType ?? "",
            ["total_discount"] = N(order.TotalDiscount),
            ["total_discount_amount"] = N(order.TotalDiscountAmount),
            ["total_gst"] = N(order.TotalGst),
            ["service_charges"] = N(order.ServiceCharges),
            ["delivery_charges"] = N(order.DeliveryCharges),
            ["tip"] = N(order.Tip),
            ["pos_fee"] = N(order.PosFee),
            ["price_type"] = order.PriceType ?? "",
            ["items"] = order.Items.Select(i => new Dictionary<string, object?>
            {
                ["pos_item_id"] = i.PosItemId,
                ["name"] = i.Name,
                ["item_sku"] = i.ItemSku ?? "",
                ["variant_sku"] = i.VariantSku ?? "",
                ["flavour_name"] = i.FlavourName ?? "",
                ["quantity"] = N(i.Quantity),
                ["sale_price"] = N(i.SalePrice),
                ["vat_exc_price"] = N(i.VatExclusivePrice),
                ["flavour_price"] = N(i.FlavourPrice),
                ["flavour_id"] = i.FlavourId ?? "",
                ["modifier_id"] = i.ModifierId ?? "",
            }).ToList(),
            ["payments"] = order.Payments.Select(p => new Dictionary<string, object>
            {
                ["method"] = p.Method,
                ["amount"] = N(p.Amount),
            }).ToList(),
            ["terminal"] = order.Shift?.Terminal ?? "",
        };

        if (order.Shift is not null)
        {
            payload["shift"] = new Dictionary<string, object?>
            {
                ["shift_id"] = order.Shift.ShiftId,
                ["shift_name"] = order.Shift.ShiftName ?? "",
                ["shift_session_id"] = order.Shift.SessionId,
                ["terminal"] = order.Shift.Terminal ?? "",
                ["session_start"] = order.Shift.SessionStart?.UtcDateTime,
                ["session_end"] = order.Shift.SessionEnd?.UtcDateTime,
                ["session_status"] = order.Shift.SessionStatus ?? "",
                ["opened_by"] = order.Shift.OpenedBy ?? "",
                ["shift_source"] = order.Shift.ShiftSource ?? "",
            };
        }

        if (order.Cashier is not null)
        {
            payload["cashier"] = new Dictionary<string, object?>
            {
                ["user_id"] = order.Cashier.UserId,
                ["name"] = order.Cashier.Name ?? "",
                ["username"] = order.Cashier.Username ?? "",
            };
        }

        if (order.Customer is not null)
        {
            payload["customer"] = new Dictionary<string, object?>
            {
                ["name"] = order.Customer.Name ?? "",
                ["phone"] = order.Customer.Phone ?? "",
                ["email"] = order.Customer.Email ?? "",
            };
        }

        return payload;
    }

    public static Dictionary<string, object> BuildLineDocument(PosLineItem item)
    {
        return new Dictionary<string, object?>
        {
            ["posItemId"] = item.PosItemId,
            ["name"] = item.Name,
            ["itemSku"] = item.ItemSku ?? "",
            ["variantSku"] = item.VariantSku ?? "",
            ["flavourName"] = item.FlavourName ?? "",
            ["quantity"] = N(item.Quantity),
            ["unitPrice"] = N(item.UnitPrice),
            ["salePrice"] = N(item.SalePrice),
            ["vatExclusivePrice"] = N(item.VatExclusivePrice),
            ["flavourPrice"] = N(item.FlavourPrice),
            ["discount"] = N(item.Discount),
            ["tax"] = N(item.Tax),
            ["flavourId"] = item.FlavourId ?? "",
            ["modifierId"] = item.ModifierId ?? "",
            ["variantId"] = item.VariantId ?? "",
            ["variantKey"] = item.VariantKey ?? "",
        }!;
    }
}
