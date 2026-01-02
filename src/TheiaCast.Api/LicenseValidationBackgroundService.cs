namespace TheiaCast.Api;

public class LicenseValidationBackgroundService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<LicenseValidationBackgroundService> _logger;

    public LicenseValidationBackgroundService(
        IServiceProvider services,
        ILogger<LicenseValidationBackgroundService> logger)
    {
        _services = services;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("License Validation Background Service started");

        // Wait 30 seconds before first run to allow app to fully start
        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _services.CreateScope();
                var licenseService = scope.ServiceProvider.GetRequiredService<ILicenseService>();

                await licenseService.CheckAndEnforceGracePeriodAsync();

                _logger.LogDebug("License validation check completed");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during license validation");
            }

            // Run every 1 hour
            await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
        }

        _logger.LogInformation("License Validation Background Service stopped");
    }
}
