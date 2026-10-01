/**
 * Возврат в список контактов на то же место. Список прокручивает <main>, а не
 * окно, и страницы подгружаются по мере прокрутки, поэтому браузер сам позицию
 * не восстановит: запоминаем адрес списка с фильтрами, прокрутку и сколько
 * строк было загружено.
 */
const KEY = 'contacts:list-position';

export type ListPosition = { url: string; y: number; rows: number; contactId: string };

function scroller(): HTMLElement | null {
  return document.getElementById('main');
}

export function saveListPosition(url: string, rows: number, contactId: string): void {
  try {
    const y = scroller()?.scrollTop ?? 0;
    sessionStorage.setItem(KEY, JSON.stringify({ url, y, rows, contactId }));
  } catch {
    // Приватный режим без sessionStorage — просто откроем список сверху
  }
}

export function readListPosition(): ListPosition | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ListPosition) : null;
  } catch {
    return null;
  }
}

export function clearListPosition(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // нечего чистить
  }
}

export function restoreScroll(y: number): void {
  const element = scroller();
  if (element) element.scrollTop = y;
}
