# apps/api: market-hours poller + demo merchant. One long-running process, SQLite on a volume.
FROM oven/bun:1.4.2-slim
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/agent/package.json packages/agent/
COPY packages/binance/package.json packages/binance/
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY packages/binance packages/binance
COPY packages/agent packages/agent
COPY apps/api apps/api
ENV NODE_ENV=production DB_PATH=/data/tozzecard.sqlite
EXPOSE 8787
CMD ["bun", "apps/api/src/index.ts"]
