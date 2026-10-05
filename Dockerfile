# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_STANDALONE=true
# better-sqlite3 may need compilation when a matching prebuilt binary is unavailable.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN mkdir -p public \
    && npm run build \
    && ./node_modules/.bin/esbuild scripts/create-admin.ts scripts/reset-staff-pin.ts \
       --bundle --platform=node --format=esm --packages=external \
       --outdir=admin-tools --out-extension:.js=.mjs

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    VALET_STORAGE=/app/storage
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/admin-tools ./admin-tools
# Include complete dependencies used by the bundled administrator CLI tools.
COPY --from=builder --chown=node:node /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder --chown=node:node /app/node_modules/bindings ./node_modules/bindings
COPY --from=builder --chown=node:node /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path
COPY --from=builder --chown=node:node /app/node_modules/libphonenumber-js ./node_modules/libphonenumber-js
COPY --from=builder --chown=node:node /app/node_modules/server-only ./node_modules/server-only
RUN mkdir -p storage .next/cache && chown -R node:node storage .next/cache
USER node
EXPOSE 3000
CMD ["node", "server.js"]
