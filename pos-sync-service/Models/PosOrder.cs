namespace PosSyncService.Models;

public sealed record PosOrder(
    string PosOrderId,
    string PosSaleId,
    DateTimeOffset OccurredAt,
    Guid OutletId,
    string SourceEventId,
    string? OrderType,
    string? BillType,
    decimal? TotalDiscount,
    decimal? TotalDiscountAmount,
    decimal? TotalGst,
    decimal? ServiceCharges,
    decimal? DeliveryCharges,
    decimal? Tip,
    decimal? PosFee,
    string? PriceType,
    int? BranchId,
    IReadOnlyList<PosLineItem> Items,
    IReadOnlyList<PosPayment> Payments,
    PosCustomer? Customer,
    IReadOnlyList<PosInventoryConsumed> Inventory
);

public sealed record PosLineItem(
    string PosItemId,
    string Name,
    decimal Quantity,
    decimal UnitPrice,
    decimal SalePrice,
    decimal VatExclusivePrice,
    decimal FlavourPrice,
    decimal Discount,
    decimal Tax,
    string? FlavourId,
    string? ModifierId,
    string? VariantId,
    string? VariantKey
);

public sealed record PosPayment(
    string Method,
    decimal Amount
);

public sealed record PosCustomer(
    string? Name,
    string? Phone,
    string? Email
);

public sealed record PosInventoryConsumed(
    string PosId,
    string RawItemId,
    decimal QuantityConsumed,
    decimal? RemainingQuantity,
    DateTime? PosDate,
    string? KdsId,
    string? Typec,
    int? BranchId,
    string? BranchMissingNote
);

public sealed record SupabaseResult(bool IsSuccess, string? ErrorMessage = null);

public sealed record PosSentSummary(
    string BillId,
    string SaleId,
    DateTimeOffset OccurredAt,
    decimal? PaymentAmount,
    string? PaymentType
);

public sealed record SyncFailure(string PosOrderId, string? Error);

public sealed record SyncRunResult(int ProcessedCount, IReadOnlyList<SyncFailure> Failures);
