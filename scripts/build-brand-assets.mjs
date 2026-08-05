/**
 * Пересборка графики из фирменного знака: design/README.md.
 *
 *   node scripts/build-brand-assets.mjs
 *
 * Запускается вручную при обновлении логотипа — результат коммитится
 * в репозиторий, чтобы сборка приложения не зависела от sharp.
 */
import { createRequire } from 'node:module';
import { readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/**
 * sharp приходит транзитивно вместе с Next, и под pnpm его нет в корне
 * node_modules — обычный import его не найдёт. Ищем в сторе .pnpm.
 */
function loadSharp() {
  try {
    return require('sharp');
  } catch {
    const store = resolve(root, 'node_modules/.pnpm');
    const dir = readdirSync(store).find((name) => name.startsWith('sharp@'));
    if (!dir) {
      throw new Error('sharp не найден. Выполните pnpm install');
    }
    return require(resolve(store, dir, 'node_modules/sharp'));
  }
}

const sharp = loadSharp();

const SOURCE = resolve(root, 'design/v2w_square_avatar_1024.png');

async function main() {
  const trimmed = () => sharp(SOURCE).trim({ threshold: 0 });

  // 1. Знак для интерфейса — без пустых полей
  await trimmed().resize({ width: 640 }).png({ compressionLevel: 9 }).toFile(resolve(root, 'public/logo.png'));

  // 2. Иконка вкладки: знак по центру квадрата, с полем по краям
  const mark512 = await trimmed().resize({ width: 410, fit: 'inside' }).toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mark512, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(resolve(root, 'app/icon.png'));

  // 3. Ярлык iOS: фон обязательно непрозрачный, иначе система зальёт чёрным
  const mark180 = await trimmed().resize({ width: 144, fit: 'inside' }).toBuffer();
  await sharp({ create: { width: 180, height: 180, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: mark180, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(resolve(root, 'app/apple-icon.png'));

  for (const file of ['public/logo.png', 'app/icon.png', 'app/apple-icon.png']) {
    const meta = await sharp(resolve(root, file)).metadata();
    console.log(`${file}: ${meta.width}x${meta.height}, ${statSync(resolve(root, file)).size} байт`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
