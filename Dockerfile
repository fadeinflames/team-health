# syntax=docker/dockerfile:1

# Общая база. Версия ноды совпадает с engines в package.json (>=20), берём текущий LTS.
FROM node:22-alpine AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false
RUN apk add --no-cache tini

# Зависимости отдельным слоем: пересобирается только при изменении package*.json.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Стадия для разработки: используется из docker compose, исходники прилетают bind-mount'ом.
FROM deps AS dev
ENV APP_ENV=local
COPY . .
EXPOSE 4173 5173
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--watch", "server.js"]

# Сборка фронтенда.
FROM deps AS build
COPY . .
RUN npm run build

# Тесты: официальный образ Playwright, версия обязана совпадать с @playwright/test.
FROM mcr.microsoft.com/playwright:v1.59.1-noble AS test
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    CI=1
COPY package.json package-lock.json ./
RUN npm ci
COPY playwright.config.js ./
COPY tests ./tests
CMD ["npx", "playwright", "test"]

# Рантайм. Без dev-зависимостей, без исходников фронтенда, от непривилегированного пользователя.
FROM base AS runtime
ARG VERSION=dev
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="team-health" \
      org.opencontainers.image.description="Team Health 1:1" \
      org.opencontainers.image.source="https://github.com/fadeinflames/team-health" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}"

ENV NODE_ENV=production \
    APP_ENV=production \
    PORT=4173

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js ./
# Миграции едут в том же образе, что и код, который их ожидает. Отдельный
# образ для миграций рано или поздно разъедется по версиям.
COPY migrations ./migrations
COPY scripts ./scripts
COPY fixtures ./fixtures
COPY --from=build /app/dist ./dist

# Каталог нужен только для file-fallback без DATABASE_URL. В k8s его не будет:
# при APP_ENV=production сервер откажется стартовать без базы, и ФС может быть read-only.
RUN mkdir -p /app/.data && chown -R node:node /app/.data

USER node
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/healthz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini не обязателен (SIGTERM обрабатывается в server.js), но снимает вопрос
# зомби-процессов, если рядом когда-нибудь появится sidecar-скрипт.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
