# Stage 1: Build React frontend
FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package.json ./
RUN npm install
COPY client/ ./
# Copy qz-tray.js into public so Vite copies it to dist as-is (no bundling)
RUN mkdir -p public && cp node_modules/qz-tray/qz-tray.js public/qz-tray.js
RUN npm run build

# Stage 2: Production server
FROM node:20-alpine
RUN apk add --no-cache openssl samba-client
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY server.js bridge.ps1 ./
COPY --from=client-builder /app/client/dist ./client/dist
EXPOSE 3200
CMD ["node", "server.js"]
