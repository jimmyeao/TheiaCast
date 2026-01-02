# PDS.Api

ASP.NET Core 8 scaffold mirroring existing NestJS routes and realtime events.

## Running
```
dotnet run --project src/PDS.Api/PDS.Api.csproj
```

Swagger: http://localhost:5000/swagger
Health: http://localhost:5000/healthz
WebSocket: ws://localhost:5000/ws

## Generating Node TypeScript Types from OpenAPI
- Start the API, then run one of:
```
npx openapi-typescript http://localhost:5000/swagger/v1/swagger.json -o client/src/generated/types.ts
```
Or with NSwag:
```
nswag openapi2tsclient /input:http://localhost:5000/swagger/v1/swagger.json /output:client/src/generated/api.ts
```
