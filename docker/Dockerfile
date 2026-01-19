# syntax=docker/dockerfile:1

FROM node:22-bookworm AS deps
WORKDIR /app
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends calibre curl ffmpeg python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*
RUN pip3 install --no-cache-dir piper-tts
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install --omit=dev
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/src/db/migrations apps/api/dist/db/migrations
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/packages/shared/dist packages/shared/dist
RUN useradd -m -u 10001 appuser \
  && mkdir -p /data \
  && chown -R appuser:appuser /app /data
USER appuser
ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:8080/api/health || exit 1
CMD ["node", "apps/api/dist/index.js"]
