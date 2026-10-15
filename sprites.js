// Пиксельные спрайты 8-bit для игры «Космический кот»
(function (root) {
  'use strict';

  // Палитра: символ -> цвет ( '.' = прозрачный )
  const PALETTE = {
    '.': null,
    K: '#101018', // чёрный (контур, кашкет, глаза)
    W: '#ffffff', // белый
    G: '#8b93a5', // серый
    S: '#b9c0cc', // светло-серый (миска)
    s: '#5b6472', // тёмно-серый
    O: '#f4922a', // рыжий (кот)
    o: '#c2610f', // тёмно-рыжий
    P: '#ff9fb4', // розовый (нос, уши)
    C: '#3ff8ff', // светящиеся глаза-лазеры
    B: '#2f3f96', // синий (плащ ловца)
    b: '#1a2257', // тёмно-синий
    H: '#f2c9a0', // кожа
    d: '#8a5a2b', // ручка сачка
    N: '#cfd8dc', // сетка сачка
    m: '#96551f', // корм
    Y: '#ffe14d', // жёлтый
    R: '#ff4d4d', // красный
    E: '#7ee787', // зелёный
    T: '#f5cf8e', // печенье (светлое тесто)
    t: '#c28b4f', // печенье (тень)
    r: '#c23a44'  // тёмно-красный (тень сердечка)
  };

  // Морда котика 16x16 — глаза 'C' стреляют лазером
  const CAT = [
    '................',
    '.OO..........OO.',
    '.OOO........OOO.',
    '.OPO........POP.',
    '.OOOOOOOOOOOOOO.',
    'OOOOOOOOOOOOOOOO',
    'OOOOOOOOOOOOOOOO',
    'OOCCOOOOOOOCCOOO',
    'OOCCOOOOOOOCCOOO',
    'OOOOOOOOOOOOOOOO',
    'OOOOOOOPPOOOOOOO',
    'OOOOOOOKKOOOOOOO',
    'WOOOOOOOOOOOOOOW',
    'WOOOOOOOOOOOOOOW',
    '..OOOOOOOOOOOO..',
    '..OOOOOOOOOOOO..'
  ];

  // Мини-морда 8x8 — иконка жизни в HUD
  const CAT_ICON = [
    '.O....O.',
    'OOOOOOOO',
    'OCO..OCO',
    'OOOOOOOO',
    'OOOPPOOO',
    'OOOKKOOO',
    'OOOOOOOO',
    '.OOOOOO.'
  ];

  // Ловец с сачком 16x16 (сачок справа, при движении влево спрайт отражается)
  const CATCHER = [
    '...........NN...',
    '..KKKKKKK..NNNN.',
    '..KKKKKKK.NNNNNN',
    '..HHHHHHH.dNNNNN',
    '..HHKKKHH.dN.NN.',
    '..HHHKKHH.dN.NN.',
    '..BBBBBBBH......',
    '..BBBBBBBHH.....',
    '..BBBBBBBBB.....',
    '..BBBBBBBBB.....',
    '..bBBBBBBb......',
    '..BBBB.BBBB.....',
    '..BBB...BBB.....',
    '..BBB...BBB.....',
    '.KKKK...KKKK....',
    '................'
  ];

  // Собачье печенье в виде косточки 16x10 (+1 жизнь)
  const BONE = [
    '..TTT......TTT..',
    'TTTTT......TTTTT',
    'TTTTT......TTTTT',
    'TTTTTTTTTTTTTTTT',
    'TTTmTTTTTTTTmTTT',
    'tttttttttttttttt',
    'ttttt......ttttt',
    'ttttt......ttttt',
    '..ttt......ttt..',
    '................'
  ];

  // Сердечко 9x7 — иконка жизни в HUD (16-бит стиль)
  const HEART = [
    '.RRR.RRR.',
    'RWRRRRRRR',
    'RRRRRRRRR',
    '.rrrrrrr.',
    '..rrrrr..',
    '...rrr...',
    '....r....'
  ];

  const SPRITES = { CAT: CAT, CAT_ICON: CAT_ICON, CATCHER: CATCHER, BONE: BONE, HEART: HEART };

  // Проверка длин строк и символов палитры (работает и в браузере, и в node)
  function validate() {
    const errs = [];
    const names = Object.keys(SPRITES);
    for (let n = 0; n < names.length; n++) {
      const name = names[n];
      const sp = SPRITES[name];
      const w = sp[0].length;
      for (let y = 0; y < sp.length; y++) {
        const row = sp[y];
        if (row.length !== w) {
          errs.push(name + ': строка ' + y + ' — длина ' + row.length + ', ожидалось ' + w);
        }
        for (let x = 0; x < row.length; x++) {
          if (!Object.prototype.hasOwnProperty.call(PALETTE, row[x])) {
            errs.push(name + ': символ "' + row[x] + '" (строка ' + y + ') не в палитре');
          }
        }
      }
    }
    return errs;
  }

  const errs = validate();
  if (errs.length && typeof console !== 'undefined') {
    console.error('Ошибка в спрайтах:', errs);
  }

  // Офисурфейсы спрайтов (кэш), строятся один раз
  const cache = {};
  function surface(name) {
    if (cache[name]) return cache[name];
    const sp = SPRITES[name];
    const h = sp.length, w = sp[0].length;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const col = PALETTE[sp[y][x]];
        if (col) {
          c.fillStyle = col;
          c.fillRect(x, y, 1, 1);
        }
      }
    }
    cache[name] = cv;
    return cv;
  }

  // Отрисовка спрайта. x,y — левый верхний угол (целые), opts: {scale, flip, alpha}
  function draw(ctx, name, x, y, opts) {
    opts = opts || {};
    const scale = opts.scale || 1;
    const sp = SPRITES[name];
    const w = sp[0].length * scale;
    const h = sp.length * scale;
    x = Math.round(x);
    y = Math.round(y);
    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    if (opts.flip) {
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      ctx.drawImage(surface(name), 0, 0, w, h);
    } else {
      ctx.drawImage(surface(name), x, y, w, h);
    }
    ctx.restore();
  }

  // ---------- растровые картинки 16-bit (PNG рядом с index.html) ----------
  // hero.png — герой, enemy.png — противник, title.png — заставка.
  // Файлы заранее обрезаны и уменьшены, поэтому рисуются 1:1 (без сглаживания).
  const PIC_FILES = { player: 'hero.png', enemy: 'enemy.png', title: 'title.png' };
  const pics = {};

  function loadPics() {
    if (typeof Image === 'undefined') return; // node/тесты — без картинок
    Object.keys(PIC_FILES).forEach(function (key) {
      const im = new Image();
      im.src = PIC_FILES[key];
      pics[key] = im;
    });
  }

  function pic(key) {
    const im = pics[key];
    return im && im.complete && im.naturalWidth > 0 ? im : null;
  }

  // Отрисовка картинки по центру cx,cy; opts: {flip, alpha}. false — нет картинки.
  function drawPic(ctx, key, cx, cy, opts) {
    const im = pic(key);
    if (!im) return false;
    opts = opts || {};
    const w = im.naturalWidth;
    const h = im.naturalHeight;
    const x = Math.round(cx - w / 2);
    const y = Math.round(cy - h / 2);
    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    if (opts.flip) {
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      ctx.drawImage(im, 0, 0);
    } else {
      ctx.drawImage(im, x, y);
    }
    ctx.restore();
    return true;
  }

  loadPics();

  const api = {
    PALETTE: PALETTE,
    SPRITES: SPRITES,
    CAT: CAT,
    CAT_ICON: CAT_ICON,
    CATCHER: CATCHER,
    BONE: BONE,
    HEART: HEART,
    draw: draw,
    validate: validate,
    PIC_FILES: PIC_FILES,
    pic: pic,
    drawPic: drawPic,
    // позиции глаз в единицах спрайта CAT (2x2)
    CAT_EYES: [{ x: 2, y: 7 }, { x: 12, y: 7 }]
  };

  root.Sprites = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
