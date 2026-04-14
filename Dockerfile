FROM node:20-slim

# System deps for sharp (libvips), canvas (cairo/pango), fontconfig, and openssl
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    fontconfig \
    libvips-dev \
    build-essential \
    g++ \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    python3 \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production
# Tell fontconfig where our bundled fonts live
ENV FONTCONFIG_PATH=/app/app/fonts

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install all deps (including devDependencies for build step)
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Generate Prisma client and build
RUN npx prisma generate
RUN pnpm run build

# Remove devDependencies after build
RUN pnpm prune --prod

# Create directory for generated print files
RUN mkdir -p /app/generated-print-files

CMD ["pnpm", "run", "docker-start"]
