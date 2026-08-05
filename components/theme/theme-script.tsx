import { THEME_COOKIE, THEME_STORAGE_KEY } from '@/lib/theme';

/**
 * Ставит класс темы на <body> до гидратации — иначе на секунду видно
 * чужую тему (ТЗ 2.4). Скрипт умышленно крошечный и синхронный.
 */
const script = `(function(){try{
var m=localStorage.getItem('${THEME_STORAGE_KEY}');
if(!m){var c=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);m=c?decodeURIComponent(c[1]):'system';}
var r=m==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):m;
var b=document.body||document.documentElement;
b.classList.remove('theme-light','theme-dark');
b.classList.add('theme-'+r);
b.dataset.themeMode=m;
}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} suppressHydrationWarning />;
}
