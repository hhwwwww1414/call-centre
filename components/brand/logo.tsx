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
