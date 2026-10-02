// Applies the saved/system theme before first paint. External file because the
// CSP forbids inline scripts. Kept in sync with src/lib/theme.ts.
(function () {
  var t = 'system';
  try {
    t = localStorage.getItem('theme') || 'system';
  } catch (e) {}
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
})();
