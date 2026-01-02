FROM node:20-alpine AS build
WORKDIR /app

# Copy root package files
COPY package.json package-lock.json* ./

# Copy workspace packages (frontend only needs shared and frontend)
COPY shared/package.json ./shared/
COPY frontend/package.json ./frontend/

# Install dependencies
RUN npm install

# Copy source code
COPY shared ./shared
COPY frontend ./frontend

# Build shared library first (required for frontend types)
RUN npm run build --workspace=@theiacast/shared

# Build frontend
# Pass VITE_API_URL as build arg if needed, default to localhost:5001
ARG VITE_API_URL=http://localhost:5001
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build --workspace=frontend

# Production stage
FROM nginx:alpine
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
