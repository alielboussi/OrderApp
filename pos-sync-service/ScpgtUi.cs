using System;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Threading;
using Microsoft.Extensions.DependencyInjection;
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

        window.Closing += (sender, e) =>
        {
            if (sender is Window w)
            {
                e.Cancel = true;
                w.Hide();
            }
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
