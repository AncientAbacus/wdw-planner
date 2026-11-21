// Pure logic first (tested in test.js), browser code below.
const W = 24, H = 16, T = 32;
const GATE = { x: 12, y: 15 };
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const TOOLS = {
  path:     { icon: '🟫', name: 'Path',     cost: 10 },
  carousel: { icon: '🎠', name: 'Carousel', cost: 150,  ticket: 3 },
  ferris:   { icon: '🎡', name: 'Ferris',   cost: 300,  ticket: 5 },
  coaster:  { icon: '🎢', name: 'Coaster',  cost: 600,  ticket: 8 },
  food:     { icon: '🍦', name: 'Snacks',   cost: 80,   ticket: 2 },
  castle:   { icon: '🏰', name: 'Castle',   cost: 1000, ticket: 0 }, // fireworks at night
  tree:     { icon: '🌳', name: 'Tree',     cost: 5 },
  fountain: { icon: '⛲', name: 'Fountain', cost: 50 },
  bulldoze: { icon: '🚜', name: 'Bulldoze', cost: 0 },
};

const walkable = t => t === 'path' || t === 'gate';
const isAttraction = t => TOOLS[t] && TOOLS[t].ticket !== undefined;

// BFS over walkable tiles from (sx,sy) to any tile next to (tx,ty). Returns [[x,y]...] incl. start, or null.
function findPath(grid, sx, sy, tx, ty) {
  const h = grid.length, w = grid[0].length, key = (x, y) => y * w + x;
  const prev = new Map([[key(sx, sy), -1]]), q = [[sx, sy]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    if (Math.abs(x - tx) + Math.abs(y - ty) === 1) {
      const out = [];
      for (let k = key(x, y); k !== -1; k = prev.get(k)) out.push([k % w, Math.floor(k / w)]);
      return out.reverse();
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || prev.has(key(nx, ny)) || !walkable(grid[ny][nx])) continue;
      prev.set(key(nx, ny), key(x, y));
      q.push([nx, ny]);
    }
  }
  return null;
}

if (typeof module !== 'undefined') module.exports = { findPath, walkable };

if (typeof document !== 'undefined') {
  const canvas = document.getElementById('park'), ctx = canvas.getContext('2d');
  canvas.width = W * T; canvas.height = H * T;
  const grid = Array.from({ length: H }, () => Array(W).fill(null));
  grid[GATE.y][GATE.x] = 'gate';
  let money = 2000, tool = 'path', time = 0.8, spawnTimer = 0, hover = null, drawing = false;
  const DAY = 90; // seconds per full day
  const guests = [], rockets = [], sparks = [];
  const rand = (a, b) => a + Math.random() * (b - a);

  // Toolbar
  const bar = document.getElementById('tools');
  Object.entries(TOOLS).forEach(([k, t], i) => {
    const b = document.createElement('button');
    b.innerHTML = `<span aria-hidden="true">${t.icon}</span>${t.name}${t.cost ? `<small>$${t.cost}</small>` : ''}`;
    b.title = `${t.name} (key ${i + 1})`;
    b.onclick = () => select(k);
    b.dataset.tool = k;
    bar.appendChild(b);
  });
  function select(k) {
    tool = k;
    bar.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === k));
  }
  select('path');
  addEventListener('keydown', e => { const k = Object.keys(TOOLS)[e.key - 1]; if (k) select(k); });

  const toastEl = document.getElementById('toast');
  let toastT;
  function toast(msg) {
    toastEl.textContent = msg;
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.textContent = '', 1500);
  }

  function place(x, y) {
    const cur = grid[y][x];
    if (cur === 'gate') return;
    if (tool === 'bulldoze') {
      if (cur) { money += Math.floor(TOOLS[cur].cost / 2); grid[y][x] = null; }
      return;
    }
    if (cur) return;
    if (money < TOOLS[tool].cost) return toast('Not enough money!');
    grid[y][x] = tool; money -= TOOLS[tool].cost;
  }

  const tileAt = e => {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * W), y = Math.floor((e.clientY - r.top) / r.height * H);
    return x >= 0 && y >= 0 && x < W && y < H ? { x, y } : null;
  };
  canvas.addEventListener('pointerdown', e => { drawing = true; const t = tileAt(e); if (t) place(t.x, t.y); });
  canvas.addEventListener('pointermove', e => { hover = tileAt(e); if (drawing && hover) place(hover.x, hover.y); });
  addEventListener('pointerup', () => drawing = false);
  canvas.addEventListener('pointerleave', () => hover = null);

  // Guests
  function attractions() {
    const out = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isAttraction(grid[y][x])) out.push({ x, y, type: grid[y][x] });
    return out;
  }
  function plan(g) {
    const here = [Math.round(g.x), Math.round(g.y)], list = attractions();
    if (g.rides < g.wants && list.length) {
      list.sort(() => Math.random() - 0.5); // shortcut: biased shuffle, fine for picking a ride
      for (const a of list) {
        const p = findPath(grid, ...here, a.x, a.y);
        if (p) return Object.assign(g, { path: p, target: a, leaving: false });
      }
    }
    // Leave: head for the gate (or vanish if unreachable).
    const p = findPath(grid, ...here, GATE.x, GATE.y);
    if (!p) g.gone = true;
    Object.assign(g, { path: p || [], target: GATE, leaving: true });
  }
  function updateGuest(g, dt) {
    if (g.riding > 0) { g.riding -= dt; return; }
    if (g.mood > 0) g.mood -= dt;
    if (!g.path) return plan(g);
    if (g.path.length) {
      const [nx, ny] = g.path[0];
      if (!walkable(grid[ny][nx])) return plan(g); // path tile got bulldozed
      const dx = nx - g.x, dy = ny - g.y, d = Math.hypot(dx, dy), step = 2.5 * dt;
      if (d <= step) { g.x = nx; g.y = ny; g.path.shift(); } else { g.x += dx / d * step; g.y += dy / d * step; }
      return;
    }
    // Arrived next to target
    if (g.leaving) { g.gone = true; return; }
    const t = g.target;
    if (grid[t.y][t.x] === t.type) {
      if (!g.rides) money += 5; // entry fee, charged only once a guest actually rides
      money += TOOLS[t.type].ticket; g.rides++; g.riding = rand(1.5, 3); g.mood = 1.5;
    }
    g.path = null;
  }

  // Fireworks (units: tiles)
  function updateFireworks(dt, night) {
    if (night > 0.35) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (grid[y][x] === 'castle' && Math.random() < dt * 1.8)
        rockets.push({ x: x + 0.5, y: y + 0.3, vx: rand(-0.6, 0.6), vy: rand(-6, -4.5), fuse: rand(0.6, 0.9), hue: rand(0, 360) });
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.x += r.vx * dt; r.y += r.vy * dt; r.fuse -= dt;
      if (r.fuse <= 0) {
        rockets.splice(i, 1);
        for (let j = 0; j < 48; j++) {
          const a = j / 48 * Math.PI * 2, s = rand(2, 4);
          sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.9, 1.4), hue: r.hue + rand(-20, 20) });
        }
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.vy += 3 * dt; s.vx *= 0.98; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.life <= 0) sparks.splice(i, 1);
    }
  }

  // Rendering
  const grass = document.createElement('canvas');
  grass.width = canvas.width; grass.height = canvas.height;
  { const g = grass.getContext('2d');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      g.fillStyle = (x + y) % 2 ? '#6cbf5a' : '#64b552'; g.fillRect(x * T, y * T, T, T);
    }
    for (let i = 0; i < 600; i++) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(rand(0, grass.width), rand(0, grass.height), 2, 2); } }

  function drawIcon(icon, x, y, now, type, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha; ctx.fillStyle = '#000'; // Chromium tints emoji with fillStyle's alpha
    ctx.translate(x * T + T / 2, y * T + T / 2);
    if (type === 'ferris') ctx.rotate(Math.sin(now / 900) * 0.15);
    if (type === 'carousel' || type === 'coaster') ctx.translate(0, Math.sin(now / 200 + x) * 1.5);
    ctx.font = `${type === 'castle' ? T * 1.05 : T * 0.8}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(icon, 0, 2);
    ctx.restore();
  }

  function draw(now, night) {
    ctx.drawImage(grass, 0, 0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = grid[y][x];
      if (walkable(t)) {
        ctx.fillStyle = '#e2cfa2'; ctx.fillRect(x * T, y * T, T, T);
        ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(x * T + 4, y * T + 4, T - 8, T - 8);
        if (t === 'gate') drawIcon('🎟️', x, y, now);
      } else if (t) drawIcon(TOOLS[t].icon, x, y, now, t);
    }
    for (const g of guests) {
      if (g.riding > 0) continue;
      const px = (g.x + 0.5 + g.ox) * T, py = (g.y + 0.5 + g.oy) * T;
      ctx.fillStyle = g.color; ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.fill();
      ctx.fillStyle = '#f5d0a9'; ctx.beginPath(); ctx.arc(px, py - 5, 3, 0, 7); ctx.fill();
      if (g.mood > 0) { ctx.fillStyle = '#000'; ctx.font = '12px serif'; ctx.textAlign = 'center'; ctx.fillText('😊', px, py - 13); }
    }
    if (night > 0) {
      ctx.fillStyle = `rgba(12,10,48,${night * 0.7})`; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'lighter';
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isAttraction(grid[y][x])) {
        const cx = x * T + T / 2, cy = y * T + T / 2, gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, T * 1.3);
        gr.addColorStop(0, `rgba(255,200,120,${0.35 * night})`); gr.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.fillStyle = gr; ctx.fillRect(cx - T * 1.3, cy - T * 1.3, T * 2.6, T * 2.6);
      }
      for (const r of rockets) { ctx.fillStyle = `hsl(${r.hue},100%,80%)`; ctx.fillRect(r.x * T - 1, r.y * T - 1, 3, 3); }
      for (const s of sparks) {
        ctx.fillStyle = `hsla(${s.hue},100%,60%,${Math.min(1, s.life)})`;
        ctx.beginPath(); ctx.arc(s.x * T, s.y * T, 2.5, 0, 7); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (hover) {
      const cur = grid[hover.y][hover.x], ok = tool === 'bulldoze' ? cur && cur !== 'gate' : !cur && money >= TOOLS[tool].cost;
      ctx.strokeStyle = ok ? '#fff' : '#ff4d4d'; ctx.lineWidth = 2;
      ctx.strokeRect(hover.x * T + 1, hover.y * T + 1, T - 2, T - 2);
      if (ok && tool !== 'bulldoze' && tool !== 'path') drawIcon(TOOLS[tool].icon, hover.x, hover.y, now, tool, 0.5);
    }
  }

  const hud = document.getElementById('hud');
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    time += dt / DAY;
    const night = Math.max(0, -Math.cos(time * Math.PI * 2)); // 0 at noon, 1 at midnight

    const n = attractions().length;
    spawnTimer -= dt;
    if (n && spawnTimer <= 0 && guests.length < 20 + n * 8) {
      spawnTimer = Math.max(0.5, 5 - n * 0.4);
      guests.push({ x: GATE.x, y: GATE.y, ox: rand(-0.2, 0.2), oy: rand(-0.2, 0.2), rides: 0, wants: 2 + Math.floor(rand(0, 4)),
        riding: 0, mood: 0, path: null, color: `hsl(${rand(0, 360)},70%,55%)` });
    }
    for (const g of guests) updateGuest(g, dt);
    for (let i = guests.length - 1; i >= 0; i--) if (guests[i].gone) guests.splice(i, 1);
    updateFireworks(dt, night);

    draw(now, night);
    const day = Math.floor(time) + 1, clock = night > 0.35 ? '🌙' : '☀️';
    hud.textContent = `💰 $${money}   🧑 ${guests.length} guests   ${clock} Day ${day}`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
