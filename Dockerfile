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
# Потолок кучи: на VPS с 4 ГБ сборка иначе уходит в OOM и падает без внятной ошибки
ENV NODE_OPTIONS=--max-old-space-size=2048

# next build требует переменные окружения только для типов, не для подключения:
# реальный DATABASE_URL приходит в рантайме
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"

RUN pnpm exec prisma generate && pnpm exec next build

# ─── migrator ───────────────────────────────────────────────────────────────
# Отдельная стадия под `prisma migrate deploy`: CLI и движки миграций весят
# сотни мегабайт, в рантайме они не нужны. Запускается разово из deploy.sh.
#
# Наследуемся от deps, а не от builder: миграциям не нужна сборка Next.
# Иначе на слабом сервере два `next build` идут параллельно и падают по памяти.
FROM deps AS migrator
WORKDIR /app
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

COPY --from=builder /app/public ./public

# output: 'standalone' — Next сам трассирует зависимости и кладёт в образ
# только реально используемый код, включая клиент Prisma и его движок.
# Вручную node_modules не копируем: под pnpm раскладка другая
# (@prisma/client лежит в .pnpm/, а не в node_modules/.prisma).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Схема — для отладки и как источник правды о структуре БД рядом с кодом
COPY --from=builder --chown=nextjs:nodejs /app/prisma/schema.prisma ./prisma/schema.prisma

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
