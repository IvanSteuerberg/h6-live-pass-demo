/* H6 Live Pass – vista de presentación: controla el móvil incrustado y genera el QR sincronizado. */
(function () {
  'use strict';
  const H = window.H6;
  const SCEN = window.H6_SCENARIOS;
  const $ = (s) => document.querySelector(s);
  const RETO = [
    'Comprender el formato',
    'Comprender las tandas',
    'Localizar al deportista',
    'Seguir su progreso',
    'Estimado vs confirmado',
    'Interpretar el resultado',
    'Provisional vs definitivo',
    'Mantener el interés',
  ];

  const clock = { base: SCEN[0].time(), anchor: Date.now(), speed: 1, paused: false };
  const now = () => (clock.paused ? clock.base : clock.base + ((Date.now() - clock.anchor) / 1000) * clock.speed);
  function setClock(o) {
    const n = now();
    Object.assign(clock, { base: n, anchor: Date.now() }, o);
    if (o.base != null) clock.anchor = Date.now();
    sync();
  }

  let current = SCEN[0];
  const frame = $('#phone');

  function send(extra) {
    frame.contentWindow && frame.contentWindow.postMessage(Object.assign({ h6: true, clock: Object.assign({}, clock) }, extra || {}), '*');
  }
  function sync() { send(); renderControls(); renderQr(); }

  function applyScenario(s, extra) {
    current = s;
    Object.assign(clock, { base: s.time(), anchor: Date.now(), speed: 1, paused: false });
    send(Object.assign({ scenario: s.id }, extra || {}));
    renderControls(); renderScen(); renderQr();
  }

  // ---------- UI ----------
  function renderScen() {
    $('#p-scen').innerHTML = SCEN.map((s, i) =>
      `<button class="${s === current ? 'on' : ''}" data-i="${i}"><span class="n">${i + 1}</span><span><div class="tt">${s.title}</div><div class="ss">${s.sub}</div></span></button>`).join('');
    $('#p-reto').innerHTML = RETO.map((r) => `<li class="${current.reto.includes(r) ? 'on' : ''}"><span class="c">${current.reto.includes(r) ? '✓' : ''}</span>${r}</li>`).join('');
  }
  function renderControls() {
    document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', !clock.paused && clock.speed === +b.dataset.speed));
    $('#p-pause').textContent = clock.paused ? '▶' : '❚❚';
    $('#p-pause').classList.toggle('on', clock.paused);
  }

  function baseUrl() {
    let host = '';
    try { host = localStorage.getItem('h6.host') || ''; } catch (e) { /* sin almacenamiento */ }
    if (host) return host.replace(/\/?$/, '/');
    return location.origin + location.pathname.replace(/[^/]*$/, '');
  }
  function renderQr() {
    const p = new URLSearchParams({ s: Math.round(clock.base), r: clock.anchor, x: clock.speed, p: clock.paused ? 1 : 0, o: 1 });
    const url = baseUrl() + 'm.html?' + p.toString();
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    $('#p-qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    $('#p-qr2').innerHTML = $('#p-qr').innerHTML;
    $('#p-url2').href = url;
    $('#p-url2').textContent = url.replace(/^https?:\/\//, '').replace(/\?.*$/, '');
    const a = $('#p-url');
    a.href = url;
    a.textContent = url.length > 70 ? url.slice(0, 70) + '…' : url;
    $('.host').open = /localhost|127\.0\.0\.1/.test(url) && !$('#p-host').value;
  }

  function fitPhone() {
    const wrap = $('#phone-wrap');
    const avail = window.innerHeight - 48;
    const sc = Math.min(1, avail / 864);
    wrap.style.transform = `scale(${sc})`;
    wrap.style.height = 864 * sc + 'px';
    wrap.style.width = 410 * sc + 'px';
  }

  // ---------- eventos ----------
  $('#p-scen').addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) applyScenario(SCEN[+b.dataset.i]);
  });
  document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => setClock({ speed: +b.dataset.speed, paused: false })));
  $('#p-pause').addEventListener('click', () => setClock({ paused: !clock.paused }));
  const range = $('#p-range');
  range.min = H.EVENT.start - 15 * 60;
  range.max = H.EVENT.end;
  range.addEventListener('input', () => setClock({ base: +range.value }));
  $('#p-host').addEventListener('change', (e) => {
    try { localStorage.setItem('h6.host', e.target.value.trim()); } catch (err) { /* sin almacenamiento */ }
    renderQr();
  });
  try { $('#p-host').value = localStorage.getItem('h6.host') || ''; } catch (e) { /* sin almacenamiento */ }

  function toggleSummary(open) { $('#p-summary').hidden = !open; }
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }
  $('#p-sum-open').addEventListener('click', () => toggleSummary(true));
  $('#p-sum-close').addEventListener('click', () => toggleSummary(false));
  $('#p-full').addEventListener('click', toggleFull);

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || document.body.classList.contains('talk')) return;
    if (e.key === 'Escape') { toggleSummary(false); return; }
    if (e.key === 'r' || e.key === 'R') { toggleSummary($('#p-summary').hidden); return; }
    if (e.key === 'f' || e.key === 'F') { toggleFull(); return; }
    const i = SCEN.indexOf(current);
    if (e.key === 'ArrowRight' && i < SCEN.length - 1) applyScenario(SCEN[i + 1]);
    else if (e.key === 'ArrowLeft' && i > 0) applyScenario(SCEN[i - 1]);
    else if (e.key === ' ') { e.preventDefault(); setClock({ paused: !clock.paused }); }
  });
  window.addEventListener('resize', fitPhone);

  setInterval(() => {
    const n = now();
    $('#p-clock').textContent = H.fmtClock(n, true);
    if (document.activeElement !== range) range.value = Math.round(n);
  }, 250);

  // El móvil incrustado arranca ya en el primer escenario.
  const s0 = SCEN[0];
  const q = new URLSearchParams({ embed: 1, s: Math.round(clock.base), r: clock.anchor, x: 1, o: s0.onboarding ? 1 : 0, g: s0.route, f: s0.follow.join(',') });
  frame.src = 'm.html?' + q.toString();
  frame.addEventListener('load', () => send({ scenario: current.id }));
  window.H6P = { applyScenario, send, setClock, toggleSummary, toggleFull, fitPhone };
  fitPhone();
  renderScen();
  renderControls();
  renderQr();
})();
