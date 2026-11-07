// Runs before the first paint so the app never flashes the wrong brightness at night.
(function () {
  const colors = { light: '#e9efe9', dark: '#0f1c1b' };
  window.applyTheme = function (theme) {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    else delete root.dataset.theme;
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      const media = meta.getAttribute('media') || '';
      const own = media.includes('dark') ? colors.dark : colors.light;
      meta.setAttribute('content', colors[theme] || own);
    });
  };
  let saved = null;
  try { saved = localStorage.getItem('year-theme'); } catch (e) { /* storage blocked */ }
  window.applyTheme(saved);
})();
