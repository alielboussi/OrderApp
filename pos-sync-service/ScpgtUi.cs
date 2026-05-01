using System;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Threading;
using Microsoft.Extensions.Hosting;

namespace PosSyncService;

public static class ScpgtUi
{
    public static int Run(IHost host)
    {
        using var mutex = ScpgtUiSignal.CreateUiMutex();
        using var showEvent = ScpgtUiSignal.CreateShowEvent();

        host.StartAsync().GetAwaiter().GetResult();

        var app = new Application
        {
            ShutdownMode = ShutdownMode.OnExplicitShutdown
        };

        var window = new ScpgtWindow();
        window.UpdateStatus("Starting...", "Loading outlet settings.");

        var coordinator = host.Services.GetRequiredService<ScpgtCoordinator>();
        var syncLock = new SemaphoreSlim(1, 1);

        var cts = new CancellationTokenSource();
        var signalThread = new Thread(() =>
        {
            while (!cts.IsCancellationRequested)
            {
                if (!showEvent.WaitOne(TimeSpan.FromMilliseconds(250)))
                {
                    continue;
                }

                window.Dispatcher.Invoke(() =>
                {
                    if (!window.IsVisible)
                    {
                        window.Show();
                    }
                    window.Activate();
                    window.Topmost = true;
                    window.Topmost = false;
                    window.Focus();
                });
            }
        })
        {
            IsBackground = true
        };
        signalThread.Start();

        async Task RunManualSyncAsync()
        {
            if (!await syncLock.WaitAsync(0))
            {
                return;
            }

            try
            {
                window.Dispatcher.Invoke(() => window.SetSyncInProgress(true));
                var snapshot = await coordinator.RunManualSyncAsync(cts.Token);
                window.Dispatcher.Invoke(() =>
                {
                    window.UpdateSnapshot(snapshot);
                    if (snapshot.ShouldHideUi)
                    {
                        window.Hide();
                    }
                });
            }
            finally
            {
                window.Dispatcher.Invoke(() => window.SetSyncInProgress(false));
                syncLock.Release();
            }
        }

        window.CloseRequested += (_, _) =>
        {
            cts.Cancel();
            window.Close();
        };

        window.StartRequested += async (_, _) =>
        {
            var result = await coordinator.StartPeriodAsync(cts.Token);
            window.Dispatcher.Invoke(() =>
            {
                window.UpdateStatus(result.Message, "Open period started.");
            });
            var snapshot = await coordinator.GetStatusAsync(cts.Token);
            window.Dispatcher.Invoke(() => window.UpdateSnapshot(snapshot));
        };

        window.ClosePeriodRequested += async (_, _) =>
        {
            coordinator.RequestClosing();
            window.UpdateStatus("Closing enabled.", "Enter closing counts, then wait for sync.");
            var snapshot = await coordinator.GetStatusAsync(cts.Token);
            window.Dispatcher.Invoke(() => window.UpdateSnapshot(snapshot));
        };

        window.SyncRequested += async (_, _) =>
        {
            await RunManualSyncAsync();
        };

        window.Closed += async (_, _) =>
        {
            cts.Cancel();
            await host.StopAsync();
            app.Shutdown();
        };

        _ = Task.Run(async () =>
        {
            var init = await coordinator.InitializeAsync(cts.Token);
            window.Dispatcher.Invoke(() =>
            {
                window.UpdateSnapshot(init);
            });
            var snapshot = await coordinator.GetStatusAsync(cts.Token);
            window.Dispatcher.Invoke(() => window.UpdateSnapshot(snapshot));
        });

        var timer = new DispatcherTimer
        {
            Interval = TimeSpan.FromSeconds(5)
        };
        timer.Tick += async (_, _) =>
        {
            var snapshot = await coordinator.GetStatusAsync(cts.Token);
            window.Dispatcher.Invoke(() =>
            {
                window.UpdateSnapshot(snapshot);
                if (snapshot.ShouldHideUi)
                {
                    window.Hide();
                }
            });
        };
        timer.Start();

        app.Run(window);
        return 0;
    }
}
