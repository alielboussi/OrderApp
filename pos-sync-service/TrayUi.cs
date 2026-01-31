using System;
using System.Globalization;
using System.Windows.Forms;
using Microsoft.Extensions.Hosting;

namespace PosSyncService;

public sealed class TrayUi
{
    private const string AppName = "Shutdown Timer";
    private readonly string _contentRoot;

    public TrayUi(IHostEnvironment hostEnvironment)
    {
        _contentRoot = hostEnvironment.ContentRootPath;
    }

    public void Run()
    {
        ApplicationConfiguration.Initialize();

        using var notifyIcon = new NotifyIcon
        {
            Icon = SystemIcons.Information,
            Visible = true,
            Text = AppName
        };

        using var menu = new ContextMenuStrip();
        var openItem = new ToolStripMenuItem("Open Settings");
        var setNowItem = new ToolStripMenuItem("Set to now (UTC)");
        var exitItem = new ToolStripMenuItem("Exit");

        menu.Items.Add(openItem);
        menu.Items.Add(setNowItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(exitItem);
        notifyIcon.ContextMenuStrip = menu;

        Form? settingsForm = null;

        openItem.Click += (_, _) =>
        {
            settingsForm ??= CreateSettingsForm();
            settingsForm.Show();
            settingsForm.BringToFront();
        };

        setNowItem.Click += (_, _) =>
        {
            var nowUtc = DateTime.UtcNow;
            SaveMinSaleDateUtc(nowUtc);
            MessageBox.Show($"Cutoff set to {nowUtc:O} (UTC). Applies on the next sync poll.", AppName,
                MessageBoxButtons.OK, MessageBoxIcon.Information);
        };

        exitItem.Click += (_, _) =>
        {
            if (settingsForm is { IsDisposed: false })
            {
                settingsForm.Close();
            }
            notifyIcon.Visible = false;
            Application.Exit();
        };

        notifyIcon.DoubleClick += (_, _) => openItem.PerformClick();

        Application.Run();
    }

    private Form CreateSettingsForm()
    {
        var form = new Form
        {
            Text = AppName,
            Width = 420,
            Height = 220,
            StartPosition = FormStartPosition.CenterScreen,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false
        };

        var label = new Label
        {
            Text = "Only sales on/after this local time will sync.",
            AutoSize = true,
            Top = 20,
            Left = 20
        };

        var picker = new DateTimePicker
        {
            Format = DateTimePickerFormat.Custom,
            CustomFormat = "yyyy-MM-dd HH:mm",
            Width = 200,
            Top = 55,
            Left = 20
        };

        var currentUtc = LoadMinSaleDateUtc();
        if (currentUtc.HasValue)
        {
            picker.Value = currentUtc.Value.ToLocalTime();
        }

        var setNow = new Button
        {
            Text = "Set to now",
            Top = 55,
            Left = 240,
            Width = 120
        };

        setNow.Click += (_, _) => picker.Value = DateTime.Now;

        var save = new Button
        {
            Text = "Save",
            Top = 110,
            Left = 20,
            Width = 120
        };

        var cancel = new Button
        {
            Text = "Close",
            Top = 110,
            Left = 160,
            Width = 120
        };

        var note = new Label
        {
            Text = "Changes apply on the next sync poll.",
            AutoSize = true,
            Top = 150,
            Left = 20
        };

        save.Click += (_, _) =>
        {
            var local = DateTime.SpecifyKind(picker.Value, DateTimeKind.Local);
            var utc = local.ToUniversalTime();
            SaveMinSaleDateUtc(utc);
            MessageBox.Show($"Saved cutoff {utc:O} (UTC).", AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
        };

        cancel.Click += (_, _) => form.Hide();

        form.Controls.Add(label);
        form.Controls.Add(picker);
        form.Controls.Add(setNow);
        form.Controls.Add(save);
        form.Controls.Add(cancel);
        form.Controls.Add(note);

        form.FormClosing += (_, e) =>
        {
            e.Cancel = true;
            form.Hide();
        };

        return form;
    }

    private DateTime? LoadMinSaleDateUtc()
    {
        return ConfigStore.LoadMinSaleDateUtc(_contentRoot);
    }

    private void SaveMinSaleDateUtc(DateTime utc)
    {
        ConfigStore.SaveMinSaleDateUtc(_contentRoot, utc);
    }
}
