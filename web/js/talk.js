/*
 * Modo «Presentar»: la demo guiada de 3 minutos.
 * Problema (pantalla fija) → 7 pasos automáticos con subtítulos y resaltado en el móvil → viabilidad → resumen con QR.
 * Teclas: → siguiente · ← anterior · espacio pausa · Esc salir.
 */
(function () {
  'use strict';
  const P = window.H6P;
  const H = window.H6;
  const L = H.LUCIA;
  const $ = (s) => document.querySelector(s);

  // `at`: [segundo del paso, mensaje para el móvil]
  const STEPS = [
    { slide: '#t-problem', title: 'El problema' },
    {
      scen: 'llegada', dur: 13,
      title: 'El Hyatlón, explicado en un minuto',
      cap: 'Lo primero que ve Ana: qué es un H6, por qué salen por tandas, que gana el menor tiempo y cómo distinguir lo confirmado de lo provisional.',
      at: [[3.2, { onbStep: 1 }], [6.4, { onbStep: 2 }], [9.6, { onbStep: 3 }]],
    },
    {
      scen: 'buscar', dur: 13,
      title: 'Ana escribe «Lucía» y ya la sigue',
      cap: 'Sin descargas ni registros. Escribe su nombre, un toque, y la app ya la sigue.',
      at: [[0, { highlight: '.search-field' }], [3.2, { highlight: '.li.res' }], [5.8, { pick: L.dorsal, highlight: null }], [6.8, { highlight: '[data-hl=hero]' }]],
    },
    {
      scen: 'carrera', dur: 13,
      title: 'Corre el km 4: dónde está y cuánto le queda',
      cap: 'Entre dos alfombras de chip, su posición es una estimación y se marca con «~». Le quedan unos 28 minutos.',
      at: [[0, { highlight: '[data-hl=hero]' }], [6.5, { highlight: '[data-hl=next]' }]],
    },
    {
      scen: 'estacion', dur: 15,
      title: 'Pisa la alfombra del RowErg y llega el aviso',
      cap: 'El chip lo confirma (✓) y Ana recibe un aviso: es el momento de ir a verla a la estación 4.',
      at: [[0, { highlight: '[data-hl=map]' }], [8.6, { highlight: '.toast' }], [12, { highlight: '[data-hl=hero]' }]],
    },
    {
      scen: 'meta', dur: 14,
      title: 'Cruza la meta la 1ª… pero es provisional',
      cap: 'Aún quedan tandas por correr, y la app lo dice claro: su puesto todavía puede cambiar.',
      at: [[0, { highlight: '[data-hl=hero]' }], [6.6, { highlight: '.toast' }], [9.5, { highlight: '[data-hl=pos]' }]],
    },
    {
      scen: 'superada', dur: 14,
      title: 'Marta, de una tanda posterior, la supera',
      cap: 'Marta llega a meta media hora después, pero tarda casi un minuto menos. Ana entiende por qué Lucía baja a la 2ª plaza.',
      at: [[0, { highlight: '.li.me' }], [6.6, { highlight: '.toast' }], [10.5, { highlight: '.list .li:first-child' }]],
    },
    {
      scen: 'oficial', dur: 10,
      title: 'Resultado oficial: 2ª',
      cap: 'Cuando termina la última tanda y los jueces lo validan, el resultado pasa a oficial. Ya no cambia.',
      at: [[0, { highlight: '[data-hl=hero]' }], [5.6, { highlight: '.toast' }], [8.5, { highlight: '[data-hl=pos]' }]],
    },
    {
      scen: 'oficial', dur: 13, offset: 30, // ya con el resultado oficial, aunque se llegue saltando pasos
      title: 'Y lo comparte, como en Strava',
      cap: 'Ana hace una foto y la app le pone encima el tiempo y el puesto de Lucía, indicando si es oficial. También como sticker sin fondo para las historias de Instagram.',
      at: [[0.4, () => ({ photo: L.dorsal, photoData: P.demoPhoto() })], [1.4, { highlight: '.photo-prev' }], [7, { photoFmt: 'sticker' }], [7.6, { highlight: '.photo-prev' }]],
    },
    { slide: '#t-viab', title: '¿Es viable?' },
    { summary: true, title: 'Probadlo ahora' },
  ];
  const DEMO = STEPS.filter((s) => s.scen);

  const st = { on: false, i: 0, el: 0, paused: false, fired: 0, last: 0 };

  function hideOverlays() {
    document.querySelectorAll('.t-slide').forEach((el) => { el.hidden = true; });
    P.toggleSummary(false);
  }

  function go(i) {
    st.i = Math.max(0, Math.min(STEPS.length - 1, i));
    st.el = 0; st.fired = 0; st.paused = false; st.last = performance.now();
    const s = STEPS[st.i];
    hideOverlays();
    if (s.slide) { $(s.slide).hidden = false; P.send({ highlight: null, closeSheet: true }); }
    else if (s.summary) { P.toggleSummary(true); P.send({ highlight: null, closeSheet: true }); }
    else {
      const sc = window.H6_SCENARIOS.find((x) => x.id === s.scen);
      P.applyScenario(sc, Object.assign({ highlight: null }, s.extra || {}));
      if (s.offset) P.setClock({ base: sc.time() + s.offset });
    }
    renderCap();
  }

  function renderCap() {
    const s = STEPS[st.i];
    const n = DEMO.indexOf(s);
    $('#t-dots').innerHTML = STEPS.map((x, j) => `<i class="${j === st.i ? 'on' : j < st.i ? 'done' : ''} ${x.scen ? '' : 'sl'}"></i>`).join('');
    $('#t-step').textContent = n >= 0 ? `Demo · paso ${n + 1} de ${DEMO.length}` : s.title;
    $('#t-title').textContent = s.scen ? s.title : '';
    $('#t-cap').textContent = s.scen ? s.cap : '';
    $('#t-cap-box').classList.toggle('slide-mode', !s.scen);
    $('#t-pause').textContent = st.paused ? '▶ Seguir' : '❚❚ Pausa';
  }

  function loop() {
    if (!st.on) return;
    const t = performance.now();
    const s = STEPS[st.i];
    if (s.scen && !st.paused) {
      st.el += (t - st.last) / 1000;
      const at = s.at || [];
      while (st.fired < at.length && at[st.fired][0] <= st.el) {
        const msg = at[st.fired][1];
        P.send(typeof msg === 'function' ? msg() : msg);
        st.fired++;
      }
      $('#t-bar').style.width = Math.min(100, (st.el / s.dur) * 100) + '%';
      if (st.el >= s.dur) { go(st.i + 1); }
    } else if (!s.scen) {
      $('#t-bar').style.width = '0%';
    }
    st.last = t;
  }

  function pause(v) {
    st.paused = v;
    P.setClock({ paused: v });
    renderCap();
  }

  function start() {
    st.on = true;
    document.body.classList.add('talk');
    P.fitPhone();
    go(0);
    // temporizador normal (no requestAnimationFrame): sigue a tiempo aunque el navegador pierda el foco
    clearInterval(st.timer);
    st.timer = setInterval(loop, 100);
  }
  function stop() {
    st.on = false;
    clearInterval(st.timer);
    document.body.classList.remove('talk');
    hideOverlays();
    P.send({ highlight: null });
    P.fitPhone();
  }

  $('#t-start').addEventListener('click', start);
  $('#t-exit').addEventListener('click', stop);
  $('#t-pause').addEventListener('click', () => pause(!st.paused));
  $('#t-next').addEventListener('click', () => go(st.i + 1));
  $('#t-prev').addEventListener('click', () => go(st.i - 1));
  document.querySelectorAll('.t-slide').forEach((el) => el.addEventListener('click', () => go(st.i + 1)));

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (!st.on) {
      if (e.key === 'p' || e.key === 'P') start();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'PageDown') go(st.i + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(st.i - 1);
    else if (e.key === ' ') { e.preventDefault(); if (STEPS[st.i].scen) pause(!st.paused); else go(st.i + 1); }
    else if (e.key === 'Escape') stop();
    else if (e.key === 'f' || e.key === 'F') P.toggleFull();
  });
})();
