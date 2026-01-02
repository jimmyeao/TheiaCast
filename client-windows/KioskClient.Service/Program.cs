using KioskClient.Core;
using KioskClient.Service;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = Host.CreateApplicationBuilder(args);

// Load configuration from appsettings.json and environment variables
var config = new KioskConfiguration();
builder.Configuration.GetSection("Kiosk").Bind(config);

// Register configuration as singleton
builder.Services.AddSingleton(config);

// Register the worker service
builder.Services.AddHostedService<KioskWorker>();

// Configure as Windows Service
builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "KioskClient";
});

var host = builder.Build();
await host.RunAsync();
