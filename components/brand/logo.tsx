import Image from 'next/image';

import logo from '@/public/logo.png';
import { ru } from '@/lib/i18n/ru';
import { cn } from '@/lib/utils';

/**
 * Фирменный знак VIN2WIN. Один источник на всё приложение: сайдбар, вход,
 * страница приглашения. Знак — зелёный на прозрачном фоне, поэтому кладём
 * его прямо на фон страницы и не заворачиваем в цветную плашку: на зелёном
 * он бы слился.
 */
export function Logo({
  className,
  width = 96,
  priority = false,
}: {
  className?: string;
  width?: number;
  priority?: boolean;
}) {
  return (
    <Image
      src={logo}
      alt={ru.app.name}
      width={width}
      // Высота считается из пропорций исходника — знак широкий, не квадратный
      height={Math.round((width * logo.height) / logo.width)}
      priority={priority}
      // Без h-auto/w-auto: они перебили бы заданную ширину, и знак
      // разъезжался бы до натуральных 640px
      className={cn('select-none', className)}
      style={{ width, height: 'auto' }}
      draggable={false}
    />
  );
}

/**
 * Словесный знак VIN2WIN в цветах темы: белый на тёмной, чёрно-зелёный на
 * светлой. Оба файла в DOM, видимость переключает класс темы на body —
 * он ставится до гидратации, поэтому логотип не мигает при загрузке.
 */
export function Wordmark({ width = 124, className }: { width?: number; className?: string }) {
  // Исходники 744×140 — держим пропорцию, чтобы буквы не плыли
  const height = Math.round((width * 140) / 744);
  const common = {
    alt: ru.app.name,
    width,
    height,
    unoptimized: true,
    draggable: false,
    style: { width, height },
  } as const;
  return (
    <span
      className={cn('relative block shrink-0 select-none', className)}
      style={{ width, height }}
    >
      <Image src="/logo-black.svg" {...common} alt={common.alt} className="dark:hidden" priority />
      <Image
        src="/logo-white.svg"
        {...common}
        alt={common.alt}
        className="hidden dark:block"
        priority
      />
    </span>
  );
}
