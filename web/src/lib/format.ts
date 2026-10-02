const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const fullFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Compact list timestamp: "5 min. ago" within the hour, time today, date otherwise. */
export function shortTime(ms: number, now = Date.now()) {
  const s = (now - ms) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute');
  if (new Date(ms).toDateString() === new Date(now).toDateString()) return timeFmt.format(ms);
  return dayFmt.format(ms);
}

export function relativeTime(ms: number, now = Date.now()) {
  const s = Math.round((ms - now) / 1000);
  const a = Math.abs(s);
  if (a < 60) return rtf.format(s, 'second');
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}

export const fullDate = (ms: number) => fullFmt.format(ms);

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

/** "Jane <jane@x.com>" -> "Jane"; bare addresses are returned as-is. */
export function senderName(from: string) {
  const m = /^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/.exec(from);
  return m?.[1] || from;
}

export const ALIAS_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
export const DISCORD_ID_RE = /^\d{5,25}$/;
