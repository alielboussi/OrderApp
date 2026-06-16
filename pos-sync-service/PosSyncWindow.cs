namespace PosSyncService;

public static class PosSyncWindow
{
    public static (DateTime? MinUtc, DateTime? MaxUtc) Compute(
        DateTime? openingUtc,
        DateTime? cutoffUtc,
        DateTime? configMinUtc,
        DateTime? configMaxUtc)
    {
        if (!openingUtc.HasValue)
        {
            return (null, null);
        }

        var minUtc = configMinUtc.HasValue
            ? MaxUtc(configMinUtc.Value, openingUtc.Value)
            : openingUtc.Value;

        DateTime? maxUtc = configMaxUtc;
        if (cutoffUtc.HasValue && cutoffUtc.Value < openingUtc.Value)
        {
            maxUtc = maxUtc.HasValue
                ? MinUtc(maxUtc.Value, cutoffUtc.Value)
                : cutoffUtc.Value;
        }

        return (minUtc, maxUtc);
    }

    private static DateTime MaxUtc(DateTime a, DateTime b) => a >= b ? a : b;

    private static DateTime MinUtc(DateTime a, DateTime b) => a <= b ? a : b;
}
