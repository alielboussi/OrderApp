using System;
using System.Threading;

namespace PosSyncService;

public static class ScpgtUiSignal
{
    private const string MutexName = "Global\\SCPGT_UI_MUTEX";
    private const string EventName = "Global\\SCPGT_UI_SHOW";

    public static Mutex CreateUiMutex()
    {
        return new Mutex(true, MutexName, out _);
    }

    public static EventWaitHandle CreateShowEvent()
    {
        return new EventWaitHandle(false, EventResetMode.AutoReset, EventName);
    }

    public static bool TrySignalShow()
    {
        try
        {
            using var mutex = Mutex.OpenExisting(MutexName);
            mutex.Dispose();
        }
        catch
        {
            return false;
        }

        try
        {
            using var handle = EventWaitHandle.OpenExisting(EventName);
            handle.Set();
            return true;
        }
        catch
        {
            return false;
        }
    }
}
