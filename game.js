// Metroidvania 2.5D: mundo lineal en seis bloques, puertas que se abren con el objeto del bloque anterior,
// pasadizos secretos y un guardián al final. Está pensado para no tener nunca un callejón sin salida.
(() => {
  'use strict';

  // ---------- Constantes ----------
  const TS = 32;                    // tamaño de una casilla en píxeles
  const RW = 30;                    // casillas por sala (ancho)
  const RH = 18;                    // casillas por sala (alto)
  const W = RW * TS;                // 960: una sala ocupa toda la pantalla
  const H = RH * TS;                // 576
  const GX = 9;                     // salas del mundo en horizontal
  const GY = 6;                     // salas del mundo en vertical
  const BLOCKS = 6;                 // bloques de 3x3 salas, en orden lineal
  const GRAV = 0.55;
  const MAX_FALL = 12;
  const RUN_ACC = 0.6;
  const RUN_MAX = 4.6;
  const JUMP_V = -11.5;
  const DJUMP_V = -9.5;
  const JUMP_CUT = -3;              // altura mínima del salto si sueltas el botón pronto
  const DASH_V = 11;
  const DASH_FRAMES = 12;
  const DASH_CD = 45;
  const COYOTE = 6;                 // frames para saltar justo después de caer de una plataforma
  const BUFFER = 6;                 // frames que se recuerda la pulsación de salto
  const ATK_FRAMES = 16;
  const IFRAMES = 70;
  const RESPAWN_FRAMES = 100;
  const HOOK_FRAMES = 40;
  const HOOK_RANGE = 240;
  const GAP_Y = [7, 8, 9, 10];      // filas de las salidas laterales
  const GAP_X = [13, 14, 15, 16];   // columnas de las salidas superior e inferior
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // Bloques de 3x3 salas en serpiente: el orden es el orden de juego
  const BLOCK_ORDER = [[0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [0, 1]];
  // Objeto que abre la puerta entre el bloque b y el b+1. Cada uno está en el bloque b.
  // Las habilidades se tienen desde el inicio, así que sólo las fronteras con llave tienen puerta cerrada.
  const GATES = [null, 'key', null, 'key', null];
  const ABILITIES = {
    dash: { name: 'Dash', color: '#7fd6ff', hint: 'K o Shift: impulso horizontal.' },
    djump: { name: 'Doble salto', color: '#b07cff', hint: 'Espacio otra vez en el aire.' },
    gancho: { name: 'Gancho', color: '#ffb347', hint: 'Q: engancha hacia un anclaje cercano.' },
  };
  const BIOMES = ['Bosque Húmedo', 'Cripta Violeta', 'Ruinas de Arena', 'Fortaleza Carmesí'];
  const FLOOR_A = ['Catacumbas', 'Bóveda', 'Abismo', 'Torre', 'Santuario', 'Galería'];
  const FLOOR_B = ['del Eco', 'de Ceniza', 'Vaelor', 'Sombrío', 'de la Ruina', 'Silente'];
  // Paleta por bioma
  const PALETTES = [
    { sky: ['#0b1a1f', '#1f3a2e'], far: '#15302a', mid: '#0e2420', wall: '#2c3d3a', wallHi: '#4a6660', wallLo: '#1a2624', accent: '#8fdc9a' },
    { sky: ['#120c1f', '#2a1a3d'], far: '#22173a', mid: '#170f2b', wall: '#35304a', wallHi: '#58507a', wallLo: '#1f1b2e', accent: '#b89cff' },
    { sky: ['#1f140b', '#3d2814'], far: '#3a2614', mid: '#2a1a0e', wall: '#4a3a2a', wallHi: '#70583a', wallLo: '#2c2218', accent: '#ffc86a' },
    { sky: ['#1a0707', '#3a0f10'], far: '#3d1212', mid: '#2a0b0b', wall: '#4a2424', wallHi: '#70383a', wallLo: '#2c1414', accent: '#ff7a6a' },
  ];
  const KEYMAP = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ' ': 'jump', w: 'jump', W: 'jump', ArrowUp: 'jump',
    j: 'attack', J: 'attack', z: 'attack', Z: 'attack',
    k: 'dash', K: 'dash', Shift: 'dash',
    e: 'interact', E: 'interact',
    q: 'hook', Q: 'hook',
  };

  // Casillas: 0 aire, 1 sólido, 2 plataforma de un sentido, 3 pinchos

  // ---------- Utilidades ----------
  const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const blockOfRoom = (r) => r.block;
  const biomeOfRoom = (r) => Math.min(BIOMES.length - 1, Math.floor((r.block * BIOMES.length) / BLOCKS));

  // ---------- Comprobación de solvencia ----------
  // Aristas: need (null | 'dash' | 'djump' | 'gancho' | 'key' | 'secret'), src (sala desde la que se cruza, si es de un sentido).
  function reachDirected(edges, held, opened) {
    const seen = new Set([0]);
    const st = [0];
    while (st.length) {
      const u = st.pop();
      edges.forEach((e, ei) => {
        let v;
        if (e.a === u) v = e.b;
        else if (e.b === u) v = e.a;
        else return;
        if (e.src !== undefined && e.src !== u) return;
        if (e.need === 'key') { if (!opened.has(ei)) return; }
        else if (e.need === 'secret') { /* un pasadizo secreto siempre se puede revelar */ }
        else if (e.need && !held.has(e.need)) return;
        if (!seen.has(v)) {
          seen.add(v);
          st.push(v);
        }
      });
    }
    return seen;
  }

  // Juego ideal: recoge objetos alcanzables y abre puertas de llave cuando hay llaves sin usar.
  function simulate(edges, placed) {
    const held = new Set();
    let keys = 0;
    const opened = new Set();
    const taken = new Set();
    let R = new Set([0]);
    let changed = true;
    while (changed) {
      changed = false;
      R = reachDirected(edges, held, opened);
      placed.forEach((p, i) => {
        if (!taken.has(i) && R.has(p.room)) {
          taken.add(i);
          changed = true;
          if (p.item === 'key') keys++;
          else held.add(p.item);
        }
      });
      edges.forEach((e, ei) => {
        if (e.need === 'key' && !opened.has(ei) && keys - opened.size > 0 && (R.has(e.a) || R.has(e.b))) {
          opened.add(ei);
          changed = true;
        }
      });
    }
    return { R, held, opened };
  }

  // ---------- Mundo ----------
  function genWorld() {
    for (let tries = 0; tries < 2000; tries++) {
      const w = tryWorld();
      if (w) return w;
    }
    throw new Error('No se pudo generar un mundo jugable');
  }

  // Mundo lineal: cada bloque tiene todas sus salas conectadas sin puertas. Entre bloques hay una sola
  // puerta, que se abre con el objeto del bloque anterior. Así el orden de juego siempre es posible.
  function tryWorld() {
    const N = GX * GY;
    const idOf = (x, y) => y * GX + x;
    const adjacent = (a, b) => Math.abs((a % GX) - (b % GX)) + Math.abs(Math.floor(a / GX) - Math.floor(b / GX)) === 1;

    const blockIdx = new Array(N).fill(-1);
    const blockCells = BLOCK_ORDER.map(([bx, by], b) => {
      const cells = [];
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          const id = idOf(bx * 3 + dx, by * 3 + dy);
          blockIdx[id] = b;
          cells.push(id);
        }
      }
      return cells;
    });

    const edges = [];
    const addEdge = (a, b, need = null) => {
      const e = { a, b, need, src: undefined, opened: false, revealed: false };
      edges.push(e);
      return e;
    };

    // Dentro de cada bloque: árbol de expansión (conexo) y bucles extra
    const loopsOf = blockCells.map((cells) => {
      const inTree = new Set([cells[0]]);
      let last = cells[0];
      while (inTree.size < cells.length) {
        const cand = [];
        for (const a of inTree) {
          for (const b of cells) {
            if (!inTree.has(b) && adjacent(a, b)) cand.push([a, b]);
          }
        }
        const fromLast = cand.filter(([x]) => x === last);
        const [a, b] = fromLast.length && Math.random() < 0.6 ? pick(fromLast) : pick(cand);
        inTree.add(b);
        last = b;
        addEdge(a, b);
      }
      const pairs = [];
      cells.forEach((a) => cells.forEach((b) => {
        if (a < b && adjacent(a, b) && !edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))) {
          pairs.push([a, b]);
        }
      }));
      return shuffle(pairs).slice(0, 3).map(([a, b]) => addEdge(a, b));
    });

    // Pasadizo secreto y puerta de un sentido: sólo en bucles, así siempre hay otro camino
    loopsOf.forEach((loops) => {
      if (loops.length >= 2) {
        loops[0].need = 'secret';
        loops[1].src = Math.random() < 0.5 ? loops[1].a : loops[1].b;
      }
    });

    // Puertas entre bloques: una sola arista por cada frontera, con el requisito del bloque anterior
    const crossings = [];
    for (let b = 0; b < BLOCKS - 1; b++) {
      const pairs = [];
      blockCells[b].forEach((a) => blockCells[b + 1].forEach((c) => {
        if (adjacent(a, c)) pairs.push([a, c]);
      }));
      const [a, c] = pick(pairs);
      crossings.push(addEdge(a, c, GATES[b]));
      // Frontera sin llave: un segundo pasillo abierto para que las zonas estén más conectadas
      if (!GATES[b] && pairs.length > 1) {
        const [a2, c2] = pick(pairs.filter(([x, y]) => x !== a || y !== c));
        addEdge(a2, c2, null);
      }
    }

    // Objetos: cada uno en un sitio cualquiera de su bloque (todo el bloque es alcanzable desde su entrada)
    const placed = [];
    for (let b = 0; b < BLOCKS - 1; b++) {
      // El objeto del bloque b va en su sala de entrada: todo el bloque se alcanza sólo por ahí,
      // así que se recoge antes de llegar a cualquier puerta del bloque
      const entryRoom = b === 0 ? 0 : crossings[b - 1].b;
      if (GATES[b]) placed.push({ room: entryRoom, item: GATES[b] });
    }

    // Guardián: la sala más lejos de la entrada del último bloque
    const entry = crossings[BLOCKS - 2].b;
    const dist = new Map([[entry, 0]]);
    const queue = [entry];
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi];
      edges.forEach((e) => {
        if (e.need || e.src !== undefined) return;
        const other = e.a === cur ? e.b : e.b === cur ? e.a : -1;
        if (other >= 0 && blockIdx[other] === BLOCKS - 1 && !dist.has(other)) {
          dist.set(other, dist.get(cur) + 1);
          queue.push(other);
        }
      });
    }
    const bossIdx = [...dist.entries()].reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];

    // Comprobación final: con los objetos del camino se llega al guardián
    const check = simulate(edges, placed);
    if (!check.R.has(bossIdx)) return null;

    const rooms = [];
    for (let i = 0; i < N; i++) {
      rooms.push({
        i, gx: i % GX, gy: Math.floor(i / GX), block: blockIdx[i], depth: blockIdx[i],
        conn: { l: null, r: null, u: null, d: null },
        tiles: null, enemies: [], pickup: null, save: null, exit: null, anchors: [],
        boss: i === bossIdx, cleared: false, explored: false, bg: null,
      });
    }
    edges.forEach((e) => {
      const A = rooms[e.a];
      const B = rooms[e.b];
      const dx = B.gx - A.gx;
      const dy = B.gy - A.gy;
      if (dx === 1) { A.conn.r = e; B.conn.l = e; }
      else if (dx === -1) { A.conn.l = e; B.conn.r = e; }
      else if (dy === 1) { A.conn.d = e; B.conn.u = e; }
      else { A.conn.u = e; B.conn.d = e; }
    });

    rooms.forEach((r) => {
      r.tiles = genRoomTiles(r);
      r.bg = genRoomBg();
    });
    placed.forEach((p) => populateItem(rooms[p.room], p.item));
    rooms.forEach((r) => populateRoom(r));

    return { rooms, edges, cur: 0, bossIdx, bossDown: false, lastBlock: -1, bossIntro: false, placed };
  }

  // Fondo de una sala: torres lejanas y columnas medias para el paralaje
  function genRoomBg() {
    const far = [];
    for (let i = 0; i < 7; i++) far.push({ x: rnd(0, W), w: rnd(40, 90), h: rnd(140, 280) });
    const mid = [];
    for (let i = 0; i < 5; i++) mid.push({ x: rnd(0, W), w: 26, h: rnd(260, 380) });
    return { far, mid };
  }

  // Elige un diseño de sala que el jugador pueda recorrer entero. Si ninguno sirve, sala lisa.
  function genRoomTiles(room) {
    for (const p of shuffle(['platforms', 'stairs', 'pillars', 'pit', 'shaft', 'ledges', 'islands', 'climb', 'bridge', 'checker'])) {
      const t = makeRoomTiles(room, p);
      if (roomReachable(t, room.conn)) return t;
    }
    return makeRoomTiles(room, 'none');
  }

  // Modelo sencillo de movimiento: andar, subir o bajar un escalón, saltar hasta 3 casillas y caer.
  // Comprueba que todas las casillas donde se puede estar son alcanzables desde las salidas.
  function roomReachable(t, conn) {
    const passable = (x, y) => x >= 0 && x < RW && y >= 0 && y < RH && (t[y][x] === 0 || t[y][x] === 3);
    const solidBelow = (x, y) => y + 1 < RH && (t[y + 1][x] === 1 || t[y + 1][x] === 2);
    const stand = (x, y) => passable(x, y) && solidBelow(x, y);

    const gaps = [];
    if (conn.l) GAP_Y.forEach((y) => gaps.push([0, y]));
    if (conn.r) GAP_Y.forEach((y) => gaps.push([RW - 1, y]));
    if (conn.u) GAP_X.forEach((x) => gaps.push([x, 0]));
    if (conn.d) GAP_X.forEach((x) => gaps.push([x, RH - 1]));
    if (!gaps.length) return true;

    const starts = [];
    for (let y = 0; y < RH; y++) {
      for (let x = 0; x < RW; x++) {
        if (stand(x, y) && gaps.some(([gx, gy]) => Math.abs(gx - x) <= 4 && Math.abs(gy - y) <= 4)) {
          starts.push([x, y]);
        }
      }
    }
    if (!starts.length) return false;

    const seen = new Set(starts.map(([x, y]) => y * RW + x));
    const queue = [...starts];
    const add = (x, y) => {
      if (!stand(x, y)) return;
      const k = y * RW + x;
      if (!seen.has(k)) {
        seen.add(k);
        queue.push([x, y]);
      }
    };
    for (let qi = 0; qi < queue.length; qi++) {
      const [x, y] = queue[qi];
      [-1, 1].forEach((dx) => {
        add(x + dx, y);
        add(x + dx, y + 1);
        if (passable(x, y - 1) && passable(x + dx, y - 1)) add(x + dx, y - 1);
      });
      for (let dx = -4; dx <= 4; dx++) {
        if (dx === 0) continue;
        for (let k = 1; k <= 3; k++) add(x + dx, y - k);
        for (let k = 1; k <= 8; k++) add(x + dx, y + k);
      }
    }

    for (let y = 0; y < RH; y++) {
      for (let x = 0; x < RW; x++) {
        if (stand(x, y) && !seen.has(y * RW + x)) return false;
      }
    }
    return true;
  }

  function makeRoomTiles(room, forcedPattern) {
    const t = Array.from({ length: RH }, () => new Array(RW).fill(1));
    for (let y = 1; y < RH - 1; y++) {
      for (let x = 1; x < RW - 1; x++) t[y][x] = 0;
    }
    const c = room.conn;
    if (c.l) GAP_Y.forEach((y) => (t[y][0] = 0));
    if (c.r) GAP_Y.forEach((y) => (t[y][RW - 1] = 0));
    if (c.u) GAP_X.forEach((x) => (t[0][x] = 0));
    if (c.d) GAP_X.forEach((x) => (t[RH - 1][x] = 0));

    // Diseño de la sala. Las salidas quedan libres.
    const inGap = (x, y) =>
      (x <= 1 && GAP_Y.includes(y)) || (x >= RW - 2 && GAP_Y.includes(y)) ||
      (y <= 1 && GAP_X.includes(x)) || (y >= RH - 2 && GAP_X.includes(x));
    const put = (x, y, v) => {
      if (x > 0 && x < RW - 1 && y > 0 && y < RH - 1 && t[y][x] === 0 && !inGap(x, y)) t[y][x] = v;
    };
    // Plataformas un poco más anchas que su definición: se salta mejor
    const row = (y, x0, len, v) => {
      for (let x = x0 - 1; x < x0 + len + 1; x++) put(x, y, v);
    };
    const pattern = forcedPattern;
    if (pattern === 'platforms') {
      [14, 11, 8, 5].forEach((ly) => {
        if (Math.random() < 0.6) row(ly, rnd(4, RW - 9), rnd(3, 6), 2);
      });
    } else if (pattern === 'stairs') {
      const mirror = Math.random() < 0.5;
      for (let s = 0; s < 5; s++) {
        const x0 = mirror ? RW - 6 - s * 3 - 4 : 5 + s * 3;
        row(15 - s * 2, x0, 4, 2);
      }
    } else if (pattern === 'pillars') {
      [6, 9, 21, 24].forEach((x) => {
        if (Math.random() < 0.6) for (let y = 8; y < RH - 1; y++) put(x, y, 1);
      });
    } else if (pattern === 'pit') {
      row(RH - 2, 12, 4, 3);
      row(13, 9, 4, 2);
      row(13, 17, 4, 2);
    } else if (pattern === 'shaft') {
      row(13, 4, 5, 2);
      row(13, RW - 9, 5, 2);
      row(9, 9, 4, 2);
      row(9, RW - 13, 4, 2);
    } else if (pattern === 'ledges') {
      row(13, 3, 4, 2);
      row(10, 8, 4, 2);
      row(7, 13, 5, 2);
    } else if (pattern === 'islands') {
      // Islas separadas por huecos que se salvan con un salto
      row(14, 4, 3, 2);
      row(11, 11, 3, 2);
      row(8, 18, 3, 2);
      row(11, 24, 3, 2);
    } else if (pattern === 'climb') {
      // Escalada en zigzag hacia arriba
      row(15, 3, 3, 2);
      row(12, 8, 3, 2);
      row(9, 3, 3, 2);
      row(6, 8, 3, 2);
    } else if (pattern === 'bridge') {
      // Puente sobre un foso de pinchos
      row(RH - 2, 8, 14, 3);
      row(13, 5, 20, 2);
    } else if (pattern === 'checker') {
      // Plataformas alternas a dos alturas
      row(14, 4, 3, 2);
      row(10, 8, 3, 2);
      row(14, 12, 3, 2);
      row(10, 16, 3, 2);
      row(14, 20, 3, 2);
      row(10, 24, 3, 2);
    }

    // Pinchos en el suelo, salvo en la entrada y en la sala del guardián
    if (room.i !== 0 && !room.boss && Math.random() < 0.3) {
      const x0 = rnd(3, RW - 6);
      for (let x = x0; x < x0 + 2; x++) {
        if (t[RH - 2][x] === 0) t[RH - 2][x] = 3;
      }
    }
    return t;
  }

  // Posiciones donde se puede estar de pie: aire con suelo debajo
  function groundSpots(t) {
    const spots = [];
    for (let y = 0; y < RH - 1; y++) {
      for (let x = 0; x < RW; x++) {
        if (t[y][x] === 0 && (t[y + 1][x] === 1 || t[y + 1][x] === 2)) spots.push({ x, y });
      }
    }
    return spots;
  }

  // Objeto de un bloque. Los poderes van en un altar central; las llaves, en cualquier sitio.
  function populateItem(room, item) {
    const inner = groundSpots(room.tiles).filter((s) => s.x >= 3 && s.x <= RW - 4);
    if (!inner.length) return;
    const s = item === 'key' ? pick(inner) : inner.reduce((best, p) => (Math.abs(p.x - 15) < Math.abs(best.x - 15) ? p : best));
    room.pickup = { item, x: s.x * TS + 4, y: (s.y + 1) * TS - 34, w: 24, h: 24 };
    if (item === 'key') {
      // La llave tiene un centinela: un enemigo más resistente que los normales
      const g = pick(inner.filter((p) => Math.abs(p.x - s.x) > 5).concat(inner));
      room.enemies.push({
        type: 'crawler', sentinel: true, x: g.x * TS, y: (g.y + 1) * TS - 30, w: 34, h: 30,
        vx: 0, vy: 0, hp: 4, dmg: 1, face: -1, hurt: 0, dead: false,
        hitWall: false, onGround: false, bounded: true,
      });
    }
  }

  function populateRoom(room) {
    const spots = groundSpots(room.tiles);
    // Anclajes para el gancho: puntos en el aire donde engancharse
    for (let i = 0; i < 2; i++) {
      const ax = rnd(3, RW - 4);
      const ay = rnd(2, 10);
      if (room.tiles[ay][ax] === 0) room.anchors.push({ x: ax * TS + 16, y: ay * TS + 16 });
    }
    const inner = spots.filter((s) => s.x >= 3 && s.x <= RW - 4);

    if (room.boss) {
      const s = spots.reduce((best, p) => (Math.abs(p.x - 15) < Math.abs(best.x - 15) ? p : best));
      room.enemies.push({
        type: 'boss', x: s.x * TS + 4, y: (s.y + 1) * TS - 64, w: 56, h: 64,
        vx: 0, vy: 0, hp: 10, maxHp: 10, dmg: 1, face: -1, state: 'wait', timer: 80,
        leapT: 0, hurt: 0, dead: false, onGround: false, hitWall: false, bounded: true,
      });
      // Escalera de salida: sólo se activa tras vencer al guardián
      const e = pick(spots.filter((p) => p.x >= 3 && p.x <= RW - 4 && Math.abs(p.x - 15) > 6));
      room.exit = { x: e.x * TS + 4, y: (e.y + 1) * TS - 32, w: 24, h: 32 };
      // Punto de guardado junto a la entrada de la sala del guardián
      const sv = spots.find((p) => p.x >= 3 && p.x <= 6) || spots[0];
      room.save = { x: sv.x * TS + 2, y: (sv.y + 1) * TS - 28, w: 28, h: 28 };
    } else if (room.i !== 0) {
      // Más enemigos y más resistentes según avanzas de bloque
      const count = rnd(1, 2) + (room.block >= 2 ? 1 : 0);
      for (let n = 0; n < count; n++) {
        if (Math.random() < 0.3) {
          const y = rnd(2, 11);
          const x = rnd(2, RW - 4);
          room.enemies.push({
            type: 'bat', x: x * TS, y: y * TS, w: 22, h: 16, vx: 0, vy: 0,
            hp: 1, dmg: 1, face: Math.random() < 0.5 ? 1 : -1, base: y * TS, t: rnd(0, 60),
            hurt: 0, dead: false, hitWall: false, bounded: true,
          });
        } else if (inner.length) {
          const s = pick(inner);
          room.enemies.push({
            type: 'crawler', x: s.x * TS + 3, y: (s.y + 1) * TS - 22, w: 26, h: 22, vx: 0, vy: 0,
            hp: room.block >= 3 ? 3 : 2, dmg: 1, face: Math.random() < 0.5 ? 1 : -1, hurt: 0, dead: false,
            hitWall: false, onGround: false, bounded: true,
          });
        }
      }
      if (inner.length && Math.random() < 0.15) {
        const s = pick(inner);
        room.save = { x: s.x * TS + 2, y: (s.y + 1) * TS - 28, w: 28, h: 28 };
      }
    }
  }

  // ---------- Estado de juego ----------
  let world = null;
  let player = null;
  let keys = {};
  let pressed = {};
  let frame = 0;
  let msgs = [];          // cola de avisos pequeños
  let big = null;         // aviso grande centrado: { title, text, color, t }
  let particles = [];
  let mapOpen = false;
  let ended = null;       // { floor, name } cuando se acaba el juego
  let canvas = null;
  let ctx = null;
  let minimap = null;
  let started = false;    // false mientras se ve la pantalla de inicio

  const curRoom = () => world.rooms[world.cur];
  const held = (ab) => !!player.abil[ab];

  // Una salida se puede cruzar si la puerta está abierta y se cruza desde el lado permitido
  function passageOpen(r, dir) {
    const e = r.conn[dir];
    if (!e) return false;
    if (e.src !== undefined && e.src !== r.i) return false;
    if (e.need === 'secret') return !!e.revealed;
    if (e.need === 'key') return e.opened;
    if (e.need) return held(e.need);
    return true;
  }

  // Casilla en coordenadas de sala. Fuera de la sala, lo que hay depende de la puerta.
  function tileAt(tx, ty) {
    const r = curRoom();
    if (tx < 0) return passageOpen(r, 'l') ? 0 : 1;
    if (tx >= RW) return passageOpen(r, 'r') ? 0 : 1;
    if (ty < 0) return passageOpen(r, 'u') ? 0 : 1;
    if (ty >= RH) return passageOpen(r, 'd') ? 0 : 1;
    return r.tiles[ty][tx];
  }

  function overlapsTiles(x, y, w, h, kinds) {
    const x0 = Math.floor(x / TS);
    const x1 = Math.floor((x + w - 0.01) / TS);
    const y0 = Math.floor(y / TS);
    const y1 = Math.floor((y + h - 0.01) / TS);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (kinds.includes(tileAt(tx, ty))) return true;
      }
    }
    return false;
  }

  // Movimiento horizontal con colisión contra sólidos
  function moveX(e) {
    e.hitWall = false;
    e.x += e.vx;
    if (e.bounded && (e.x < 0 || e.x + e.w > W)) {
      e.x = Math.max(0, Math.min(W - e.w, e.x));
      e.hitWall = true;
      return;
    }
    if (overlapsTiles(e.x, e.y, e.w, e.h, [1])) {
      if (e.vx > 0) {
        const tx = Math.floor((e.x + e.w - 0.01) / TS);
        e.x = tx * TS - e.w;
      } else {
        const tx = Math.floor(e.x / TS);
        e.x = (tx + 1) * TS;
      }
      e.hitWall = true;
      e.vx = 0;
    }
  }

  // Movimiento vertical: aterriza en sólidos y en plataformas de un sentido
  function moveY(e) {
    e.prevBottom = e.y + e.h;
    e.y += e.vy;
    e.onGround = false;
    if (e.vy >= 0) {
      const ty = Math.floor((e.y + e.h - 0.01) / TS);
      const solid = overlapsTiles(e.x, e.y, e.w, e.h, [1]);
      const thin = !solid && e.prevBottom <= ty * TS + 1 && overlapsTiles(e.x, e.y, e.w, e.h, [2]);
      if (solid || thin) {
        e.y = ty * TS - e.h;
        e.vy = 0;
        e.onGround = true;
      }
    } else if (overlapsTiles(e.x, e.y, e.w, e.h, [1])) {
      e.y = (Math.floor(e.y / TS) + 1) * TS;
      e.vy = 0;
    }
  }

  // Pared a la izquierda (-1) o a la derecha (1) del personaje, 0 si no hay
  function wallSide(p) {
    if (overlapsTiles(p.x - 2, p.y + 6, 2, p.h - 12, [1])) return -1;
    if (overlapsTiles(p.x + p.w, p.y + 6, 2, p.h - 12, [1])) return 1;
    return 0;
  }

  function burst(x, y, color, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 3;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 1, color });
    }
  }

  // Aviso pequeño en la cola. No repite un texto que ya está visible.
  function notify(text, color = '#f2ece0') {
    if (msgs.some((m) => m.text === text)) return;
    msgs.push({ text, color, t: 200 });
    if (msgs.length > 4) msgs.shift();
  }

  // Marcador en la sala actual: se ve en el mapa para volver a ella
  function toggleMarker() {
    const i = world.cur;
    if (world.markers.has(i)) {
      world.markers.delete(i);
      notify('Marcador quitado de esta sala.', '#8fdcff');
    } else {
      world.markers.add(i);
      notify('Marcador puesto en esta sala.', '#8fdcff');
    }
  }

  // Aviso grande centrado para hitos: zonas, guardianes, habilidades y el final
  function bigAlert(title, text, color = '#ffc86a') {
    big = { title, text, color, t: 260 };
  }

  // ---------- Partida ----------
  function newGame() {
    world = genWorld();
    world.markers = new Set();
    const start = groundSpots(world.rooms[0].tiles).reduce((best, p) =>
      (Math.abs(p.x - 8) < Math.abs(best.x - 8) ? p : best));
    player = {
      x: start.x * TS + 6, y: (start.y + 1) * TS - 28, w: 20, h: 28,
      vx: 0, vy: 0, face: 1, onGround: false, prevBottom: 0,
      coyote: 0, jumpBuf: 0, jumpsLeft: 0,
      hp: 6, maxHp: 6, iframes: 0, dashT: 0, dashCD: 0, atkT: 0, hits: new Set(),
      abil: { dash: true, djump: true, gancho: true }, keys: 0,
      hookT: 0, hookCD: 0, hookTarget: null, wallCD: 0,
      respawn: { room: 0, x: start.x * TS + 6, y: (start.y + 1) * TS - 28 },
      dead: false, respawnT: 0,
    };
    particles = [];
    msgs = [];
    big = null;
    mapOpen = false;
    ended = null;
    onEnterRoom(curRoom());
    bigAlert('AVENTURA', 'Tienes todas tus habilidades. Consigue las llaves y vence al guardián.');
  }

  // Novedades al entrar en una sala: zona nueva, santuario, centinela y guardián
  function onEnterRoom(r) {
    r.explored = true;
    if (r.pickup && r.pickup.item !== 'key' && !r.shrineShown) {
      r.shrineShown = true;
      bigAlert('SANTUARIO', `Un poder antiguo espera aquí: ${ABILITIES[r.pickup.item].name}.`, ABILITIES[r.pickup.item].color);
    }
    if (!r.announced && r.enemies.some((e) => e.sentinel && !e.dead)) {
      r.announced = true;
      notify('Un centinela guarda la llave de esta sala.', '#d9a441');
    }
    if (r.block !== world.lastBlock) {
      world.lastBlock = r.block;
      bigAlert(BIOMES[biomeOfRoom(r)], `Zona ${r.block + 1} de ${BLOCKS}`);
    }
    if (r.boss && !world.bossIntro) {
      world.bossIntro = true;
      bigAlert('¡GUARDIÁN!', 'La escalera de salida se abrirá al vencerlo', '#ff4d6d');
    }
  }

  function hurtPlayer(dmg, src) {
    if (player.iframes > 0 || player.dashT > 0 || player.dead) return;
    player.hp -= dmg;
    player.iframes = IFRAMES;
    player.vx = (player.x < src.x ? -1 : 1) * 6;
    player.vy = -6;
    burst(player.x + player.w / 2, player.y + player.h / 2, '#ff6b6b', 8);
    if (player.hp <= 0) {
      player.hp = 0;
      player.dead = true;
      player.respawnT = RESPAWN_FRAMES;
      notify('Has caído. Despertarás en el último punto de guardado.', '#ff6b6b');
    } else {
      notify(`Te golpean: -${dmg} corazón${dmg > 1 ? 'es' : ''}.`, '#ff6b6b');
    }
  }

  function killEnemy(e) {
    e.dead = true;
    burst(e.x + e.w / 2, e.y + e.h / 2, e.type === 'boss' ? '#ff4d6d' : '#c8ff9a', e.type === 'boss' ? 40 : 14);
    if (e.type === 'boss') {
      world.bossDown = true;
      bigAlert('GUARDIÁN CAÍDO', 'La escalera de salida se ha abierto', '#7fd67f');
    }
    const r = curRoom();
    if (r.enemies.every((x) => x.dead)) r.cleared = true;
  }

  function updateBoss(e) {
    e.timer--;
    e.vy = Math.min(e.vy + GRAV, MAX_FALL);
    if (e.state === 'wait') {
      if (e.timer === 14) notify('El guardián se prepara. Salta o esquiva.', '#ff4d6d');
      e.vx = 0;
      if (e.timer <= 0) {
        e.face = player.x < e.x ? -1 : 1;
        if (Math.random() < 0.5) {
          e.state = 'charge';
          e.timer = 70;
        } else {
          e.state = 'leap';
          e.leapT = 0;
          e.vy = -12;
          e.vx = e.face * 3.5;
        }
      }
    } else if (e.state === 'charge') {
      e.vx = e.face * 6.5;
      if (e.hitWall || e.timer <= 0) {
        e.state = 'wait';
        e.timer = 60;
        e.vx = 0;
      }
    } else if (e.state === 'leap') {
      e.leapT++;
      if (e.onGround && e.leapT > 10) {
        burst(e.x + e.w / 2, e.y + e.h, '#d8c8a8', 12);
        e.state = 'wait';
        e.timer = 60;
        e.vx = 0;
      }
    }
    moveX(e);
    if (e.hitWall && e.state === 'charge') e.face *= -1;
    moveY(e);
    if (!e.halfWarned && e.hp <= e.maxHp / 2) {
      e.halfWarned = true;
      notify('El guardián está herido. Sigue atacando.', '#ff4d6d');
    }
  }

  function updateEnemies() {
    const r = curRoom();
    r.enemies.forEach((e) => {
      if (e.dead) return;
      if (e.hurt > 0) e.hurt--;

      if (e.type === 'crawler') {
        e.vx = e.face * 0.9;
        e.vy = Math.min(e.vy + GRAV, MAX_FALL);
        moveX(e);
        if (e.hitWall) e.face *= -1;
        const ahead = Math.floor((e.face > 0 ? e.x + e.w + 2 : e.x - 2) / TS);
        const foot = Math.floor((e.y + e.h + 4) / TS);
        const floor = tileAt(ahead, foot);
        if (floor !== 1 && floor !== 2) e.face *= -1;
        moveY(e);
      } else if (e.type === 'bat') {
        e.t++;
        e.vx = e.face * 1.3;
        moveX(e);
        if (e.hitWall) e.face *= -1;
        e.y = e.base + Math.sin(e.t * 0.05) * 36;
      } else if (e.type === 'boss') {
        updateBoss(e);
      }

      if (e.y > H + 40) {
        e.dead = true;
        return;
      }
      if (overlaps(player, e)) hurtPlayer(e.dmg, e);
    });
  }

  // Avisos al tocar una puerta cerrada. La llave se gasta al primer contacto.
  function checkDoors(r) {
    const p = player;
    const touch = { l: p.x < 4, r: p.x + p.w > W - 4, u: p.y < 4, d: p.y + p.h > H - 4 };
    ['l', 'r', 'u', 'd'].forEach((dir) => {
      const e = r.conn[dir];
      if (!e || !touch[dir] || passageOpen(r, dir)) return;
      if (e.src !== undefined && e.src !== r.i) {
        notify('Esta puerta solo se abre desde el otro lado.', '#ff9a6a');
      } else if (e.need === 'secret') {
        if (pressed.interact) {
          e.revealed = true;
          notify('¡Pasadizo secreto revelado!', '#ffc86a');
          burst(W / 2, H / 2, '#ffc86a', 24);
        } else {
          notify('Grieta en el muro: pulsa E para derribarla.', '#ffc86a');
        }
      } else if (e.need === 'key') {
        if (p.keys > 0) {
          p.keys--;
          e.opened = true;
          notify('Llave usada: la puerta se abre.', '#ffd23f');
        } else {
          notify('Puerta cerrada. Necesitas una llave.', '#ffd23f');
        }
      } else if (e.need) {
        notify(`Puerta sellada. Necesitas ${ABILITIES[e.need].name}.`, ABILITIES[e.need].color);
      }
    });
  }

  function updatePlayer() {
    const p = player;
    if (p.iframes > 0) p.iframes--;
    if (p.dashCD > 0) p.dashCD--;
    if (p.hookCD > 0) p.hookCD--;

    // Movimiento horizontal con aceleración y freno
    if (p.hookT > 0) {
      // Gancho: el personaje vuela hacia el anclaje
      p.hookT--;
      const tx = p.hookTarget.x - (p.x + p.w / 2);
      const ty = p.hookTarget.y - (p.y + p.h / 2);
      const d = Math.hypot(tx, ty) || 1;
      if (d < 14) {
        p.hookT = 0;
        p.vx = 0;
        p.vy = 0;
      } else {
        p.vx = (tx / d) * 10;
        p.vy = (ty / d) * 10;
      }
    } else if (p.dashT > 0) {
      p.dashT--;
      p.vx = p.face * DASH_V;
      p.vy = 0;
    } else {
      if (keys.right) {
        p.vx = Math.min(RUN_MAX, p.vx + (p.vx < 0 ? RUN_ACC * 2 : RUN_ACC));
        p.face = 1;
      } else if (keys.left) {
        p.vx = Math.max(-RUN_MAX, p.vx - (p.vx > 0 ? RUN_ACC * 2 : RUN_ACC));
        p.face = -1;
      } else {
        p.vx *= 0.6;
        if (Math.abs(p.vx) < 0.1) p.vx = 0;
      }
      p.vy = Math.min(p.vy + GRAV, MAX_FALL);
    }

    // Deslizarse por una pared al caer, si mantienes la dirección hacia ella
    if (!p.onGround && p.vy > 0 && p.dashT <= 0 && p.hookT <= 0 && (keys.left || keys.right) && wallSide(p) !== 0) {
      p.vy = Math.min(p.vy, 2.5);
    }

    // Salto con margen de caída y memoria de la pulsación
    if (p.onGround) {
      p.coyote = COYOTE;
      p.jumpsLeft = held('djump') ? 1 : 0;
    } else {
      p.coyote--;
    }
    p.jumpBuf = pressed.jump ? BUFFER : p.jumpBuf - 1;
    if (p.jumpBuf > 0) {
      if (p.coyote > 0) {
        p.vy = JUMP_V;
        p.coyote = 0;
        p.jumpBuf = 0;
      } else if (held('djump') && p.jumpsLeft > 0) {
        p.vy = DJUMP_V;
        p.jumpsLeft--;
        p.jumpBuf = 0;
        burst(p.x + p.w / 2, p.y + p.h, '#b07cff', 10);
      }
    }
    // Salto de pared: en el aire, pegado a una pared, saltas en sentido contrario
    if (p.wallCD > 0) p.wallCD--;
    if (p.jumpBuf > 0 && !p.onGround && p.wallCD <= 0) {
      const side = wallSide(p);
      if (side !== 0) {
        p.vx = -side * 7;
        p.vy = JUMP_V * 0.9;
        p.face = -side;
        p.jumpBuf = 0;
        p.wallCD = 12;
        p.jumpsLeft = held('djump') ? 1 : 0;
        burst(p.x + (side < 0 ? 0 : p.w), p.y + p.h / 2, '#ffffff', 8);
      }
    }
    if (!keys.jump && p.vy < JUMP_CUT && p.dashT <= 0 && p.hookT <= 0) p.vy = JUMP_CUT;

    // Dash: sin gravedad y con invulnerabilidad breve
    if (pressed.dash && held('dash') && p.dashCD <= 0 && p.dashT <= 0) {
      p.dashT = DASH_FRAMES;
      p.dashCD = DASH_CD;
      p.iframes = Math.max(p.iframes, DASH_FRAMES);
      burst(p.x + p.w / 2, p.y + p.h / 2, '#7fd6ff', 12);
    }

    // Gancho: se engancha al anclaje más cercano dentro del alcance
    if (pressed.hook && held('gancho') && p.hookCD <= 0 && p.hookT <= 0) {
      const cands = (curRoom().anchors || [])
        .map((a) => ({ a, d: Math.hypot(a.x - (p.x + p.w / 2), a.y - (p.y + p.h / 2)) }))
        .filter((c) => c.d <= HOOK_RANGE)
        .sort((u, v) => u.d - v.d);
      if (cands.length) {
        p.hookTarget = cands[0].a;
        p.hookT = HOOK_FRAMES;
        p.hookCD = 20;
        burst(cands[0].a.x, cands[0].a.y, '#ffb347', 10);
      } else {
        notify('No hay anclaje cerca.', '#ffb347');
      }
    }

    // Ataque cuerpo a cuerpo
    if (pressed.attack && p.atkT <= 0) {
      p.atkT = ATK_FRAMES;
      p.hits = new Set();
    }
    if (p.atkT > 0) {
      const f = ATK_FRAMES - p.atkT;
      p.atkT--;
      if (f >= 3 && f <= 10) {
        const hb = { x: p.face > 0 ? p.x + p.w : p.x - 34, y: p.y + 4, w: 34, h: p.h - 8 };
        curRoom().enemies.forEach((e) => {
          if (e.dead || p.hits.has(e) || !overlaps(hb, e)) return;
          e.hp--;
          e.hurt = 10;
          p.hits.add(e);
          if (e.type !== 'boss') e.x += p.face * 10;
          burst(e.x + e.w / 2, e.y + e.h / 2, '#ffffff', 6);
          if (e.hp <= 0) killEnemy(e);
        });
      }
    }

    moveX(p);
    moveY(p);

    // Pinchos
    if (overlapsTiles(p.x, p.y, p.w, p.h, [3]) && p.iframes <= 0) {
      p.hp = Math.max(0, p.hp - 1);
      p.iframes = IFRAMES;
      p.vy = -7;
      if (p.hp <= 0) {
        p.dead = true;
        p.respawnT = RESPAWN_FRAMES;
        notify('Has caído en los pinchos.', '#ff6b6b');
      } else {
        notify('Pinchos: -1 corazón.', '#ff6b6b');
      }
    }

    // Cambio de sala al cruzar un borde abierto
    if (p.x + p.w / 2 < 0) enterRoom('l');
    else if (p.x + p.w / 2 > W) enterRoom('r');
    else if (p.y + p.h / 2 < 0) enterRoom('u');
    else if (p.y + p.h / 2 > H) enterRoom('d');

    checkDoors(curRoom());

    // Red de seguridad: si algo deja al jugador fuera del mapa, vuelve al último guardado
    if (p.y > H + 150 || p.x < -150 || p.x > W + 150) {
      p.dead = true;
      p.respawnT = 1;
      notify('Te has salido del mapa. Vuelves al último guardado.', '#ff6b6b');
    }

    // Objetos, guardado y salida
    const r = curRoom();
    if (r.pickup && overlaps(p, r.pickup)) collectItem(r);
    if (pressed.interact && r.save && overlaps({ x: p.x - 16, y: p.y - 16, w: p.w + 32, h: p.h + 32 }, r.save)) {
      p.hp = p.maxHp;
      p.respawn = { room: world.cur, x: p.x, y: p.y };
      notify('Punto de guardado: corazones restaurados.', '#8fdcff');
      burst(r.save.x + 14, r.save.y + 14, '#8fdcff', 20);
    }
    if (r.exit && world.bossDown && overlaps(p, r.exit)) endGame();
  }

  function collectItem(r) {
    const it = r.pickup;
    if (it.item === 'key') {
      player.keys++;
      notify('Llave encontrada. Sirve para la puerta del siguiente bloque.', '#ffd23f');
    } else {
      player.abil[it.item] = true;
      bigAlert(`Nueva habilidad: ${ABILITIES[it.item].name}`, ABILITIES[it.item].hint, ABILITIES[it.item].color);
    }
    burst(it.x + 12, it.y + 12, it.item === 'key' ? '#ffd23f' : ABILITIES[it.item].color, 24);
    r.pickup = null;
  }

  // Final: llegar a otro piso aleatorio acaba el juego
  function endGame() {
    if (ended) return;
    const floor = rnd(2, 9);
    ended = { floor, name: `${pick(FLOOR_A)} ${pick(FLOOR_B)}` };
    bigAlert('FIN DE LA AVENTURA', `Desciendes al piso ${ended.floor}: ${ended.name}. Pulsa R o Nueva partida para volver a jugar.`, '#7fd67f');
  }

  // Cambio de sala. Entras por el lado opuesto de la salida.
  function enterRoom(dir) {
    const r = curRoom();
    const e = r.conn[dir];
    if (!e || !passageOpen(r, dir)) {
      if (dir === 'l') player.x = 0;
      if (dir === 'r') player.x = W - player.w;
      if (dir === 'u') player.y = 0;
      if (dir === 'd') player.y = H - player.h;
      return;
    }
    const ni = e.a === r.i ? e.b : e.a;
    world.cur = ni;
    const nr = world.rooms[ni];
    if (dir === 'l') player.x = W - player.w - 4;
    if (dir === 'r') player.x = 4;
    if (dir === 'u') player.y = H - player.h - 4;
    if (dir === 'd') player.y = 4;
    if (dir === 'l' || dir === 'r') player.y = Math.max(0, Math.min(H - player.h, player.y));
    if (dir === 'u' || dir === 'd') player.x = Math.max(0, Math.min(W - player.w, player.x));
    player.hits = new Set();
    player.atkT = 0;
    onEnterRoom(nr);
  }

  function step() {
    frame++;
    if (msgs.length) msgs.forEach((m) => (m.t -= 1));
    msgs = msgs.filter((m) => m.t > 0);
    if (big) {
      big.t -= 1;
      if (big.t <= 0) big = null;
    }
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08;
      p.life -= 0.035;
    });
    particles = particles.filter((p) => p.life > 0);

    if (ended) {
      pressed = {};
      return;
    }

    if (player.dead) {
      player.respawnT--;
      if (player.respawnT <= 0) {
        world.cur = player.respawn.room;
        player.x = player.respawn.x;
        player.y = player.respawn.y;
        player.hp = player.maxHp;
        player.dead = false;
        player.iframes = IFRAMES;
        player.vx = 0;
        player.vy = 0;
        player.dashT = 0;
        player.hookT = 0;
        player.atkT = 0;
        curRoom().explored = true;
        notify('Despiertas en el último punto de guardado.', '#8fdcff');
      }
    } else {
      updatePlayer();
      updateEnemies();
    }
    pressed = {};
  }

  // ---------- Dibujo de la sala ----------
  function drawBackground(r) {
    const pal = PALETTES[biomeOfRoom(r)];
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, pal.sky[0]);
    g.addColorStop(1, pal.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Paralaje: el fondo se mueve menos que el jugador
    const camShift = player.x + player.w / 2 - W / 2;

    ctx.fillStyle = pal.far;
    r.bg.far.forEach((b) => {
      const x = (((b.x - camShift * 0.08) % W) + W) % W;
      [x - W, x].forEach((xx) => {
        ctx.fillRect(xx, H - b.h, b.w, b.h);
        ctx.beginPath();
        ctx.moveTo(xx - 6, H - b.h);
        ctx.lineTo(xx + b.w / 2, H - b.h - 30);
        ctx.lineTo(xx + b.w + 6, H - b.h);
        ctx.fill();
      });
    });

    drawTheme(r, camShift);
    r.bg.mid.forEach((c) => {
      const x = (((c.x - camShift * 0.2) % W) + W) % W;
      [x - W, x].forEach((xx) => {
        ctx.fillStyle = pal.mid;
        ctx.fillRect(xx, H - c.h, c.w, c.h);
        ctx.fillStyle = pal.wallHi;
        ctx.globalAlpha = 0.25;
        ctx.fillRect(xx, H - c.h, 3, c.h);
        ctx.globalAlpha = 1;
      });
    });
  }

  // Fondo temático por bloque: cada zona tiene su propio paisaje en parallax
  const THEMES = ['bosque', 'cripta', 'ruinas', 'mina', 'fortaleza', 'trono'];
  function drawTheme(r, camShift) {
    const theme = THEMES[r.block];
    const off = (k) => -camShift * k;
    ctx.save();
    if (theme === 'bosque') {
      // Troncos y copas redondas
      for (let i = 0; i < 9; i++) {
        const x = ((i * 130 + off(0.15)) % W + W) % W;
        ctx.fillStyle = '#0c2216';
        ctx.fillRect(x, H - 230 - (i % 3) * 30, 14, 230 + (i % 3) * 30);
        ctx.beginPath();
        ctx.arc(x + 7, H - 240 - (i % 3) * 30, 46, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (theme === 'cripta') {
      // Arcos góticos y lápidas con velas parpadeantes
      for (let i = 0; i < 6; i++) {
        const x = ((i * 170 + off(0.15)) % W + W) % W;
        ctx.fillStyle = '#1c1430';
        ctx.fillRect(x, 120, 16, H - 120);
        ctx.fillRect(x + 60, 120, 16, H - 120);
        ctx.beginPath();
        ctx.moveTo(x, 120);
        ctx.quadraticCurveTo(x + 38, 40, x + 76, 120);
        ctx.lineWidth = 16;
        ctx.strokeStyle = '#1c1430';
        ctx.stroke();
        ctx.lineWidth = 1;
        const flick = 0.6 + 0.4 * Math.sin(frame * 0.2 + i);
        ctx.fillStyle = `rgba(255,190,90,${flick})`;
        ctx.beginPath();
        ctx.arc(x + 38, 150, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (theme === 'ruinas') {
      // Columnas rotas y dunas de arena
      ctx.fillStyle = '#4a3a22';
      for (let i = 0; i < 6; i++) {
        const x = ((i * 170 + off(0.15)) % W + W) % W;
        ctx.fillRect(x, H - 300 + (i % 2) * 40, 26, 300 - (i % 2) * 40);
        ctx.fillRect(x - 6, H - 300 + (i % 2) * 40, 38, 10);
      }
      ctx.fillStyle = '#6a5230';
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 40) ctx.lineTo(x, H - 40 - 30 * Math.sin((x + off(0.3)) / 120));
      ctx.lineTo(W, H);
      ctx.fill();
    } else if (theme === 'mina') {
      // Cadenas colgantes y cristales
      for (let i = 0; i < 8; i++) {
        const x = ((i * 125 + off(0.15)) % W + W) % W;
        ctx.strokeStyle = '#3d3d4a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 60 + (i % 4) * 40);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = 'rgba(160,220,255,0.35)';
        ctx.beginPath();
        ctx.moveTo(x - 8, 80 + (i % 4) * 40);
        ctx.lineTo(x, 120 + (i % 4) * 40);
        ctx.lineTo(x + 8, 80 + (i % 4) * 40);
        ctx.fill();
      }
    } else if (theme === 'fortaleza') {
      // Almenas y estandartes rojos
      ctx.fillStyle = '#2a1414';
      for (let x = -20; x < W + 20; x += 40) ctx.fillRect(((x + off(0.12)) % W + W) % W, H - 380, 26, 40);
      for (let i = 0; i < 5; i++) {
        const x = ((i * 200 + off(0.12)) % W + W) % W;
        ctx.fillStyle = '#7a1c1c';
        ctx.fillRect(x, 60, 40, 150);
        ctx.fillStyle = '#c9a03a';
        ctx.fillRect(x + 16, 60, 8, 150);
      }
    } else if (theme === 'trono') {
      // Resplandor de lava y el trono al fondo
      const glow = ctx.createRadialGradient(W / 2, H, 20, W / 2, H, W * 0.6);
      glow.addColorStop(0, 'rgba(255,90,40,0.35)');
      glow.addColorStop(1, 'rgba(255,90,40,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#1a0a0a';
      const tx = ((W / 2 + off(0.1)) % W + W) % W;
      ctx.fillRect(tx - 40, H - 260, 80, 260);
      ctx.fillRect(tx - 60, H - 300, 14, 300);
      ctx.fillRect(tx + 46, H - 300, 14, 300);
    }
    ctx.restore();
  }

  function drawTiles(r) {
    const pal = PALETTES[biomeOfRoom(r)];
    for (let ty = 0; ty < RH; ty++) {
      for (let tx = 0; tx < RW; tx++) {
        const v = r.tiles[ty][tx];
        if (v === 0) continue;
        const x = tx * TS;
        const y = ty * TS;
        if (v === 1) {
          ctx.fillStyle = pal.wall;
          ctx.fillRect(x, y, TS, TS);
          if (ty > 0 && r.tiles[ty - 1][tx] === 0) {
            ctx.fillStyle = pal.wallHi;
            ctx.fillRect(x, y, TS, 4);
          }
          if (ty < RH - 1 && r.tiles[ty + 1][tx] === 0) {
            ctx.fillStyle = pal.wallLo;
            ctx.fillRect(x, y + TS - 3, TS, 3);
          }
          ctx.fillStyle = pal.wallLo;
          ctx.globalAlpha = 0.6;
          ctx.fillRect(x, y + (ty % 2 ? 0 : TS / 2), TS, 1);
          ctx.fillRect(x + (tx % 2 ? TS / 2 : 0), y + (ty % 2 ? 0 : TS / 2), 1, TS / 2);
          ctx.globalAlpha = 1;
        } else if (v === 2) {
          ctx.fillStyle = '#6b4a2b';
          ctx.fillRect(x, y, TS, 8);
          ctx.fillStyle = '#9a7046';
          ctx.fillRect(x, y, TS, 2);
        } else if (v === 3) {
          ctx.fillStyle = '#5a4a4a';
          ctx.fillRect(x, y + TS - 4, TS, 4);
          ctx.fillStyle = '#d8d8e6';
          for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(x + i * 8, y + TS - 4);
            ctx.lineTo(x + i * 8 + 4, y + TS - 16);
            ctx.lineTo(x + i * 8 + 8, y + TS - 4);
            ctx.fill();
          }
        }
      }
    }
  }

  // Puertas: cerradas en color de su requisito, abiertas con flecha si son de un sentido
  function drawDoors(r) {
    const spans = {
      l: { x: 0, y: GAP_Y[0] * TS, w: TS, h: GAP_Y.length * TS },
      r: { x: W - TS, y: GAP_Y[0] * TS, w: TS, h: GAP_Y.length * TS },
      u: { x: GAP_X[0] * TS, y: 0, w: GAP_X.length * TS, h: TS },
      d: { x: GAP_X[0] * TS, y: H - TS, w: GAP_X.length * TS, h: TS },
    };
    ['l', 'r', 'u', 'd'].forEach((dir) => {
      const e = r.conn[dir];
      if (!e) return;
      const s = spans[dir];
      const open = passageOpen(r, dir);
      const requirement = e.need === 'key' ? '#ffd23f'
        : e.need === 'secret' ? '#8a7a6a'
          : e.need ? ABILITIES[e.need].color : null;
      if (!open) {
        const color = requirement || '#ff9a6a';
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.28 + 0.1 * Math.sin(frame * 0.1);
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(s.x + 1, s.y + 1, s.w - 2, s.h - 2);
        if (e.need === 'key') drawKeyIcon(s.x + s.w / 2, s.y + s.h / 2, color);
      } else if (e.src !== undefined) {
        // Puerta de un sentido abierta: flecha que indica el sentido de paso
        const forward = e.src === r.i;
        const cx = s.x + s.w / 2;
        const cy = s.y + s.h / 2;
        const pointX = dir === 'l' ? (forward ? -1 : 1) : dir === 'r' ? (forward ? 1 : -1) : 0;
        const pointY = dir === 'u' ? (forward ? -1 : 1) : dir === 'd' ? (forward ? 1 : -1) : 0;
        ctx.fillStyle = '#ff9a6a';
        ctx.beginPath();
        ctx.moveTo(cx + pointX * 10, cy + pointY * 10);
        ctx.lineTo(cx - pointY * 6 - pointX * 4, cy + pointX * 6 - pointY * 4);
        ctx.lineTo(cx + pointY * 6 - pointX * 4, cy - pointX * 6 - pointY * 4);
        ctx.fill();
      }
    });
  }

  function drawKeyIcon(x, y, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x - 6, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x, y - 2, 12, 4);
    ctx.fillRect(x + 8, y, 3, 5);
  }

  function drawSave(r) {
    if (!r.save) return;
    const s = r.save;
    const pulse = 10 + Math.sin(frame * 0.08) * 2;
    ctx.fillStyle = '#8fdcff';
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(s.x + 14, s.y + 14, pulse + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#44556a';
    ctx.fillRect(s.x + 4, s.y + 18, 20, 10);
    ctx.fillStyle = '#8fdcff';
    ctx.beginPath();
    ctx.arc(s.x + 14, s.y + 12, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawExit(r) {
    if (!r.exit) return;
    const x = r.exit.x;
    const y = r.exit.y;
    const active = world.bossDown;
    ctx.fillStyle = active ? '#3a3a2a' : '#1e1e26';
    ctx.fillRect(x, y, 24, 32);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = active ? '#ffd23f' : '#4a4a58';
      ctx.fillRect(x + i * 5, y + 4 + i * 6, 24 - i * 5, 4);
    }
    if (active) {
      ctx.fillStyle = '#ffd23f';
      ctx.globalAlpha = 0.2 + 0.15 * Math.sin(frame * 0.12);
      ctx.fillRect(x - 6, y - 6, 36, 44);
      ctx.globalAlpha = 1;
    }
  }

  function drawPickup(r) {
    if (!r.pickup) return;
    const p = r.pickup;
    const isKey = p.item === 'key';
    const color = isKey ? '#ffd23f' : ABILITIES[p.item].color;
    const cx = p.x + 12;
    const cy = p.y + 12 + Math.sin(frame * 0.1) * 3;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (isKey) {
      drawKeyIcon(cx - 2, cy, color);
    } else {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 12);
      ctx.lineTo(cx + 10, cy);
      ctx.lineTo(cx, cy + 12);
      ctx.lineTo(cx - 10, cy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function shadow(e, scale) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(e.x + e.w / 2, e.y + e.h + 2, e.w * scale, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCrawler(e) {
    shadow(e, 0.6);
    const wig = Math.sin(frame * 0.3 + e.x) * 2;
    ctx.fillStyle = e.hurt > 0 ? '#ffffff' : e.sentinel ? '#d9a441' : '#7ed957';
    ctx.beginPath();
    ctx.ellipse(e.x + e.w / 2, e.y + e.h / 2, e.w / 2, e.h / 2 - 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2f6b25';
    ctx.fillRect(e.x + 4, e.y + e.h - 4, 4, 4 + wig);
    ctx.fillRect(e.x + e.w - 8, e.y + e.h - 4, 4, 4 - wig);
    ctx.fillStyle = '#101010';
    const ex = e.face > 0 ? e.x + e.w - 9 : e.x + 5;
    ctx.fillRect(ex, e.y + 6, 4, 5);
  }

  function drawBat(e) {
    const flap = Math.sin(frame * 0.4) * 6;
    ctx.fillStyle = e.hurt > 0 ? '#ffffff' : '#5b4a86';
    ctx.beginPath();
    ctx.moveTo(e.x + e.w / 2, e.y + e.h / 2);
    ctx.lineTo(e.x - 6, e.y - flap);
    ctx.lineTo(e.x + 2, e.y + e.h);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(e.x + e.w / 2, e.y + e.h / 2);
    ctx.lineTo(e.x + e.w + 6, e.y - flap);
    ctx.lineTo(e.x + e.w - 2, e.y + e.h);
    ctx.fill();
    ctx.fillStyle = '#2a1f40';
    ctx.beginPath();
    ctx.ellipse(e.x + e.w / 2, e.y + e.h / 2, e.w / 3, e.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff3b3b';
    ctx.fillRect(e.x + e.w / 2 - 4, e.y + e.h / 2 - 2, 2, 2);
    ctx.fillRect(e.x + e.w / 2 + 2, e.y + e.h / 2 - 2, 2, 2);
  }

  function drawBoss(e) {
    shadow(e, 1.1);
    ctx.fillStyle = e.hurt > 0 ? '#ffffff' : '#4a3a5a';
    ctx.fillRect(e.x + 8, e.y + 20, e.w - 16, e.h - 20);
    ctx.fillStyle = '#2a2236';
    ctx.beginPath();
    ctx.arc(e.x + e.w / 2, e.y + 16, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9b8e0';
    ctx.beginPath();
    ctx.moveTo(e.x + 8, e.y + 8);
    ctx.lineTo(e.x + 2, e.y - 6);
    ctx.lineTo(e.x + 16, e.y + 4);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(e.x + e.w - 8, e.y + 8);
    ctx.lineTo(e.x + e.w - 2, e.y - 6);
    ctx.lineTo(e.x + e.w - 16, e.y + 4);
    ctx.fill();
    ctx.fillStyle = '#ff4d6d';
    ctx.fillRect(e.x + e.w / 2 - 8, e.y + 12, 5, 3);
    ctx.fillRect(e.x + e.w / 2 + 3, e.y + 12, 5, 3);
  }

  // Anclajes del gancho y cuerda mientras se vuela hacia uno
  function drawAnchors(r) {
    const ready = held('gancho');
    r.anchors.forEach((a) => {
      const pulse = 6 + Math.sin(frame * 0.15) * 2;
      ctx.strokeStyle = ready ? '#ffb347' : '#5a4a3a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(a.x, a.y, pulse + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    if (player.hookT > 0 && player.hookTarget) {
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(player.x + player.w / 2, player.y + player.h / 2);
      ctx.lineTo(player.hookTarget.x, player.hookTarget.y);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  function drawEnemies(r) {
    r.enemies.forEach((e) => {
      if (e.dead) return;
      if (e.type === 'crawler') drawCrawler(e);
      else if (e.type === 'bat') drawBat(e);
      else if (e.type === 'boss') drawBoss(e);
    });
    const boss = r.enemies.find((e) => e.type === 'boss' && !e.dead);
    if (boss) {
      const pct = Math.max(0, boss.hp / boss.maxHp);
      ctx.fillStyle = '#000000';
      ctx.fillRect(W / 2 - 150, 24, 300, 10);
      ctx.fillStyle = '#ff4d6d';
      ctx.fillRect(W / 2 - 149, 25, 298 * pct, 8);
    }
  }

  function drawPlayer() {
    const p = player;
    if (p.dead) return;
    if (p.iframes > 0 && Math.floor(frame / 4) % 2 === 0) return; // parpadeo tras un golpe
    shadow(p, 0.7);
    const run = Math.abs(p.vx) > 0.5 && p.onGround;
    const step = run ? Math.sin(frame * 0.5) * 3 : 0;
    const x = p.x;
    const y = p.y;

    ctx.fillStyle = p.dashT > 0 ? '#7fd6ff' : '#5a2f7a';
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 10);
    ctx.lineTo(x + 10 - 6 * p.face, y + 26);
    ctx.lineTo(x + 20, y + 26);
    ctx.fill();

    ctx.fillStyle = '#e8c9a0';
    ctx.fillRect(x + 6, y + 2, 10, 9);
    ctx.fillStyle = '#2f5d8a';
    ctx.fillRect(x + 4, y + 11, 14, 10);
    ctx.fillStyle = '#243a5a';
    ctx.fillRect(x + 4 + step, y + 21, 5, 7);
    ctx.fillRect(x + 11 - step, y + 21, 5, 7);
    ctx.fillStyle = '#101010';
    const ex = p.face > 0 ? x + 12 : x + 7;
    ctx.fillRect(ex, y + 5, 2, 2);

    if (p.atkT > 0) {
      const f = ATK_FRAMES - p.atkT;
      const a = (f / ATK_FRAMES) * Math.PI - Math.PI / 2;
      const sx = x + 10;
      const sy = y + 14;
      ctx.strokeStyle = '#e8f4ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a) * 30 * p.face, sy + Math.sin(a) * 30);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  function drawForeground(r) {
    const pal = PALETTES[biomeOfRoom(r)];
    const camShift = player.x + player.w / 2 - W / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    [60, 420, 780].forEach((bx) => {
      const x = (((bx - camShift * 1.25) % W) + W) % W;
      ctx.fillRect(x, 0, 36, H);
      ctx.fillRect(x - W, 0, 36, H);
    });
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.6);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = pal.accent;
    ctx.globalAlpha = 0.04;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 3, 3);
    });
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    for (let i = 0; i < player.maxHp; i++) {
      const x = 16 + i * 22;
      ctx.fillStyle = i < player.hp ? '#ff5a6a' : '#3a2a30';
      ctx.beginPath();
      ctx.arc(x, 22, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ['dash', 'djump', 'gancho'].forEach((ab, i) => {
      const x = 16 + i * 30;
      ctx.fillStyle = player.abil[ab] ? ABILITIES[ab].color : '#2a2a38';
      ctx.fillRect(x, 40, 22, 6);
    });
    drawKeyIcon(16 + 3 * 30 + 6, 43, player.keys > 0 ? '#ffd23f' : '#2a2a38');
    ctx.fillStyle = '#f2ece0';
    ctx.font = 'bold 13px Consolas, "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`x${player.keys}`, 16 + 3 * 30 + 16, 47);

    // Avisos pequeños apilados abajo
    msgs.forEach((m, i) => {
      const alpha = Math.min(1, m.t / 40);
      const y = H - 46 - (msgs.length - 1 - i) * 26;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(W / 2 - 300, y - 16, 600, 22);
      ctx.fillStyle = m.color;
      ctx.font = 'bold 14px Consolas, "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(m.text, W / 2, y);
      ctx.globalAlpha = 1;
    });
    ctx.textAlign = 'left';

    // Aviso grande
    if (big) {
      const alpha = Math.min(1, big.t / 40, big.t / 20);
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(W / 2 - 320, 110, 640, 96);
      ctx.strokeStyle = big.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(W / 2 - 320, 110, 640, 96);
      ctx.textAlign = 'center';
      ctx.fillStyle = big.color;
      ctx.font = 'bold 24px Consolas, "Courier New", monospace';
      ctx.fillText(big.title, W / 2, 146);
      ctx.fillStyle = '#f2ece0';
      ctx.font = '15px Segoe UI, system-ui, sans-serif';
      wrapText(big.text, W / 2, 174, 600, 20);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }

    if (player.dead) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function wrapText(text, x, y, maxW, lh) {
    const words = text.split(' ');
    let line = '';
    let yy = y;
    words.forEach((w) => {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy);
        line = w;
        yy += lh;
      } else {
        line = test;
      }
    });
    if (line) ctx.fillText(line, x, yy);
  }

  // Pantalla final
  function drawEnd() {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
  }

  // ---------- Pantalla de inicio ----------
  function drawTitle() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#07050c');
    g.addColorStop(1, '#1c1430');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Siluetas de torres y columnas al fondo
    ctx.fillStyle = '#120d1e';
    for (let i = 0; i < 9; i++) {
      const x = i * 120 + 20;
      const h = 160 + ((i * 53) % 140);
      ctx.fillRect(x, H - h, 70, h);
      ctx.beginPath();
      ctx.moveTo(x - 8, H - h);
      ctx.lineTo(x + 35, H - h - 40);
      ctx.lineTo(x + 78, H - h);
      ctx.fill();
    }
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.65);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffc86a';
    ctx.font = 'bold 60px Consolas, "Courier New", monospace';
    ctx.fillText('PIXEL QUEST', W / 2, 170);
    ctx.fillStyle = '#b89cff';
    ctx.font = '20px Consolas, "Courier New", monospace';
    ctx.fillText('METROIDVANIA 2.5D', W / 2, 206);

    ctx.fillStyle = '#e8e2d4';
    ctx.font = '16px Segoe UI, system-ui, sans-serif';
    ctx.fillText('Flechas: mover  ·  Espacio: saltar  ·  J: atacar  ·  K o Shift: dash', W / 2, 300);
    ctx.fillText('E: guardado o grieta  ·  Q: gancho  ·  M: mapa grande  ·  R: nueva partida', W / 2, 330);
    ctx.fillText('Objetivo: sigue las zonas en orden y vence al guardián de la última', W / 2, 360);

    if (Math.floor(Date.now() / 500) % 2 === 0) {
      ctx.fillStyle = '#ffc86a';
      ctx.font = 'bold 22px Consolas, "Courier New", monospace';
      ctx.fillText('Pulsa ENTER o haz clic para empezar', W / 2, 470);
    }
    ctx.textAlign = 'left';
  }

  function render() {
    if (!started) {
      drawTitle();
      return;
    }
    const r = curRoom();
    ctx.clearRect(0, 0, W, H);
    drawBackground(r);
    drawTiles(r);
    drawDoors(r);
    drawExit(r);
    drawSave(r);
    drawPickup(r);
    drawAnchors(r);
    drawEnemies(r);
    drawPlayer();
    drawParticles();
    drawForeground(r);
    drawHud();
    if (ended) drawEnd();
    if (mapOpen) drawBigMap();
    drawMinimap();
  }

  // ---------- Mapa ----------
  // Dibuja el mundo conocido. cell y gap controlan el tamaño; x0 y y0 la posición.
  function drawWorldMap(m, cell, gap, x0, y0, showIcons) {
    const cxOf = (r) => x0 + r.gx * (cell + gap) + cell / 2;
    const cyOf = (r) => y0 + r.gy * (cell + gap) + cell / 2;

    // Conexiones: puertas coloreadas por requisito y flechas en las de un sentido
    world.edges.forEach((e) => {
      const A = world.rooms[e.a];
      const B = world.rooms[e.b];
      if (!A.explored && !B.explored) return;
      if (e.need === 'secret' && !e.revealed) return;
      const color = e.need === 'key' ? (e.opened ? '#6a6a80' : '#ffd23f')
        : e.need === 'secret' ? '#ffc86a'
          : e.need ? ABILITIES[e.need].color
            : e.src !== undefined ? '#ff9a6a' : '#5a5a72';
      m.strokeStyle = color;
      m.lineWidth = e.need || e.src !== undefined ? 3 : 2;
      m.beginPath();
      m.moveTo(cxOf(A), cyOf(A));
      m.lineTo(cxOf(B), cyOf(B));
      m.stroke();
      if (e.src !== undefined && showIcons) {
        const from = world.rooms[e.src];
        const to = world.rooms[e.src === e.a ? e.b : e.a];
        const mx = (cxOf(from) + cxOf(to)) / 2;
        const my = (cyOf(from) + cyOf(to)) / 2;
        const ang = Math.atan2(cyOf(to) - cyOf(from), cxOf(to) - cxOf(from));
        m.fillStyle = color;
        m.beginPath();
        m.moveTo(mx + Math.cos(ang) * 6, my + Math.sin(ang) * 6);
        m.lineTo(mx + Math.cos(ang + 2.6) * 5, my + Math.sin(ang + 2.6) * 5);
        m.lineTo(mx + Math.cos(ang - 2.6) * 5, my + Math.sin(ang - 2.6) * 5);
        m.fill();
      }
    });

    world.rooms.forEach((r) => {
      const x = x0 + r.gx * (cell + gap);
      const y = y0 + r.gy * (cell + gap);
      if (!r.explored) {
        m.fillStyle = '#14111c';
        m.fillRect(x, y, cell, cell);
        m.strokeStyle = '#2e2a40';
        m.lineWidth = 1;
        m.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
        if (showIcons) {
          m.fillStyle = '#2a2638';
          m.font = `${Math.round(cell * 0.4)}px Consolas, monospace`;
          m.textAlign = 'center';
          m.fillText('?', x + cell / 2, y + cell * 0.6);
          m.textAlign = 'left';
        }
        return;
      }
      const accent = PALETTES[biomeOfRoom(r)].accent;
      m.fillStyle = r.i === world.cur ? '#ffd23f' : r.cleared ? '#2b3a2b' : '#2a2a40';
      m.fillRect(x, y, cell, cell);
      m.strokeStyle = accent;
      m.lineWidth = 1;
      m.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);

      m.textAlign = 'center';
      m.font = `bold ${Math.round(cell * 0.42)}px Consolas, monospace`;
      if (r.boss) {
        m.fillStyle = world.bossDown ? '#7fd67f' : '#ff4d6d';
        m.fillText(world.bossDown ? '★' : 'B', x + cell / 2, y + cell * 0.62);
      } else if (r.exit) {
        m.fillStyle = '#ffd23f';
        m.fillText('>', x + cell / 2, y + cell * 0.62);
      } else if (r.pickup && showIcons) {
        const pk = r.pickup;
        m.fillStyle = pk.item === 'key' ? '#ffd23f' : ABILITIES[pk.item].color;
        m.fillText(pk.item === 'key' ? 'K' : pk.item === 'dash' ? 'D' : pk.item === 'gancho' ? 'G' : 'S', x + cell / 2, y + cell * 0.62);
      } else if (r.save && showIcons) {
        m.fillStyle = '#8fdcff';
        m.fillText('+', x + cell / 2, y + cell * 0.62);
      }
      m.textAlign = 'left';

      if (showIcons && r.i !== world.cur) {
        m.fillStyle = accent;
        m.globalAlpha = 0.25;
        m.fillRect(x + 2, y + cell - 4, cell - 4, 2);
        m.globalAlpha = 1;
      }
    });

    // Marcadores del jugador: punto azul en la esquina de la sala
    world.markers.forEach((i) => {
      const mr = world.rooms[i];
      if (!mr.explored) return;
      m.fillStyle = '#8fdcff';
      m.beginPath();
      m.arc(x0 + mr.gx * (cell + gap) + cell - 6, y0 + mr.gy * (cell + gap) + 6, Math.max(2, cell * 0.1), 0, Math.PI * 2);
      m.fill();
    });

    // Posición actual parpadeante
    const cur = world.rooms[world.cur];
    if (Math.floor(frame / 15) % 2 === 0) {
      m.strokeStyle = '#ffffff';
      m.lineWidth = 2;
      m.strokeRect(x0 + cur.gx * (cell + gap) - 1, y0 + cur.gy * (cell + gap) - 1, cell + 2, cell + 2);
    }
  }

  function drawBigMap() {
    ctx.fillStyle = 'rgba(5,3,8,0.9)';
    ctx.fillRect(0, 0, W, H);
    const cell = 72;
    const gap = 10;
    const totalW = GX * (cell + gap) - gap;
    const totalH = GY * (cell + gap) - gap;
    const x0 = Math.round((W - totalW) / 2);
    const y0 = Math.round((H - totalH) / 2 - 20);
    drawWorldMap(ctx, cell, gap, x0, y0, true);

    ctx.fillStyle = '#e8e2d4';
    ctx.font = 'bold 16px Consolas, "Courier New", monospace';
    ctx.textAlign = 'center';
    const explored = world.rooms.filter((r) => r.explored).length;
    ctx.fillText(`MAPA DEL REINO · ${BIOMES[biomeOfRoom(curRoom())]} · explorado ${explored}/${world.rooms.length} · M cierra`, W / 2, H - 48);
    ctx.font = '13px Segoe UI, system-ui, sans-serif';
    ctx.fillText('Azul/morado: puerta de habilidad · Amarillo: llave · Naranja con flecha: puerta de un sentido', W / 2, H - 26);
    ctx.textAlign = 'left';
  }

  function drawMinimap() {
    if (!minimap) return;
    const m = minimap;
    m.clearRect(0, 0, 290, 196);
    m.fillStyle = '#08060c';
    m.fillRect(0, 0, 290, 196);
    drawWorldMap(m, 26, 5, 5, 5, true);
  }

  // ---------- Bucle de juego a 60 fps ----------
  let acc = 0;
  let last = 0;
  function loop(now) {
    if (!last) last = now;
    acc += Math.min(100, now - last);
    last = now;
    while (acc >= 1000 / 60) {
      if (started && !mapOpen) step();
      else pressed = {};
      acc -= 1000 / 60;
    }
    render();
    requestAnimationFrame(loop);
  }

  // ---------- Entrada ----------
  function bindInput() {
    window.addEventListener('keydown', (e) => {
      if (!started) {
        if (e.key === 'Enter' || KEYMAP[e.key]) {
          started = true;
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'b' || e.key === 'B') {
        toggleMarker();
        e.preventDefault();
        return;
      }
      if (e.key === 'm' || e.key === 'M') {
        mapOpen = !mapOpen;
        e.preventDefault();
        return;
      }
      if ((e.key === 'r' || e.key === 'R') && ended) {
        newGame();
        return;
      }
      const act = KEYMAP[e.key];
      if (!act) return;
      e.preventDefault();
      if (!keys[act]) pressed[act] = true;
      keys[act] = true;
    });

    // Botones táctiles y de ratón: se mantienen pulsados mientras el dedo o el ratón están encima
    document.querySelectorAll('[data-act]').forEach((btn) => {
      const act = btn.dataset.act;
      const down = (e) => {
        e.preventDefault();
        started = true;
        if (!keys[act]) pressed[act] = true;
        keys[act] = true;
      };
      const up = () => {
        keys[act] = false;
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('pointercancel', up);
    });

    window.addEventListener('keyup', (e) => {
      const act = KEYMAP[e.key];
      if (act) keys[act] = false;
    });
  }

  function init() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    minimap = document.getElementById('mini').getContext('2d');
    newGame();
    bindInput();
    canvas.addEventListener('click', () => {
      started = true;
    });
    document.getElementById('restart').addEventListener('click', () => {
      started = true;
      newGame();
      canvas.focus();
    });
    requestAnimationFrame(loop);
  }

  // Exposición para pruebas automáticas (no afecta al juego)
  window.MV = {
    genWorld, simulate, RW, RH, GX, GY, TS, W, H, BLOCKS,
    get world() { return world; },
    get player() { return player; },
    step, newGame,
    keys: () => keys,
    press: (k) => { pressed[k] = true; },
    isEnded: () => !!ended,
    blockOf: blockOfRoom,
  };
  if (typeof document !== 'undefined' && document.getElementById('game')) init();
})();
