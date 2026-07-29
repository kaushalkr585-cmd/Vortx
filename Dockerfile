# ============================================================
# VORTX Production Dockerfile
# Bundles Vite Frontend + Express Backend + yt-dlp + FFmpeg
# ============================================================

FROM node:20-slim

# Install Python3, pip, ffmpeg, curl, wget
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install latest yt-dlp system-wide
# --break-system-packages is needed on Debian 12+ (bookworm)
RUN pip3 install --no-cache-dir --break-system-packages -U yt-dlp

WORKDIR /app

# Install frontend dependencies (including devDependencies like typescript and vite for build)
COPY package*.json ./
RUN npm ci || npm install

# Install server dependencies
COPY server/package*.json ./server/
RUN cd server && (npm ci --omit=dev || npm install --omit=dev)

# Copy all source files
COPY . .

# Build frontend to dist/
RUN npm run build

# Expose port and start Express backend
EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

# IMPORTANT: Set YOUTUBE_COOKIES env var in your deployment platform (Render, Railway, etc.)
# with the contents of your Netscape cookie file to prevent bot-detection errors.
# See server/COOKIES_SETUP.md for instructions.

CMD ["node", "server/index.js"]
