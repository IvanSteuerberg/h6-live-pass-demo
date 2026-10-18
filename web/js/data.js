/*
 * H6 Live Pass – motor de simulación (sin backend).
 *
 * Genera de forma determinista una jornada de Hyatlón H6 genérica: categorías, tandas cada
 * 15 min y los pasos por alfombra de chip de cada atleta. Todo se calcula a partir de la
 * "hora simulada", así que el PC y cualquier móvil que abra el QR ven la misma carrera.
 *
 * Supuesto de cronometraje (ver investigacion/RESUMEN.md): hay alfombra de chip en la
 * salida, en la entrada y la salida de cada estación y en meta → 14 lecturas por atleta.
 */
(function (global) {
  'use strict';

  // ---------- utilidades ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(20261016);
  const gauss = () => {
    let u = 0, v = 0;
    while (!u) u = rng();
    while (!v) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const T = (h, m, s = 0) => h * 3600 + m * 60 + s;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- formato H6 (oficial: hyatlon.org/event-format) ----------
  const STATIONS = [
    { n: 1, name: 'SkiErg', dist: '1.000 m', icon: '⛷️', anim: 'skierg',
      desc: 'Ergómetro de esquí: tira de las asas hacia abajo, como un esquiador de fondo, hasta que la pantalla marca 1.000 m.',
      watch: 'Es la primera estación: aún van muy juntos los de su tanda.' },
    { n: 2, name: 'Sled Push', dist: '50 m', icon: '🛷', anim: 'sled', weightKey: 'sled',
      desc: 'Empuja un trineo cargado a lo largo de 50 m. El peso cambia según la categoría.',
      watch: 'Es la estación más dura de fuerza: aquí se abren diferencias.' },
    { n: 3, name: 'Burpee Broad Jump', dist: '80 m', icon: '🐸', anim: 'burpee',
      desc: 'Burpee (pecho al suelo) y salto horizontal con los dos pies hacia delante, hasta cubrir 80 m.',
      watch: 'Larga y visible: buen momento para animar.' },
    { n: 4, name: 'RowErg', dist: '1.000 m', icon: '🚣', anim: 'row',
      desc: 'Remoergómetro: 1.000 m de remo en máquina.',
      watch: 'Mitad de la prueba. Sentados en la máquina, fácil de localizar.' },
    { n: 5, name: 'Sandbag Lunges', dist: '100 m', icon: '🎒', anim: 'lunges', weightKey: 'sandbag',
      desc: 'Zancadas con un saco sobre los hombros durante 100 m; la rodilla toca el suelo en cada zancada.',
      watch: 'Piernas ya muy cansadas: el ritmo baja mucho.' },
    { n: 6, name: 'Wall Balls', dist: '100 rep.', icon: '🏐', anim: 'wallballs', weightKey: 'wallball',
      desc: 'Sentadilla y lanzamiento del balón a una diana en la pared. 100 repeticiones válidas; el juez no cuenta las que no llegan.',
      watch: 'Última estación. Al acabar, sprint final a meta.' },
  ];

  // Pesos oficiales por categoría (hyatlon.org/categories)
  const CATEGORIES = {
    EF: { id: 'EF', name: 'Élite Femenino', short: 'Élite F', g: 'F', level: 'Élite', color: '#f472b6', factor: 0.84,
          weights: { sled: '152 kg', sandbag: '20 kg', wallball: '6 kg · diana a 2,70 m' } },
    EM: { id: 'EM', name: 'Élite Masculino', short: 'Élite M', g: 'M', level: 'Élite', color: '#60a5fa', factor: 0.76,
          weights: { sled: '202 kg', sandbag: '30 kg', wallball: '9 kg · diana a 3,00 m' } },
    OF: { id: 'OF', name: 'Open Femenino', short: 'Open F', g: 'F', level: 'Open', color: '#a78bfa', factor: 1.0,
          weights: { sled: '102 kg', sandbag: '10 kg', wallball: '4 kg · diana a 2,70 m' } },
    OM: { id: 'OM', name: 'Open Masculino', short: 'Open M', g: 'M', level: 'Open', color: '#2dd4bf', factor: 0.92,
          weights: { sled: '152 kg', sandbag: '20 kg', wallball: '6 kg · diana a 3,00 m' } },
  };
  const CAT_ORDER = ['EF', 'EM', 'OF', 'OM'];
  const GGEE = ['16-24', '25-29', '30-34', '35-39', '40-44', '45-49', '50+'];

  // Tiempos base por tramo (segundos) para Open Femenino; se escalan por categoría y atleta.
  // Tramos: km1, est1, km2, est2, …, km6, est6, sprint final.
  const RUN = [335, 345, 350, 355, 362, 372];
  const ST = [285, 225, 330, 295, 285, 420];
  const SPRINT = 55;
  const BASE = [];
  for (let i = 0; i < 6; i++) { BASE.push(RUN[i], ST[i]); }
  BASE.push(SPRINT);
  const BASE_CUM = [0];
  BASE.forEach((s, i) => BASE_CUM.push(BASE_CUM[i] + s));
  const BASE_TOTAL = BASE_CUM[BASE.length];

  // 14 alfombras: 0 salida · 2j+1 entrada est. j+1 · 2j+2 salida est. j+1 · 13 meta
  const MATS = ['Salida'];
  STATIONS.forEach((s) => { MATS.push('Entrada ' + s.name, 'Salida ' + s.name); });
  MATS.push('Meta');
  const FINISH = 13;

  const CALL_ROOM = 10 * 60;   // llamada a cámara 10 min antes de la salida
  const REVIEW = 15 * 60;      // revisión de jueces tras el último atleta de la categoría
  const DNF_CONFIRM = 12 * 60; // la organización confirma una retirada

  // ---------- jornada genérica ----------
  const EVENT = {
    name: 'Hyatlón H6',
    venue: 'Sede de demostración',
    day: 'Sábado',
    start: T(9, 0),
    end: T(14, 15),
  };

  const TANDAS = [];
  function addTandas(cat, h, m, count, size) {
    for (let i = 0; i < count; i++) {
      const start = T(h, m) + i * 15 * 60;
      TANDAS.push({ id: cat + '-' + (i + 1), cat, start, idx: i + 1, of: count, size, athletes: [] });
    }
  }
  addTandas('EF', 9, 0, 2, 11);
  addTandas('EM', 9, 30, 3, 12);
  addTandas('OF', 10, 15, 4, 12);
  addTandas('OM', 11, 15, 6, 12);

  // ---------- nombres ficticios ----------
  const NAMES_F = ['Lucía', 'Marta', 'Paula', 'Elena', 'Sara', 'Claudia', 'Irene', 'Laura', 'Nerea', 'Alba', 'Carmen', 'Noelia', 'Ainhoa', 'Cristina', 'Andrea', 'Raquel', 'Beatriz', 'Julia', 'Rocío', 'Silvia', 'Natalia', 'Inés', 'Lorena', 'Patricia', 'Miriam', 'Olga', 'Teresa', 'Vega'];
  const NAMES_M = ['Javier', 'Pablo', 'Daniel', 'Adrián', 'Hugo', 'Álvaro', 'Diego', 'Sergio', 'Iván', 'Rubén', 'Marcos', 'David', 'Óscar', 'Raúl', 'Víctor', 'Jorge', 'Mario', 'Alberto', 'Gonzalo', 'Íñigo', 'Héctor', 'Rafael', 'Andrés', 'Luis', 'Nacho', 'Aitor', 'Samuel', 'Tomás'];
  const SURN = ['García', 'Martín', 'López', 'Sánchez', 'Romero', 'Navarro', 'Torres', 'Domínguez', 'Gil', 'Vázquez', 'Serrano', 'Ramos', 'Blanco', 'Molina', 'Morales', 'Ortega', 'Delgado', 'Castro', 'Ortiz', 'Rubio', 'Marín', 'Sanz', 'Iglesias', 'Núñez', 'Medina', 'Garrido', 'Cortés', 'Castillo', 'Santos', 'Lozano', 'Guerrero', 'Cano', 'Prieto', 'Méndez', 'Cruz', 'Calvo', 'Gallego', 'Vidal', 'León', 'Herrera', 'Peña', 'Flores', 'Cabrera', 'Campos', 'Vega', 'Fuentes', 'Carrasco', 'Diez', 'Caballero', 'Reyes', 'Aguilar', 'Pascual', 'Santana', 'Herrero', 'Lorenzo', 'Hidalgo', 'Montero', 'Ibáñez', 'Giménez', 'Ferrer', 'Durán', 'Vicente', 'Benítez', 'Mora', 'Arias', 'Varela', 'Soler', 'Pastor'];
  const CLUBS = ['Box Norte', 'CrossTraining León', 'Club Atletismo Ribera', 'Hybrid Lab', 'Independiente', 'Independiente', 'Gimnasio Central', 'Team Fuego', 'Universidad', 'Running Sur'];

  const pad2 = (n) => String(n).padStart(2, '0');
  const hhmm = (sec) => pad2(Math.floor(sec / 3600)) + ':' + pad2(Math.floor((sec % 3600) / 60));

  // ---------- generación de atletas ----------
  const ATHLETES = [];
  const usedNames = new Set();
  function newName(g) {
    for (;;) {
      const first = pick(g === 'F' ? NAMES_F : NAMES_M);
      const last = pick(SURN) + ' ' + pick(SURN);
      const full = first + ' ' + last;
      if (!usedNames.has(full) && first !== 'Lucía' && first !== 'Marta') { usedNames.add(full); return { first, last }; }
    }
  }

  function buildSplits(cat, ability, noise) {
    const raw = BASE.map((b, i) => b * (1 + noise * gauss() * (i % 2 ? 1.4 : 1)));
    const rawTotal = raw.reduce((a, b) => a + b, 0);
    const target = BASE_TOTAL * CATEGORIES[cat].factor * ability;
    return raw.map((s) => Math.round((s * target) / rawTotal));
  }

  TANDAS.forEach((t) => {
    const cat = CATEGORIES[t.cat];
    for (let o = 1; o <= t.size; o++) {
      const nm = newName(cat.g);
      const ability = clamp(Math.exp(0.1 * gauss()), 0.84, 1.32);
      const a = {
        dorsal: hhmm(t.start) + '-' + pad2(o),
        first: nm.first, last: nm.last, name: nm.first + ' ' + nm.last,
        g: cat.g, cat: t.cat, tanda: t, order: o,
        ggee: cat.level === 'Open' ? pick(GGEE) : null,
        club: pick(CLUBS),
        ability,
        splits: null, mats: null, dnfAt: null,
      };
      t.athletes.push(a);
      ATHLETES.push(a);
    }
  });

  // Historia de la demo: Lucía (Open F, tanda 10:30) termina 1ª provisional… y una atleta
  // de una tanda posterior (Marta, 11:00) la supera por tiempo neto.
  const tandaOF2 = TANDAS.find((t) => t.cat === 'OF' && t.idx === 2);
  const tandaOF4 = TANDAS.find((t) => t.cat === 'OF' && t.idx === 4);
  const LUCIA = tandaOF2.athletes[6];
  Object.assign(LUCIA, { first: 'Lucía', last: 'Martín Vega', name: 'Lucía Martín Vega', ggee: '30-34', club: 'CrossTraining León', ability: 0.865 });
  const MARTA = tandaOF4.athletes[2];
  Object.assign(MARTA, { first: 'Marta', last: 'Ríos Calvo', name: 'Marta Ríos Calvo', ggee: '25-29', club: 'Hybrid Lab', ability: 0.851 });
  ATHLETES.filter((a) => a.cat === 'OF' && a !== LUCIA && a !== MARTA).forEach((a) => { a.ability = Math.max(a.ability, 0.9); });

  ATHLETES.forEach((a) => {
    const noise = a === LUCIA || a === MARTA ? 0.035 : 0.06;
    a.splits = buildSplits(a.cat, a.ability, noise);
    a.mats = [a.tanda.start];
    a.splits.forEach((s, i) => a.mats.push(a.mats[i] + s));
  });

  // Dos retiradas: el chip deja de leer y la organización lo confirma después.
  [['EM', 2, 4, 8], ['OM', 3, 9, 6]].forEach(([cat, tIdx, ord, lastMat]) => {
    const t = TANDAS.find((x) => x.cat === cat && x.idx === tIdx);
    const a = t.athletes[ord];
    a.dnfAt = lastMat;
    const expectedNext = a.mats[lastMat + 1];
    a.dnfConfirm = expectedNext + DNF_CONFIRM;
    a.mats = a.mats.map((m, i) => (i <= lastMat ? m : null));
  });

  const BY_DORSAL = {};
  ATHLETES.forEach((a) => { BY_DORSAL[a.dorsal] = a; });
  const BY_CAT = {};
  CAT_ORDER.forEach((c) => { BY_CAT[c] = ATHLETES.filter((a) => a.cat === c); });

  // ---------- consultas en un instante dado ----------
  function lastMat(a, now) {
    let k = -1;
    for (let i = 0; i < a.mats.length; i++) {
      if (a.mats[i] != null && a.mats[i] <= now) k = i; else break;
    }
    return k;
  }

  // Ritmo del atleta respecto a la referencia de su categoría, a partir de lo ya confirmado.
  function paceFactor(a, k) {
    const f = CATEGORIES[a.cat].factor;
    if (k <= 0) return f;
    return (a.mats[k] - a.mats[0]) / BASE_CUM[k];
  }

  function segInfo(seg) {
    if (seg === 12) return { kind: 'sprint', label: 'Sprint final a meta' };
    if (seg % 2 === 0) return { kind: 'run', km: seg / 2 + 1, next: STATIONS[seg / 2], label: 'Carrera · km ' + (seg / 2 + 1) + ' de 6' };
    const st = STATIONS[(seg - 1) / 2];
    return { kind: 'station', station: st, label: 'Estación ' + st.n + ' · ' + st.name };
  }

  /**
   * Estado de un atleta en el instante `now`.
   * Todo lo que viene de una alfombra es "confirmado"; posición dentro del tramo,
   * próximas llegadas y tiempo final previsto son "estimados".
   */
  function status(a, now) {
    const start = a.mats[0];
    const pf = paceFactor(a, 0);
    const s = { a, now, start };
    if (now < start - CALL_ROOM) return Object.assign(s, { phase: 'scheduled', projectedNet: BASE_TOTAL * pf });
    if (now < start) return Object.assign(s, { phase: 'call', projectedNet: BASE_TOTAL * pf, startsIn: start - now });

    const k = lastMat(a, now);
    s.k = k;
    s.lastTime = a.mats[k];
    s.netAtLast = a.mats[k] - start;
    s.elapsed = now - start;

    if (k === FINISH) {
      return Object.assign(s, { phase: 'finished', net: a.mats[FINISH] - start, projectedNet: a.mats[FINISH] - start });
    }

    const p = paceFactor(a, k);
    const segEst = BASE[k] * p;
    const sinceLast = now - a.mats[k];
    const expectedNext = a.mats[k] + segEst;
    s.seg = k;
    s.info = segInfo(k);
    s.progress = clamp(sinceLast / segEst, 0, 0.97);
    s.nextMat = k + 1;
    s.nextEta = expectedNext;
    s.projectedNet = s.netAtLast + (BASE_TOTAL - BASE_CUM[k]) * p;
    s.projectedFinish = start + s.projectedNet;

    if (a.dnfAt != null && k === a.dnfAt) {
      if (now >= a.dnfConfirm) return Object.assign(s, { phase: 'dnf' });
      if (now > expectedNext + 3 * 60) return Object.assign(s, { phase: 'missing', overdue: now - expectedNext });
    }
    return Object.assign(s, { phase: 'racing' });
  }

  const isDone = (st) => st.phase === 'finished' || st.phase === 'dnf';

  /** Posición "virtual": entre los de su categoría que ya han pasado por su último control, por tiempo neto en ese control. */
  function virtualPosition(a, now) {
    const k = lastMat(a, now);
    if (k <= 0) return null;
    const peers = BY_CAT[a.cat].filter((b) => b.mats[k] != null && b.mats[k] <= now);
    peers.sort((x, y) => (x.mats[k] - x.mats[0]) - (y.mats[k] - y.mats[0]));
    return { pos: peers.indexOf(a) + 1, of: peers.length, mat: k, matName: MATS[k] };
  }

  function categoryStatus(cat, now) {
    const list = BY_CAT[cat];
    const tandas = TANDAS.filter((t) => t.cat === cat);
    const sts = list.map((a) => status(a, now));
    const finished = sts.filter((s) => s.phase === 'finished').length;
    const dnf = sts.filter((s) => s.phase === 'dnf').length;
    const notStarted = sts.filter((s) => s.phase === 'scheduled' || s.phase === 'call').length;
    const racing = list.length - finished - dnf - notStarted;
    const tandasLeft = tandas.filter((t) => t.athletes.some((a) => !isDone(status(a, now)))).length;
    const tandasNotStarted = tandas.filter((t) => now < t.start).length;
    const base = { cat, total: list.length, finished, dnf, notStarted, racing, tandasLeft, tandasNotStarted, tandas: tandas.length };
    if (now < tandas[0].start - CALL_ROOM) return Object.assign(base, { state: 'scheduled' });
    if (finished + dnf < list.length) return Object.assign(base, { state: 'live' });
    const lastEnd = Math.max(...list.map((a) => (a.dnfAt != null ? a.dnfConfirm : a.mats[FINISH])));
    if (now < lastEnd + REVIEW) return Object.assign(base, { state: 'review', officialAt: lastEnd + REVIEW });
    return Object.assign(base, { state: 'official', officialAt: lastEnd + REVIEW });
  }

  function ranking(cat, now, ggee) {
    let list = BY_CAT[cat];
    if (ggee) list = list.filter((a) => a.ggee === ggee);
    const sts = list.map((a) => status(a, now));
    const finished = sts.filter((s) => s.phase === 'finished').sort((x, y) => x.net - y.net);
    const racing = sts.filter((s) => s.phase === 'racing' || s.phase === 'missing').sort((x, y) => x.projectedNet - y.projectedNet);
    const waiting = sts.filter((s) => s.phase === 'scheduled' || s.phase === 'call');
    const dnf = sts.filter((s) => s.phase === 'dnf');
    return { finished, racing, waiting, dnf };
  }

  /** Puesto previsto al terminar entre los que ya han salido (estimado). */
  function projectedRank(a, now) {
    const me = status(a, now);
    let better = 0, considered = 0;
    BY_CAT[a.cat].forEach((b) => {
      const s = b === a ? me : status(b, now);
      if (s.phase === 'scheduled' || s.phase === 'call' || s.phase === 'dnf' || s.phase === 'missing') return;
      considered++;
      if (b !== a && s.projectedNet < me.projectedNet) better++;
    });
    return { pos: better + 1, of: considered };
  }

  /** Quién superó a este atleta llegando más tarde a meta pero con menos tiempo neto. */
  function overtakers(a, now) {
    if (a.mats[FINISH] == null) return [];
    const net = a.mats[FINISH] - a.mats[0];
    return BY_CAT[a.cat].filter((b) => b.mats[FINISH] != null && b.mats[FINISH] <= now && b.mats[FINISH] > a.mats[FINISH] && b.mats[FINISH] - b.mats[0] < net);
  }

  function tandaStatus(t, now) {
    const sts = t.athletes.map((a) => status(a, now));
    const finished = sts.filter((s) => s.phase === 'finished').length;
    const dnf = sts.filter((s) => s.phase === 'dnf').length;
    const onCourse = sts.filter((s) => s.phase === 'racing' || s.phase === 'missing').length;
    let state = 'done';
    if (now < t.start - CALL_ROOM) state = 'scheduled';
    else if (now < t.start) state = 'call';
    else if (finished + dnf < t.athletes.length) state = 'racing';
    return { t, state, finished, dnf, onCourse, size: t.athletes.length };
  }

  // ---------- formato ----------
  function fmtClock(sec, withSeconds) {
    sec = Math.floor(sec);
    const s = pad2(Math.floor(sec / 3600)) + ':' + pad2(Math.floor((sec % 3600) / 60));
    return withSeconds ? s + ':' + pad2(sec % 60) : s;
  }
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? h + ':' + pad2(m) + ':' + pad2(s) : m + ':' + pad2(s);
  }
  function fmtMin(sec) {
    const m = Math.max(0, Math.round(sec / 60));
    if (m < 1) return 'menos de 1 min';
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + ' h ' + pad2(m % 60) + ' min';
  }
  const ord = (n, g) => n + (g === 'F' ? 'ª' : 'º');

  // ---------- quién lo ha hecho (sale en la app y en la presentación) ----------
  const TEAM = {
    award: 'Ganador del reto GED Sports · Activa-Hack ULE',
    people: [
      { name: 'Iván Rodríguez Steuerberg', email: 'irodriguezsteuerberg@gmail.com', linkedin: 'https://www.linkedin.com/in/ivansteuerberg/' },
      { name: 'Álvaro Rodríguez Pino', email: 'alvaro.rodpin8@gmail.com', linkedin: 'https://www.linkedin.com/in/alvarorodriguezpino/' },
    ],
  };

  global.H6 = {
    TEAM, T, EVENT, STATIONS, CATEGORIES, CAT_ORDER, GGEE, MATS, FINISH, BASE, BASE_TOTAL, CALL_ROOM, REVIEW,
    TANDAS, ATHLETES, BY_DORSAL, BY_CAT, LUCIA, MARTA,
    lastMat, status, segInfo, virtualPosition, categoryStatus, ranking, projectedRank, overtakers, tandaStatus,
    fmtClock, fmtDur, fmtMin, ord,
  };
})(window);
