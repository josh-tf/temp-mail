import { useSyncExternalStore } from 'react';

// Mirrors public/theme.js, which applies the theme before first paint.
export type Theme = 'light' | 'dark' | 'system';

const mq = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark') return t;
  } catch {
    /* storage blocked */
  }
  return 'system';
}

let theme = read();
const resolved = () => (theme === 'dark' || (theme === 'system' && mq.matches) ? 'dark' : 'light');

function apply() {
  document.documentElement.classList.toggle('dark', resolved() === 'dark');
  listeners.forEach((l) => l());
}

mq.addEventListener('change', apply);

export function setTheme(t: Theme) {
  theme = t;
  try {
    if (t === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', t);
  } catch {
    /* storage blocked */
  }
  apply();
}

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

export function useTheme() {
  const t = useSyncExternalStore(subscribe, () => theme);
  const r = useSyncExternalStore(subscribe, resolved);
  return { theme: t, resolved: r, setTheme };
}
