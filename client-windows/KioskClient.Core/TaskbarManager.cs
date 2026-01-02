using System.Runtime.InteropServices;

namespace KioskClient.Core;

/// <summary>
/// Manages Windows taskbar visibility for kiosk mode
/// </summary>
public static class TaskbarManager
{
    [DllImport("user32.dll")]
    private static extern IntPtr FindWindow(string className, string? windowText);

    [DllImport("user32.dll")]
    private static extern int ShowWindow(IntPtr hwnd, int command);

    private const int SW_HIDE = 0;
    private const int SW_SHOW = 1;

    private static IntPtr taskbarHandle = IntPtr.Zero;

    /// <summary>
    /// Hide the Windows taskbar
    /// </summary>
    public static bool Hide()
    {
        try
        {
            taskbarHandle = FindWindow("Shell_TrayWnd", null);
            if (taskbarHandle != IntPtr.Zero)
            {
                ShowWindow(taskbarHandle, SW_HIDE);

                // Also hide the Start button on Windows 11 if present
                var startHandle = FindWindow("Shell_SecondaryTrayWnd", null);
                if (startHandle != IntPtr.Zero)
                {
                    ShowWindow(startHandle, SW_HIDE);
                }

                return true;
            }
            return false;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Show the Windows taskbar
    /// </summary>
    public static bool Show()
    {
        try
        {
            if (taskbarHandle != IntPtr.Zero)
            {
                ShowWindow(taskbarHandle, SW_SHOW);

                // Also show the Start button on Windows 11 if present
                var startHandle = FindWindow("Shell_SecondaryTrayWnd", null);
                if (startHandle != IntPtr.Zero)
                {
                    ShowWindow(startHandle, SW_SHOW);
                }

                return true;
            }

            // Try to find it again in case it wasn't found before
            taskbarHandle = FindWindow("Shell_TrayWnd", null);
            if (taskbarHandle != IntPtr.Zero)
            {
                ShowWindow(taskbarHandle, SW_SHOW);
                return true;
            }

            return false;
        }
        catch
        {
            return false;
        }
    }
}
