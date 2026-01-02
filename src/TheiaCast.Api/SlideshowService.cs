using System.Diagnostics;
using Microsoft.EntityFrameworkCore;

namespace TheiaCast.Api;

public interface ISlideshowService
{
    Task<ContentItem> ConvertAndCreateAsync(IFormFile file, string name, int durationPerSlide);
    Task<string> GenerateViewerHtmlAsync(string storageId, int durationMs);
}

public class SlideshowService : ISlideshowService
{
    private readonly PdsDbContext _db;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<SlideshowService> _logger;

    public SlideshowService(PdsDbContext db, IWebHostEnvironment env, ILogger<SlideshowService> logger)
    {
        _db = db;
        _env = env;
        _logger = logger;
    }

    public async Task<ContentItem> ConvertAndCreateAsync(IFormFile file, string name, int durationPerSlide)
    {
        // 1. Save uploaded file to temp
        var tempDir = Path.Combine(Path.GetTempPath(), "pds_uploads", Guid.NewGuid().ToString());
        Directory.CreateDirectory(tempDir);
        var tempFilePath = Path.Combine(tempDir, file.FileName);

        using (var stream = new FileStream(tempFilePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        // 2. Convert PPTX -> PDF using LibreOffice
        _logger.LogInformation("Converting PPTX to PDF: {FilePath}", tempFilePath);
        await RunCommandAsync("soffice", $"--headless --convert-to pdf --outdir \"{tempDir}\" \"{tempFilePath}\"");

        var pdfPath = Path.Combine(tempDir, Path.GetFileNameWithoutExtension(file.FileName) + ".pdf");
        if (!File.Exists(pdfPath))
        {
            throw new Exception("PDF conversion failed. Output file not found.");
        }

        // 3. Convert PDF -> Images using pdftoppm
        // Create wwwroot/slideshows/{id} directory
        // We don't have the ID yet, so we'll use a GUID folder first, then maybe rename or just use GUID.
        // Let's use a GUID for the storage folder to avoid ID conflicts before insert.
        var storageId = Guid.NewGuid().ToString();
        var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        var outputDir = Path.Combine(webRoot, "slideshows", storageId);
        Directory.CreateDirectory(outputDir);

        _logger.LogInformation("Converting PDF to Images: {PdfPath} -> {OutputDir}", pdfPath, outputDir);
        // pdftoppm -jpeg -r 150 input.pdf output_prefix
        await RunCommandAsync("pdftoppm", $"-jpeg -r 150 \"{pdfPath}\" \"{Path.Combine(outputDir, "slide")}\"");

        // 4. Cleanup temp
        try { Directory.Delete(tempDir, true); } catch { /* ignore */ }

        // Calculate total duration
        // Count the generated images
        var slideCount = Directory.GetFiles(outputDir, "*.jpg").Length;
        var totalDurationSeconds = (slideCount * durationPerSlide) / 1000;

        // 5. Create ContentItem
        // The URL will point to the viewer endpoint
        var content = new ContentItem
        {
            Name = name,
            Url = $"/api/render/slideshow/{storageId}?duration={durationPerSlide}",
            DefaultDuration = totalDurationSeconds
        };

        _db.Content.Add(content);
        await _db.SaveChangesAsync();

        // 6. Save first slide as thumbnail
        try
        {
            var slideFiles = Directory.GetFiles(outputDir, "*.jpg").OrderBy(f => f).ToArray();
            if (slideFiles.Length > 0)
            {
                var firstSlide = slideFiles[0]; // Should be slide-1.jpg
                var thumbnailBytes = await File.ReadAllBytesAsync(firstSlide);
                content.ThumbnailBase64 = Convert.ToBase64String(thumbnailBytes);
                await _db.SaveChangesAsync();
                _logger.LogInformation("Saved PowerPoint thumbnail from first slide: {FirstSlide}", Path.GetFileName(firstSlide));
            }
            else
            {
                _logger.LogWarning("No slides found for thumbnail generation in {OutputDir}", outputDir);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save PowerPoint thumbnail for {StorageId}", storageId);
            // Don't fail the entire operation if thumbnail fails
        }

        return content;
    }

    public async Task<string> GenerateViewerHtmlAsync(string storageId, int durationMs)
    {
        var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        var slidesDir = Path.Combine(webRoot, "slideshows", storageId);
        
        if (!Directory.Exists(slidesDir))
        {
            return "<html><body><h1>Slideshow not found</h1></body></html>";
        }

        var images = Directory.GetFiles(slidesDir, "*.jpg")
            .Select(f => Path.GetFileName(f))
            .OrderBy(f => f) // slide-1.jpg, slide-10.jpg... sorting might be tricky with default string sort
            // Better sort:
            .OrderBy(f => {
                var name = Path.GetFileNameWithoutExtension(f); // slide-1
                var number = name.Replace("slide-", "");
                return int.TryParse(number, out int n) ? n : 0;
            })
            .ToList();

        var imageListJs = string.Join(",", images.Select(i => $"'/slideshows/{storageId}/{i}'"));

        return $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body, html {{ margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: black; }}
        #slide {{ width: 100%; height: 100%; object-fit: contain; display: block; }}
    </style>
</head>
<body>
    <img id='slide' src='' />
    <script>
        const images = [{imageListJs}];
        let currentIndex = 0;
        const imgElement = document.getElementById('slide');
        const duration = {durationMs};

        function showNextSlide() {{
            if (images.length === 0) return;
            imgElement.src = images[currentIndex];
            currentIndex = (currentIndex + 1) % images.length;
        }}

        showNextSlide();
        setInterval(showNextSlide, duration);
    </script>
</body>
</html>";
    }

    private async Task RunCommandAsync(string command, string args)
    {
        var psi = new ProcessStartInfo
        {
            FileName = command,
            Arguments = args,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = Process.Start(psi);
        if (process == null) throw new Exception($"Failed to start {command}");

        var output = await process.StandardOutput.ReadToEndAsync();
        var error = await process.StandardError.ReadToEndAsync();
        
        await process.WaitForExitAsync();

        if (process.ExitCode != 0)
        {
            _logger.LogError("Command failed: {Command} {Args}\nOutput: {Output}\nError: {Error}", command, args, output, error);
            throw new Exception($"Command failed with exit code {process.ExitCode}: {error}");
        }
    }
}
