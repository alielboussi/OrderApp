using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

namespace PosSyncService;

public sealed class ScpgtListener : IDisposable
{
    private const int WhKeyboardLl = 13;
    private const int WmKeydown = 0x0100;
    private const int WmKeyup = 0x0101;
    private const int WmSysKeydown = 0x0104;
    private const int WmSysKeyup = 0x0105;
    private const int VkShift = 0x10;
    private const int VkBack = 0x08;
    private const int VkOemPlus = 0xBB;

    private readonly string _contentRoot;
    private LowLevelKeyboardProc? _hookCallback;
    private IntPtr _hookHandle;
    private bool _shiftDown;
    private bool _plusDown;

    public ScpgtListener(string contentRoot)
    {
        _contentRoot = contentRoot;
    }

    public void Run(CancellationToken cancellationToken)
    {
        _hookCallback = HookCallback;
        _hookHandle = SetWindowsHookEx(WhKeyboardLl, _hookCallback, GetModuleHandle(null), 0);
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                if (GetMessage(out var msg, IntPtr.Zero, 0, 0) <= 0)
                {
                    break;
                }
                TranslateMessage(ref msg);
                DispatchMessage(ref msg);
            }
        }
        finally
        {
            if (_hookHandle != IntPtr.Zero)
            {
                UnhookWindowsHookEx(_hookHandle);
            }
        }
    }

    private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0)
        {
            var message = wParam.ToInt32();
            var info = Marshal.PtrToStructure<KbdLlHookStruct>(lParam);
            var key = info.vkCode;

            if (message == WmKeydown || message == WmSysKeydown)
            {
                if (key == VkShift) _shiftDown = true;
                if (key == VkOemPlus) _plusDown = true;

                if (key == VkBack && _shiftDown && _plusDown)
                {
                    LaunchOrFocusUi();
                }
            }
            else if (message == WmKeyup || message == WmSysKeyup)
            {
                if (key == VkShift) _shiftDown = false;
                if (key == VkOemPlus) _plusDown = false;
            }
        }

        return CallNextHookEx(_hookHandle, nCode, wParam, lParam);
    }

    private void LaunchOrFocusUi()
    {
        if (ScpgtUiSignal.TrySignalShow())
        {
            return;
        }

        var exePath = Process.GetCurrentProcess().MainModule?.FileName;
        if (string.IsNullOrWhiteSpace(exePath))
        {
            return;
        }

        var args = string.IsNullOrWhiteSpace(_contentRoot)
            ? "--ui"
            : "--ui --contentRoot \"" + _contentRoot + "\"";

        Process.Start(new ProcessStartInfo
        {
            FileName = exePath,
            Arguments = args,
            UseShellExecute = false
        });
    }

    public void Dispose()
    {
        if (_hookHandle != IntPtr.Zero)
        {
            UnhookWindowsHookEx(_hookHandle);
            _hookHandle = IntPtr.Zero;
        }
    }

    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct KbdLlHookStruct
    {
        public int vkCode;
        public int scanCode;
        public int flags;
        public int time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Msg
    {
        public IntPtr hwnd;
        public uint message;
        public UIntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public System.Drawing.Point pt;
    }

    [DllImport("user32.dll")]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll")]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern int GetMessage(out Msg lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

    [DllImport("user32.dll")]
    private static extern bool TranslateMessage([In] ref Msg lpMsg);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage([In] ref Msg lpMsg);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetModuleHandle(string? lpModuleName);
}
