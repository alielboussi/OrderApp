using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace PosSyncService;

public sealed class ScpgtWindow : Window
{
    private TextBlock _statusText = null!;
    private TextBlock _subStatusText = null!;
    private TextBlock _warehouseText = null!;
    private TextBlock _periodText = null!;
    private TextBlock _cutoffText = null!;
    private TextBlock _ordersAppText = null!;
    private TextBlock _syncWindowText = null!;
    private TextBlock _lastSyncText = null!;

    public ScpgtWindow()
    {
        Title = "SCPGT";
        Width = 560;
        Height = 400;
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

        var minimize = new Button
        {
            Content = "Minimize",
            Padding = new Thickness(14, 6, 14, 6),
            Background = new SolidColorBrush(Color.FromRgb(15, 23, 42)),
            Foreground = Brushes.White,
            BorderThickness = new Thickness(0),
            FontWeight = FontWeights.SemiBold,
            Cursor = Cursors.Hand
        };
        minimize.Click += (_, _) => Hide();
        Grid.SetColumn(minimize, 1);

        grid.Children.Add(title);
        grid.Children.Add(minimize);
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
            Text = "Hotkey: Shift + A + 1 + 0",
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

        _warehouseText = BuildMetaText("Warehouse: -");
        _periodText = BuildMetaText("POS sync from: -");
        _cutoffText = BuildMetaText("Last cutoff: -");
        _ordersAppText = BuildMetaText("Orders app outlet: -");
        _syncWindowText = BuildMetaText("Effective window: -");
        _lastSyncText = BuildMetaText("Last sync: -");

        AddMeta(infoGrid, _warehouseText, 0, 0);
        AddMeta(infoGrid, _periodText, 0, 1);
        AddMeta(infoGrid, _cutoffText, 1, 0);
        AddMeta(infoGrid, _ordersAppText, 1, 1);
        AddMeta(infoGrid, _syncWindowText, 2, 0);
        AddMeta(infoGrid, _lastSyncText, 2, 1);

        stack.Children.Add(infoGrid);

        var note = new TextBlock
        {
            Text = "Stocktake periods are opened in Afterten Orders → Outlet Stocktake. This service uploads POS sales within the sync window.",
            FontSize = 12,
            Foreground = new SolidColorBrush(Color.FromRgb(71, 85, 105)),
            Margin = new Thickness(0, 18, 0, 0),
            TextWrapping = TextWrapping.Wrap
        };
        stack.Children.Add(note);

        return stack;
    }

    public void UpdateSnapshot(ScpgtUiSnapshot snapshot)
    {
        UpdateStatus(snapshot.Title, snapshot.Detail);
        _warehouseText.Text = snapshot.WarehouseLabel;
        _periodText.Text = snapshot.PeriodLabel;
        _cutoffText.Text = snapshot.CutoffLabel;
        _ordersAppText.Text = snapshot.OrdersAppLabel;
        _syncWindowText.Text = snapshot.SyncWindowLabel;
        _lastSyncText.Text = snapshot.LastSyncLabel;
    }

    private static TextBlock BuildMetaText(string text)
    {
        return new TextBlock
        {
            Text = text,
            FontSize = 12,
            Foreground = new SolidColorBrush(Color.FromRgb(71, 85, 105)),
            Margin = new Thickness(0, 4, 12, 0),
            TextWrapping = TextWrapping.Wrap
        };
    }

    private static void AddMeta(Grid grid, UIElement element, int row, int column)
    {
        Grid.SetRow(element, row);
        Grid.SetColumn(element, column);
        grid.Children.Add(element);
    }
}
