/* ============================================================
   Колесо фортуны — vanilla JS
   ============================================================ */

(() => {
  'use strict';

  // ---------- Состояние ----------
  const DEFAULT_PALETTE = [
    '#ef4444', '#f59e0b', '#10b981', '#3b82f6',
    '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
    '#6366f1', '#84cc16', '#06b6d4', '#a855f7'
  ];

  const STORAGE_KEY = 'wheel-of-fortune.v1';

  const defaultFields = () => ([
    { id: cryptoId(), label: '500₴',     color: '#ef4444' },
    { id: cryptoId(), label: '1000₴',    color: '#f59e0b' },
    { id: cryptoId(), label: '500₴',     color: '#10b981' },
    { id: cryptoId(), label: '2000₴',    color: '#3b82f6' },
    { id: cryptoId(), label: '500₴',     color: '#8b5cf6' },
    { id: cryptoId(), label: '1000₴',    color: '#ec4899' },
    { id: cryptoId(), label: '500₴',     color: '#14b8a6' },
    { id: cryptoId(), label: 'Перекрути', color: '#f97316' },
    { id: cryptoId(), label: '2х',       color: '#a855f7' },
  ]);

  function cryptoId() {
    return (crypto.randomUUID && crypto.randomUUID()) ||
      Math.random().toString(36).slice(2, 10);
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultFields();
      const data = JSON.parse(raw);
      if (!Array.isArray(data) || data.length < 2) return defaultFields();
      // sanitize
      return data
        .filter(f => f && typeof f.label === 'string' && f.label.trim())
        .map((f, i) => ({
          id: typeof f.id === 'string' ? f.id : cryptoId(),
          label: String(f.label).slice(0, 60),
          color: isValidColor(f.color) ? f.color : DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]
        }));
    } catch {
      return defaultFields();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fields));
    } catch { /* quota or disabled — ignore */ }
  }

  function isValidColor(c) {
    return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
  }

  // ---------- DOM ----------
  const canvas        = document.getElementById('wheel');
  const ctx           = canvas.getContext('2d');
  const resultEl      = document.getElementById('result');
  const fieldsList    = document.getElementById('fieldsList');
  const addBtn        = document.getElementById('addField');
  const resetBtn      = document.getElementById('reset');
  const toggleBtn     = document.getElementById('toggleEditor');
  const settingsModal = document.getElementById('settingsModal');
  const hintEl        = document.getElementById('hint');
  const confettiCnv   = document.getElementById('confetti');
  const confettiCtx   = confettiCnv.getContext('2d');

  let fields = loadState();
  let rotation = 0;           // текущий угол поворота колеса (рад)
  let spinning = false;
  let idleAnimating = true;   // крутится ли колесо в idle-режиме
  let idleSpeed = 0.18;       // рад/сек — медленное idle-вращение (≈35 сек/оборот)
  let spinState = null;       // активное состояние анимации спина (см. spin())
  let confettiParticles = [];
  let confettiAnimating = false;
  let audioCtx = null;
  let lastFrameTime = 0;
  let currentPointerColor = null; // цвет указателя (= цвет текущего сектора)

  // ---------- Canvas sizing (HiDPI) ----------
  function fitCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const size = Math.max(280, Math.floor(Math.min(rect.width, rect.height)));
    if (size <= 0) return;
    canvas.width  = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function fitConfetti() {
    const dpr = window.devicePixelRatio || 1;
    confettiCnv.width  = window.innerWidth * dpr;
    confettiCnv.height = window.innerHeight * dpr;
    confettiCnv.style.width  = window.innerWidth + 'px';
    confettiCnv.style.height = window.innerHeight + 'px';
    confettiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------- Draw ----------
  function draw() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const cx = w / 2, cy = h / 2;
    const radius = Math.min(cx, cy) - 6;

    ctx.clearRect(0, 0, w, h);

    const n = fields.length;
    if (n === 0) return;
    const arc = (Math.PI * 2) / n;

    // сектора
    for (let i = 0; i < n; i++) {
      const start = rotation + i * arc;
      const end   = start + arc;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = fields[i].color || DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
      ctx.fill();

      // тонкая граница
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.stroke();

      // подпись
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + arc / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = readableTextColor(fields[i].color);
      ctx.font = fontForRadius(radius, n);
      const maxWidth = radius * 0.78;
      const text = truncate(ctx, fields[i].label, maxWidth);
      ctx.fillText(text, radius - 12, 0);
      ctx.restore();
    }

    // внешний круг
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#111827';
    ctx.stroke();

    // центральный диск (декоративный, без надписи)
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#e5e7eb';
    ctx.stroke();

    // маленький dot по центру для акцента
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#111827';
    ctx.fill();

    // Указатель справа от колеса (3 часа), остриём влево (внутрь).
    // Основание ВЫСТУПАЕТ за край колеса, остриё входит внутрь.
    // Цвет = текущий сектор под указателем.
    drawPointer(cx, cy, radius, currentPointerColor || (fields[0] && fields[0].color) || '#ef4444');
  }

  function drawPointer(cx, cy, radius, color) {
    // Размеры — крупные, как на референсе spinthewheel.io
    const halfH = 22;                                  // половина высоты основания
    const baseProtrusion = 8;                          // насколько основание торчит наружу
    const tipInset = 12;                               // насколько остриё уходит внутрь
    const baseX = cx + radius + baseProtrusion;        // основание снаружи справа
    const tipX  = cx + radius - tipInset;              // остриё чуть внутри справа

    // Защита от пустого цвета
    const fill = (typeof color === 'string' && color.length > 0) ? color : '#ef4444';

    ctx.save();

    // 1) ТЕНЬ — рисуем отдельным смещённым path (так надёжнее, чем через ctx.shadow*)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.moveTo(tipX + 2, cy + 3);
    ctx.lineTo(baseX + 2, cy - halfH + 3);
    ctx.lineTo(baseX + 2, cy + halfH + 3);
    ctx.closePath();
    ctx.fill();

    // 2) ЗАЛИВКА цветом сектора
    ctx.beginPath();
    ctx.moveTo(tipX, cy);
    ctx.lineTo(baseX, cy - halfH);
    ctx.lineTo(baseX, cy + halfH);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    // 3) БЕЛАЯ ОБВОДКА (поверх заливки)
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.restore();
  }

  function fontForRadius(r, n) {
    // адаптивный размер шрифта: больше радиус → больше шрифт,
    // больше полей → меньше шрифт
    const base = Math.max(10, Math.min(20, r * 0.07));
    const factor = n <= 6 ? 1 : n <= 10 ? 0.85 : 0.7;
    return `600 ${Math.floor(base * factor)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
  }

  function truncate(c, text, maxWidth) {
    if (c.measureText(text).width <= maxWidth) return text;
    let lo = 0, hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (c.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return text.slice(0, lo) + '…';
  }

  // Белая или чёрная подпись в зависимости от яркости фона
  function readableTextColor(hex) {
    const c = hex.replace('#', '');
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    // яркость по sRGB
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? '#111827' : '#ffffff';
  }

  // ---------- Spin ----------
  // Указатель смотрит вправо (3 часа) — угол 0 в нашей системе.
  // Чтобы указатель попал на центр сектора i:
  //   rotation + i*arc + arc/2 = 0  (mod 2π)
  //   rotation = -i*arc - arc/2    (mod 2π)
  // Добавляем N полных оборотов вперёд (rotation растёт → движение по часовой).
  function spin() {
    if (spinning) return;
    if (fields.length < 2) {
      flashResult('Нужно минимум 2 поля', false);
      return;
    }

    // Останавливаем idle-вращение, скрываем подсказку
    idleAnimating = false;
    hideHint();

    spinning = true;
    resultEl.textContent = '';
    resultEl.classList.remove('win');

    const n = fields.length;
    const arc = (Math.PI * 2) / n;
    const winnerIndex = Math.floor(Math.random() * n);

    const targetForWinner = ((-winnerIndex * arc - arc / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);

    // полные обороты (5–7), чтобы анимация была эффектной
    const fullTurns = 5 + Math.floor(Math.random() * 3);

    const currentTurns = Math.floor(rotation / (Math.PI * 2));
    let finalAngle = (currentTurns + fullTurns) * (Math.PI * 2) + targetForWinner;

    // Гарантируем минимум один полный оборот анимации
    while (finalAngle < rotation + Math.PI * 2) {
      finalAngle += Math.PI * 2;
    }

    const duration = 4500 + Math.random() * 1500;
    const startAngle = rotation;
    const startTime = performance.now();
    const totalDelta = finalAngle - startAngle;

    // триггер «тика» при пересечении границы сектора
    // Нормализуем к [0, n), чтобы корректно работать с любым startAngle
    let lastSector = ((Math.floor((-startAngle) / arc) % n) + n) % n;

    audioCtx = ensureAudio(audioCtx);

    // Сохраняем в замыкании для главного render-loop
    spinState = {
      startTime,
      duration,
      startAngle,
      totalDelta,
      arc,
      n,
      lastSector,
      winnerIndex,
      finished: false
    };
  }

  function hideHint() {
    if (hintEl) hintEl.classList.add('hidden');
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function flashResult(text, isWin) {
    resultEl.textContent = text;
    if (isWin) {
      resultEl.classList.add('win');
    } else {
      resultEl.classList.remove('win');
    }
  }

  // ---------- Audio (WebAudio synth, no files) ----------
  function ensureAudio(ctxA) {
    if (ctxA) return ctxA;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const c = new AC();
      return c;
    } catch { return null; }
  }

  function playTick(ctxA) {
    if (!ctxA) return;
    if (ctxA.state === 'suspended') ctxA.resume().catch(() => {});
    const t0 = ctxA.currentTime;
    const osc = ctxA.createOscillator();
    const gain = ctxA.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(900, t0);
    osc.frequency.exponentialRampToValueAtTime(400, t0 + 0.05);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
    osc.connect(gain).connect(ctxA.destination);
    osc.start(t0);
    osc.stop(t0 + 0.08);
  }

  function playWin(ctxA) {
    if (!ctxA) return;
    if (ctxA.state === 'suspended') ctxA.resume().catch(() => {});
    const t0 = ctxA.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctxA.createOscillator();
      const gain = ctxA.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t0 + i * 0.09);
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + i * 0.09 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.09 + 0.45);
      osc.connect(gain).connect(ctxA.destination);
      osc.start(t0 + i * 0.09);
      osc.stop(t0 + i * 0.09 + 0.5);
    });
  }

  // ---------- Confetti ----------
  function launchConfetti(originColor) {
    fitConfetti();
    const w = confettiCnv.clientWidth;
    const h = confettiCnv.clientHeight;
    const colors = [originColor, ...DEFAULT_PALETTE].filter(isValidColor);
    const N = 140;

    for (let i = 0; i < N; i++) {
      const fromLeft = Math.random() < 0.5;
      confettiParticles.push({
        x: fromLeft ? -10 : w + 10,
        y: h * (0.4 + Math.random() * 0.5),
        vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 8),
        vy: -8 - Math.random() * 6,
        g:  0.25 + Math.random() * 0.15,
        size: 6 + Math.random() * 6,
        rot: Math.random() * Math.PI * 2,
        vr:  (Math.random() - 0.5) * 0.3,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1,
        shape: Math.random() < 0.5 ? 'rect' : 'circle'
      });
    }
    if (!confettiAnimating) {
      confettiAnimating = true;
      requestAnimationFrame(confettiFrame);
    }
  }

  function confettiFrame() {
    const w = confettiCnv.clientWidth;
    const h = confettiCnv.clientHeight;
    confettiCtx.clearRect(0, 0, w, h);

    const next = [];
    for (const p of confettiParticles) {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= 0.008;

      if (p.life > 0 && p.y < h + 40) {
        drawParticle(p);
        next.push(p);
      }
    }
    confettiParticles = next;

    if (confettiParticles.length > 0) {
      requestAnimationFrame(confettiFrame);
    } else {
      confettiAnimating = false;
      confettiCtx.clearRect(0, 0, w, h);
    }
  }

  function drawParticle(p) {
    confettiCtx.save();
    confettiCtx.globalAlpha = Math.max(0, Math.min(1, p.life));
    confettiCtx.translate(p.x, p.y);
    confettiCtx.rotate(p.rot);
    confettiCtx.fillStyle = p.color;
    if (p.shape === 'rect') {
      confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    } else {
      confettiCtx.beginPath();
      confettiCtx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      confettiCtx.fill();
    }
    confettiCtx.restore();
  }

  // ---------- Editor ----------
  function renderEditor() {
    fieldsList.innerHTML = '';
    fields.forEach((f, i) => {
      const li = document.createElement('li');
      li.className = 'field-row';
      li.dataset.id = f.id;

      const color = document.createElement('input');
      color.type = 'color';
      color.value = f.color || DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
      color.setAttribute('aria-label', `Цвет поля ${f.label}`);
      color.addEventListener('input', e => {
        f.color = e.target.value;
        saveState();
        // Если меняем цвет текущего сектора под указателем — обновить цвет указателя
        if (currentPointerColor && f.color) currentPointerColor = f.color;
        draw();
      });

      const text = document.createElement('input');
      text.type = 'text';
      text.value = f.label;
      text.maxLength = 60;
      text.setAttribute('aria-label', `Название поля ${i + 1}`);
      text.addEventListener('input', e => {
        f.label = e.target.value;
        saveState();
        draw();
      });

      const remove = document.createElement('button');
      remove.className = 'remove';
      remove.title = 'Удалить поле';
      remove.setAttribute('aria-label', `Удалить поле ${f.label}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => removeField(f.id));

      li.append(color, text, remove);
      fieldsList.appendChild(li);
    });
  }

  function addField() {
    if (fields.length >= 24) {
      flashResult('Максимум 24 поля', false);
      return;
    }
    fields.push({
      id: cryptoId(),
      label: `Поле ${fields.length + 1}`,
      color: DEFAULT_PALETTE[fields.length % DEFAULT_PALETTE.length]
    });
    saveState();
    renderEditor();
    draw();
  }

  function removeField(id) {
    if (fields.length <= 2) {
      flashResult('Должно остаться минимум 2 поля', false);
      return;
    }
    fields = fields.filter(f => f.id !== id);
    saveState();
    renderEditor();
    draw();
  }

  function resetAll() {
    fields = defaultFields();
    rotation = 0;
    saveState();
    renderEditor();
    draw();
    flashResult('', false);
  }

  // ---------- Wiring ----------
  addBtn.addEventListener('click', addField);
  resetBtn.addEventListener('click', resetAll);

  // Открытие/закрытие модалки настроек
  function openSettings() {
    settingsModal.setAttribute('aria-hidden', 'false');
    // Небольшая задержка, чтобы фокус перешёл после анимации
    setTimeout(() => {
      const firstInput = settingsModal.querySelector('input[type="text"]');
      if (firstInput) firstInput.focus();
    }, 50);
  }
  function closeSettings() {
    settingsModal.setAttribute('aria-hidden', 'true');
  }
  toggleBtn.addEventListener('click', openSettings);
  settingsModal.addEventListener('click', e => {
    if (e.target.matches('[data-close]')) closeSettings();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && settingsModal.getAttribute('aria-hidden') === 'false') {
      closeSettings();
    }
  });

  // Клавиатура: Space / Enter — крутить
  document.addEventListener('keydown', e => {
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (settingsModal.getAttribute('aria-hidden') === 'false') return;
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      spin();
    }
  });

  // Клик по колесу — спин (если не в процессе)
  canvas.addEventListener('click', () => {
    if (!spinning && !spinState) spin();
  });

  // Resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      fitCanvas();
      fitConfetti();
    }, 100);
  });

  // ---------- Главный render-loop ----------
  // Один RAF-цикл, который обрабатывает три режима:
  // 1) spinning: идёт анимация спина (см. spinState)
  // 2) idle: колесо медленно вращается
  // 3) idle-after-win: пауза 2.5 сек после победы, потом снова idle
  function frame(now) {
    if (!lastFrameTime) lastFrameTime = now;
    const dt = Math.min(0.1, (now - lastFrameTime) / 1000); // cap на случай лагов
    lastFrameTime = now;

    if (spinState) {
      const t = Math.min(1, (now - spinState.startTime) / spinState.duration);
      const eased = easeOutCubic(t);
      rotation = spinState.startAngle + spinState.totalDelta * eased;
      draw();

      // tick + обновление цвета указателя при смене сектора
      const curSector = ((Math.floor((-rotation) / spinState.arc) % spinState.n) + spinState.n) % spinState.n;
      if (curSector !== spinState.lastSector) {
        spinState.lastSector = curSector;
        playTick(audioCtx);
        const f = fields[curSector];
        if (f) currentPointerColor = f.color;
      }

      if (t >= 1) {
        const s = spinState;
        spinState = null;
        spinning = false;
        const winner = fields[s.winnerIndex];
        flashResult(winner.label, true);
        playWin(audioCtx);
        launchConfetti(winner.color);
        // Явно обновить цвет указателя на цвет победителя
        if (winner && winner.color) currentPointerColor = winner.color;
        draw();
        // Возвращаем idle-вращение через 2.5 секунды после победы,
        // чтобы пользователь успел прочитать результат.
        setTimeout(() => {
          if (!spinning && !spinState) idleAnimating = true;
        }, 2500);
      }
    } else if (idleAnimating) {
      rotation += idleSpeed * dt;
      draw();

      // Цвет указателя в idle — пересчитываем каждый кадр
      if (fields.length > 0) {
        const arc = (Math.PI * 2) / fields.length;
        const idx = ((Math.floor((-rotation) / arc) % fields.length) + fields.length) % fields.length;
        const f = fields[idx];
        if (f) currentPointerColor = f.color;
      }
    }
    // else: ничего не делаем (статичная картинка)

    requestAnimationFrame(frame);
  }

  // ---------- Init ----------
  // Стартовый цвет указателя = цвет первого сектора
  if (fields.length > 0) {
    currentPointerColor = fields[0].color;
  }

  renderEditor();
  fitCanvas();
  fitConfetti();
  draw();  // первый кадр сразу с правильным цветом указателя
  requestAnimationFrame(frame);

  // для отладки в консоли
  window.__wheel = { get fields() { return fields; }, spin };
})();
