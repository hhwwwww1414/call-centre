import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

/**
 * CSP. `unsafe-inline` для стилей нужен Tailwind/Radix (инлайновые style-атрибуты),
 * для скриптов — инлайновому анти-flash скрипту темы в <head> и рантайму Next.
 * В dev дополнительно нужен `unsafe-eval` (React Refresh).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob: https:",
  `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // outputFileTracingIncludes намеренно не используется: glob с `**` по
  // node_modules/.pnpm заставляет трассировщик обходить весь стор и съедает
  // всю память сборки. Движок Prisma докладывается в образ отдельным COPY
  // в Dockerfile — там путь известен точно.
  serverExternalPackages: ['@node-rs/argon2', 'pino', 'exceljs'],
  experimental: {
    // forbidden()/unauthorized() из next/navigation — рендерят app/forbidden.tsx
    authInterrupts: true,
  },
  env: {
    NEXT_PUBLIC_BUILD_VERSION: process.env.BUILD_VERSION ?? 'dev',
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: csp },
          ...(isDev
            ? []
            : [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]),
        ],
      },
      {
        // SSE не должен буферизоваться и кэшироваться ни на одном промежуточном узле
        source: '/api/events/stream',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-transform' },
          { key: 'X-Accel-Buffering', value: 'no' },
        ],
      },
    ];
  },
};

export default nextConfig;
