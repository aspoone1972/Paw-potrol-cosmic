// «Космический кот» — основной модуль игры (16-bit аркада)
(function () {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = 320, H = 240;
  ctx.imageSmoothingEnabled = false;

  const Sprites = window.Sprites;
  const Sound = window.Sound;

  // ---------- Telegram Mini App (вне Telegram всё аккуратно игнорируется) ----------
  const tg = (window.Telegram && window.Telegram.WebApp) || null;

  function haptic(kind) {
    try {
      if (!tg || !tg.HapticFeedback) return;
      if (kind === 'light') tg.HapticFeedback.impactOccurred('light');
      else if (kind === 'medium') tg.HapticFeedback.impactOccurred('medium');
      else if (kind === 'error') tg.HapticFeedback.notificationOccurred('error');
    } catch (e) { /* хаптика недоступна */ }
  }

  function tgMainButton(show) {
    try {
      if (!tg || !tg.MainButton) return;
      if (show) {
        tg.MainButton.setText('ПОДЕЛИТЬСЯ РЕКОРДОМ');
        tg.MainButton.show();
      } else {
        tg.MainButton.hide();
      }
    } catch (e) { /* MainButton недоступен */ }
  }

  function shareScore() {
    if (!tg) return;
    try {
      tgMainButton(false);
      // понадобится включённый inline-режим бота: BotFather -> /setinline
      if (tg.switchInlineQuery) tg.switchInlineQuery('Космический кот — мой рекорд: ' + state.score + '!');
    } catch (e) { /* switchInlineQuery недоступен */ }
  }

  // ---------- вспомогательные функции ----------
  const FONT = '"Press Start 2P", "Pixelify Sans", monospace';

  function text(str, x, y, o) {
    o = o || {};
    ctx.font = (o.size || 8) + 'px ' + FONT;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = 'top';
    if (o.shadow !== false) {
      ctx.fillStyle = o.shadowColor || '#101018';
      ctx.fillText(str, x + 1, y + 1);
    }
    ctx.fillStyle = o.color || '#ffffff';
    ctx.fillText(str, x, y);
  }

  function pad(n, len) {
    return String(Math.max(0, Math.floor(n))).padStart(len, '0');
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function clamp(v, a, b) {
    return v < a ? a : (v > b ? b : v);
  }

  function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // ---------- состояние игры ----------
  const state = {
    screen: 'title', // title | play | over
    paused: false,
    score: 0,
    best: 0,
    lives: 3,
    time: 0,
    shake: 0,
    flash: 0,
    newRecord: false
  };
  try {
    state.best = parseInt(localStorage.getItem('cosmicCatBest') || '0', 10) || 0;
  } catch (e) { /* localStorage недоступен */ }

  const player = { x: 60, y: 120, vx: 0, vy: 0, dir: 1, cd: 0, inv: 0, eye: 0 };

  let catchers = [];
  let lasers = [];
  let bowls = [];
  let parts = [];
  let floats = [];
  let spawnT = 0;
  let bowlT = 0;

  // сенсорное управление (телефоны, Telegram Mini App)
  const touchCapable = typeof navigator !== 'undefined' &&
    (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0);
  let touchMode = !!touchCapable; // также включается первым касанием
  let dragging = false;
  let firing = false; // удержание кнопки «ЛАЗЕР»
  let dragPid = null;   // id пальца, который ведёт героя
  let firePid = null;   // id пальца, который жмёт «ЛАЗЕР»
  const touchTarget = { x: 60, y: 120 };
  const dragOff = { x: 0, y: 0 };
  // кнопка огня в левом нижнем углу (видна только на сенсорных устройствах)
  const FIRE_BTN = { x: 6, y: 206, w: 44, h: 30 };

  const START_BTN = { x: 104, y: 178, w: 112, h: 24 };
  const AGAIN_BTN = { x: 104, y: 140, w: 112, h: 24 };

  // ---------- 16-бит космос: градиент, туманности, планета, звёзды ----------
  let bgT = 0; // общее время фона (идёт и на заставке)

  function vgrad(y0, y1, stops) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    if (!g) return null;
    for (let i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    return g;
  }

  function rgrad(x0, y0, r0, x1, y1, r1, c0, c1) {
    const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
    if (!g) return null;
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);
    return g;
  }

  const STAR_SPD = [7, 16, 34];
  const STAR_COL = ['#5a68b8', '#a9b8ff', '#ffffff'];
  const stars = [];
  for (let i = 0; i < 70; i++) {
    stars.push({ x: rand(0, W), y: rand(0, H), l: i % 3, tw: rand(0, 6.3) });
  }

  // разноцветные туманности (средний слой параллакса)
  const NEBULAS = [
    { x: 40, y: 60, r: 70, c0: 'rgba(112,52,168,0.45)', spd: 1.2 },
    { x: 210, y: 40, r: 55, c0: 'rgba(38,92,180,0.40)', spd: 0.8 },
    { x: 150, y: 200, r: 80, c0: 'rgba(150,44,110,0.35)', spd: 1.6 },
    { x: 300, y: 150, r: 60, c0: 'rgba(44,140,170,0.30)', spd: 1.0 }
  ];

  const PLANET = { y: 190, r: 46 };

  function updateStars(dt) {
    bgT += dt;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      s.x -= STAR_SPD[s.l] * dt;
      s.tw += dt * 3;
      if (s.x < -2) {
        s.x = W + 2;
        s.y = rand(0, H);
      }
    }
  }

  function drawStars() {
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(s.tw);
      ctx.fillStyle = STAR_COL[s.l];
      const sz = s.l === 2 ? 2 : 1;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  // далёкая планета с кольцом (16-битный фон)
  function drawPlanet() {
    const span = W + 260;
    const px = ((250 - bgT * 2.5) % span + span) % span - 130;
    const py = PLANET.y;
    const r = PLANET.r;
    // кольцо (задняя половина)
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = '#6d5fd4';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(px, py, r * 1.6, r * 0.45, -0.35, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    ctx.restore();
    // шар с полосами и кратерами
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = '#33276e';
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = '#3d2f84';
    ctx.fillRect(px - r, py - 14, r * 2, 8);
    ctx.fillStyle = '#4a3a9e';
    ctx.fillRect(px - r, py + 4, r * 2, 6);
    ctx.fillStyle = '#2a1f5c';
    ctx.beginPath();
    ctx.arc(px - 18, py - 24, 7, 0, 6.28);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px + 12, py + 22, 9, 0, 6.28);
    ctx.fill();
    // тень по краю
    const sh = rgrad(px + 20, py + 16, 4, px + 20, py + 16, r * 1.7, 'rgba(5,6,15,0)', 'rgba(5,6,15,0.75)');
    ctx.fillStyle = sh || 'rgba(5,6,15,0.35)';
    ctx.fillRect(px - r, py - r, r * 2, r * 2);
    ctx.restore();
    // контур
    ctx.strokeStyle = '#8f7ff0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px + 0.5, py + 0.5, r, 0, Math.PI * 2);
    ctx.stroke();
    // передняя половина кольца
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = '#8f7ff0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(px, py, r * 1.6, r * 0.45, -0.35, 0.05, Math.PI * 0.95);
    ctx.stroke();
    ctx.restore();
  }

  function drawSpace() {
    const bg = vgrad(0, H, [
      [0, '#05060f'],
      [0.45, '#0d1030'],
      [0.78, '#1a1044'],
      [1, '#271250']
    ]);
    ctx.fillStyle = bg || '#0d1030';
    ctx.fillRect(0, 0, W, H);
    // туманности
    for (let i = 0; i < NEBULAS.length; i++) {
      const n = NEBULAS[i];
      const span = W + n.r * 2;
      const nx = ((n.x - bgT * n.spd) % span + span) % span - n.r;
      const g = rgrad(nx, n.y, n.r * 0.15, nx, n.y, n.r, n.c0, 'rgba(10,10,30,0)');
      ctx.fillStyle = g || n.c0;
      ctx.fillRect(nx - n.r, n.y - n.r, n.r * 2, n.r * 2);
    }
    drawPlanet();
    drawStars();
  }

  // ---------- ввод ----------
  const keys = Object.create(null);
  const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];

  window.addEventListener('keydown', function (e) {
    if (GAME_KEYS.indexOf(e.code) !== -1) e.preventDefault();
    keys[e.code] = true;
    Sound.unlock();
    if (e.repeat) return;
    if (e.code === 'KeyM') {
      const m = Sound.toggleMute();
      addFloat(W / 2, H - 24, m ? 'ЗВУК ВЫКЛ' : 'ЗВУК ВКЛ', m ? '#8b93a5' : '#7ee787');
    }
    if (state.screen !== 'play') {
      if (e.code === 'Enter' || e.code === 'Space') startGame();
      return;
    }
    if (e.code === 'KeyP' || e.code === 'Escape') state.paused = !state.paused;
  });

  window.addEventListener('keyup', function (e) {
    keys[e.code] = false;
  });

  window.addEventListener('blur', function () {
    if (state.screen === 'play') state.paused = true;
    dragging = false;
    firing = false;
    dragPid = null;
    firePid = null;
  });

  function btnHit(x, y, b) {
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }

  // ---------- указатель: мышь — стрельба кликом, палец — перетаскивание героя ----------
  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * W / (r.width || W),
      y: (e.clientY - r.top) * H / (r.height || H)
    };
  }

  canvas.addEventListener('pointerdown', function (e) {
    Sound.unlock();
    const p = canvasPos(e);
    if (state.screen === 'title') {
      if (btnHit(p.x, p.y, START_BTN)) startGame();
      return;
    }
    if (state.screen === 'over') {
      if (btnHit(p.x, p.y, AGAIN_BTN)) startGame();
      return;
    }
    if (state.screen !== 'play') return;
    if (state.paused) {
      state.paused = false; // тап — продолжить
      dragging = false;
      firing = false;
      return;
    }
    if (e.pointerType === 'touch') touchMode = true; // касание включает тач-режим
    if (p.y < 16) { // тап по полосе HUD — пауза
      state.paused = true;
      return;
    }
    // кнопка «ЛАЗЕР» в левом нижнем углу
    if (touchMode && btnHit(p.x, p.y, FIRE_BTN)) {
      firing = true;
      firePid = e.pointerId;
      e.preventDefault();
      return;
    }
    if (e.pointerType === 'touch') {
      dragging = true;
      dragPid = e.pointerId;
      // смещение «пальца» относительно героя, чтобы не закрывать его собой
      dragOff.x = clamp(player.x - p.x, -70, 70);
      dragOff.y = clamp(player.y - p.y, -70, 70);
      touchTarget.x = clamp(p.x + dragOff.x, 9, W - 9);
      touchTarget.y = clamp(p.y + dragOff.y, 24, H - 9);
      e.preventDefault(); // без выделения текста и эмуляции mouse-событий
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!dragging || e.pointerId !== dragPid || state.screen !== 'play' || state.paused) return;
    const p = canvasPos(e);
    touchTarget.x = clamp(p.x + dragOff.x, 9, W - 9);
    touchTarget.y = clamp(p.y + dragOff.y, 24, H - 9);
    if (e.pointerType === 'touch') e.preventDefault();
  });

  // отпустили палец — прекращаем вести героя или держать кнопку огня
  function stopPointer(e) {
    if (firePid !== null && e.pointerId === firePid) {
      firing = false;
      firePid = null;
    }
    if (dragPid !== null && e.pointerId === dragPid) {
      dragging = false;
      dragPid = null;
    }
  }
  canvas.addEventListener('pointerup', stopPointer);
  canvas.addEventListener('pointercancel', stopPointer);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  canvas.addEventListener('mousedown', function (e) {
    Sound.unlock();
    // для мыши клик по-прежнему стреляет; кнопки уже обработаны в pointerdown
    if (state.screen === 'play' && !state.paused) shoot();
  });

  // ---------- кот, лазер из глаз ----------
  const SPEED = 148; // px/сек

  function updatePlayer(dt) {
    let dx = 0, dy = 0;
    if (keys.ArrowLeft || keys.KeyA) dx -= 1;
    if (keys.ArrowRight || keys.KeyD) dx += 1;
    if (keys.ArrowUp || keys.KeyW) dy -= 1;
    if (keys.ArrowDown || keys.KeyS) dy += 1;
    if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
    player.vx = dx * SPEED;
    player.vy = dy * SPEED;
    player.x = clamp(player.x + player.vx * dt, 9, W - 9);
    player.y = clamp(player.y + player.vy * dt, 24, H - 9); // не залезаем под HUD
    if (dx) player.dir = dx > 0 ? 1 : -1;
    // тач-режим (Telegram на телефоне): герой летит к точке под пальцем
    if (dragging) {
      const tx = touchTarget.x - player.x;
      const ty = touchTarget.y - player.y;
      const dist = Math.hypot(tx, ty);
      if (dist > 0.5) {
        const step = Math.min(dist, SPEED * 1.35 * dt); // тач отзывчивее клавиш
        player.x += (tx / dist) * step;
        player.y += (ty / dist) * step;
        if (Math.abs(tx) > 2) player.dir = tx > 0 ? 1 : -1;
      }
    }
    player.x = clamp(player.x, 9, W - 9);
    player.y = clamp(player.y, 24, H - 9);
    if (player.cd > 0) player.cd -= dt;
    if (player.inv > 0) player.inv -= dt;
    if (player.eye > 0) player.eye -= dt;
    if (keys.Space) shoot(); // можно держать пробел
    if (firing && player.cd <= 0) shoot(); // удержание кнопки «ЛАЗЕР» внизу слева
  }

  function shoot() {
    if (player.cd > 0) return;
    player.cd = 0.22;
    player.eye = 0.1;
    // два параллельных луча — из глаз в сторону взгляда
    lasers.push({ x: player.x + player.dir * 8, y: player.y - 7, vx: 430 * player.dir });
    lasers.push({ x: player.x + player.dir * 8, y: player.y - 4, vx: 430 * player.dir });
    Sound.shoot();
  }

  function updateLasers(dt) {
    for (let i = lasers.length - 1; i >= 0; i--) {
      const l = lasers[i];
      l.x += l.vx * dt;
      if (l.x < -20 || l.x > W + 20) {
        lasers.splice(i, 1);
        continue;
      }
      for (let j = catchers.length - 1; j >= 0; j--) {
        const c = catchers[j];
        if (overlap(l.x - 6, l.y - 2, 12, 4, c.x - 7, c.y - 11, 14, 22)) {
          explode(c.x, c.y, 18, ['#7a4fd0', '#c07bff', '#ffe14d', '#ffffff']);
          catchers.splice(j, 1);
          lasers.splice(i, 1);
          state.score += 10;
          addFloat(c.x, c.y - 6, '+10', '#3ff8ff');
          Sound.hit();
          break;
        }
      }
    }
  }

  // ---------- ловцы уличных животных (джентльмены с цилиндрами) ----------
  function spawnCatcher() {
    const side = Math.floor(rand(0, 4));
    let x, y;
    if (side === 0) { x = -14; y = rand(34, H - 14); }
    else if (side === 1) { x = W + 14; y = rand(34, H - 14); }
    else if (side === 2) { x = rand(14, W - 14); y = 14; }
    else { x = rand(14, W - 14); y = H + 14; }
    catchers.push({
      x: x,
      y: y,
      speed: (46 + Math.min(78, state.time * 1.7)) * rand(0.85, 1.15),
      phase: rand(0, 6.28),
      flip: false
    });
  }

  function updateCatchers(dt) {
    for (let i = catchers.length - 1; i >= 0; i--) {
      const c = catchers[i];
      // летят к герою с предсказанием его движения и покачиванием
      const tx = player.x + player.vx * 0.35;
      const ty = player.y + player.vy * 0.35;
      let ax = tx - c.x, ay = ty - c.y;
      const len = Math.hypot(ax, ay) || 1;
      ax /= len; ay /= len;
      const wob = Math.sin(state.time * 3 + c.phase) * 0.55;
      const vx = (ax - ay * wob) * c.speed;
      const vy = (ay + ax * wob) * c.speed;
      c.x += vx * dt;
      c.y += vy * dt;
      c.flip = player.x < c.x; // джентльмен всегда смотрит на героя
      // поймал героя — минус одна жизнь
      if (player.inv <= 0 && overlap(player.x - 5, player.y - 5, 10, 10, c.x - 7, c.y - 11, 14, 22)) {
        hurtPlayer();
        catchers.splice(i, 1);
      }
    }
  }

  function hurtPlayer() {
    explode(player.x, player.y, 26, ['#ff9fb4', '#f4922a', '#ff4d4d', '#ffffff']);
    state.lives -= 1;
    player.inv = 2; // 2 секунды неуязвимости, герой мигает
    state.shake = 0.45;
    state.flash = 0.25;
    Sound.hurt();
    haptic('medium');
    addFloat(player.x, player.y - 14, '-1 ЖИЗНЬ', '#ff4d4d');
    if (state.lives <= 0) gameOver();
  }

  // ---------- печенье-косточка (+1 жизнь) ----------
  function spawnBowl() {
    bowls.push({
      x: rand(28, W - 28),
      y: rand(42, H - 24),
      vx: rand(-16, 16),
      vy: rand(-12, 12),
      life: 10
    });
  }

  function updateBowls(dt) {
    for (let i = bowls.length - 1; i >= 0; i--) {
      const b = bowls[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < 20 || b.x > W - 20) b.vx *= -1;
      if (b.y < 36 || b.y > H - 14) b.vy *= -1;
      b.x = clamp(b.x, 20, W - 20);
      b.y = clamp(b.y, 36, H - 14);
      if (b.life <= 0) {
        bowls.splice(i, 1);
        continue;
      }
      if (overlap(player.x - 6, player.y - 6, 12, 12, b.x - 8, b.y - 5, 16, 10)) {
        bowls.splice(i, 1);
        if (state.lives < 3) {
          state.lives += 1;
          addFloat(b.x, b.y - 10, '+1 ЖИЗНЬ', '#7ee787');
        } else {
          state.score += 100; // жизни и так полны — берём очки
          addFloat(b.x, b.y - 10, '+100', '#ffe14d');
        }
        Sound.pickup();
        haptic('light');
      }
    }
  }

  function spawnLogic(dt) {
    spawnT -= dt;
    const maxC = Math.min(11, 4 + Math.floor(state.time / 18));
    if (spawnT <= 0 && catchers.length < maxC) {
      spawnCatcher();
      spawnT = Math.max(0.65, 2.3 - state.time * 0.035) + rand(0, 0.5);
    }
    bowlT -= dt;
    if (bowlT <= 0) {
      spawnBowl();
      bowlT = rand(9, 15);
    }
  }

  // ---------- частицы взрыва и всплывающие надписи ----------
  function explode(x, y, n, colors) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(25, 95);
      parts.push({
        x: x,
        y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.3, 0.75),
        c: colors[Math.floor(rand(0, colors.length))],
        s: Math.random() < 0.5 ? 2 : 3
      });
    }
  }

  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.life -= dt;
      if (p.life <= 0) parts.splice(i, 1);
    }
  }

  function addFloat(x, y, txt, color) {
    floats.push({ x: x, y: y, txt: txt, color: color, life: 1.1 });
  }

  function updateFloats(dt) {
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.y -= 14 * dt;
      f.life -= dt;
      if (f.life <= 0) floats.splice(i, 1);
    }
  }

  // ---------- игровой цикл: старт и конец ----------
  function startGame() {
    state.screen = 'play';
    state.paused = false;
    state.score = 0;
    state.lives = 3;
    state.time = 0;
    state.shake = 0;
    state.flash = 0;
    state.newRecord = false;
    player.x = 60;
    player.y = H / 2;
    dragging = false;
    firing = false;
    dragPid = null;
    firePid = null;
    touchTarget.x = player.x;
    touchTarget.y = player.y;
    player.vx = 0;
    player.vy = 0;
    player.dir = 1;
    player.cd = 0;
    player.inv = 1.2; // защита при появлении
    player.eye = 0;
    catchers = [];
    lasers = [];
    bowls = [];
    parts = [];
    floats = [];
    spawnT = 1.2;
    bowlT = 5; // первое печенье скоро
    canvas.style.cursor = 'crosshair';
    tgMainButton(false); // прячем кнопку шаринга во время игры
    Sound.start();
    Sound.startMusic();
  }

  function gameOver() {
    state.screen = 'over';
    state.paused = false;
    canvas.style.cursor = 'pointer';
    if (state.score > state.best) {
      state.best = state.score;
      state.newRecord = true;
      try {
        localStorage.setItem('cosmicCatBest', String(state.best));
      } catch (e) { /* localStorage недоступен */ }
    }
    Sound.stopMusic();
    Sound.over();
    haptic('error');
    tgMainButton(true); // в Telegram — кнопка «Поделиться рекордом»
  }

  function update(dt) {
    updateStars(dt);
    updateParts(dt);
    updateFloats(dt);
    if (state.shake > 0) state.shake -= dt;
    if (state.flash > 0) state.flash -= dt;
    if (state.screen !== 'play' || state.paused) return;
    state.time += dt;
    updatePlayer(dt);
    updateLasers(dt);
    updateCatchers(dt);
    updateBowls(dt);
    spawnLogic(dt);
  }

  // ---------- HUD (16-бит панель с фаской) ----------
  function drawHUD() {
    ctx.fillStyle = '#0d1026';
    ctx.fillRect(0, 0, W, 16);
    ctx.fillStyle = '#3d4680';
    ctx.fillRect(0, 0, W, 1);
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 15, W, 1);
    for (let i = 0; i < 3; i++) {
      if (i < state.lives) {
        Sprites.draw(ctx, 'HEART', 4 + i * 12, 4, {});
      } else {
        ctx.fillStyle = '#262633';
        ctx.fillRect(5 + i * 12, 5, 7, 6);
      }
    }
    text('SCORE ' + pad(state.score, 6), 44, 4, { color: '#ffe14d' });
    const lv = 1 + Math.floor(state.time / 25);
    text('LV ' + pad(lv, 2), 152, 4, { color: '#3ff8ff' });
    text('BEST ' + pad(state.best, 6), W - 16, 4, { align: 'right', color: '#a9b8ff' });
    // иконка «пауза»: тап/клик по полосе HUD ставит игру на паузу
    ctx.fillStyle = '#a9b8ff';
    ctx.fillRect(W - 13, 4, 3, 8);
    ctx.fillRect(W - 8, 4, 3, 8);
  }

  // ---------- кнопка «ЛАЗЕР» в левом нижнем углу (только на сенсорных) ----------
  function drawFireBtn() {
    if (!touchMode) return;
    const b = FIRE_BTN;
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = firing ? '#2e3a7a' : '#161b3d';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#5b6ad4'; // блик сверху и слева
    ctx.fillRect(b.x, b.y, b.w, 1);
    ctx.fillRect(b.x, b.y, 1, b.h);
    ctx.fillStyle = '#05060f'; // тень снизу и справа
    ctx.fillRect(b.x, b.y + b.h - 1, b.w, 1);
    ctx.fillRect(b.x + b.w - 1, b.y, 1, b.h);
    // значок луча
    ctx.fillStyle = firing ? '#ffffff' : '#3ff8ff';
    ctx.fillRect(b.x + 5, b.y + 6, b.w - 10, 3);
    ctx.fillStyle = '#3a5cff';
    ctx.fillRect(b.x + 5, b.y + 10, b.w - 10, 2);
    text('ЛАЗЕР', b.x + b.w / 2, b.y + 17, {
      align: 'center', size: 6,
      color: firing ? '#ffe14d' : '#a9b8ff',
      shadow: false
    });
  }

  // ---------- отрисовка мира ----------
  function drawWorld() {
    drawSpace();

    // печенье-косточки (мигают перед исчезновением)
    for (let i = 0; i < bowls.length; i++) {
      const b = bowls[i];
      if (b.life < 2 && Math.floor(b.life * 8) % 2 === 0) continue;
      Sprites.draw(ctx, 'BONE', b.x - 8, b.y - 5, {});
    }

    // противники (джентльмены с цилиндром)
    for (let i = 0; i < catchers.length; i++) {
      const c = catchers[i];
      if (!Sprites.drawPic(ctx, 'enemy', c.x, c.y, { flip: !c.flip })) {
        Sprites.draw(ctx, 'CATCHER', c.x - 8, c.y - 8, { flip: c.flip });
      }
    }

    // герой (мигает во время неуязвимости; после game over не рисуем)
    if (state.screen !== 'over') {
      const blink = player.inv > 0 && Math.floor(player.inv * 12) % 2 === 0;
      if (!blink) {
        // картинка героя смотрит влево — отражаем вправо при dir = 1
        if (!Sprites.drawPic(ctx, 'player', player.x, player.y, { flip: player.dir === 1 })) {
          Sprites.draw(ctx, 'CAT', Math.round(player.x - 8), Math.round(player.y - 8), {});
        }
        if (player.eye > 0) {
          // вспышка выстрела у переднего края
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(Math.round(player.x + player.dir * 8) - 1, Math.round(player.y - 8), 2, 2);
          ctx.fillRect(Math.round(player.x + player.dir * 8) - 1, Math.round(player.y - 5), 2, 2);
        }
      }
    }

    // лазеры из глаз (16-бит свечение слоями)
    for (let i = 0; i < lasers.length; i++) {
      const l = lasers[i];
      const bx = Math.round(l.x);
      const by = Math.round(l.y);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#3a5cff';
      ctx.fillRect(bx - 7, by - 3, 14, 6);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#3ff8ff';
      ctx.fillRect(bx - 6, by - 2, 12, 4);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx - 4, by - 1, 8, 2);
      ctx.restore();
    }

    // частицы взрывов
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      ctx.globalAlpha = Math.min(1, p.life * 2.5);
      ctx.fillStyle = p.c;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
    }
    ctx.globalAlpha = 1;
  }

  function drawFloats() {
    for (let i = 0; i < floats.length; i++) {
      const f = floats[i];
      ctx.globalAlpha = Math.min(1, f.life * 2);
      text(f.txt, f.x, f.y, { align: 'center', color: f.color });
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 16-бит панель и кнопка с фаской ----------
  function panel(x, y, w, h, fill) {
    ctx.fillStyle = '#05060f';
    ctx.fillRect(x + 2, y + 2, w, h); // тень
    ctx.fillStyle = fill || '#14172e';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#5b6ad4'; // блик сверху и слева
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = '#05060f'; // тень снизу и справа
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x + w - 1, y, 1, h);
  }

  function drawButton(b, label, color) {
    ctx.fillStyle = '#05060f';
    ctx.fillRect(b.x + 2, b.y + 2, b.w, b.h); // тень
    ctx.fillStyle = '#232a52';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#3d4680'; // блик сверху
    ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, 2);
    ctx.fillStyle = '#0a0c1c'; // тень снизу
    ctx.fillRect(b.x + 1, b.y + b.h - 3, b.w - 2, 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    text(label, b.x + b.w / 2, b.y + 8, { align: 'center', color: color });
  }

  // ---------- заставка ----------
  function drawTitle() {
    drawSpace();

    // картинка заставки (ЩПВСЕ.png) в рамке — без текста названия
    const ix = 40, iy = 8, iw = 240, ih = 160;
    ctx.fillStyle = '#05060f';
    ctx.fillRect(ix - 5, iy - 5, iw + 10, ih + 10); // тень рамки
    ctx.fillStyle = '#2a2f5e';
    ctx.fillRect(ix - 4, iy - 4, iw + 8, ih + 8);
    ctx.fillStyle = '#8f7ff0'; // фаска: блик сверху/слева
    ctx.fillRect(ix - 4, iy - 4, iw + 8, 1);
    ctx.fillRect(ix - 4, iy - 4, 1, ih + 8);
    ctx.fillStyle = '#14172e'; // фаска: тень снизу/справа
    ctx.fillRect(ix - 4, iy + ih + 3, iw + 8, 1);
    ctx.fillRect(ix + iw + 3, iy - 4, 1, ih + 8);
    if (!Sprites.pic('title')) {
      ctx.fillStyle = '#10143a'; // запасная заливка, если картинка не загрузилась
      ctx.fillRect(ix, iy, iw, ih);
    }
    Sprites.drawPic(ctx, 'title', ix + iw / 2, iy + ih / 2, {});

    // кнопка СТАРТ
    const btnColor = Math.floor(performance.now() / 500) % 2 ? '#3ff8ff' : '#ffe14d';
    drawButton(START_BTN, 'СТАРТ', btnColor);

    // подсказки по управлению
    if (touchMode) {
      text('ТЯНИ ПАЛЬЦЕМ - ПОЛЁТ, ОГОНЬ - КНОПКА ЛАЗЕР', W / 2, 210, { align: 'center', size: 7, color: '#a9b8ff' });
      text('ТАП ПО HUD - ПАУЗА  ПЕЧЕНЬЕ = +1 ЖИЗНЬ', W / 2, 222, { align: 'center', size: 7, color: '#a9b8ff' });
    } else {
      text('СТРЕЛКИ/WASD - ПОЛЁТ  ПРОБЕЛ - ЛАЗЕР', W / 2, 210, { align: 'center', size: 7, color: '#a9b8ff' });
      text('M - ЗВУК  P - ПАУЗА  ПЕЧЕНЬЕ = +1 ЖИЗНЬ', W / 2, 222, { align: 'center', size: 7, color: '#a9b8ff' });
    }
  }

  // ---------- экран конца игры ----------
  function drawOver() {
    drawWorld();
    drawHUD();
    ctx.fillStyle = 'rgba(5,6,15,0.78)';
    ctx.fillRect(0, 0, W, H);

    panel(56, 36, 208, 156);
    text('ИГРА ОКОНЧЕНА', W / 2, 48, { align: 'center', size: 12, color: '#ff4d4d' });
    text('СЧЁТ ' + pad(state.score, 6), W / 2, 80, { align: 'center', color: '#ffe14d' });
    text('РЕКОРД ' + pad(state.best, 6), W / 2, 96, { align: 'center', color: '#3ff8ff' });
    if (state.newRecord && Math.floor(performance.now() / 350) % 2 === 0) {
      text('НОВЫЙ РЕКОРД!', W / 2, 114, { align: 'center', color: '#7ee787' });
    }
    const btnColor = Math.floor(performance.now() / 500) % 2 ? '#3ff8ff' : '#ffe14d';
    drawButton(AGAIN_BTN, 'ЕЩЁ РАЗ', btnColor);
    text('ENTER ИЛИ КЛИК', W / 2, 176, { align: 'center', size: 7, color: '#a9b8ff' });
  }

  // ---------- пауза ----------
  function drawPause() {
    ctx.fillStyle = 'rgba(5,6,15,0.6)';
    ctx.fillRect(0, 0, W, H);
    panel(84, 84, 152, 68);
    if (Math.floor(performance.now() / 400) % 2 === 0) {
      text('ПАУЗА', W / 2, 100, { align: 'center', size: 16, color: '#3ff8ff' });
    }
    text('P ИЛИ ТАП - ПРОДОЛЖИТЬ', W / 2, 132, { align: 'center', size: 7, color: '#a9b8ff' });
  }

  // ---------- общий кадр ----------
  function draw() {
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, W, H);

    if (state.screen === 'title') {
      drawTitle();
    } else if (state.screen === 'over') {
      drawOver();
    } else {
      ctx.save();
      if (state.shake > 0) {
        ctx.translate(Math.round(rand(-2, 2)), Math.round(rand(-2, 2)));
      }
      drawWorld();
      ctx.restore();
      drawHUD();
      drawFireBtn();
      if (state.paused) drawPause();
    }

    // белая вспышка при потере жизни
    if (state.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.85, state.flash).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    drawFloats();
  }

  // ---------- главный цикл с фиксированным шагом ----------
  let last = performance.now();
  let acc = 0;
  const STEP = 1 / 60;

  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard < 5) {
      update(STEP);
      acc -= STEP;
      guard++;
    }
    if (acc > STEP) acc = 0; // сброс долга при просадке кадров
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // подгружаем пиксельный шрифт (если нет интернета — сработает fallback monospace)
  if (document.fonts && document.fonts.load) {
    document.fonts.load('8px "Press Start 2P"').catch(function () {});
    document.fonts.load('7px "Pixelify Sans"').catch(function () {});
  }

  // ---------- запуск как Telegram Mini App (вне Telegram этот блок ничего не делает) ----------
  if (tg) {
    try {
      tg.ready();   // сообщаем Telegram, что приложение готово
      tg.expand();  // разворачиваем на весь экран
      if (tg.setHeaderColor) tg.setHeaderColor('#0d1030');
      if (tg.setBackgroundColor) tg.setBackgroundColor('#05060f');
      if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); // свайп вниз не закрывает игру
      if (tg.MainButton && tg.MainButton.onClick) tg.MainButton.onClick(shareScore);
      tgMainButton(false);
    } catch (e) { /* не в Telegram или старая версия API */ }
  }

})();
