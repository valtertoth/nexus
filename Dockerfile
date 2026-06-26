# Stage 1: Build frontend
FROM node:20-slim AS web-builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/web/package.json packages/web/
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

RUN npm ci && npm cache clean --force

COPY packages/shared/ packages/shared/
COPY packages/web/ packages/web/

ENV VITE_API_URL=""
ENV VITE_SUPABASE_URL=https://rutzeiqywwfjpeizikpw.supabase.co
ENV VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1dHplaXF5d3dmanBlaXppa3B3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MjQ1ODQsImV4cCI6MjA5MDIwMDU4NH0.0Rr1HcfiadcRJOzYMbFwsv3pRyJgcRIkEkMsQvJOG74

RUN npm run build -w @nexus/web

# Stage 2: Production server
FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/
COPY packages/shared/package.json packages/shared/
COPY packages/web/package.json packages/web/

RUN npm ci --omit=dev && npm cache clean --force

COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/

# Copy frontend build from stage 1
COPY --from=web-builder /app/packages/web/dist/ ./web-dist/

RUN addgroup --system nexus && adduser --system --ingroup nexus nexus

USER nexus

ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r=>{if(!r.ok)throw r.status}).catch(()=>process.exit(1))"

CMD ["node", "--max-old-space-size=512", "node_modules/.bin/tsx", "packages/server/src/index.ts"]
