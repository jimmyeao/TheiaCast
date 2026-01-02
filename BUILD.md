# TheiaCast Build Guide

Quick reference for building and deploying TheiaCast components.

## Build Scripts (Windows PowerShell)

Three PowerShell scripts are provided in the repository root:

### `.\build-backend.ps1`
**Use when:** Backend code changes (`.cs` files in `src/TheiaCast.Api/`)

Rebuilds and restarts the backend Docker container.

```powershell
.\build-backend.ps1
```

### `.\build-frontend.ps1`
**Use when:** Frontend code changes (`.tsx`, `.ts` files in `frontend/`)

Rebuilds and restarts the frontend Docker container.

```powershell
.\build-frontend.ps1
```

### `.\build-all.ps1`
**Use when:**
- Shared types change (`shared/src/types/`)
- Both backend and frontend change
- First-time setup

Rebuilds shared package, backend, and frontend.

```powershell
.\build-all.ps1
```

## Quick Reference

| What Changed | Command | Time |
|--------------|---------|------|
| Backend `.cs` files | `.\build-backend.ps1` | ~2-3 min |
| Frontend `.tsx`/`.ts` files | `.\build-frontend.ps1` | ~2-3 min |
| Shared types | `.\build-all.ps1` | ~5-6 min |
| Multiple components | `.\build-all.ps1` | ~5-6 min |

## Manual Build (Advanced)

If scripts fail or you need manual control:

```powershell
# Navigate to repository root (replace with your actual path)
cd <path-to-repository>

# 1. Rebuild shared (only if types changed)
cd shared
npm run build
cd ..

# 2. Rebuild backend
docker build -t theiacast-backend:local -f src/TheiaCast.Api/Dockerfile .

# 3. Rebuild frontend
docker build -t theiacast-frontend:local -f frontend/Dockerfile .

# 4. Restart containers
docker-compose stop backend frontend
docker-compose rm -f backend frontend
docker-compose up -d backend frontend

# 5. Check logs
docker-compose logs -f backend
```

## Common Docker Commands

```powershell
# View all logs
docker-compose logs -f

# View backend logs only
docker-compose logs -f backend

# View frontend logs only
docker-compose logs -f frontend

# Restart all containers
docker-compose restart

# Stop all containers
docker-compose stop

# View running containers
docker-compose ps

# Remove all containers (does not delete images)
docker-compose down
```

## Troubleshooting

### "Build failed" error
- Check Docker is running: `docker ps`
- Check disk space: `docker system df`
- Clean old images: `docker system prune`

### Changes not reflected after rebuild
- Verify you're in the repository root directory
- Check you rebuilt the correct component
- Hard refresh browser (Ctrl+Shift+R) for frontend changes
- Check container logs for errors: `docker-compose logs backend`

### Shared types not updating
- Always run `.\build-all.ps1` when shared types change
- Running `.\build-backend.ps1` or `.\build-frontend.ps1` alone won't rebuild shared package

## URLs

- **Backend API**: http://localhost:5001
- **Backend Swagger**: http://localhost:5001/swagger
- **Frontend**: http://localhost:5173
- **WebSocket**: ws://localhost:5001/ws

## See Also

- **CLAUDE.md** - Full project documentation
- **docker-compose.yml** - Container configuration
- **src/TheiaCast.Api/Dockerfile** - Backend Dockerfile
- **frontend/Dockerfile** - Frontend Dockerfile
