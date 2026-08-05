# syntax=docker/dockerfile:1.7

# ─── deps ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

RUN corepack enable && apk add --no-cache libc6-compat openssl

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma

# Полный набор зависимостей нужен для сборки; prisma generate ставит движки
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# ─── builder ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && apk add --no-cache libc6-compat openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION
ENV NEXT_TELEMETRY_DISABLED=1
# Потолок кучи: на VPS с 4 ГБ сборка иначе уходит в OOM и падает без внятной
# ошибки («signal: killed»). Значение переопределяется build-аргументом.
ARG NODE_HEAP_MB=3072
ENV NODE_OPTIONS=--max-old-space-size=$NODE_HEAP_MB

# next build требует переменные окружения только для типов, не для подключения:
# реальный DATABASE_URL приходит в рантайме
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"

RUN pnpm exec prisma generate && pnpm exec next build

# Движок Prisma — нативный бинарник, трассировщик Next его не видит.
# Собираем сгенерированный клиент в предсказуемое место: под pnpm он лежит
# внутри .pnpm/@prisma+client@…/, и путь в COPY заранее не выписать.
RUN set -eux; \
    src="$(dirname "$(find /app/node_modules/.pnpm -path '*/.prisma/client/default.js' -print -quit)")"; \
    mkdir -p /prisma-client; \
    cp -a "$src/." /prisma-client/; \
    ls -1 /prisma-client | head -20; \
    test -n "$(find /prisma-client -name 'libquery_engine*' -o -name '*.node' | head -1)"

# ─── migrator ───────────────────────────────────────────────────────────────
# Отдельная стадия под `prisma migrate deploy`: CLI и движки миграций весят
# сотни мегабайт, в рантайме они не нужны. Запускается разово из deploy.sh.
#
# Наследуемся от deps, а не от builder: миграциям не нужна сборка Next.
# Иначе на слабом сервере два `next build` идут параллельно и падают по памяти.
FROM deps AS migrator
WORKDIR /app

# Тем же образом запускаются сид-скрипты и аварийная установка пароля,
# а они тянут код из lib/ — без него tsx не найдёт модули
COPY tsconfig.json ./
COPY lib ./lib
COPY scripts ./scripts

CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ─── runner ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl curl tzdata && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# ARG не переходит между стадиями — объявляем заново, иначе /api/health
# рапортует "dev" и по нему нельзя понять, какая сборка сейчас живая
ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

COPY --from=builder /app/public ./public

# output: 'standalone' — Next сам трассирует зависимости и кладёт в образ
# только реально используемый код, включая клиент Prisma и его движок.
# Вручную node_modules не копируем: под pnpm раскладка другая
# (@prisma/client лежит в .pnpm/, а не в node_modules/.prisma).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Схема — для отладки и как источник правды о структуре БД рядом с кодом
COPY --from=builder --chown=nextjs:nodejs /app/prisma/schema.prisma ./prisma/schema.prisma

# Клиент Prisma вместе с движком запроса: standalone тянет JS-обёртку,
# но нативный бинарник в трассировку не попадает
COPY --from=builder --chown=nextjs:nodejs /prisma-client ./node_modules/.prisma/client

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
