using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace PosSyncService;

public sealed class ScpgtWindow : Window
{
    private readonly TextBlock _statusText;
    private readonly TextBlock _subStatusText;
    private readonly TextBlock _warehouseText;
    private readonly TextBlock _periodText;
    private readonly TextBlock _openingText;
    private readonly TextBlock _closingText;
    private readonly TextBlock _closingRequestText;
    private readonly TextBlock _syncWindowText;
    private readonly TextBlock _lastSyncText;
    private readonly Button _openButton;
    private readonly Button _closeButton;
    private readonly Button _syncButton;

    public event EventHandler? CloseRequested;
    public event EventHandler? StartRequested;
    public event EventHandler? ClosePeriodRequested;
    public event EventHandler? SyncRequested;

    public ScpgtWindow()
    {
        Title = "SCPGT";
        Width = 560;
        Height = 420;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        ResizeMode = ResizeMode.NoResize;
        ShowInTaskbar = false;
        Background = new SolidColorBrush(Color.FromRgb(248, 250, 252));

        var root = new Border
        {
            BorderThickness = new Thickness(1),
            BorderBrush = new SolidColorBrush(Color.FromRgb(30, 58, 138)),
            CornerRadius = new CornerRadius(12),
            Padding = new Thickness(18)
        };

        var layout = new Grid();
        layout.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        layout.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        root.Child = layout;

        var header = BuildHeader();
        Grid.SetRow(header, 0);
        layout.Children.Add(header);

        var body = BuildBody();
        Grid.SetRow(body, 1);
        layout.Children.Add(body);

        Content = root;

        MouseLeftButtonDown += (_, _) => DragMove();
    }

    public void UpdateStatus(string title, string detail)
    {
        _statusText.Text = title;
        _subStatusText.Text = detail;
    }

    private UIElement BuildHeader()
    {
        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        var title = new TextBlock
        {
            Text = "SCPGT",
            FontSize = 22,
            FontWeight = FontWeights.SemiBold,
            Foreground = new SolidColorBrush(Color.FromRgb(30, 58, 138))
        };
        Grid.SetColumn(title, 0);

        var close = new Button
        {
            Content = "Close",
            Padding = new Thickness(14, 6, 14, 6),
            Background = new SolidColorBrush(Color.FromRgb(220, 38, 38)),
            Foreground = Brushes.White,
            BorderThickness = new Thickness(0),
            FontWeight = FontWeights.SemiBold,
            Cursor = Cursors.Hand
        };
        close.Click += (_, _) => CloseRequested?.Invoke(this, EventArgs.Empty);
        Grid.SetColumn(close, 1);

        grid.Children.Add(title);
        grid.Children.Add(close);
        return grid;
    }

    private UIElement BuildBody()
    {
        var stack = new StackPanel
        {
            Margin = new Thickness(0, 20, 0, 0)
        };

        _statusText = new TextBlock
        {
            Text = "Waiting for sync",
            FontSize = 18,
            FontWeight = FontWeights.SemiBold,
            Foreground = new SolidColorBrush(Color.FromRgb(15, 23, 42))
        };

        _subStatusText = new TextBlock
        {
            Text = "Hotkey: Shift + + + Backspace",
            FontSize = 13,
            Foreground = new SolidColorBrush(Color.FromRgb(71, 85, 105)),
            Margin = new Thickness(0, 6, 0, 20)
        };

        stack.Children.Add(_statusText);
        stack.Children.Add(_subStatusText);

        var infoGrid = new Grid
        {
            Margin = new Thickness(0, 6, 0, 18)
        };
        infoGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        infoGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        infoGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        infoGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        infoGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        infoGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

        _warehouseText = BuildMetaText("Warehouse: -");
        _periodText = BuildMetaText("Period: -");
        _openingText = BuildMetaText("Opening counts: -");
        _closingText = BuildMetaText("Closing counts: -");
        _closingRequestText = BuildMetaText("Closing requested: -");
        _syncWindowText = BuildMetaText("Sync window: -");
        _lastSyncText = BuildMetaText("Last sync: -");

        AddMeta(infoGrid, _warehouseText, 0, 0);
        AddMeta(infoGrid, _periodText, 0, 1);
        AddMeta(infoGrid, _openingText, 1, 0);
        AddMeta(infoGrid, _closingText, 1, 1);
        AddMeta(infoGrid, _closingRequestText, 2, 0);
        AddMeta(infoGrid, _syncWindowText, 2, 1);
        AddMeta(infoGrid, _lastSyncText, 3, 0);
        Grid.SetColumnSpan(_lastSyncText, 2);

        stack.Children.Add(infoGrid);

        var buttonRow = new UniformGrid
        {
            Columns = 2,
            Rows = 2,
            Margin = new Thickness(0, 6, 0, 0)
        };

        _openButton = BuildActionButton("Open Period", Color.FromRgb(30, 58, 138), (_, _) =>
        {
            StartRequested?.Invoke(this, EventArgs.Empty);
        });
        buttonRow.Children.Add(_openButton);

        _closeButton = BuildActionButton("Close Period", Color.FromRgb(59, 130, 246), (_, _) =>
        {
            ClosePeriodRequested?.Invoke(this, EventArgs.Empty);
        });
        buttonRow.Children.Add(_closeButton);

        _syncButton = BuildActionButton("Sync Now", Color.FromRgb(2, 132, 199), (_, _) =>
        {
            SyncRequested?.Invoke(this, EventArgs.Empty);
        });
        buttonRow.Children.Add(_syncButton);

        buttonRow.Children.Add(BuildActionButton("Hide", Color.FromRgb(15, 23, 42), (_, _) =>
        {
            Hide();
        }));

        stack.Children.Add(buttonRow);

        var note = new TextBlock
        {
            Text = "All actions log to Supabase and lock on success.",
            FontSize = 12,
            Foreground = new SolidColorBrush(Color.FromRgb(71, 85, 105)),
            Margin = new Thickness(0, 18, 0, 0)
        };
        stack.Children.Add(note);

        return stack;
    }

    public void UpdateSnapshot(ScpgtUiSnapshot snapshot)
    {
        UpdateStatus(snapshot.Title, snapshot.Detail);
        _warehouseText.Text = snapshot.WarehouseLabel;
        _periodText.Text = snapshot.PeriodLabel;
        _openingText.Text = snapshot.OpeningLabel;
        _closingText.Text = snapshot.ClosingLabel;
        _closingRequestText.Text = snapshot.ClosingRequestedLabel;
        _syncWindowText.Text = snapshot.SyncWindowLabel;
        _lastSyncText.Text = snapshot.LastSyncLabel;

        _openButton.IsEnabled = snapshot.CanOpenPeriod;
        _closeButton.IsEnabled = snapshot.CanClosePeriod;
    }

    public void SetSyncInProgress(bool isBusy)
    {
        _syncButton.IsEnabled = !isBusy;
        _syncButton.Content = isBusy ? "Syncing..." : "Sync Now";
    }

    private static TextBlock BuildMetaText(string text)
    {
        return new TextBlock
        {
            Text = text,
            FontSize = 12,
            Foreground = new SolidColorBrush(Color.FromRgb(71, 85, 105)),
            Margin = new Thickness(0, 4, 12, 0)
        };
    }

    private static void AddMeta(Grid grid, UIElement element, int row, int column)
    {
        Grid.SetRow(element, row);
        Grid.SetColumn(element, column);
        grid.Children.Add(element);
    }

    private static Button BuildActionButton(string label, Color color, RoutedEventHandler onClick)
    {
        var button = new Button
        {
            Content = label,
            Margin = new Thickness(4),
            Padding = new Thickness(12, 10, 12, 10),
            Background = new SolidColorBrush(color),
            Foreground = Brushes.White,
            BorderThickness = new Thickness(0),
            FontWeight = FontWeights.SemiBold,
            Cursor = Cursors.Hand
        };
        button.Click += onClick;
        return button;
    }
}
