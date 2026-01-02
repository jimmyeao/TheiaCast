# PDS .NET Deployment

- Windows publish:
```
 dotnet publish ./src/PDS.Api/PDS.Api.csproj -c Release -r win-x64 -p:PublishSingleFile=true --self-contained true -o ./publish/win-x64/api
```
- Raspberry Pi (linux-arm64) publish:
```
 dotnet publish ./src/PDS.Api/PDS.Api.csproj -c Release -r linux-arm64 -p:PublishSingleFile=true --self-contained true -o ./publish/linux-arm64/api
```
- Install systemd unit:
```
 sudo cp deploy/pds-api.service /etc/systemd/system/pds-api.service
 sudo systemctl daemon-reload
 sudo systemctl enable pds-api
 sudo systemctl start pds-api
```
