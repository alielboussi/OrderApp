using System;
using System.Collections.Generic;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Microsoft.Win32;

namespace PosSyncService;

internal sealed class InstallerWizardWindow : Window
{
    private readonly string _defaultInstallPath;
    private readonly string _defaultConfigRoot;
    private int _stepIndex;

    private TextBlock _stepTitle = null!;
    private TextBlock _stepDescription = null!;
    private Border _contentHost = null!;
    private Button _backButton = null!;
    private Button _nextButton = null!;

    private RadioButton _installModeRadio = null!;
    private RadioButton _uninstallModeRadio = null!;

    private TextBox _installPathBox = null!;
    private TextBox _configRootBox = null!;
    private TextBox _outletIdBox = null!;
    private TextBox _supabaseUrlBox = null!;
    private TextBox _supabaseAnonKeyBox = null!;
    private TextBox _supabaseServiceKeyBox = null!;
    private TextBox _posServerBox = null!;
    private TextBox _posDatabaseBox = null!;
    private TextBox _posUsernameBox = null!;
    private PasswordBox _posPasswordBox = null!;
    private TextBlock _summaryText = null!;

    public InstallerWizardResult? Result { get; private set; }

    public InstallerWizardWindow(string defaultInstallPath, string defaultConfigRoot)
    {
        _defaultInstallPath = defaultInstallPath;
        _defaultConfigRoot = defaultConfigRoot;

        Title = "SCPGT Setup Wizard";
        Width = 760;
        Height = 620;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        ResizeMode = ResizeMode.NoResize;
        Background = new SolidColorBrush(Color.FromRgb(245, 247, 250));

        BuildLayout();
        RenderStep();
    }

    private bool IsInstallMode => _installModeRadio.IsChecked == true;

    private void BuildLayout()
    {
        var root = new Grid
        {
            Margin = new Thickness(20)
        };
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

        var header = new StackPanel
        {
            Orientation = Orientation.Vertical,
            Margin = new Thickness(0, 0, 0, 12)
        };

        _stepTitle = new TextBlock
        {
            Text = "SCPGT Setup",
            FontSize = 24,
            FontWeight = FontWeights.SemiBold,
            Foreground = new SolidColorBrush(Color.FromRgb(15, 23, 42))
        };

        _stepDescription = new TextBlock
        {
            Text = "Install or uninstall the middleware.",
            FontSize = 13,
            Foreground = new SolidColorBrush(Color.FromRgb(71, 85, 105)),
            Margin = new Thickness(0, 6, 0, 0)
        };

        header.Children.Add(_stepTitle);
        header.Children.Add(_stepDescription);
        Grid.SetRow(header, 0);
        root.Children.Add(header);

        _contentHost = new Border
        {
            BorderBrush = new SolidColorBrush(Color.FromRgb(203, 213, 225)),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(10),
            Padding = new Thickness(18),
            Background = Brushes.White
        };
        Grid.SetRow(_contentHost, 1);
        root.Children.Add(_contentHost);

        var footer = new Grid
        {
            Margin = new Thickness(0, 12, 0, 0)
        };
        footer.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        footer.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        footer.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        footer.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        var cancelButton = BuildButton("Cancel", (_, _) => Close());
        Grid.SetColumn(cancelButton, 0);
        footer.Children.Add(cancelButton);

        _backButton = BuildButton("Back", (_, _) =>
        {
            if (_stepIndex > 0)
            {
                _stepIndex--;
                RenderStep();
            }
        });
        Grid.SetColumn(_backButton, 2);
        footer.Children.Add(_backButton);

        _nextButton = BuildButton("Next", (_, _) => MoveNext());
        _nextButton.Margin = new Thickness(8, 0, 0, 0);
        Grid.SetColumn(_nextButton, 3);
        footer.Children.Add(_nextButton);

        Grid.SetRow(footer, 2);
        root.Children.Add(footer);

        Content = root;
    }

    private static Button BuildButton(string text, RoutedEventHandler onClick)
    {
        var button = new Button
        {
            Content = text,
            MinWidth = 96,
            Padding = new Thickness(14, 8, 14, 8),
            Background = new SolidColorBrush(Color.FromRgb(15, 23, 42)),
            Foreground = Brushes.White,
            BorderThickness = new Thickness(0),
            FontWeight = FontWeights.SemiBold
        };
        button.Click += onClick;
        return button;
    }

    private void RenderStep()
    {
        _backButton.IsEnabled = _stepIndex > 0;
        _nextButton.Content = _stepIndex == 3 ? "Finish" : "Next";

        switch (_stepIndex)
        {
            case 0:
                _stepTitle.Text = "Welcome";
                _stepDescription.Text = "Choose whether to install/update or uninstall SCPGT.";
                _contentHost.Child = BuildModeStep();
                break;
            case 1:
                _stepTitle.Text = "Install Locations";
                _stepDescription.Text = "Choose where service files and config will be stored.";
                _contentHost.Child = BuildPathsStep();
                break;
            case 2:
                _stepTitle.Text = "Outlet Configuration";
                _stepDescription.Text = "Enter required outlet, Supabase, and POS SQL settings.";
                _contentHost.Child = BuildConfigStep();
                break;
            default:
                _stepTitle.Text = "Ready";
                _stepDescription.Text = "Review selections and click Finish.";
                _contentHost.Child = BuildSummaryStep();
                break;
        }
    }

    private UIElement BuildModeStep()
    {
        var panel = new StackPanel();

        _installModeRadio ??= new RadioButton
        {
            Content = "Install / Update service",
            IsChecked = true,
            FontSize = 15,
            FontWeight = FontWeights.SemiBold,
            Margin = new Thickness(0, 8, 0, 12)
        };

        _uninstallModeRadio ??= new RadioButton
        {
            Content = "Uninstall service",
            FontSize = 15,
            FontWeight = FontWeights.SemiBold
        };

        var note = new TextBlock
        {
            Text = "Install mode uses a step-by-step wizard. Uninstall removes SCPGT service and startup listener.",
            Foreground = new SolidColorBrush(Color.FromRgb(71, 85, 105)),
            Margin = new Thickness(0, 20, 0, 0),
            TextWrapping = TextWrapping.Wrap
        };

        panel.Children.Add(_installModeRadio);
        panel.Children.Add(_uninstallModeRadio);
        panel.Children.Add(note);
        return panel;
    }

    private UIElement BuildPathsStep()
    {
        _installPathBox ??= new TextBox { Text = _defaultInstallPath };
        _configRootBox ??= new TextBox { Text = _defaultConfigRoot };

        var panel = new StackPanel();
        panel.Children.Add(BuildLabeledPathRow("Install folder", _installPathBox));
        panel.Children.Add(BuildLabeledPathRow("Config folder", _configRootBox));
        return panel;
    }

    private UIElement BuildConfigStep()
    {
        _outletIdBox ??= new TextBox();
        _supabaseUrlBox ??= new TextBox();
        _supabaseAnonKeyBox ??= new TextBox();
        _supabaseServiceKeyBox ??= new TextBox();
        _posServerBox ??= new TextBox { Text = "localhost" };
        _posDatabaseBox ??= new TextBox { Text = "MINTPOS" };
        _posUsernameBox ??= new TextBox { Text = "mint" };
        _posPasswordBox ??= new PasswordBox();

        var panel = new StackPanel();
        panel.Children.Add(BuildLabeledInput("Outlet UUID", _outletIdBox));
        panel.Children.Add(BuildLabeledInput("Supabase URL", _supabaseUrlBox));
        panel.Children.Add(BuildLabeledInput("Supabase anon key", _supabaseAnonKeyBox));
        panel.Children.Add(BuildLabeledInput("Supabase service key (optional)", _supabaseServiceKeyBox));
        panel.Children.Add(BuildLabeledInput("POS SQL Server", _posServerBox));
        panel.Children.Add(BuildLabeledInput("POS SQL Database", _posDatabaseBox));
        panel.Children.Add(BuildLabeledInput("POS SQL Username", _posUsernameBox));
        panel.Children.Add(BuildLabeledInput("POS SQL Password", _posPasswordBox));
        return new ScrollViewer { Content = panel, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
    }

    private UIElement BuildSummaryStep()
    {
        _summaryText ??= new TextBlock
        {
            FontFamily = new FontFamily("Consolas"),
            Foreground = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
            TextWrapping = TextWrapping.Wrap
        };

        var sb = new StringBuilder();
        if (IsInstallMode)
        {
            sb.AppendLine("Action: Install / Update service");
            sb.AppendLine($"Install folder: {_installPathBox.Text.Trim()}");
            sb.AppendLine($"Config folder : {_configRootBox.Text.Trim()}");
            sb.AppendLine($"Outlet UUID   : {_outletIdBox.Text.Trim()}");
            sb.AppendLine($"Supabase URL  : {_supabaseUrlBox.Text.Trim()}");
            sb.AppendLine($"Anon key      : {(string.IsNullOrWhiteSpace(_supabaseAnonKeyBox.Text) ? "<missing>" : "<provided>")}");
            sb.AppendLine($"Service key   : {(string.IsNullOrWhiteSpace(_supabaseServiceKeyBox.Text) ? "<empty>" : "<provided>")}");
            sb.AppendLine($"POS Server    : {_posServerBox.Text.Trim()}");
            sb.AppendLine($"POS Database  : {_posDatabaseBox.Text.Trim()}");
            sb.AppendLine($"POS Username  : {_posUsernameBox.Text.Trim()}");
            sb.AppendLine($"POS Password  : {(string.IsNullOrWhiteSpace(_posPasswordBox.Password) ? "<missing>" : "<provided>")}");
        }
        else
        {
            sb.AppendLine("Action: Uninstall service");
            sb.AppendLine("Service: SCPGT");
            sb.AppendLine("This removes the Windows service and startup listener entry.");
        }

        _summaryText.Text = sb.ToString();
        return _summaryText;
    }

    private UIElement BuildLabeledPathRow(string label, TextBox textBox)
    {
        var panel = new StackPanel { Margin = new Thickness(0, 0, 0, 14) };
        panel.Children.Add(new TextBlock
        {
            Text = label,
            FontWeight = FontWeights.SemiBold,
            Margin = new Thickness(0, 0, 0, 6)
        });

        var row = new Grid();
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        textBox.MinHeight = 28;
        textBox.Padding = new Thickness(8, 4, 8, 4);
        Grid.SetColumn(textBox, 0);
        row.Children.Add(textBox);

        var browse = new Button
        {
            Content = "Browse...",
            Margin = new Thickness(8, 0, 0, 0),
            MinWidth = 92,
            Padding = new Thickness(10, 6, 10, 6)
        };
        browse.Click += (_, _) =>
        {
            var dialog = new OpenFolderDialog
            {
                Title = $"Select {label}",
                FolderName = textBox.Text
            };
            if (dialog.ShowDialog() == true)
            {
                textBox.Text = dialog.FolderName;
            }
        };
        Grid.SetColumn(browse, 1);
        row.Children.Add(browse);

        panel.Children.Add(row);
        return panel;
    }

    private static UIElement BuildLabeledInput(string label, Control input)
    {
        var panel = new StackPanel { Margin = new Thickness(0, 0, 0, 12) };
        panel.Children.Add(new TextBlock
        {
            Text = label,
            FontWeight = FontWeights.SemiBold,
            Margin = new Thickness(0, 0, 0, 5)
        });

        switch (input)
        {
            case TextBox box:
                box.MinHeight = 28;
                box.Padding = new Thickness(8, 4, 8, 4);
                break;
            case PasswordBox pass:
                pass.MinHeight = 28;
                pass.Padding = new Thickness(8, 4, 8, 4);
                break;
        }

        panel.Children.Add(input);
        return panel;
    }

    private void MoveNext()
    {
        if (!ValidateStep())
        {
            return;
        }

        if (_stepIndex == 3)
        {
            if (IsInstallMode)
            {
                Result = new InstallerWizardResult(
                    Confirmed: true,
                    InstallMode: true,
                    InstallPath: _installPathBox.Text.Trim(),
                    ConfigRoot: _configRootBox.Text.Trim(),
                    OutletId: _outletIdBox.Text.Trim(),
                    SupabaseUrl: _supabaseUrlBox.Text.Trim(),
                    SupabaseAnonKey: _supabaseAnonKeyBox.Text.Trim(),
                    SupabaseServiceKey: _supabaseServiceKeyBox.Text.Trim(),
                    PosServer: _posServerBox.Text.Trim(),
                    PosDatabase: _posDatabaseBox.Text.Trim(),
                    PosUsername: _posUsernameBox.Text.Trim(),
                    PosPassword: _posPasswordBox.Password
                );
            }
            else
            {
                Result = new InstallerWizardResult(
                    Confirmed: true,
                    InstallMode: false,
                    InstallPath: string.Empty,
                    ConfigRoot: string.Empty,
                    OutletId: string.Empty,
                    SupabaseUrl: string.Empty,
                    SupabaseAnonKey: string.Empty,
                    SupabaseServiceKey: string.Empty,
                    PosServer: string.Empty,
                    PosDatabase: string.Empty,
                    PosUsername: string.Empty,
                    PosPassword: string.Empty
                );
            }

            DialogResult = true;
            Close();
            return;
        }

        if (_stepIndex == 0 && !IsInstallMode)
        {
            _stepIndex = 3;
            RenderStep();
            return;
        }

        _stepIndex++;
        RenderStep();
    }

    private bool ValidateStep()
    {
        if (_stepIndex == 1 && IsInstallMode)
        {
            if (string.IsNullOrWhiteSpace(_installPathBox.Text) || string.IsNullOrWhiteSpace(_configRootBox.Text))
            {
                MessageBox.Show("Install and config folders are required.", "SCPGT Setup", MessageBoxButton.OK, MessageBoxImage.Warning);
                return false;
            }
        }

        if (_stepIndex == 2 && IsInstallMode)
        {
            if (!Guid.TryParse(_outletIdBox.Text.Trim(), out _))
            {
                MessageBox.Show("Outlet UUID must be a valid GUID.", "SCPGT Setup", MessageBoxButton.OK, MessageBoxImage.Warning);
                return false;
            }

            if (!Uri.TryCreate(_supabaseUrlBox.Text.Trim(), UriKind.Absolute, out _))
            {
                MessageBox.Show("Supabase URL must be a valid absolute URL.", "SCPGT Setup", MessageBoxButton.OK, MessageBoxImage.Warning);
                return false;
            }

            if (string.IsNullOrWhiteSpace(_supabaseAnonKeyBox.Text))
            {
                MessageBox.Show("Supabase anon key is required.", "SCPGT Setup", MessageBoxButton.OK, MessageBoxImage.Warning);
                return false;
            }

            if (string.IsNullOrWhiteSpace(_posServerBox.Text)
                || string.IsNullOrWhiteSpace(_posDatabaseBox.Text)
                || string.IsNullOrWhiteSpace(_posUsernameBox.Text)
                || string.IsNullOrWhiteSpace(_posPasswordBox.Password))
            {
                MessageBox.Show("All POS SQL fields are required.", "SCPGT Setup", MessageBoxButton.OK, MessageBoxImage.Warning);
                return false;
            }
        }

        return true;
    }
}

internal sealed record InstallerWizardResult(
    bool Confirmed,
    bool InstallMode,
    string InstallPath,
    string ConfigRoot,
    string OutletId,
    string SupabaseUrl,
    string SupabaseAnonKey,
    string SupabaseServiceKey,
    string PosServer,
    string PosDatabase,
    string PosUsername,
    string PosPassword
);
