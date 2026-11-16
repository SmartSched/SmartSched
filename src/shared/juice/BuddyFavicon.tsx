import { useEffect } from 'react';
import type { Accent } from '../../app/theme';
import type { Buddy } from './prefs';

const ACCENT: Record<Accent, string> = {
  violet: '#a78bfa',
  blue: '#60a5fa',
  teal: '#2dd4bf',
  green: '#4ade80',
  rose: '#fb7185',
  orange: '#fb923c',
};

const FACE =
  '<ellipse cx="22" cy="49" rx="4.5" ry="2.6" fill="#f472b6" opacity=".4"/><ellipse cx="58" cy="49" rx="4.5" ry="2.6" fill="#f472b6" opacity=".4"/><ellipse cx="30" cy="40" rx="3.3" ry="4.3" fill="#252342"/><circle cx="31.1" cy="38.5" r="1.1" fill="#fff"/><ellipse cx="50" cy="40" rx="3.3" ry="4.3" fill="#252342"/><circle cx="51.1" cy="38.5" r="1.1" fill="#fff"/><path d="M36.8 51q3.2 3.2 6.4 0" fill="none" stroke="#252342" stroke-linecap="round" stroke-width="2"/>';

function body(buddy: Buddy, accent: Accent) {
  switch (buddy) {
    case 'cloud':
      return '<path d="M17 68C7 68 3 59 7 52 2 44 8 33 19 34 19 21 31 13 42 17 50 8 66 12 67 27 77 29 79 42 73 49 78 59 71 68 61 68Z" fill="#f8fafc" stroke="#94a3b8" stroke-width="2" stroke-linejoin="round"/>';
    case 'sunflower':
      return `<g fill="#facc15" stroke="#eab308" stroke-width="1.2">${Array.from({ length: 12 }, (_, i) => `<ellipse cx="40" cy="15" rx="6.5" ry="11" transform="rotate(${i * 30} 40 42)"/>`).join('')}</g><circle cx="40" cy="44" r="22" fill="#c98a3c"/>`;
    case 'sun':
      return `<g stroke="#f59e0b" stroke-width="4.5" stroke-linecap="round">${Array.from({ length: 12 }, (_, i) => `<path d="M40 6v7" transform="rotate(${i * 30} 40 42)"/>`).join('')}</g><circle cx="40" cy="42" r="25" fill="#fbbf24"/>`;
    case 'moon':
      return '<circle cx="40" cy="42" r="28" fill="#fef3c7" opacity=".35"/><circle cx="40" cy="42" r="25" fill="#fde68a"/><circle cx="23" cy="30" r="4" fill="#fcd34d"/><circle cx="56" cy="26" r="2.6" fill="#fcd34d"/><circle cx="57" cy="58" r="3.2" fill="#fcd34d"/>';
    default:
      return `<path fill="${ACCENT[accent]}" d="M40 8C61 8 75 25 75 45c0 16-13 24-35 24S5 61 5 45C5 25 19 8 40 8Z"/><ellipse cx="27" cy="22" rx="8" ry="4.5" transform="rotate(-25 27 22)" fill="#fff" opacity=".35"/>`;
  }
}

export function BuddyFavicon({ buddy, accent }: { buddy: Buddy; accent: Accent }) {
  useEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon)
      icon.href = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">${body(buddy, accent)}${FACE}</svg>`)}`;
  }, [buddy, accent]);
  return null;
}
