/* H6 Live Pass – app del espectador. Todo es simulado en el navegador (ver data.js). */
(function () {
  'use strict';
  const H = window.H6;
  const SCEN = window.H6_SCENARIOS || [];
  const $ = (s, el = document) => el.querySelector(s);
  const params = new URLSearchParams(location.search);
  const EMBED = params.get('embed') === '1';
  if (EMBED) document.body.classList.add('embed');
  if (params.has('r')) document.body.classList.add('synced');

  const BASE_CUM = [0];
  H.BASE.forEach((s, i) => BASE_CUM.push(BASE_CUM[i] + s));

  // ---------------------------------------------------------------- reloj simulado
  const Clock = {
    base: H.LUCIA.mats[0] + 26 * 60, anchor: Date.now(), speed: 1, paused: false,
    now() { return this.paused ? this.base : this.base + ((Date.now() - this.anchor) / 1000) * this.speed; },
    set(o) {
      const now = this.now();
      if (o.base == null) { this.base = now; this.anchor = Date.now(); }
      Object.assign(this, o);
      if (o.base != null && o.anchor == null) this.anchor = Date.now();
    },
  };
  if (params.has('s')) {
    Clock.base = +params.get('s');
    Clock.anchor = params.has('r') ? +params.get('r') : Date.now();
    Clock.speed = params.has('x') ? +params.get('x') : 1;
    Clock.paused = params.get('p') === '1';
  }

  // ---------------------------------------------------------------- estado
  const store = {
    get(k, d) { try { const v = localStorage.getItem('h6.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('h6.' + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
  };
  let follows = store.get('follows', []).filter((d) => H.BY_DORSAL[d]);
  if (params.has('f')) follows = params.get('f').split(',').filter((d) => H.BY_DORSAL[d]);
  const ui = { cat: null, ggee: '', query: '', searchOpen: false, showAll: false, typed: false, typing: false };

  function setFollows(list) { follows = list; store.set('follows', follows); resetWatch(); }
  function toggleFollow(d) {
    setFollows(follows.includes(d) ? follows.filter((x) => x !== d) : [...follows, d]);
    render();
  }

  // ---------------------------------------------------------------- helpers de presentación
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const C = (cat) => H.CATEGORIES[cat];
  const clk = (s, sec) => H.fmtClock(s, sec);
  const initials = (a) => (a.first[0] + a.last[0]).toUpperCase();
  const avatar = (a, sm) => `<div class="avatar${sm ? ' sm' : ''}" style="background:${C(a.cat).color}">${initials(a)}</div>`;
  const catChip = (cat) => `<span class="chip"><span class="sw" style="background:${C(cat).color}"></span>${C(cat).name}</span>`;
  // Animación del ejercicio. `data-keep` hace que no se reinicie con el repintado de cada segundo.
  // Las animaciones van como SVG dentro de la página, no como <img>: dentro de un <img> el navegador
  // puede congelarlas o mostrar una versión antigua de la caché.
  const ANIM_V = 3; // subir al cambiar un SVG
  const animSvg = {};
  H.STATIONS.forEach((s) => {
    fetch(`anim/${s.anim}.svg?v=${ANIM_V}`).then((r) => r.text()).then((t) => { animSvg[s.anim] = t; }).catch(() => {});
  });
  const anim = (s, where) => (animSvg[s.anim]
    ? `<div class="anim anim-${where}" role="img" aria-label="Animación de ${s.name}" data-keep="anim-${s.anim}-${where}-svg">${animSvg[s.anim]}</div>`
    : `<img class="anim anim-${where}" src="anim/${s.anim}.svg?v=${ANIM_V}" alt="Animación de ${s.name}" data-keep="anim-${s.anim}-${where}">`);
  const conf = (t) => `<span class="badge b-ok">✓ ${t}</span>`;
  const est = (t) => `<span class="badge b-est">~ ${t}</span>`;
  const badge = (cls, t) => `<span class="badge ${cls}">${t}</span>`;
  const ord = (n, a) => H.ord(n, a.g);
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const tandaLabel = (t) => `Tanda ${clk(t.start)}`;
  const leftText = (sec) => (sec < 60 ? '¡Ya llega!' : '~' + H.fmtMin(sec));
  const etaText = (sec) => (sec <= 20 ? 'en cualquier momento' : 'en ~' + H.fmtMin(sec));

  function paceFactor(a, k) {
    if (k <= 0) return C(a.cat).factor;
    return (a.mats[k] - a.mats[0]) / BASE_CUM[k];
  }
  function matEstimate(a, k, i) {
    const p = paceFactor(a, Math.max(k, 0));
    const from = k >= 0 ? a.mats[k] : a.mats[0];
    const fromCum = k >= 0 ? BASE_CUM[k] : 0;
    return from + (BASE_CUM[i] - fromCum) * p;
  }

  function resultState(a, now) {
    const cs = H.categoryStatus(a.cat, now);
    if (cs.state === 'official') return { cls: 'b-off', label: 'Oficial', cs };
    if (cs.state === 'review') return { cls: 'b-mute', label: 'En revisión', cs };
    return { cls: 'b-prov', label: 'Provisional', cs };
  }
  function finishedRank(a, now, ggee) {
    const r = H.ranking(a.cat, now, ggee);
    return { pos: r.finished.findIndex((s) => s.a === a) + 1, of: r.finished.length };
  }

  /** Frase principal de estado + badge confirmado/estimado. */
  function describe(st) {
    const a = st.a, now = st.now;
    switch (st.phase) {
      case 'scheduled':
        return { cls: '', title: `Sale a las ${clk(a.mats[0])}`, sub: `Tanda ${a.tanda.idx} de ${a.tanda.of} de ${C(a.cat).name}`, badge: badge('b-mute', 'Programado') };
      case 'call':
        return { cls: '', title: 'En cámara de llamadas', sub: `Sale en ${H.fmtMin(st.startsIn)} (${clk(a.mats[0])}) con su tanda`, badge: badge('b-mute', 'Previo a la salida') };
      case 'missing':
        return { cls: '', title: `Sin lectura de chip desde hace ${H.fmtMin(now - st.lastTime)}`, sub: `Debía pasar por «${H.MATS[st.k + 1]}» hacia las ${clk(st.nextEta)}. Puede haberse detenido: pendiente de confirmar por la organización.`, badge: badge('b-bad', '? Sin confirmar') };
      case 'dnf':
        return { cls: '', title: 'Retirada de la prueba', sub: `Último control: ${H.MATS[st.k]} a las ${clk(st.lastTime)}.`, badge: badge('b-bad', '✓ Confirmado por la organización') };
      case 'finished': {
        const rs = resultState(a, now);
        return { cls: rs.cs.state === 'official' ? 'official' : 'finished', title: `En meta · ${H.fmtDur(st.net)}`, sub: `Cruzó la meta a las ${clk(a.mats[H.FINISH], true)}`, badge: badge(rs.cls, rs.label) };
      }
      default: {
        const info = st.info;
        if (info.kind === 'station') {
          return { cls: 'station', title: `En ${info.station.name}`, sub: `Estación ${info.station.n} de 6 · entró a las ${clk(st.lastTime, true)}`, badge: conf('Confirmado por chip') };
        }
        if (info.kind === 'sprint') {
          return { cls: 'racing', title: 'Sprint final hacia meta', sub: `Salió de Wall Balls a las ${clk(st.lastTime, true)} · llegará ${etaText(st.nextEta - now)}`, badge: est('Posición estimada') };
        }
        return { cls: 'racing', title: `Corriendo el km ${info.km} de 6`, sub: `Hacia ${info.next.name} · llegará ${etaText(st.nextEta - now)}`, badge: est('Posición estimada') };
      }
    }
  }

  function segbar(st) {
    let html = '<div class="segbar">';
    for (let i = 0; i < 13; i++) {
      const isSt = i % 2 === 1;
      let cls = isSt ? 'st' : '';
      let style = '';
      if (st.phase === 'finished' || (st.k != null && i < st.k)) cls += ' done';
      else if ((st.phase === 'racing' || st.phase === 'missing' || st.phase === 'dnf') && i === st.k) {
        cls += ' cur' + (isSt ? ' conf' : '');
        style = ` style="--p:${Math.round((st.progress || 0) * 100)}%"`;
      }
      html += `<i class="${cls}"${style} title="${i === 12 ? 'Sprint' : isSt ? H.STATIONS[(i - 1) / 2].name : 'km ' + (i / 2 + 1)}"></i>`;
    }
    return html + '</div>';
  }

  // ---------------------------------------------------------------- esquema del recinto
  const ST_BOX = H.STATIONS.map((s, i) => ({ x: 87 + (i % 3) * 60, y: 60 + Math.floor(i / 3) * 42, w: 54, h: 32, label: ['SkiErg', 'Sled Push', 'Burpee', 'RowErg', 'Lunges', 'Wall Balls'][i] }));
  function mapSvg(st) {
    const k = st.k == null ? -1 : st.k;
    const curStation = st.phase !== 'finished' && st.info && st.info.kind === 'station' ? st.info.station.n : null;
    const nextStation = st.info && st.info.kind === 'run' ? st.info.next.n : null;
    let boxes = '';
    ST_BOX.forEach((b, i) => {
      const n = i + 1;
      const done = st.phase === 'finished' || k >= 2 * n;
      const cls = n === curStation ? 'cur' : done ? 'done' : n === nextStation ? 'next' : '';
      boxes += `<rect class="st ${cls}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="7"/>` +
        `<text x="${b.x + b.w / 2}" y="${b.y + 13}" text-anchor="middle">${n}</text>` +
        `<text x="${b.x + b.w / 2}" y="${b.y + 25}" text-anchor="middle" style="font-size:7.5px;fill:#9aa3b5">${b.label}</text>`;
    });
    return `<svg class="map" viewBox="0 0 340 196" role="img" aria-label="Esquema del recinto con la posición del atleta">
      <path id="trk" class="track" d="M170,172 H95 A76,76 0 0 1 95,20 H245 A76,76 0 0 1 245,172 Z"/>
      <path class="track-line" d="M170,172 H95 A76,76 0 0 1 95,20 H245 A76,76 0 0 1 245,172 Z"/>
      <rect class="zone" x="76" y="48" width="188" height="100" rx="14"/>
      <text class="lbl" x="170" y="44" text-anchor="middle" style="display:none">ZONA DE ESTACIONES</text>
      ${boxes}
      <rect x="164" y="162" width="12" height="20" fill="#f3f4f6" rx="2"/>
      <text class="lbl" x="170" y="194" text-anchor="middle">SALIDA · META</text>
      <g id="dot" data-keep="dot"></g>
    </svg>`;
  }
  function placeDot(st) {
    const svg = $('#view .map');
    if (!svg) return;
    const path = svg.querySelector('#trk');
    const g = svg.querySelector('#dot');
    let x, y, confirmed = false;
    const len = path.getTotalLength();
    if (st.phase === 'scheduled' || st.phase === 'call' || st.phase === 'finished') {
      x = 170; y = 172; confirmed = true;
    } else if (st.info && st.info.kind === 'station') {
      const b = ST_BOX[st.info.station.n - 1];
      x = b.x + b.w / 2; y = b.y + b.h - 4; confirmed = true;
    } else {
      const p = st.info && st.info.kind === 'sprint' ? 0.88 + 0.12 * st.progress : st.progress;
      const pt = path.getPointAtLength(((p % 1) * len));
      x = pt.x; y = pt.y;
    }
    const kind = confirmed ? 'conf' : 'est';
    if (g.dataset.kind !== kind) {
      g.dataset.kind = kind;
      g.innerHTML = confirmed
        ? `<circle class="halo conf" r="11"/><circle class="dot-conf" r="6" stroke="#0b0d12" stroke-width="2"/>`
        : `<circle class="halo" r="13"/><circle class="dot-est" r="6" stroke="#0b0d12" stroke-width="2"/>`;
    }
    g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
  }

  // ---------------------------------------------------------------- vistas
  const views = {};

  // Inicio: la búsqueda está aquí mismo (nada de pantallas intermedias).
  // El esqueleto (con el campo de texto) se pinta una vez; las zonas en vivo se refrescan cada segundo.
  views.seguir = function () {
    const has = follows.length > 0;
    const open = !has || ui.searchOpen;
    let html = '';
    if (has) {
      html += `<h1>Tus deportistas</h1><p class="small muted">Se actualiza solo. Te avisamos cuando pasen por cada alfombra de chip.</p><div id="live"></div>`;
    } else {
      html += `<div class="search-hero"><h1>¿A quién vienes a ver?</h1><p class="muted">Escribe su nombre y te contamos dónde está, qué le queda y cómo va.</p></div>`;
    }
    if (open) {
      html += `<div class="search-box">
        ${has ? '<h2 style="margin-top:18px">Seguir a otra persona</h2>' : ''}
        <div class="search-field"><span class="ic">🔎</span><input type="search" id="q" placeholder="Nombre o apellido" value="${esc(ui.query)}" autocomplete="off" autocapitalize="words" enterkeyhint="search" /></div>
        <div id="results"></div></div>`;
    } else {
      html += `<button class="btn block" style="margin-top:12px" data-search-open>＋ Seguir a otra persona</button>`;
    }
    if (!has) {
      html += `<div class="card tap" style="margin-top:14px" data-onb="1"><div class="row"><div style="font-size:26px">📖</div><div class="grow"><b>¿Primera vez en un Hyatlón?</b><div class="small muted">Te lo explicamos en 1 minuto.</div></div><span class="dim">›</span></div></div>`;
    }
    html += `<div id="venue"></div>`;
    return html;
  };

  views.buscar = views.seguir; // #/buscar/<texto> abre el inicio con la búsqueda escrita

  function liveCards(now) {
    return follows.map((d) => {
      const a = H.BY_DORSAL[d];
      const st = H.status(a, now);
      const ds = describe(st);
      let pos = '';
      if (st.phase === 'finished') {
        const r = finishedRank(a, now);
        pos = `<b>${ord(r.pos, a)}</b> de ${r.of} en meta`;
      } else if (st.phase === 'racing') {
        const vp = H.virtualPosition(a, now);
        if (vp) pos = `<b>${ord(vp.pos, a)}</b> en el último control`;
      }
      return `<div class="card tap" data-go="#/atleta/${a.dorsal}">
        <div class="row">${avatar(a)}<div class="grow"><b class="ellipsis" style="display:block">${esc(a.name)}</b>
        <div class="row wrap" style="gap:6px;margin-top:4px">${catChip(a.cat)}<span class="chip">Sale ${clk(a.tanda.start)}</span></div></div></div>
        <div style="margin-top:12px"><div style="font-weight:800">${ds.title}</div><div class="xs muted">${ds.sub}</div></div>
        <div class="row between" style="margin-top:8px">${ds.badge}<span class="small muted">${pos}</span></div>
        ${segbar(st)}
      </div>`;
    }).join('');
  }

  function venueNow(now) {
    const ts = H.TANDAS.map((t) => H.tandaStatus(t, now));
    const racing = ts.filter((x) => x.state === 'racing');
    const onCourse = racing.reduce((n, x) => n + x.onCourse, 0);
    const next = ts.find((x) => x.state === 'scheduled' || x.state === 'call');
    return `<h2>Ahora en el recinto</h2>
      <div class="card tap" data-go="#/tandas">
        <div class="kv" style="margin:0">
          <div><div class="k">En pista</div><div class="v">${onCourse}</div></div>
          <div><div class="k">Tandas corriendo</div><div class="v">${racing.length}</div></div></div>
        <div class="small muted" style="margin-top:10px">${next ? `Próxima salida: <b style="color:var(--text)">${clk(next.t.start)}</b> · ${C(next.t.cat).name}, tanda ${next.t.idx} de ${next.t.of}` : 'No quedan salidas hoy.'} <span class="dim">›</span></div>
      </div>`;
  }

  views.atleta = function (dorsal) {
    const a = H.BY_DORSAL[dorsal];
    if (!a) return `<p>No encontramos ese dorsal.</p>`;
    const now = Clock.now();
    const st = H.status(a, now);
    const ds = describe(st);
    const followed = follows.includes(a.dorsal);
    let html = `<div class="row between" style="margin-bottom:10px"><a href="#/seguir" class="small muted" style="text-decoration:none">‹ Volver</a>
      <div class="row" style="gap:6px"><button class="btn sm" data-share="${a.dorsal}" title="Compartir su seguimiento">📤 Compartir</button>
      <button class="btn sm ${followed ? 'on' : ''}" data-follow="${a.dorsal}">${followed ? '★ Siguiendo' : '☆ Seguir'}</button></div></div>
      <div class="row">${avatar(a)}<div class="grow"><h1 style="margin:0;font-size:21px">${esc(a.name)}</h1>
      <div class="row wrap" style="gap:6px;margin-top:5px"><span class="dorsal">${a.dorsal}</span>${catChip(a.cat)}${a.ggee ? `<span class="chip">GGEE ${a.ggee}</span>` : ''}</div></div></div>
      <p class="xs dim" style="margin:8px 0 12px">Dorsal en la pegatina del brazo · ${tandaLabel(a.tanda)} (${a.tanda.idx} de ${a.tanda.of}) · ${esc(a.club)}</p>`;

    // héroe
    const inStation = st.phase === 'racing' && st.info.kind === 'station' ? st.info.station : null;
    html += `<div class="hero ${ds.cls}${inStation ? ' has-anim' : ''}" data-hl="hero">${inStation ? `<div class="hero-anim" data-station="${inStation.n}" data-cat="${a.cat}">${anim(inStation, 'hero')}</div>` : ''}${ds.badge}<div class="big">${ds.title}</div><div class="small muted">${ds.sub}</div>`;
    if (st.phase === 'racing' || st.phase === 'missing') {
      html += segbar(st) + `<div class="seglabels"><span>Salida ${clk(a.mats[0])}</span><span>Meta</span></div>`;
      html += `<div class="kv"><div><div class="k">Tiempo en carrera</div><div class="v">${H.fmtDur(st.elapsed)}</div><div class="xs dim">desde su salida</div></div>
        <div><div class="k">Le queda</div><div class="v est-text">${leftText(st.projectedNet - st.elapsed)}</div><div class="xs dim">meta hacia las ${clk(st.projectedFinish)}</div></div></div>`;
    } else if (st.phase === 'finished') {
      html += `<div class="kv"><div><div class="k">Tiempo neto</div><div class="v">${H.fmtDur(st.net)}</div><div class="xs dim">el que cuenta</div></div>
        <div><div class="k">Hora de llegada</div><div class="v">${clk(a.mats[H.FINISH])}</div><div class="xs dim">salió a las ${clk(a.mats[0])}</div></div></div>`;
    } else if (st.phase === 'scheduled' || st.phase === 'call') {
      html += `<div class="kv"><div><div class="k">Sale a las</div><div class="v">${clk(a.mats[0])}</div></div>
        <div><div class="k">Tiempo previsto</div><div class="v est-text">~${H.fmtMin(st.projectedNet)}</div><div class="xs dim">media de su categoría</div></div></div>`;
    }
    html += `</div>`;
    if (st.phase === 'racing' || st.phase === 'finished') {
      html += `<button class="btn block photo-btn" style="margin-top:10px" data-photo="${a.dorsal}">📸 ${st.phase === 'finished' ? 'Comparte su resultado en redes' : (a.g === 'M' ? 'Comparte una foto animándole' : 'Comparte una foto animándola')}</button>`;
    }

    // próximo momento
    if (st.phase === 'racing') {
      let nm = '';
      if (st.info.kind === 'run') nm = `Entrará en <b>${st.info.next.name}</b> ${etaText(st.nextEta - now)} (hacia las ${clk(st.nextEta)}).`;
      else if (st.info.kind === 'station') nm = st.info.station.n < 6
        ? `Saldrá de ${st.info.station.name} ${etaText(st.nextEta - now)} y empezará el km ${st.info.station.n + 1}.`
        : `Tras Wall Balls le queda el sprint final: llegará a meta hacia las ${clk(st.projectedFinish)}.`;
      else nm = `Llegará a meta ${etaText(st.nextEta - now)}. ¡Ve hacia la zona de meta!`;
      const upcoming = st.info.kind === 'run' ? st.info.next : null;
      html += `<div class="card" style="margin-top:12px" data-hl="next"><div class="card-title">Próximo momento para verla${a.g === 'M' ? '/o' : ''}</div>
        <div class="row" style="align-items:center">${upcoming ? `<div class="next-anim" data-station="${upcoming.n}" data-cat="${a.cat}">${anim(upcoming, 'mini')}</div>` : ''}<div class="grow">${nm}</div></div>
        <div class="xs dim" style="margin-top:6px">~ Calculado con su ritmo de hoy. Se confirma al pisar la siguiente alfombra.</div></div>`;
    }

    // mapa
    if (st.phase !== 'dnf') {
      html += `<div class="card" style="margin-top:12px" data-hl="map"><div class="row between"><div class="card-title" style="margin:0">Dónde está ahora</div>
        <div class="legend"><span class="badge b-ok">● Confirmado</span><span class="badge b-est">● Estimado</span></div></div>
        ${mapSvg(st)}<div class="xs dim">Óvalo: circuito de carrera (1 km). Centro: zona de estaciones. Esquema genérico, no a escala: cada sede publica su plano en la Guía del Atleta.</div></div>`;
    }

    // posición
    html += positionCard(a, st, now);

    // estación actual
    if (st.phase === 'racing' && st.info.kind === 'station') {
      html += `<button class="btn block" style="margin-top:12px" data-station="${st.info.station.n}" data-cat="${a.cat}">${st.info.station.icon} ¿Qué es ${st.info.station.name}?</button>`;
    }

    // recorrido
    html += `<h2>Recorrido</h2><div class="card"><ul class="tl">${timeline(a, st)}</ul></div>`;
    return html;
  };

  function positionCard(a, st, now) {
    const cat = C(a.cat);
    if (st.phase === 'racing' || st.phase === 'missing') {
      const vp = H.virtualPosition(a, now);
      const pr = H.projectedRank(a, now);
      if (!vp) return '';
      return `<div class="card" style="margin-top:12px" data-hl="pos"><div class="row between"><div class="card-title" style="margin:0">Cómo va en ${cat.name}</div>${badge('b-prov', 'Provisional')}</div>
        <div class="row" style="margin-top:10px;align-items:flex-end"><div class="bigtime" style="font-size:38px;font-weight:900">${ord(vp.pos, a)}</div><div class="small muted" style="padding-bottom:5px">de ${vp.of} que ya han pasado por «${vp.matName}»</div></div>
        <p class="small muted" style="margin-top:8px">Comparamos el <b style="color:var(--text)">tiempo neto</b> (desde que salió su tanda) en ese mismo control ✓, porque cada tanda salió a una hora distinta.</p>
        ${st.phase === 'racing' ? `<div class="row between" style="margin-top:6px"><span class="small">Si mantiene el ritmo, terminaría</span>${est(ord(pr.pos, a) + ' de ' + pr.of)}</div>` : ''}
        <button class="btn sm ghost" style="margin-top:10px;padding-left:0" data-go="#/clasificacion/${a.cat}">Ver clasificación completa ›</button></div>`;
    }
    if (st.phase === 'finished') {
      const r = finishedRank(a, now);
      const rs = resultState(a, now);
      const cs = rs.cs;
      let msg = '';
      if (cs.state === 'live') {
        msg = `<div class="banner prov"><div class="bi">⏳</div><div><b>Puede cambiar</b>Aún ${cs.racing + cs.notStarted === 1 ? 'compite o no ha salido 1 atleta' : `compiten o no han salido ${cs.racing + cs.notStarted} atletas`} de ${plural(cs.tandasLeft, 'tanda', 'tandas')}. Si hacen menos tiempo neto, la superarán aunque lleguen después.</div></div>`;
      } else if (cs.state === 'review') {
        msg = `<div class="banner rev"><div class="bi">🧑‍⚖️</div><div><b>En revisión por los jueces</b>Ya han terminado todas. La clasificación será oficial hacia las ${clk(cs.officialAt)}.</div></div>`;
      } else {
        msg = `<div class="banner off"><div class="bi">🏆</div><div><b>Resultado oficial</b>Validado por la organización a las ${clk(cs.officialAt)}. Ya no cambia.</div></div>`;
      }
      const over = H.overtakers(a, now);
      let overHtml = '';
      if (over.length) {
        overHtml = `<hr class="sep"><div class="card-title">Quién la${a.g === 'M' ? '/o' : ''} ha superado después</div>` + over.map((b) =>
          `<div class="row" style="margin-top:8px" data-go="#/atleta/${b.dorsal}">${avatar(b, true)}<div class="grow small"><b>${esc(b.name)}</b> · ${tandaLabel(b.tanda)}<div class="xs muted">Llegó a meta ${H.fmtMin(b.mats[H.FINISH] - a.mats[H.FINISH])} más tarde, pero con ${H.fmtDur((a.mats[H.FINISH] - a.mats[0]) - (b.mats[H.FINISH] - b.mats[0]))} menos de tiempo neto.</div></div></div>`).join('');
      }
      let gg = '';
      if (a.ggee) {
        const rg = finishedRank(a, now, a.ggee);
        gg = `<div class="row between small" style="margin-top:6px"><span class="muted">En su grupo de edad (${a.ggee})</span><b>${ord(rg.pos, a)} de ${rg.of}</b></div>`;
      }
      return `<div class="card" style="margin-top:12px" data-hl="pos"><div class="row between"><div class="card-title" style="margin:0">Puesto en ${cat.name}</div>${badge(rs.cls, rs.label)}</div>
        <div class="row" style="margin-top:10px;align-items:flex-end"><div style="font-size:42px;font-weight:900;line-height:1">${ord(r.pos, a)}</div><div class="small muted" style="padding-bottom:5px">de ${r.of} que han terminado</div></div>
        ${gg}${msg}${overHtml}
        <button class="btn sm ghost" style="margin-top:6px;padding-left:0" data-go="#/clasificacion/${a.cat}">Ver clasificación completa ›</button></div>`;
    }
    if (st.phase === 'scheduled' || st.phase === 'call') {
      return `<div class="card tap" style="margin-top:12px" data-go="#/clasificacion/${a.cat}"><div class="card-title">Mientras tanto</div>Mira cómo va su categoría: los tiempos que tendrá que batir. <span class="dim">›</span></div>`;
    }
    return '';
  }

  function timeline(a, st) {
    const k = st.k == null ? -1 : st.k;
    let html = '';
    for (let i = 0; i <= H.FINISH; i++) {
      const name = H.MATS[i];
      const isStationIn = i % 2 === 1 && i < 13;
      const station = i > 0 && i < 13 ? H.STATIONS[Math.floor((i - 1) / 2)] : null;
      const sub = i === 0 ? tandaLabel(a.tanda) : isStationIn ? `Tras el km ${(i + 1) / 2}` : i === 13 ? 'Tras el sprint final' : `${station.name} hecho`;
      if (a.mats[i] != null && i <= k) {
        const net = a.mats[i] - a.mats[0];
        const split = i > 0 ? a.mats[i] - a.mats[i - 1] : null;
        html += `<li><span class="ic ok">✓</span><div><b>${name}</b><div class="sub">${sub}${split != null ? ` · tramo ${H.fmtDur(split)}` : ''}</div></div>
          <div class="t">${clk(a.mats[i], true)}<div class="sub">${i ? 'neto ' + H.fmtDur(net) : ''}</div></div></li>`;
      } else if (st.phase === 'dnf' || (st.phase === 'missing' && i > k)) {
        html += `<li class="future"><span class="ic no"></span><div><b>${name}</b><div class="sub">Sin lectura</div></div><div class="t">—</div></li>`;
      } else {
        const t = matEstimate(a, k, i);
        const next = i === k + 1 && st.phase === 'racing';
        html += `<li class="${next ? '' : 'future'}"><span class="ic est">~</span><div><b>${name}</b><div class="sub">${next ? 'Siguiente control' : sub}</div></div>
          <div class="t est-text">~${clk(t)}</div></li>`;
      }
    }
    return html;
  }

  const norm = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const PHASE_RANK = { call: 0, racing: 1, missing: 1, scheduled: 2, finished: 3, dnf: 4 };

  /** Búsqueda tolerante: cada palabra escrita debe ser el inicio de alguna palabra del nombre o del club. */
  function search(query, now) {
    const q = norm(query.trim());
    if (q.length < 2) return [];
    const toks = q.split(/\s+/).filter(Boolean);
    const digits = q.replace(/[^0-9]/g, '');
    const out = [];
    H.ATHLETES.forEach((a) => {
      const nameWords = norm(a.name).split(/\s+/);
      const words = nameWords.concat(norm(a.club).split(/\s+/));
      let score = -1;
      if (toks.every((t) => words.some((w) => w.startsWith(t)))) {
        score = 1;
        if (nameWords[0].startsWith(toks[0])) score += 3;
        if (toks.every((t) => nameWords.some((w) => w.startsWith(t)))) score += 2;
      } else if (digits.length >= 3 && a.dorsal.replace(/[^0-9]/g, '').startsWith(digits)) {
        score = 2;
      }
      if (score < 0) return;
      out.push({ a, st: H.status(a, now), score });
    });
    out.sort((x, y) => y.score - x.score || PHASE_RANK[x.st.phase] - PHASE_RANK[y.st.phase] || x.a.name.localeCompare(y.a.name));
    return out;
  }

  function highlight(name, query) {
    const toks = norm(query.trim()).split(/\s+/).filter(Boolean);
    return name.split(' ').map((w) => {
      const t = toks.find((x) => norm(w).startsWith(x));
      return t ? `<mark>${esc(w.slice(0, t.length))}</mark>${esc(w.slice(t.length))}` : esc(w);
    }).join(' ');
  }

  function searchResults() {
    const box = $('#results');
    if (!box) return;
    const now = Clock.now();
    const q = ui.query.trim();
    if (q.length < 2) {
      box.innerHTML = `<div class="tips">
        <div class="tip"><span>💡</span><div>Con el nombre o un apellido basta: <b>«lucia»</b>, <b>«martin vega»</b>… No hace falta poner tildes.</div></div>
        <div class="tip"><span>🔗</span><div>¿Te ha enviado su enlace de seguimiento? Ábrelo y le seguirás directamente.</div></div>
        <div class="tip tap" data-go="#/tandas"><span>⏱️</span><div>¿Sabes a qué hora sale? Busca su nombre en la lista de su <b>tanda</b> ›</div></div>
      </div>`;
      return;
    }
    const res = search(q, now);
    if (!res.length) {
      box.innerHTML = `<div class="card" style="margin-top:12px"><b>No encontramos «${esc(q)}»</b><p class="small muted" style="margin:6px 0 0">Prueba solo con el apellido o con el nombre de su club. También puedes buscarle en la lista de su <a href="#/tandas">tanda</a>.</p></div>`;
      return;
    }
    const shown = ui.showAll ? res : res.slice(0, 6);
    box.innerHTML = `<div class="list" style="margin-top:12px">` + shown.map(({ a, st }) => {
      const f = follows.includes(a.dorsal);
      const ds = describe(st);
      const live = st.phase === 'racing' && st.info.kind === 'station' ? 'ok-text' : st.phase === 'racing' ? 'est-text' : '';
      return `<div class="li res" data-pick="${a.dorsal}">${avatar(a, true)}<div class="grow">
          <div class="name">${highlight(a.name, q)}</div>
          <div class="meta"><span class="sw-dot" style="background:${C(a.cat).color}"></span>${C(a.cat).name} · sale a las ${clk(a.tanda.start)}</div>
          <div class="meta ${live}">${esc(ds.title)}</div></div>
        ${f ? '<span class="badge b-ok">★ Siguiendo</span>' : '<span class="btn sm primary">Seguir</span>'}</div>`;
    }).join('') + `</div>` +
      (res.length > shown.length ? `<button class="btn block ghost small" style="margin-top:8px" data-show-all>Ver ${res.length - shown.length} más</button>` : '') +
      `<p class="xs dim" style="margin-top:10px">¿Varias personas con el mismo nombre? Fíjate en la categoría y la hora de salida, o en el dorsal de la pegatina de su brazo.</p>`;
  }

  /** Elegir un resultado = seguirle y abrir su ficha, en un solo toque. */
  function pick(dorsal) {
    const a = H.BY_DORSAL[dorsal];
    if (!follows.includes(dorsal)) {
      setFollows([...follows, dorsal]);
      toast(`<b>★ Ahora sigues a ${esc(a.first)}</b>Te avisaremos cuando pase por cada estación y cuando cambie su puesto.`);
    }
    ui.query = ''; ui.searchOpen = false; ui.showAll = false;
    location.hash = '#/atleta/' + dorsal;
  }

  function shareLink(dorsal) {
    const p = new URLSearchParams({ f: dorsal, s: Math.round(Clock.base), r: Clock.anchor, x: Clock.speed, p: Clock.paused ? 1 : 0 });
    return location.origin + location.pathname.replace(/[^/]*$/, '') + 'm.html?' + p.toString() + '&g=' + encodeURIComponent('#/atleta/' + dorsal);
  }
  async function share(dorsal) {
    const a = H.BY_DORSAL[dorsal];
    const url = shareLink(dorsal);
    const text = `Sigue a ${a.first} en directo en el Hyatlón (sale a las ${clk(a.tanda.start)})`;
    try {
      if (navigator.share) { await navigator.share({ title: 'H6 Live Pass', text, url }); return; }
      await navigator.clipboard.writeText(url);
      toast('<b>🔗 Enlace copiado</b>Pégalo en WhatsApp o donde quieras.');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      window.prompt('Copia este enlace:', url);
    }
  }

  views.clasificacion = function (cat) {
    const now = Clock.now();
    if (cat && H.CATEGORIES[cat]) { if (ui.cat !== cat) ui.ggee = ''; ui.cat = cat; }
    if (!ui.cat) ui.cat = follows.length ? H.BY_DORSAL[follows[0]].cat : 'OF';
    const c = C(ui.cat);
    const cs = H.categoryStatus(ui.cat, now);
    const r = H.ranking(ui.cat, now, ui.ggee || null);
    let html = `<h1>Clasificación</h1><div class="seg-ctl">` + H.CAT_ORDER.map((id) =>
      `<button class="${id === ui.cat ? 'on' : ''}" data-cat-tab="${id}"><span class="sw" style="width:8px;height:8px;border-radius:50%;background:${C(id).color};display:inline-block"></span>${C(id).name}</button>`).join('') + `</div>`;
    if (c.level === 'Open') {
      html += `<select id="ggee" style="margin-top:8px"><option value="">Todos los grupos de edad</option>${H.GGEE.map((g) => `<option ${g === ui.ggee ? 'selected' : ''}>${g}</option>`).join('')}</select>`;
    }
    // estado de la categoría
    if (cs.state === 'scheduled') {
      html += `<div class="banner info"><div class="bi">🕘</div><div><b>Aún no ha empezado</b>La primera tanda de ${c.name} sale a las ${clk(H.TANDAS.find((t) => t.cat === ui.cat).start)}.</div></div>`;
    } else if (cs.state === 'live') {
      html += `<div class="banner prov"><div class="bi">⏳</div><div><b>Clasificación provisional</b>${cs.finished} en meta · ${cs.racing} en carrera · ${cs.notStarted} sin salir (${plural(cs.tandasNotStarted, 'tanda', 'tandas')}). Puede cambiar hasta que terminen todas.</div></div>`;
    } else if (cs.state === 'review') {
      html += `<div class="banner rev"><div class="bi">🧑‍⚖️</div><div><b>En revisión por los jueces</b>Han terminado todas. Será oficial hacia las ${clk(cs.officialAt)}.</div></div>`;
    } else {
      html += `<div class="banner off"><div class="bi">🏆</div><div><b>Clasificación oficial</b>Validada a las ${clk(cs.officialAt)}.</div></div>`;
    }
    html += `<p class="xs muted" style="margin:0 0 10px">Orden por <b style="color:var(--text)">tiempo neto</b>: desde la salida de su tanda hasta meta. Llegar antes a meta no significa ir primero.</p>`;

    if (r.finished.length) {
      html += `<div class="list">` + r.finished.map((s, i) => {
        const a = s.a;
        const me = follows.includes(a.dorsal);
        const p = i + 1;
        return `<div class="li ${me ? 'me' : ''}" data-go="#/atleta/${a.dorsal}"><div class="pos ${p <= 3 ? 'p' + p : ''}">${p}</div>
          <div class="grow"><div class="name ellipsis">${me ? '<span class="star">★</span> ' : ''}${esc(a.name)}</div>
          <div class="meta">${tandaLabel(a.tanda)}${a.ggee ? ' · ' + a.ggee : ''}</div></div>
          <div class="time">${H.fmtDur(s.net)}<small>meta ${clk(a.mats[H.FINISH])}</small></div></div>`;
      }).join('') + `</div>`;
    } else if (cs.state !== 'scheduled') {
      html += `<div class="card small muted">Aún no ha llegado nadie a meta.</div>`;
    }

    if (r.racing.length) {
      html += `<h2>En carrera ahora <span class="dim small">(${r.racing.length})</span></h2><p class="xs muted" style="margin-top:-4px">Ordenadas por su tiempo final previsto ~</p><div class="list">` + r.racing.map((s) => {
        const a = s.a;
        const me = follows.includes(a.dorsal);
        const where = s.phase === 'missing' ? '? Sin lectura de chip' : s.info.kind === 'station' ? '✓ En ' + s.info.station.name : s.info.kind === 'sprint' ? '~ Sprint final' : `~ km ${s.info.km}`;
        return `<div class="li ${me ? 'me' : ''}" data-go="#/atleta/${a.dorsal}"><div class="pos dim" style="font-size:12px">${s.phase === 'missing' ? '?' : '›'}</div>
          <div class="grow"><div class="name ellipsis">${me ? '<span class="star">★</span> ' : ''}${esc(a.name)}</div>
          <div class="meta">${tandaLabel(a.tanda)} · <span class="${s.info && s.info.kind === 'station' ? 'ok-text' : 'est-text'}">${where}</span></div></div>
          <div class="time est-text">~${H.fmtDur(s.projectedNet)}<small>previsto</small></div></div>`;
      }).join('') + `</div>`;
    }
    if (r.waiting.length) {
      const byT = {};
      r.waiting.forEach((s) => { (byT[s.a.tanda.id] = byT[s.a.tanda.id] || { t: s.a.tanda, n: 0 }).n++; });
      html += `<h2>Por salir</h2><div class="list">` + Object.values(byT).map((x) =>
        `<div class="li" data-go="#/tandas"><div class="pos dim" style="font-size:12px">⏱</div><div class="grow"><div class="name">${tandaLabel(x.t)}</div><div class="meta">${plural(x.n, 'atleta', 'atletas')} · sale ${now >= x.t.start - H.CALL_ROOM ? 'en ' + H.fmtMin(x.t.start - now) : 'a las ' + clk(x.t.start)}</div></div></div>`).join('') + `</div>`;
    }
    if (r.dnf.length) {
      html += `<h2>Retiradas</h2><div class="list">` + r.dnf.map((s) => `<div class="li" data-go="#/atleta/${s.a.dorsal}"><div class="pos dim">–</div><div class="grow"><div class="name">${esc(s.a.name)}</div><div class="meta">Último control: ${H.MATS[s.k]}</div></div>${badge('b-bad', 'Retirada')}</div>`).join('') + `</div>`;
    }
    return html;
  };

  views.tandas = function () {
    const now = Clock.now();
    const ts = H.TANDAS.map((t) => H.tandaStatus(t, now));
    const racing = ts.filter((x) => x.state === 'racing');
    const onCourse = racing.reduce((n, x) => n + x.onCourse, 0);
    const d0 = H.EVENT.start - 15 * 60, d1 = H.EVENT.end;
    const pct = (s) => ((s - d0) / (d1 - d0)) * 100;

    let html = `<h1>Tandas de hoy</h1>
      <p class="small muted">Cada 15 minutos sale un grupo de ~12 personas. Por eso en pista coinciden atletas que van por el km 1 con otros que ya están en Wall Balls.</p>
      <div class="kv" style="margin:12px 0"><div><div class="k">En pista ahora</div><div class="v">${onCourse}</div><div class="xs dim">de ${plural(racing.length, 'tanda', 'tandas')}</div></div>
      <div><div class="k">En meta</div><div class="v">${ts.reduce((n, x) => n + x.finished, 0)}</div><div class="xs dim">de ${H.ATHLETES.length} inscritas/os</div></div></div>`;

    // cronograma visual
    html += `<div class="card"><div class="card-title">La jornada de un vistazo</div><div style="position:relative;padding-top:16px">`;
    for (let h = 9; h <= 14; h++) {
      const x = pct(h * 3600);
      if (x >= 0 && x <= 100) html += `<div style="position:absolute;top:0;left:${x}%;font-size:10px;color:var(--dim);transform:translateX(-50%)">${h}h</div><div style="position:absolute;top:14px;bottom:0;left:${x}%;border-left:1px dashed #2a3040"></div>`;
    }
    ts.forEach((x) => {
      const t = x.t;
      const end = Math.max(...t.athletes.map((a) => (a.mats[H.FINISH] != null ? a.mats[H.FINISH] : a.dnfConfirm)));
      const fill = clampPct((now - t.start) / (end - t.start));
      html += `<div style="position:relative;height:11px;margin:3px 0" title="${C(t.cat).name} · ${tandaLabel(t)}">
        <div style="position:absolute;left:${pct(t.start)}%;width:${pct(end) - pct(t.start)}%;top:0;bottom:0;border-radius:4px;background:${C(t.cat).color}33;border:1px solid ${C(t.cat).color}66;overflow:hidden">
        <div style="height:100%;width:${fill}%;background:${C(t.cat).color}"></div></div></div>`;
    });
    html += `<div style="position:absolute;top:12px;bottom:0;left:${pct(now)}%;border-left:2px solid #ef4444"><div style="position:absolute;bottom:-14px;left:-14px;font-size:9px;font-weight:800;color:#ef4444">AHORA</div></div>`;
    html += `</div><div class="legend" style="margin-top:18px">${H.CAT_ORDER.map((c) => `<span class="chip"><span class="sw" style="background:${C(c).color}"></span>${C(c).short}</span>`).join('')}</div></div>`;

    H.CAT_ORDER.forEach((cat) => {
      const list = ts.filter((x) => x.t.cat === cat);
      const cs = H.categoryStatus(cat, now);
      const lbl = { scheduled: badge('b-mute', 'Por empezar'), live: badge('b-prov', 'Provisional'), review: badge('b-mute', 'En revisión'), official: badge('b-off', 'Oficial') }[cs.state];
      html += `<h2 class="row between"><span class="row" style="gap:8px"><span style="width:10px;height:10px;border-radius:50%;background:${C(cat).color}"></span>${C(cat).name}</span>${lbl}</h2><div class="list">`;
      list.forEach((x) => {
        const t = x.t;
        const st = { scheduled: badge('b-mute', 'Programada'), call: badge('b-est', 'Cámara de llamadas'), racing: badge('b-prov', 'En carrera'), done: badge('b-ok', 'Terminada') }[x.state];
        const hasMe = t.athletes.some((a) => follows.includes(a.dorsal));
        html += `<div class="li ${hasMe ? 'me' : ''}" data-tanda="${t.id}"><div class="pos num" style="width:48px;font-size:15px">${clk(t.start)}</div>
          <div class="grow"><div class="row between"><span class="name">Tanda ${t.idx} de ${t.of}${hasMe ? ' <span class="star">★</span>' : ''}</span>${st}</div>
          <div class="progress" style="margin-top:7px"><div class="f" style="width:${(x.finished / x.size) * 100}%"></div><div class="r" style="width:${(x.onCourse / x.size) * 100}%"></div></div>
          <div class="meta" style="margin-top:4px">${x.state === 'scheduled' || x.state === 'call' ? `${x.size} atletas · sale ${x.state === 'call' ? 'en ' + H.fmtMin(t.start - now) : 'a las ' + clk(t.start)}` : `${x.finished} en meta · ${x.onCourse} en pista${x.dnf ? ' · ' + x.dnf + ' retirada' : ''}`}</div></div></div>`;
      });
      html += `</div>`;
    });
    return html;
  };
  const clampPct = (v) => Math.max(0, Math.min(100, v * 100));

  views.guia = function () {
    const strip = () => {
      let s = '<div class="format-strip">';
      H.STATIONS.forEach((st) => { s += `<div class="r">1 km</div><div class="s" title="${st.name}">${st.icon}</div>`; });
      return s + '<div class="m">🏁</div></div>';
    };
    const lw = (key) => H.CAT_ORDER.map((c) => `<td>${C(c).weights[key]}</td>`).join('');
    return `<h1>Guía para el espectador</h1><p class="small muted">Todo lo que necesitas para entender un Hyatlón, en 1 minuto.</p>
    <details class="acc" open><summary>🏃 ¿Qué es un H6?</summary><div class="body">
      <p>Seis veces seguidas: <b>1 km de carrera</b> + <b>una estación de ejercicio funcional</b>. Al final, un sprint corto hasta meta.</p>${strip()}
      <p>Una persona Open suele tardar entre 55 y 90 minutos; la Élite, entre 45 y 75.</p></div></details>

    <details class="acc"><summary>🏋️ Las 6 estaciones</summary><div class="body">
      ${H.STATIONS.map((s) => `<div class="row" style="align-items:flex-start;margin-bottom:10px" data-station="${s.n}"><div class="guide-anim">${anim(s, 'guide')}</div><div class="grow"><b>${s.n}. ${s.name}</b> <span class="dim small">${s.dist}</span><div class="small muted">${s.desc}</div></div></div>`).join('')}
      <table class="w"><tr><th>Peso</th>${H.CAT_ORDER.map((c) => `<th>${C(c).short}</th>`).join('')}</tr>
        <tr><td>Sled Push</td>${lw('sled')}</tr><tr><td>Sandbag</td>${lw('sandbag')}</tr><tr><td>Wall Ball</td>${lw('wallball')}</tr></table>
      <p class="xs dim" style="margin-top:6px">Fuente: tabla de pesos oficial de hyatlon.org.</p></div></details>

    <details class="acc"><summary>🏷️ Categorías</summary><div class="body">
      <p><b>Élite</b>: nivel competitivo alto y más peso. <b>Open</b>: categoría general; además del puesto general hay premios por <b>grupo de edad (GGEE)</b>.</p>
      <p>Modalidades: <b>Individual</b>, <b>Dobles</b> (en pareja), <b>Relevos</b> (equipos de 3) y <b>Paralímpico</b>.</p>
      <p>Cada categoría tiene <b>su propia clasificación</b>: solo se compara con quien hace la misma prueba con el mismo peso.</p></div></details>

    <details class="acc"><summary>⏱️ Tandas: por qué llegar primero no es ganar</summary><div class="body">
      <p>Cada categoría sale en varias <b>tandas</b> separadas 15 min. Cuenta el <b>tiempo neto</b>: desde que sale su tanda hasta que cruza la meta.</p>
      <div class="vs"><div>Lucía · tanda 10:30<div class="t">57:53</div><div class="xs dim">llega a meta 11:27</div></div><div style="border-color:var(--off)">Marta · tanda 11:00<div class="t">56:56</div><div class="xs dim">llega a meta 11:56</div></div></div>
      <p style="margin-top:10px">Marta llega media hora después… <b>y gana</b>, porque tardó menos.</p></div></details>

    <details class="acc"><summary>🟠 Provisional, en revisión y oficial</summary><div class="body">
      <p>${badge('b-prov', 'Provisional')} Aún hay atletas de la categoría en carrera o sin salir: el puesto puede cambiar.</p>
      <p>${badge('b-mute', 'En revisión')} Ya han terminado todas; los jueces revisan penalizaciones y reclamaciones.</p>
      <p>${badge('b-off', 'Oficial')} La organización ha validado la clasificación. Ya no cambia.</p></div></details>

    <details class="acc"><summary>📡 Cómo leer los datos</summary><div class="body">
      <p>${conf('Confirmado')} Lo ha registrado una <b>alfombra de cronometraje</b> al pasar el chip: salida, entrada y salida de cada estación y meta.</p>
      <p>${est('Estimado')} Lo calculamos con su ritmo de hoy entre dos alfombras: dónde va dentro del km, cuándo llegará y tiempo final previsto.</p>
      <p>${badge('b-bad', '? Sin confirmar')} No ha pasado por la siguiente alfombra cuando debía. No damos nada por hecho hasta que la organización lo confirma.</p></div></details>

    <details class="acc"><summary>📋 Normas básicas <span class="sec-tag">secundario</span></summary><div class="body">
      <p>Los jueces de cada estación solo cuentan las <b>repeticiones válidas</b> (por ejemplo, el balón tiene que llegar a la diana).</p>
      <p>Saltarse un estándar puede suponer una <b>penalización de tiempo</b>; por eso un resultado no es definitivo hasta que se revisa.</p>
      <p class="xs dim">Supuesto basado en el Reglamento de Competiciones y el Manual Técnico HYATLON 2026, que no son públicos todavía.</p></div></details>

    <details class="acc"><summary>🎟️ Consejos en el recinto</summary><div class="body">
      <p>La entrada de acompañantes es gratuita. Quédate en las zonas de público: la zona de competición, el calentamiento, la cámara de llamadas y el cronometraje son solo para personas acreditadas.</p>
      <p>Identifica a tu deportista por el <b>dorsal de la pegatina del brazo</b>. El mejor sitio para verle es una estación: allí está unos minutos en un punto fijo.</p></div></details>

    <button class="btn block" style="margin-top:14px" data-onb="1">Ver de nuevo la introducción</button>
    ${EMBED ? '' : '<button class="btn block ghost small dim" style="margin-top:8px" data-demo>⚙︎ Modo demo (mover el reloj de la carrera)</button>'}`;
  };

  // ---------------------------------------------------------------- hoja inferior
  function openSheet(html) {
    $('#sheet').innerHTML = '<div class="grab"></div>' + html;
    $('#sheet').scrollTop = 0;
    $('#sheet').classList.add('open');
    $('#sheet-bg').classList.add('open');
  }
  function closeSheet() { $('#sheet').classList.remove('open'); $('#sheet-bg').classList.remove('open'); }
  $('#sheet-bg').addEventListener('click', closeSheet);

  function stationSheet(n, cat) {
    const s = H.STATIONS[n - 1];
    const w = s.weightKey ? `<div class="banner info"><div class="bi">⚖️</div><div><b>Peso${cat ? ' en ' + C(cat).name : ''}</b>${cat ? C(cat).weights[s.weightKey] : H.CAT_ORDER.map((c) => C(c).short + ': ' + C(c).weights[s.weightKey]).join(' · ')}</div></div>` : '';
    openSheet(`<div class="sheet-anim">${anim(s, 'sheet')}</div><h1>${s.n}. ${s.name}</h1><p class="muted">${s.dist}</p><p>${s.desc}</p>${w}
      <div class="card"><div class="card-title">Qué mirar</div>${s.watch}</div>
      <button class="btn block primary" style="margin-top:14px" data-close>Entendido</button>`);
  }
  function tandaSheet(id) {
    const t = H.TANDAS.find((x) => x.id === id);
    const now = Clock.now();
    openSheet(`<h1>${C(t.cat).name} · ${tandaLabel(t)}</h1><p class="small muted">Tanda ${t.idx} de ${t.of} · ${t.athletes.length} atletas · dorsales ${clk(t.start)}-01 a ${clk(t.start)}-${String(t.athletes.length).padStart(2, '0')}</p>
      <div class="list">${t.athletes.map((a) => { const ds = describe(H.status(a, now)); return `<div class="li" data-go="#/atleta/${a.dorsal}" data-close>${avatar(a, true)}<div class="grow"><div class="name ellipsis">${esc(a.name)}</div><div class="meta">${a.dorsal} · ${esc(ds.title)}</div></div><span class="dim">›</span></div>`; }).join('')}</div>`);
  }

  // ---------------------------------------------------------------- foto para redes (estilo Strava)
  // La imagen se compone en el propio móvil con un canvas: la foto nunca sale del dispositivo.
  const photo = { dorsal: null, fmt: 'story', img: null, blob: null, url: null, gen: 0 };

  function photoSheet(dorsal) {
    photo.dorsal = dorsal;
    photo.blob = null;
    const a = H.BY_DORSAL[dorsal];
    openSheet(`<h1>Foto para redes</h1>
      <p class="small muted">Haz una foto a ${esc(a.first)} (o usa el fondo de H6) y compártela con su resultado encima.</p>
      <div class="seg-ctl" style="margin-bottom:10px">${[['story', 'Historia 9:16'], ['post', 'Post 4:5'], ['sticker', 'Sticker PNG']].map(([k, l]) => `<button data-fmt="${k}" class="${photo.fmt === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="photo-prev ${photo.fmt}"><img id="ph-prev" alt="Vista previa de la imagen para compartir"><div class="ph-wait">Generando…</div></div>
      ${photo.fmt === 'sticker'
        ? `<div class="tip" style="margin-top:12px"><span>✨</span><div><b>PNG transparente.</b> En una historia de Instagram, añádelo como sticker desde la galería y colócalo sobre tu foto o vídeo.</div></div>`
        : `<div class="row" style="gap:8px;margin-top:12px">
        <label class="btn grow" style="cursor:pointer"><input type="file" accept="image/*" id="ph-file" hidden>📷 ${photo.img ? 'Cambiar foto' : 'Elegir foto'}</label>
        ${photo.img ? '<button class="btn" data-ph-clear>Sin foto</button>' : ''}
      </div>`}
      <div class="row" style="gap:8px;margin-top:8px"><button class="btn primary grow" data-ph-share>Compartir</button><button class="btn" data-ph-dl>⬇︎ Guardar</button></div>
      <p class="xs dim" style="margin-top:10px">Instagram, WhatsApp, Strava… La imagen se crea en tu móvil: tu foto no se sube a ningún sitio.</p>`);
    drawPhoto();
  }

  function fitFont(ctx, text, weight, size, maxW) {
    let s = size;
    do { ctx.font = `${weight} ${s}px Inter, system-ui, sans-serif`; s -= 4; } while (ctx.measureText(text).width > maxW && s > 20);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  async function drawPhoto() {
    const gen = ++photo.gen; // si se pide otro dibujo mientras tanto, este se descarta
    const a = H.BY_DORSAL[photo.dorsal];
    const now = Clock.now();
    const st = H.status(a, now);
    const sticker = photo.fmt === 'sticker';
    const contentH = st.phase === 'finished' ? 760 : 670; // altura del bloque de texto, de abajo arriba
    const W = 1080, HH = { story: 1920, post: 1350, sticker: contentH + 220 }[photo.fmt], M = 80;
    try { await Promise.all(['900 100px Inter', '800 60px Inter', '700 30px Inter'].map((f) => document.fonts.load(f))); } catch (e) { /* sin fuentes web */ }
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = HH;
    const ctx = cv.getContext('2d');

    // fondo: transparente (sticker), la foto (recortada para llenar) o el degradado de H6
    if (sticker) {
      // sin fondo
    } else if (photo.img) {
      const iw = photo.img.width, ih = photo.img.height, sc = Math.max(W / iw, HH / ih);
      ctx.drawImage(photo.img, (W - iw * sc) / 2, (HH - ih * sc) / 2, iw * sc, ih * sc);
    } else {
      const g = ctx.createRadialGradient(W * 0.2, HH * 0.1, 50, W * 0.4, HH * 0.4, HH);
      g.addColorStop(0, '#5a2a08'); g.addColorStop(0.45, '#1a1210'); g.addColorStop(1, '#0b0d12');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, HH);
      ctx.save(); ctx.globalAlpha = 0.06; ctx.fillStyle = '#ffb321';
      ctx.font = '900 760px Inter, system-ui, sans-serif'; ctx.fillText('H6', -40, HH * 0.55); ctx.restore();
    }
    if (!sticker) {
      const g0 = Math.max(0, HH - contentH - 240);
      const shade = ctx.createLinearGradient(0, g0, 0, HH);
      shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(0.3, 'rgba(0,0,0,.55)'); shade.addColorStop(1, 'rgba(0,0,0,.9)');
      ctx.fillStyle = shade; ctx.fillRect(0, 0, W, HH);
      const top = ctx.createLinearGradient(0, 0, 0, 260);
      top.addColorStop(0, 'rgba(0,0,0,.55)'); top.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = top; ctx.fillRect(0, 0, W, 260);
    }
    // sombra suave en todo lo que se dibuja encima, para que se lea sobre cualquier foto
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = sticker ? 18 : 14;
    ctx.shadowOffsetY = 2;

    // cabecera: marca y evento
    const lg = ctx.createLinearGradient(M, M, M + 84, M + 84);
    lg.addColorStop(0, '#ffb321'); lg.addColorStop(1, '#ff6a1a');
    ctx.fillStyle = lg; roundRect(ctx, M, M, 84, 84, 22); ctx.fill();
    ctx.fillStyle = '#140a02'; ctx.font = '900 40px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('H6', M + 42, M + 57);
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = '800 36px Inter, system-ui, sans-serif'; ctx.fillText('HYATLÓN H6', M + 108, M + 40);
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '600 28px Inter, system-ui, sans-serif'; ctx.fillText(H.EVENT.venue, M + 108, M + 78);

    // datos según el momento de la carrera
    const cat = C(a.cat);
    let pre, big, stats, status;
    if (st.phase === 'finished') {
      const r = finishedRank(a, now);
      const rs = resultState(a, now);
      pre = '¡HA TERMINADO!';
      big = H.fmtDur(st.net);
      const stTime = a.splits.filter((_, i) => i % 2 === 1).reduce((x, y) => x + y, 0);
      const second = a.ggee ? ['Grupo ' + a.ggee, ord(finishedRank(a, now, a.ggee).pos, a)] : ['Tanda', clk(a.tanda.start)];
      stats = [['Puesto', `${ord(r.pos, a)} ${cat.short}`], second, ['En estaciones', H.fmtDur(stTime)]];
      status = { text: rs.label === 'Oficial' ? '✓ RESULTADO OFICIAL' : rs.label === 'En revisión' ? 'EN REVISIÓN POR LOS JUECES' : 'PROVISIONAL · AÚN QUEDAN TANDAS', color: rs.label === 'Oficial' ? '#38bdf8' : '#fb923c' };
      big = null;
    } else if (st.phase === 'racing' || st.phase === 'missing') {
      const vp = H.virtualPosition(a, now);
      pre = `¡VAMOS, ${a.first.toUpperCase()}!`;
      big = st.info.kind === 'station' ? `${st.info.station.name}` : st.info.kind === 'sprint' ? 'Sprint final' : `Km ${st.info.km} de 6`;
      stats = [['En carrera', H.fmtDur(st.elapsed)], ['Le queda', leftText(st.projectedNet - st.elapsed)], ['Ahora va', vp ? `${ord(vp.pos, a)} ${cat.short}` : '—']];
      status = { text: 'EN DIRECTO · POSICIÓN PROVISIONAL', color: '#fb923c' };
    } else {
      pre = 'HOY COMPITE';
      big = `Sale a las ${clk(a.mats[0])}`;
      stats = [['Categoría', cat.name], ['Tanda', `${a.tanda.idx} de ${a.tanda.of}`], ['Dorsal', a.dorsal]];
      status = { text: '6 KM · 6 ESTACIONES', color: '#ffb321' };
    }

    // de abajo arriba
    let y = HH - M;
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '700 26px Inter, system-ui, sans-serif';
    ctx.fillText('H6 LIVE PASS', M, y);
    ctx.textAlign = 'right'; ctx.fillText(`TANDA ${clk(a.tanda.start)} · ${a.dorsal}`, W - M, y); ctx.textAlign = 'left';

    // barra de 13 tramos
    y -= 64;
    const n = 13, gap = 8, bw = (W - 2 * M - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const done = st.phase === 'finished' || (st.k != null && i < st.k);
      const cur = (st.phase === 'racing' || st.phase === 'missing') && i === st.k;
      ctx.fillStyle = done ? '#22c55e' : cur ? '#ffb321' : sticker ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.22)';
      roundRect(ctx, M + i * (bw + gap), y, bw, 14, 7); ctx.fill();
    }

    // estadísticas
    y -= 56;
    const cw = (W - 2 * M) / 3;
    stats.forEach(([k, v], i) => {
      const x = M + i * cw;
      ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.font = '700 26px Inter, system-ui, sans-serif'; ctx.fillText(k.toUpperCase(), x, y - 62);
      ctx.fillStyle = '#fff'; fitFont(ctx, v, 800, 50, cw - 20); ctx.fillText(v, x, y);
    });

    // estado (provisional / oficial)
    y -= 130;
    ctx.font = '800 28px Inter, system-ui, sans-serif';
    const sw = ctx.measureText(status.text).width + 40;
    ctx.fillStyle = sticker ? 'rgba(0,0,0,.45)' : status.color + '33'; roundRect(ctx, M, y - 38, sw, 54, 27); ctx.fill();
    ctx.strokeStyle = status.color; ctx.lineWidth = 2; roundRect(ctx, M, y - 38, sw, 54, 27); ctx.stroke();
    ctx.fillStyle = status.color; ctx.fillText(status.text, M + 20, y - 1);

    // número grande (o tiempo final)
    y -= 70;
    const hero = st.phase === 'finished' ? H.fmtDur(st.net) : big;
    ctx.fillStyle = '#fff'; fitFont(ctx, hero, 900, st.phase === 'finished' ? 230 : 130, W - 2 * M);
    ctx.fillText(hero, M - 6, y);

    // nombre y antetítulo
    y -= st.phase === 'finished' ? 250 : 160;
    ctx.fillStyle = '#fff'; fitFont(ctx, a.name, 800, 64, W - 2 * M); ctx.fillText(a.name, M, y);
    y -= 80;
    ctx.fillStyle = '#ffb321'; ctx.font = '800 34px Inter, system-ui, sans-serif'; ctx.fillText(pre, M, y);

    const blob = await new Promise((res) => (sticker ? cv.toBlob(res, 'image/png') : cv.toBlob(res, 'image/jpeg', 0.9)));
    if (gen !== photo.gen) return;
    photo.blob = blob;
    if (photo.url) URL.revokeObjectURL(photo.url);
    photo.url = URL.createObjectURL(photo.blob);
    const prev = $('#ph-prev');
    if (prev) { prev.src = photo.url; prev.parentElement.classList.add('ready'); }
  }

  function photoFile() {
    const a = H.BY_DORSAL[photo.dorsal];
    const png = photo.fmt === 'sticker';
    return new File([photo.blob], `hyatlon-${norm(a.first)}-${photo.fmt}.${png ? 'png' : 'jpg'}`, { type: png ? 'image/png' : 'image/jpeg' });
  }
  async function sharePhoto() {
    if (!photo.blob) return;
    const a = H.BY_DORSAL[photo.dorsal];
    const file = photoFile();
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: `${a.first} en el Hyatlón H6 💪` }); } catch (e) { /* cancelado */ }
    } else {
      downloadPhoto();
      toast('<b>⬇︎ Imagen guardada</b>Tu navegador no permite compartir directamente: súbela desde la galería.');
    }
  }
  function downloadPhoto() {
    if (!photo.blob) return;
    const l = document.createElement('a');
    l.href = photo.url; l.download = photoFile().name;
    document.body.appendChild(l); l.click(); l.remove();
  }
  async function loadPhoto(file) {
    if (!file) return;
    try { photo.img = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) {
      photo.img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(file); });
    }
    photoSheet(photo.dorsal);
  }

  // ---------------------------------------------------------------- onboarding
  const ONB = [
    { e: '🏃‍♀️', h: 'Bienvenida/o al Hyatlón', p: 'Un H6 son <b>6 km de carrera</b> y <b>6 estaciones de fuerza</b>, alternados: 1 km, estación, 1 km, estación… y sprint a meta.', x: () => views.guia().match(/<div class="format-strip">[\s\S]*?<\/div><\/div>/)[0] },
    { e: '⏱️', h: 'Salen por tandas', p: 'Cada <b>15 minutos</b> sale un grupo de unas 12 personas. Por eso verás a gente en fases distintas a la vez: unos empiezan y otros casi terminan.' },
    { e: '🏆', h: 'Gana el menor tiempo, no quien llega antes', p: 'Se compara el <b>tiempo neto</b> de cada persona dentro de su categoría. Alguien de una tanda posterior puede ganar llegando más tarde.', x: () => `<div class="vs"><div>Tanda 10:30<div class="t">57:53</div><div class="xs dim">llega 11:27</div></div><div style="border-color:var(--off)">Tanda 11:00<div class="t">56:56</div><div class="xs dim">llega 11:56 · gana</div></div></div>` },
    { e: '📡', h: 'Siempre sabrás qué es seguro', p: 'Lo que registra el chip lo marcamos como confirmado; lo que calculamos, como estimado. Y el puesto es <b>provisional</b> hasta que termina la última tanda y los jueces lo validan.', x: () => `<div class="legend" style="margin-top:12px">${conf('Confirmado')}${est('Estimado')}${badge('b-prov', 'Provisional')}${badge('b-off', 'Oficial')}</div>` },
  ];
  let onbStep = 0;
  function showOnb(open) {
    const el = $('#onb');
    if (!open) { el.classList.remove('open'); store.set('onboarded', true); return; }
    const s = ONB[onbStep];
    el.innerHTML = `<div class="in"><div class="row between"><div class="logo"><div class="logo-mark">H6</div>Live Pass</div><button class="btn sm ghost" data-onb-skip>Saltar</button></div>
      <div class="slide"><div class="emoji">${s.e}</div><h1>${s.h}</h1><p class="muted" style="font-size:16px">${s.p}</p>${s.x ? s.x() : ''}</div>
      <div class="dots">${ONB.map((_, i) => `<i class="${i === onbStep ? 'on' : ''}"></i>`).join('')}</div>
      <button class="btn primary block" data-onb-next>${onbStep < ONB.length - 1 ? 'Siguiente' : '🔎 Buscar a mi deportista'}</button></div>`;
    el.classList.add('open');
  }

  // ---------------------------------------------------------------- demo (solo fuera del modo presentación)
  function demoSheet() {
    const now = Clock.now();
    openSheet(`<h1>Modo demo</h1><p class="small muted">La carrera es simulada. Mueve el reloj o salta a un momento de la historia.</p>
      <div class="card"><div class="row between"><b class="num" id="demo-time">${clk(now, true)}</b>
        <div class="row" style="gap:6px">${[1, 10, 60].map((x) => `<button class="btn sm ${Clock.speed === x && !Clock.paused ? 'on' : ''}" data-speed="${x}">×${x}</button>`).join('')}
        <button class="btn sm ${Clock.paused ? 'on' : ''}" data-pause>${Clock.paused ? '▶' : '❚❚'}</button></div></div>
        <input type="range" id="demo-range" min="${H.EVENT.start - 15 * 60}" max="${H.EVENT.end}" step="30" value="${Math.round(now)}" style="width:100%;margin-top:12px"></div>
      <h2>Escenarios</h2><div class="list">${SCEN.map((s, i) => `<div class="li" data-scen="${s.id}"><div class="pos">${i + 1}</div><div class="grow"><div class="name">${s.title}</div><div class="meta">${s.sub}</div></div></div>`).join('')}</div>`);
  }

  function applyScenario(s) {
    Clock.set({ base: s.time(), anchor: Date.now(), speed: 1, paused: false });
    setFollows(s.follow.slice());
    if (s.route && location.hash !== s.route) location.hash = s.route; else render();
    if (s.onboarding) { onbStep = 0; showOnb(true); } else showOnb(false);
  }

  // ---------------------------------------------------------------- avisos (toasts)
  let watch = {};
  let lastTick = null;
  function resetWatch() { watch = {}; }
  function toast(html, cls) {
    const el = document.createElement('div');
    el.className = 'toast ' + (cls || '');
    el.innerHTML = html;
    $('#toasts').appendChild(el);
    applyHl(false);
    setTimeout(() => el.remove(), 6500);
  }
  function checkEvents(now) {
    const jumped = lastTick != null && (now < lastTick || now - lastTick > 5 * 60);
    lastTick = now;
    follows.forEach((d) => {
      const a = H.BY_DORSAL[d];
      const k = H.lastMat(a, now);
      const st = H.status(a, now);
      const rank = st.phase === 'finished' ? finishedRank(a, now).pos : null;
      const catState = H.categoryStatus(a.cat, now).state;
      const prev = watch[d];
      watch[d] = { k, rank, catState };
      if (!prev || jumped) return;
      if (k > prev.k && k >= 0) {
        const name = a.first;
        if (k === 0) toast(`<b>🟢 ¡${name} ha salido!</b>Tanda ${clk(a.tanda.start)} · confirmado por chip`);
        else if (k === H.FINISH) toast(`<b>🏁 ${name} en meta · ${H.fmtDur(st.net)}</b>${ord(rank, a)} provisional en ${C(a.cat).name}`, 'prov');
        else if (k % 2 === 1) { const s = H.STATIONS[(k - 1) / 2]; toast(`<b>📍 ${name} entra en ${s.name}</b>Estación ${s.n} de 6 · ✓ confirmado por la alfombra de entrada`); }
        else { const s = H.STATIONS[k / 2 - 1]; toast(`<b>✓ ${name} sale de ${s.name}</b>${s.n < 6 ? 'Empieza el km ' + (s.n + 1) : 'Sprint final a meta'}`); }
      }
      if (prev.rank && rank && rank > prev.rank) {
        const by = H.overtakers(a, now).slice(-1)[0];
        toast(`<b>⚠️ ${a.first} pasa a ${ord(rank, a)} provisional</b>${by ? esc(by.name) + ' (tanda ' + clk(by.tanda.start) + ') ha hecho mejor tiempo neto.' : ''}`, 'prov');
      }
      if (prev.catState !== 'official' && catState === 'official' && rank) {
        toast(`<b>🏆 Resultado oficial: ${a.first} ${ord(rank, a)}</b>${C(a.cat).name} · validado por la organización`, 'off');
      }
    });
  }

  // ---------------------------------------------------------------- router y bucle
  let route = { name: 'seguir', arg: null };
  function parseHash() {
    const parts = (location.hash || '#/seguir').slice(2).split('/');
    route = { name: views[parts[0]] ? parts[0] : 'seguir', arg: parts.slice(1).join('/') || null };
  }
  /** En la demo, escribe la búsqueda letra a letra para que se vea cómo funciona. */
  function typeQuery(text) {
    ui.typed = true;
    ui.typing = true;
    ui.query = '';
    let i = 0;
    const step = () => {
      const q = $('#q');
      if (!q || i > text.length) { ui.typing = false; return; }
      ui.query = text.slice(0, i++);
      q.value = ui.query;
      searchResults();
      setTimeout(step, 170);
    };
    setTimeout(step, 600);
  }

  /** Resalta un elemento (lo pide la presentación guiada). Se reaplica tras cada repintado. */
  function applyHl(scroll) {
    document.querySelectorAll('.hl').forEach((el) => el.classList.remove('hl'));
    if (!ui.hl) return;
    const el = document.querySelector(ui.hl);
    if (!el) return;
    el.classList.add('hl');
    if (scroll) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /**
   * Actualiza `from` para que quede igual que `to` sin recrear los nodos que no cambian.
   * Un nodo con `data-keep` se deja tal cual mientras conserve la misma clave.
   */
  function morphChildren(from, to) {
    const a = Array.from(from.childNodes), b = Array.from(to.childNodes);
    b.forEach((n, i) => {
      const o = a[i];
      if (!o) { from.appendChild(n.cloneNode(true)); return; }
      const same = o.nodeType === n.nodeType && o.nodeName === n.nodeName && (o.nodeType !== 1 || o.getAttribute('data-keep') === n.getAttribute('data-keep'));
      if (!same) { from.replaceChild(n.cloneNode(true), o); return; }
      if (o.nodeType !== 1) { if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; return; }
      if (o.hasAttribute('data-keep')) return;
      Array.from(o.attributes).forEach((at) => { if (!n.hasAttribute(at.name)) o.removeAttribute(at.name); });
      Array.from(n.attributes).forEach((at) => { if (o.getAttribute(at.name) !== at.value) o.setAttribute(at.name, at.value); });
      morphChildren(o, n);
    });
    for (let i = a.length - 1; i >= b.length; i--) from.removeChild(a[i]);
  }

  function render() {
    const now = Clock.now();
    const view = $('#view');
    if (route.name === 'seguir' || route.name === 'buscar') {
      if (route.name === 'buscar') ui.searchOpen = true;
      const key = 'seguir:' + follows.length + ':' + !!ui.searchOpen;
      if (view.dataset.shell !== key) {
        view.innerHTML = views.seguir();
        view.dataset.shell = key;
        if (route.name === 'buscar' && route.arg && !ui.typed) typeQuery(decodeURIComponent(route.arg));
      }
      const live = $('#live');
      if (live) live.innerHTML = liveCards(now);
      $('#venue').innerHTML = venueNow(now);
      if (!ui.typing) searchResults();
    } else {
      view.dataset.shell = '';
      // Solo se toca lo que cambia: así las animaciones (ejercicios, mapa) no se reinician cada segundo.
      const tpl = document.createElement('div');
      tpl.innerHTML = views[route.name](route.arg);
      morphChildren(view, tpl);
      if (route.name === 'atleta' && $('#view .map')) placeDot(H.status(H.BY_DORSAL[route.arg], now));
    }
    const tab = route.name === 'atleta' || route.name === 'buscar' ? 'seguir' : route.name;
    document.querySelectorAll('.tabbar a').forEach((el) => el.classList.toggle('active', el.dataset.tab === tab));
    applyHl(false);
  }
  function tick() {
    const now = Clock.now();
    $('#clock').textContent = clk(now, true);
    $('#clock-pill').classList.toggle('paused', Clock.paused);
    const dt = $('#demo-time');
    if (dt) dt.textContent = clk(now, true);
    checkEvents(now);
    if (route.name !== 'guia') render();
  }

  window.addEventListener('hashchange', () => { parseHash(); ui.typed = false; $('#view').innerHTML = ''; $('#view').dataset.shell = ''; render(); window.scrollTo(0, 0); });

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-photo],[data-fmt],[data-ph-share],[data-ph-dl],[data-ph-clear],[data-pick],[data-share],[data-search-open],[data-show-all],[data-demo],[data-follow],[data-go],[data-station],[data-tanda],[data-cat-tab],[data-onb],[data-onb-next],[data-onb-skip],[data-close],[data-scen],[data-speed],[data-pause]');
    if (!t) return;
    if (t.dataset.photo) { photoSheet(t.dataset.photo); return; }
    if (t.dataset.fmt) { photo.fmt = t.dataset.fmt; photoSheet(photo.dorsal); return; }
    if (t.hasAttribute('data-ph-share')) { sharePhoto(); return; }
    if (t.hasAttribute('data-ph-dl')) { downloadPhoto(); return; }
    if (t.hasAttribute('data-ph-clear')) { photo.img = null; photoSheet(photo.dorsal); return; }
    if (t.dataset.pick) { pick(t.dataset.pick); return; }
    if (t.dataset.share) { share(t.dataset.share); return; }
    if (t.hasAttribute('data-search-open')) { ui.searchOpen = true; render(); const q = $('#q'); if (q) q.focus(); return; }
    if (t.hasAttribute('data-show-all')) { ui.showAll = true; searchResults(); return; }
    if (t.hasAttribute('data-demo')) { demoSheet(); return; }
    if (t.dataset.follow) { e.stopPropagation(); toggleFollow(t.dataset.follow); return; }
    if (t.hasAttribute('data-close')) closeSheet();
    if (t.dataset.go) { location.hash = t.dataset.go; return; }
    if (t.dataset.station) { stationSheet(+t.dataset.station, t.dataset.cat || (follows[0] && H.BY_DORSAL[follows[0]].cat)); return; }
    if (t.dataset.tanda) { tandaSheet(t.dataset.tanda); return; }
    if (t.dataset.catTab) { location.hash = '#/clasificacion/' + t.dataset.catTab; return; }
    if (t.hasAttribute('data-onb')) { onbStep = 0; showOnb(true); return; }
    if (t.hasAttribute('data-onb-next')) {
      if (onbStep < ONB.length - 1) { onbStep++; showOnb(true); } else { showOnb(false); if (!follows.length) { location.hash = '#/seguir'; setTimeout(() => { const q = $('#q'); if (q) q.focus(); }, 50); } }
      return;
    }
    if (t.hasAttribute('data-onb-skip')) { showOnb(false); return; }
    if (t.dataset.scen) { closeSheet(); applyScenario(SCEN.find((s) => s.id === t.dataset.scen)); return; }
    if (t.dataset.speed) { Clock.set({ speed: +t.dataset.speed, paused: false }); demoSheet(); return; }
    if (t.hasAttribute('data-pause')) { Clock.set({ paused: !Clock.paused }); demoSheet(); }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'q') { ui.query = e.target.value; ui.showAll = false; searchResults(); }
    if (e.target.id === 'demo-range') { Clock.set({ base: +e.target.value }); lastTick = null; render(); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'ggee') { ui.ggee = e.target.value; render(); }
    if (e.target.id === 'ph-file') loadPhoto(e.target.files[0]);
  });
  $('#demo-fab').addEventListener('click', demoSheet);

  // Control desde la vista de presentación (index.html)
  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!m || !m.h6) return;
    if (m.clock) { Clock.base = m.clock.base; Clock.anchor = m.clock.anchor; Clock.speed = m.clock.speed; Clock.paused = m.clock.paused; lastTick = null; }
    if (m.scenario) { const s = SCEN.find((x) => x.id === m.scenario); if (s) { closeSheet(); ui.hl = null; setFollows(s.follow.slice()); if (location.hash !== s.route) location.hash = s.route; onbStep = 0; showOnb(!!s.onboarding); } }
    if (m.onbStep != null) { onbStep = m.onbStep; showOnb(true); }
    if (m.pick) pick(m.pick);
    if (m.photo) {
      photo.fmt = 'story';
      photo.img = null;
      if (m.photoData) {
        const im = new Image();
        im.onload = () => { photo.img = im; photoSheet(m.photo); };
        im.src = m.photoData;
      }
      photoSheet(m.photo);
    }
    if (m.photoFmt && photo.dorsal) { photo.fmt = m.photoFmt; photoSheet(photo.dorsal); }
    if (m.closeSheet) closeSheet();
    render();
    if ('highlight' in m) { ui.hl = m.highlight; setTimeout(() => applyHl(true), 60); }
  });

  // ---------------------------------------------------------------- arranque
  $('#evt-name').textContent = H.EVENT.name + ' · ' + H.EVENT.venue;
  if (params.get('g')) location.hash = params.get('g');
  parseHash();
  render();
  tick();
  setInterval(tick, 1000);
  if (params.get('o') === '1' || (params.get('o') !== '0' && !EMBED && !store.get('onboarded', false))) { onbStep = 0; showOnb(true); }
})();
