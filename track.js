// Records every link click as a GoatCounter event, e.g. "click: https://github.com/...".
// Add data-track="name" to a link to give it a friendlier label in the dashboard.
document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('a');
  if (!a || !window.goatcounter || !window.goatcounter.count) return;
  window.goatcounter.count({
    path: 'click: ' + (a.dataset.track || a.getAttribute('href')),
    title: a.textContent.trim(),
    event: true,
  });
});

// Open links to other sites (GitHub, LinkedIn, papers, ...) in a new tab. Links within this site,
// email links and in-page anchors are left alone.
document.querySelectorAll('a[href]').forEach(function (a) {
  if (/^https?:$/.test(a.protocol) && a.host !== location.host) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
});
