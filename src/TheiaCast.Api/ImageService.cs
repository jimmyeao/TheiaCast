using Microsoft.EntityFrameworkCore;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;
using SixLabors.ImageSharp.Formats.Jpeg;

namespace TheiaCast.Api;

public interface IImageService
{
    Task<object> ProcessAndCreateAsync(IFormFile file, string name);
}

public class ImageService : IImageService
{
    private readonly PdsDbContext _db;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<ImageService> _logger;

    public ImageService(PdsDbContext db, IWebHostEnvironment env, ILogger<ImageService> logger)
    {
        _db = db;
        _env = env;
        _logger = logger;
    }

    public async Task<object> ProcessAndCreateAsync(IFormFile file, string name)
    {
        // Validate file type
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp" };

        if (!allowedExtensions.Contains(extension))
        {
            throw new InvalidOperationException($"Unsupported image format: {extension}. Allowed: {string.Join(", ", allowedExtensions)}");
        }

        // Generate unique storage ID
        var storageId = Guid.NewGuid().ToString();
        var imageDir = Path.Combine(_env.WebRootPath, "images", storageId);
        Directory.CreateDirectory(imageDir);

        _logger.LogInformation("Processing image upload: {FileName} ({Size} bytes) -> {StorageId}",
            file.FileName, file.Length, storageId);

        // Save image file
        var imageFileName = $"image{extension}";
        var imagePath = Path.Combine(imageDir, imageFileName);

        using (var stream = new FileStream(imagePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        _logger.LogInformation("Image saved to: {Path}", imagePath);

        // Generate HTML wrapper for consistent full-screen display
        var htmlPath = Path.Combine(imageDir, "index.html");
        var htmlContent = GenerateImageHtml(imageFileName);
        await File.WriteAllTextAsync(htmlPath, htmlContent);

        _logger.LogInformation("Generated HTML wrapper: {Path}", htmlPath);

        // Generate thumbnail for preview
        string? thumbnailBase64 = null;
        try
        {
            _logger.LogInformation("Generating thumbnail for image: {ImagePath}", imagePath);

            // Security: Check image dimensions before loading to prevent DoS attacks
            const int MaxImageDimension = 8192; // 8K resolution
            var imageInfo = await Image.IdentifyAsync(imagePath);

            if (imageInfo.Width > MaxImageDimension || imageInfo.Height > MaxImageDimension)
            {
                _logger.LogWarning("Image dimensions ({Width}x{Height}) exceed maximum allowed ({Max}x{Max}). Skipping thumbnail generation for security.",
                    imageInfo.Width, imageInfo.Height, MaxImageDimension, MaxImageDimension);
                // thumbnailBase64 remains null, method continues gracefully
            }
            else
            {
                _logger.LogInformation("Image dimensions: {Width}x{Height}", imageInfo.Width, imageInfo.Height);

                using var image = await Image.LoadAsync(imagePath);

                // Resize to thumbnail size (320x180 for 16:9 aspect ratio)
                image.Mutate(x => x.Resize(new ResizeOptions
                {
                    Size = new Size(320, 180),
                    Mode = ResizeMode.Max // Maintain aspect ratio
                }));

                // Convert to JPEG base64
                using var ms = new MemoryStream();
                await image.SaveAsync(ms, new JpegEncoder { Quality = 80 });
                thumbnailBase64 = Convert.ToBase64String(ms.ToArray());
                _logger.LogInformation("Thumbnail generated successfully ({Bytes} bytes)", ms.Length);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to generate thumbnail for image, will use fallback");
        }

        // Create ContentItem with thumbnail
        var relativeUrl = $"/images/{storageId}/index.html";
        var content = new ContentItem
        {
            Name = name,
            Url = relativeUrl,
            CreatedAt = DateTime.UtcNow,
            DefaultDuration = null, // Images display indefinitely by default (use playlist item duration)
            ThumbnailBase64 = thumbnailBase64
        };

        _db.Content.Add(content);
        await _db.SaveChangesAsync();

        _logger.LogInformation("ContentItem created: Id={Id}, Name={Name}, Url={Url}, HasThumbnail={HasThumbnail}",
            content.Id, content.Name, content.Url, thumbnailBase64 != null);

        return new
        {
            id = content.Id,
            name = content.Name,
            url = content.Url,
            createdAt = content.CreatedAt,
            storageId = storageId,
            fileSize = file.Length
        };
    }

    private string GenerateImageHtml(string imageFileName)
    {
        return $@"<!DOCTYPE html>
<html>
<head>
    <meta charset=""utf-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
    <title>Image Display</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        html, body {{
            width: 100%;
            height: 100%;
            overflow: hidden;
            background-color: #000;
        }}
        .image-container {{
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: #000;
        }}
        img {{
            max-width: 100%;
            max-height: 100%;
            width: auto;
            height: auto;
            object-fit: contain;
            display: block;
        }}
    </style>
</head>
<body>
    <div class=""image-container"">
        <img src=""{imageFileName}"" alt=""Display Image"" />
    </div>
</body>
</html>";
    }
}
