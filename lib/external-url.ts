/**
 * Ссылка с чужих данных (профили на площадке заполняют сами пользователи):
 * «t.me/name» без протокола браузер считает относительной, а «javascript:»
 * выполнил бы код. Дописываем https:// и пропускаем только http(s).
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value)
    ? value
    : `https://${value.replace(/^\/+/, '')}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}
