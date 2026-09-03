# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

WORKDIR /app

RUN corepack enable

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM dependencies AS build

ARG VITE_FRONTEND_FORGE_API_URL
ARG VITE_FRONTEND_FORGE_API_KEY
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_ENVIRONMENT
ARG VITE_ANALYTICS_ENDPOINT
ARG VITE_ANALYTICS_WEBSITE_ID

COPY client ./client
COPY server ./server
COPY shared ./shared
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY tsconfig.json tsconfig.node.json vite.config.ts ./

RUN pnpm build

FROM dependencies AS migrate

COPY drizzle ./drizzle
COPY drizzle.config.ts tsconfig.json ./

USER node

CMD ["node", "node_modules/drizzle-kit/bin.cjs", "migrate"]

FROM dependencies AS production-dependencies

RUN pnpm prune --prod

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health/ready').then(response=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "dist/index.js"]
