FROM node:20-alpine

# System deps for sharp (libvips), canvas (cairo/pango), and fontconfig
RUN apk add --no-cache \
    openssl \
    fontconfig \
    vips-dev \
    build-base \
    g++ \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev \
    python3

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

CMD ["pnpm", "run", "docker-start"]
