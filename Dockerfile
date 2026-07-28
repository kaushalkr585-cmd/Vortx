# ============================================================
# VORTX Production Dockerfile
# Bundles Vite Frontend + Express Backend + yt-dlp + FFmpeg
# ============================================================

FROM node:20-slim

# Install Python3, pip, ffmpeg, and curl
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install latest yt-dlp system-wide
RUN pip3 install --no-cache-dir --break-system-packages -U yt-dlp

WORKDIR /app

# Install frontend dependencies (including devDependencies like typescript and vite for build)
COPY package*.json ./
RUN npm ci || npm install

# Install server dependencies
COPY server/package*.json ./server/
RUN cd server && (npm ci --omit=dev || npm install)

# Copy all source files
COPY . .

# Build frontend to dist/
RUN npm run build

# Expose port and start Express backend
EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

CMD ["node", "server/index.js"]
