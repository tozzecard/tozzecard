# apps/api: market-hours poller + demo merchant. One long-running process, SQLite on a volume.
FROM oven/bun:1.4.2-slim
# The agent runs the Binance `baw` CLI with Node: Bun can't create the secp256k1 key its sign-in needs.
COPY --from=node:22-slim /usr/local/bin/node /usr/local/bin/node
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
# Agentic Wallet session on the volume, so a redeploy doesn't sign the agent out. baw encrypts it
# with a key derived from the MAC address, which changes every deploy: set BINANCE_INSTANCE_ID
# (a secret, passed at `docker run`, never in the image) to keep the key stable.
ENV BINANCE_BAW_DIR=/data/baw
EXPOSE 8787
CMD ["bun", "apps/api/src/index.ts"]
