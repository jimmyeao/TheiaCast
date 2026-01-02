using System.Diagnostics;
using System.Management;

namespace KioskClient.Core;

public class HealthMonitor
{
    private readonly ILogger _logger;
    private readonly PerformanceCounter _cpuCounter;
    private readonly PerformanceCounter _ramCounter;

    public HealthMonitor(ILogger logger)
    {
        _logger = logger;

        // Initialize performance counters
        _cpuCounter = new PerformanceCounter("Processor", "% Processor Time", "_Total");
        _ramCounter = new PerformanceCounter("Memory", "% Committed Bytes In Use");

        // First call returns 0, so call once to initialize
        _cpuCounter.NextValue();
    }

    public async Task<HealthReport> GetHealthReportAsync()
    {
        try
        {
            // CPU usage
            var cpuUsage = _cpuCounter.NextValue();

            // Memory usage
            var memoryUsage = _ramCounter.NextValue();

            // Disk usage (C: drive)
            var driveInfo = new DriveInfo("C");
            var diskUsagePercent = (double)(driveInfo.TotalSize - driveInfo.AvailableFreeSpace) / driveInfo.TotalSize * 100;

            return new HealthReport
            {
                CpuPercent = Math.Round(cpuUsage, 2),
                MemoryPercent = Math.Round(memoryUsage, 2),
                DiskPercent = Math.Round(diskUsagePercent, 2),
                Timestamp = DateTime.UtcNow
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get health report");
            return new HealthReport
            {
                CpuPercent = 0,
                MemoryPercent = 0,
                DiskPercent = 0,
                Timestamp = DateTime.UtcNow
            };
        }
    }

    public void Dispose()
    {
        _cpuCounter?.Dispose();
        _ramCounter?.Dispose();
    }
}

public class HealthReport
{
    public double CpuPercent { get; set; }
    public double MemoryPercent { get; set; }
    public double DiskPercent { get; set; }
    public DateTime Timestamp { get; set; }
}
