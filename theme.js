// Light/dark theme. Loaded in <head> without defer so a saved choice applies before the page paints.
// With no saved choice the site follows the system setting (see the prefers-color-scheme rules in style.css).
(function () {
  var KEY = 'theme';
  var root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);

  var MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  var SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>';

  function isDark() {
    var t = root.getAttribute('data-theme');
    return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-toggle';
    function update() {
      var dark = isDark();
      button.innerHTML = dark ? SUN : MOON;
      button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      button.title = button.getAttribute('aria-label');
    }
    button.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      function apply() {
        root.setAttribute('data-theme', next);
        try { localStorage.setItem(KEY, next); } catch (e) {}
        update();
      }
      // Cross-fade the whole page between the old and new theme (see ::view-transition rules in
      // style.css). Browsers without View Transitions, or with reduced motion, switch instantly.
      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (document.startViewTransition && !reduce) document.startViewTransition(apply);
      else apply();
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', update);
    update();
    document.body.appendChild(button);
  });
})();
