// Small enhancements; every page reads fine without them.
(function () {
  var page = document.querySelector('.page');
  if (!page) return;

  // Tables: mark the "At a glance" one, give the rest a scrolling wrapper.
  page.querySelectorAll('table').forEach(function (t) {
    var first = t.querySelector('th');
    if (first && first.textContent.trim() === 'At a glance') {
      t.classList.add('infobox');
      return;
    }
    var wrap = document.createElement('div');
    wrap.className = 'scroll';
    wrap.tabIndex = 0;
    t.parentNode.insertBefore(wrap, t);
    wrap.appendChild(t);
  });

  // Diagrams: tap to open the SVG full size; style the caption under it.
  page.querySelectorAll('p > img:only-child').forEach(function (img) {
    var p = img.parentNode;
    if (p.textContent.trim() !== '') return;
    p.classList.add('figure');
    var a = document.createElement('a');
    a.href = img.src;
    p.insertBefore(a, img);
    a.appendChild(img);
    var cap = p.nextElementSibling;
    if (cap && cap.tagName === 'P' && cap.children.length === 1 &&
        cap.firstElementChild.tagName === 'EM' &&
        cap.textContent === cap.firstElementChild.textContent) {
      cap.classList.add('caption');
    }
  });

  // Previous and next: the breadcrumb line carries them as "← a" and "b →".
  var crumb = page.querySelector(':scope > blockquote:first-of-type + p');
  if (crumb) {
    var prev = null, next = null;
    crumb.querySelectorAll('a').forEach(function (a) {
      var before = a.previousSibling, after = a.nextSibling;
      if (before && before.nodeType === 3 && /←\s*$/.test(before.textContent)) prev = a;
      if (after && after.nodeType === 3 && /^\s*→/.test(after.textContent)) next = a;
    });
    if (prev || next) {
      var nav = document.createElement('nav');
      nav.className = 'pager';
      nav.setAttribute('aria-label', 'Previous and next page');
      [[prev, 'prev', 'Previous'], [next, 'next', 'Next']].forEach(function (x) {
        if (!x[0]) return;
        var a = document.createElement('a');
        a.href = x[0].href;
        a.className = x[1];
        var s = document.createElement('small');
        s.textContent = x[2];
        a.appendChild(s);
        a.appendChild(document.createTextNode(x[0].textContent));
        nav.appendChild(a);
      });
      page.appendChild(nav);
    }
  }

  // Search: filter the list items of the index or the glossary.
  var box = document.getElementById('search');
  if (box) {
    var items = Array.prototype.slice.call(page.querySelectorAll(':scope > ul > li'));
    var text = items.map(function (li) { return li.textContent.toLowerCase(); });
    var count = document.querySelector('.filter-count');
    var run = function () {
      var words = box.value.toLowerCase().split(/\s+/).filter(Boolean);
      var on = words.length > 0, shown = 0;
      page.classList.toggle('filtering', on);
      items.forEach(function (li, i) {
        var hit = words.every(function (w) { return text[i].indexOf(w) !== -1; });
        li.classList.toggle('miss', on && !hit);
        if (hit) shown++;
      });
      count.hidden = !on;
      count.textContent = shown === 1 ? '1 match' : shown + ' matches';
    };
    box.addEventListener('input', run);
    if (location.hash === '#search') box.focus();
    window.addEventListener('hashchange', function () {
      if (location.hash === '#search') box.focus();
    });
    run();
  }
})();
