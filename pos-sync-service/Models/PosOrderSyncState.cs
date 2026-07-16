namespace PosSyncService.Models;

public sealed record PosOrderSyncState(
    bool HasOrderRow,
    bool HasOutletSales)
{
    public bool IsComplete => HasOrderRow && HasOutletSales;

    public bool NeedsLineBackfill => HasOrderRow && !HasOutletSales;
}
