FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["src/TheiaCast.Api/TheiaCast.Api.csproj", "./"]
RUN dotnet restore "TheiaCast.Api.csproj"
COPY src/TheiaCast.Api/ .
RUN dotnet publish "TheiaCast.Api.csproj" -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
# Install LibreOffice and Poppler Utils for PPTX conversion, FFmpeg for video processing, and Chromium for web screenshots
RUN apt-get update && apt-get install -y \
    libreoffice \
    poppler-utils \
    fonts-liberation \
    ffmpeg \
    chromium \
    chromium-driver \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
# Ensure wwwroot exists so UseStaticFiles works correctly
RUN mkdir -p wwwroot

COPY --from=build /app/publish .
EXPOSE 8080
ENV ASPNETCORE_HTTP_PORTS=8080
ENTRYPOINT ["dotnet", "TheiaCast.Api.dll"]
