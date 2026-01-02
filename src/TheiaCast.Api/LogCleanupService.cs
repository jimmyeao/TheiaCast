using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace TheiaCast.Api;

public class LogCleanupService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<LogCleanupService> _logger;

    public LogCleanupService(IServiceProvider serviceProvider, ILogger<LogCleanupService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Log cleanup service starting");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Run cleanup every hour
                await Task.Delay(TimeSpan.FromHours(1), stoppingToken);

                using var scope = _serviceProvider.CreateScope();
                var logService = scope.ServiceProvider.GetRequiredService<ILogService>();
                await logService.CleanupOldLogsAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in log cleanup service");
            }
        }

        _logger.LogInformation("Log cleanup service stopping");
    }
}
