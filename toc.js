// Writeup contents: highlights the section being read, with a marker beside its link that slides
// between links. On wide screens the list sits in the left margin (see .toc in style.css); its links
// jump to each section.
(function () {
  var toc = document.querySelector('.toc');
  if (!toc) return;
  var pairs = [];
  toc.querySelectorAll('a[href^="#"]').forEach(function (a) {
    var section = document.getElementById(a.getAttribute('href').slice(1));
    if (section) pairs.push({ link: a, item: a.closest('li') || a, section: section });
  });
  if (!pairs.length) return;

  // Scroll positions where each section starts. A section starts once its top passes a line 30% down
  // the viewport. The page usually can't scroll far enough for the last sections to reach the line,
  // so the end of the page is squeezed to fit: the stretch that would be needed is compressed into
  // a stretch half as long that ends at the bottom of the page, keeping proportions. Every section
  // gets its own stretch of scrolling, however short or close to the end it is.
  function sectionStarts() {
    var max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    var line = window.innerHeight * 0.3;
    var starts = pairs.map(function (p) {
      return p.section.getBoundingClientRect().top + window.scrollY - line;
    });
    var lastSection = pairs[pairs.length - 1].section;
    var end = starts[starts.length - 1] + lastSection.offsetHeight; // where the page would need to scroll to
    if (end <= max) return starts;
    var from = Math.max(0, 2 * max - end);
    var scale = (max - from) / (end - from);
    return starts.map(function (s) { return s > from ? from + (s - from) * scale : s; });
  }

  // After a link is clicked (the browser then scrolls to its section), that section stays current,
  // even if the page can't scroll it to the top. Any scrolling by the reader, wherever the pointer
  // is, hands it back to the scroll position.
  var pinned = null;
  toc.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    var p = pairs.find(function (p) { return p.link === a; });
    if (!p) return;
    pinned = p;
    queue();
    // Scroll there ourselves and replace the URL's #section rather than adding a history entry,
    // so Back leaves the page instead of stepping back through sections. Modified clicks (new tab
    // and so on) are left to the browser.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    p.section.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(history.state, '', a.hash);
  });
  // Pressing a link unpins too, but its click pins that link straight after.
  ['wheel', 'touchmove', 'keydown', 'mousedown'].forEach(function (type) {
    window.addEventListener(type, function () {
      if (pinned) { pinned = null; queue(); }
    }, { passive: true });
  });

  // The marker is as tall as the current link's line, centred on its capital letters (the line box
  // has extra room below for descenders, so centring on the box would sit low). The baseline comes
  // from a zero-size marker placed on it, and the capital height from the link's font. Measured from
  // the top of the list, unrounded.
  var canvas = document.createElement('canvas').getContext('2d');
  function capCentre(p) {
    var probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    p.link.insertBefore(probe, p.link.firstChild);
    var baseline = probe.getBoundingClientRect().top - toc.getBoundingClientRect().top;
    probe.remove();
    var cs = getComputedStyle(p.link);
    canvas.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    return baseline - canvas.measureText('H').actualBoundingBoxAscent / 2;
  }

  // The marker slides when the section changes (see .toc::after).
  var current = null, force = false;
  function update() {
    var active = pinned;
    if (!active) {
      var y = window.scrollY;
      active = null;
      sectionStarts().forEach(function (s, k) { if (s <= y + 1) active = pairs[k]; });
    }
    if (active === current && !force) return;
    force = false;
    if (current) { current.link.classList.remove('active'); current.link.removeAttribute('aria-current'); }
    if (active) {
      active.link.classList.add('active');
      active.link.setAttribute('aria-current', 'true');
      var top = capCentre(active) - active.item.offsetHeight / 2;
      toc.style.setProperty('--marker-top', top + 'px');
      toc.style.setProperty('--marker-height', active.item.offsetHeight + 'px');
    }
    toc.classList.toggle('has-active', !!active);
    current = active;
  }
  // Fonts loading or the window resizing can move the links, so the marker is re-placed then
  function replace() { force = true; queue(); }

  var queued = false;
  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; update(); });
  }
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', replace);
  window.addEventListener('load', replace); // images change section positions as they load
  if (document.fonts) document.fonts.ready.then(replace);
  // Place the first marker without sliding in from the top
  toc.classList.add('no-slide');
  update();
  requestAnimationFrame(function () { requestAnimationFrame(function () { toc.classList.remove('no-slide'); }); });
})();
