// design-first page. Three jobs, none of them load-bearing (WEB-07): the content is in the HTML
// in document order and reads the same with this file missing.
//  1. the flow: on wide screens, move each step's scene into the pinned stage and show the one
//     whose step is nearest the middle of the viewport (orient, causality)
//  2. typing: reveal a terminal's lines one by one, once, only in the active scene, never under
//     prefers-reduced-motion
//  3. the rail: mark the current chapter; the grade dial: show one rule's grade and mechanism
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var wide = window.matchMedia('(min-width: 960px)');

  // ---- 1. the flow
  var scrolly = document.querySelector('.scrolly');
  var stage = scrolly && scrolly.querySelector('.stage');
  var steps = scrolly ? Array.prototype.slice.call(scrolly.querySelectorAll('.step')) : [];
  var scenes = {};
  var active = null;

  function mount() {
    if (!scrolly || scrolly.hasAttribute('data-js')) return;
    steps.forEach(function (step) {
      var scene = step.querySelector('.scene');
      if (!scene) return;
      scenes[step.getAttribute('data-scene')] = scene;
      stage.appendChild(scene);
    });
    scrolly.setAttribute('data-js', '');
    show(steps[0]);
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) show(e.target); });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    steps.forEach(function (s) { io.observe(s); });
  }

  function show(step) {
    var id = step.getAttribute('data-scene');
    if (active === id) return;
    active = id;
    Object.keys(scenes).forEach(function (k) {
      if (k === id) { scenes[k].setAttribute('data-active', ''); type(scenes[k]); }
      else scenes[k].removeAttribute('data-active');
    });
  }

  // ---- 2. typing
  function type(scene) {
    var term = scene.querySelector('.term[data-type]');
    if (!term || term.hasAttribute('data-done') || term.hasAttribute('data-typing')) return;
    if (reduce) { term.setAttribute('data-done', ''); return; }
    term.setAttribute('data-typing', '');
    var lines = Array.prototype.slice.call(term.querySelectorAll('.ln'));
    var i = 0;
    var tick = function () {
      if (i >= lines.length) { term.setAttribute('data-done', ''); term.removeAttribute('data-typing'); return; }
      lines[i].setAttribute('data-shown', '');
      if (term.scrollHeight > term.clientHeight) term.scrollTop = term.scrollHeight;
      i += 1;
      window.setTimeout(tick, i < 4 ? 140 : 28);
    };
    tick();
  }

  if (scrolly && stage && 'IntersectionObserver' in window) {
    if (wide.matches) mount();
    var onWide = function (e) { if (e.matches) mount(); };
    if (wide.addEventListener) wide.addEventListener('change', onWide); else wide.addListener(onWide);
  }

  // ---- 3a. the rail
  var rail = document.querySelector('.rail');
  var chapters = Array.prototype.slice.call(document.querySelectorAll('.chapter'));
  if (rail && chapters.length && 'IntersectionObserver' in window) {
    var items = {};
    Array.prototype.forEach.call(rail.querySelectorAll('li'), function (li) {
      var a = li.querySelector('a'); if (a) items[a.getAttribute('href').slice(1)] = li;
    });
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        Object.keys(items).forEach(function (k) { items[k].removeAttribute('aria-current'); });
        var li = items[e.target.id]; if (li) li.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-30% 0px -60% 0px', threshold: 0 });
    chapters.forEach(function (c) { cio.observe(c); });
  }

  // ---- 3b. the grade dial
  var pick = document.getElementById('dial-pick');
  var out = document.getElementById('dial-out');
  var dataEl = document.getElementById('clause-data');
  if (pick && out && dataEl) {
    var clauses = {};
    try { JSON.parse(dataEl.textContent).forEach(function (c) { clauses[c.id] = c; }); } catch (e) { clauses = null; }
    var render = function (id, fromUser) {
      var c = clauses && clauses[id];
      if (!c) { out.textContent = ''; return; }
      var what = c.mech ? 'Enforced by ' + c.mech : 'Nothing on the disk enforces this. The reader does, or nobody.';
      out.innerHTML = '';
      var g = document.createElement('span'); g.className = 'g g-' + c.grade.toLowerCase(); g.textContent = c.grade;
      var b = document.createElement('b'); b.textContent = c.id + ' ';
      var r = document.createElement('span'); r.textContent = c.rule;
      var m = document.createElement('span'); m.className = 'mech'; m.textContent = what;
      out.appendChild(g); out.appendChild(b); out.appendChild(r); out.appendChild(m);
      if (fromUser && history.replaceState) history.replaceState(null, '', '#rule=' + encodeURIComponent(id));
    };
    if (clauses) {
      var h = /^#rule=([A-Z]+-\d+)$/.exec(location.hash);
      if (h && clauses[h[1]]) pick.value = h[1];
      render(pick.value, false);
      pick.addEventListener('change', function () { render(pick.value, true); });
    }
  }
})();
