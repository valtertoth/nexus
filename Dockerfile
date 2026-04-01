FROM node:20-slim

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/
COPY packages/shared/package.json packages/shared/
COPY packages/web/package.json packages/web/

# Install dependencies (including tsx which is a devDependency needed at runtime)
# We install all deps then prune, or we move tsx to prod deps via explicit install
RUN npm ci && \
    npm cache clean --force

# Copy source code (only server and shared — web is not needed)
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/

# Set production mode
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Run with tsx since shared package exports raw TypeScript
CMD ["npx", "tsx", "packages/server/src/index.ts"]
