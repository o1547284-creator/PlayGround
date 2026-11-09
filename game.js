(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const ui = {
    title: $('title-screen'), pause: $('pause-screen'), end: $('end-screen'),
    start: $('start-btn'), resume: $('resume-btn'), again: $('again-btn'),
    pauseBtn: $('pause-btn'), soundBtn: $('sound-btn'), hp: $('hero-hp'), hpText: $('hp-text'),
    bossHp: $('boss-hp'), bossPercent: $('boss-percent'), quest: $('quest-text'),
    toast: $('toast'), endEyebrow: $('end-eyebrow'), endTitle: $('end-title'), endCopy: $('end-copy')
  };
  const keys = new Set();
  const held = { left: false, right: false };
  let W = 0, H = 0, dpr = 1, last = 0, elapsed = 0, state = 'title';
  let camera = 0, shake = 0, soundOn = false, audio = null, toastTimer = 0;
  let player, boss, shots, particles, slashes, stars, platforms, worldEnd;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rectHit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = Math.max(320, rect.width); H = Math.max(300, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (player) {
      player.y = Math.min(player.y, floorY() - player.h);
      worldEnd = Math.max(worldEnd, W + 900);
    }
  }
  const floorY = () => H - (H < 460 ? 68 : 82);
  const floorTop = () => floorY();

  function reset() {
    worldEnd = Math.max(1900, W + 1150);
    player = { x: 100, y: floorY() - 48, w: 29, h: 48, vx: 0, vy: 0, hp: 100, face: 1,
      grounded: true, invuln: 0, attackCd: 0, dashCd: 0, dashTime: 0, jumpLock: false, anim: 0 };
    boss = { x: Math.max(590, Math.min(850, W * .76)), y: floorY() - 102, w: 76, h: 102,
      hp: 100, face: -1, phase: 1, mode: 'stalk', timer: 1.4, attackCd: 0, hitFlash: 0, anim: 0, vulnerable: false };
    shots = []; particles = []; slashes = []; camera = 0; shake = 0; elapsed = 0;
    platforms = [
      { x: 300, y: floorY() - 105, w: 145, h: 14 },
      { x: 670, y: floorY() - 150, w: 150, h: 14 },
      { x: 1110, y: floorY() - 96, w: 170, h: 14 },
      { x: 1510, y: floorY() - 145, w: 145, h: 14 }
    ];
    stars = Array.from({ length: 95 }, () => ({ x: Math.random() * 2600, y: rand(20, H * .75), r: rand(.5, 1.8), a: rand(.14, .75), p: rand(0, 7) }));
    ui.hp.style.width = '100%'; ui.hpText.textContent = '100 / 100';
    ui.bossHp.style.width = '100%'; ui.bossPercent.textContent = '100%';
    ui.quest.textContent = 'Defeat the Hollow Warden';
    ui.toast.classList.remove('show');
  }

  function showToast(message) {
    ui.toast.textContent = message; ui.toast.classList.add('show'); toastTimer = 1.4;
  }
  function setState(next) {
    state = next;
    ui.title.classList.toggle('visible', next === 'title');
    ui.pause.classList.toggle('visible', next === 'paused');
    ui.end.classList.toggle('visible', next === 'won' || next === 'lost');
    ui.pauseBtn.textContent = next === 'paused' ? '▶' : 'Ⅱ';
  }
  function startGame() { reset(); setState('playing'); last = performance.now(); }
  function finish(won) {
    setState(won ? 'won' : 'lost');
    ui.endEyebrow.textContent = won ? 'RIFT SEALED' : 'THE RIFT CLAIMS YOU';
    ui.endTitle.textContent = won ? 'VICTORY' : 'DEFEATED';
    ui.endCopy.textContent = won ? 'The Sunken Rift falls quiet. The shards are yours.' : 'The Hollow Warden still guards the shards. Try again.';
  }

  function audioBlip(freq = 220, duration = .08, type = 'sine', volume = .035) {
    if (!soundOn) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const osc = audio.createOscillator(), gain = audio.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, audio.currentTime);
      gain.gain.setValueAtTime(volume, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
      osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + duration);
    } catch (_) { /* Audio is an optional flourish. */ }
  }
  function burst(x, y, color, count = 10, speed = 140) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), v = rand(speed * .35, speed);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(.25, .65), max: .65, size: rand(2, 5), color });
    }
  }
  function attack() {
    if (state !== 'playing' || player.attackCd > 0) return;
    player.attackCd = .29;
    slashes.push({ x: player.x + player.w / 2 + player.face * 29, y: player.y + 22, dir: player.face, life: .22, max: .22, hit: false });
    audioBlip(460, .07, 'triangle', .025);
  }
  function jump() {
    if (state !== 'playing' || !player.grounded) return;
    player.vy = -480; player.grounded = false; audioBlip(300, .09, 'sine', .02);
  }
  function dash() {
    if (state !== 'playing' || player.dashCd > 0) return;
    player.dashCd = .82; player.dashTime = .16; player.invuln = Math.max(player.invuln, .22);
    player.vx = player.face * 520; burst(player.x + player.w / 2, player.y + player.h * .65, '#76f6df', 7, 85);
    audioBlip(170, .11, 'sawtooth', .018);
  }
  function takeDamage(amount, sourceX) {
    if (player.invuln > 0 || state !== 'playing') return;
    player.hp = Math.max(0, player.hp - amount); player.invuln = .9;
    player.vx = (player.x + player.w / 2 < sourceX ? -1 : 1) * 235; player.vy = -180;
    shake = 8; burst(player.x + player.w / 2, player.y + 20, '#ff7b91', 12, 125);
    ui.hp.style.width = `${player.hp}%`; ui.hpText.textContent = `${player.hp} / 100`;
    audioBlip(95, .18, 'square', .045);
    if (player.hp <= 0) finish(false);
  }
  function hurtBoss(damage) {
    if (boss.hp <= 0 || state !== 'playing') return;
    boss.hp = Math.max(0, boss.hp - damage); boss.hitFlash = .15;
    boss.vulnerable = true; boss.timer = Math.max(boss.timer, .28);
    ui.bossHp.style.width = `${boss.hp}%`; ui.bossPercent.textContent = `${Math.ceil(boss.hp)}%`;
    burst(boss.x + boss.w / 2, boss.y + 42, '#d58bff', 9, 110);
    shake = Math.max(shake, 3); audioBlip(620, .06, 'triangle', .03);
    if (boss.hp <= 66 && boss.phase === 1) { boss.phase = 2; boss.mode = 'roar'; boss.timer = 1.05; showToast('THE WARDEN AWAKENS'); burst(boss.x + boss.w / 2, boss.y + 50, '#f08aff', 28, 230); }
    if (boss.hp <= 33 && boss.phase === 2) { boss.phase = 3; boss.mode = 'roar'; boss.timer = .9; showToast('RIFT SURGE · PHASE III'); burst(boss.x + boss.w / 2, boss.y + 50, '#75f6df', 35, 250); }
    if (boss.hp <= 0) { ui.quest.textContent = 'Rift guardian defeated'; finish(true); }
  }

  function doSlashHits() {
    for (const slash of slashes) {
      if (slash.hit) continue;
      const sx = player.x + player.w / 2 + slash.dir * 36;
      const box = { x: sx - 32, y: player.y + 5, w: 64, h: 47 };
      const target = { x: boss.x + 4, y: boss.y + 6, w: boss.w - 8, h: boss.h - 4 };
      if (rectHit(box, target)) { slash.hit = true; hurtBoss(8.5); }
    }
  }

  function updateBoss(dt) {
    if (boss.hp <= 0) return;
    boss.anim += dt; boss.hitFlash = Math.max(0, boss.hitFlash - dt);
    boss.attackCd = Math.max(0, boss.attackCd - dt);
    const dx = (player.x + player.w / 2) - (boss.x + boss.w / 2);
    boss.face = dx < 0 ? -1 : 1;
    if (boss.mode === 'roar') {
      boss.timer -= dt;
      if (boss.timer <= 0) { boss.mode = 'stalk'; boss.timer = .35; }
    } else if (boss.mode === 'windup') {
      boss.timer -= dt;
      if (boss.timer <= 0) {
        if (boss.attackType === 'slam') {
          burst(boss.x + boss.w / 2, floorY() - 8, '#d985ff', 18, 200);
          const near = Math.abs(dx) < (boss.phase === 3 ? 175 : 135);
          if (near && player.y + player.h > floorY() - 95) takeDamage(boss.phase === 3 ? 14 : 10, boss.x + boss.w / 2);
          const dir = dx < 0 ? -1 : 1;
          shots.push({ x: boss.x + boss.w / 2 + dir * 22, y: floorY() - 21, w: 25, h: 13, vx: dir * (boss.phase === 3 ? 350 : 260), vy: -45, life: 3, damage: 10, color: '#d681ff', ground: true });
        } else {
          const n = boss.phase === 3 ? 5 : boss.phase === 2 ? 3 : 1;
          for (let i = 0; i < n; i++) {
            const aimX = player.x + player.w / 2, aimY = player.y + player.h * .48 + (i - (n - 1) / 2) * (boss.phase === 3 ? 48 : 25);
            const ox = boss.x + boss.w / 2, oy = boss.y + 39;
            const mag = Math.hypot(aimX - ox, aimY - oy) || 1, speed = boss.phase === 3 ? 295 : 245;
            shots.push({ x: ox, y: oy, w: 17, h: 17, vx: (aimX - ox) / mag * speed, vy: (aimY - oy) / mag * speed, life: 3.2, damage: 8, color: '#c27bff' });
          }
        }
        boss.mode = 'recover'; boss.timer = boss.phase === 3 ? .46 : .68; boss.attackCd = boss.phase === 3 ? .35 : .65;
        shake = Math.max(shake, boss.attackType === 'slam' ? 5 : 2);
      }
    } else if (boss.mode === 'recover') {
      boss.timer -= dt;
      if (boss.timer <= 0) boss.mode = 'stalk';
    } else {
      const speed = boss.phase === 3 ? 90 : boss.phase === 2 ? 68 : 46;
      if (Math.abs(dx) > 102) boss.x += Math.sign(dx) * speed * dt;
      else boss.x += Math.sign(dx) * speed * .22 * dt;
      if (boss.timer > 0) boss.timer -= dt;
      if (boss.attackCd <= 0 && boss.timer <= 0) {
        boss.attackType = Math.abs(dx) < 225 && Math.random() < (boss.phase === 3 ? .72 : .55) ? 'slam' : 'volley';
        boss.mode = 'windup'; boss.timer = boss.phase === 3 ? .48 : .7;
        boss.vulnerable = false;
      }
    }
    boss.x = clamp(boss.x, 120, worldEnd - boss.w - 20);
  }

  function update(dt) {
    elapsed += dt;
    if (toastTimer > 0 && (toastTimer -= dt) <= 0) ui.toast.classList.remove('show');
    if (state !== 'playing') return;
    player.anim += dt * (Math.abs(player.vx) > 15 ? 11 : 3);
    player.invuln = Math.max(0, player.invuln - dt);
    player.attackCd = Math.max(0, player.attackCd - dt);
    player.dashCd = Math.max(0, player.dashCd - dt);
    const left = keys.has('ArrowLeft') || keys.has('KeyA') || held.left;
    const right = keys.has('ArrowRight') || keys.has('KeyD') || held.right;
    const axis = (right ? 1 : 0) - (left ? 1 : 0);
    if (axis) player.face = axis;
    else if (Math.abs((boss.x + boss.w / 2) - (player.x + player.w / 2)) < 180) {
      player.face = boss.x + boss.w / 2 < player.x + player.w / 2 ? -1 : 1;
    }
    if (player.dashTime > 0) {
      player.dashTime -= dt; player.vx = player.face * 520;
    } else {
      const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 245 : 190;
      player.vx += (axis * speed - player.vx) * Math.min(1, dt * (axis ? 13 : 10));
    }
    const prevY = player.y;
    if (player.dashTime <= 0) player.vy += 1250 * dt;
    player.x += player.vx * dt; player.y += player.vy * dt;
    player.x = clamp(player.x, 0, worldEnd - player.w);
    player.grounded = false;
    const bottom = player.y + player.h;
    if (player.vy >= 0) {
      let landing = floorTop();
      for (const p of platforms) {
        if (player.x + player.w > p.x + 4 && player.x < p.x + p.w - 4 && prevY + player.h <= p.y + 3 && bottom >= p.y) landing = Math.min(landing, p.y);
      }
      if (bottom >= landing) { player.y = landing - player.h; player.vy = 0; player.grounded = true; }
    }
    player.y = Math.min(player.y, floorY() - player.h);
    if (player.y + player.h >= floorY()) { player.y = floorY() - player.h; player.vy = 0; player.grounded = true; }
    if (player.dashTime <= 0 && Math.abs(player.vx) > 320) player.vx = Math.sign(player.vx) * 320;

    updateBoss(dt);
    doSlashHits();
    for (const s of shots) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.ground) s.y += Math.sin(elapsed * 12) * 1.3;
      if (rectHit(player, s)) { takeDamage(s.damage, s.x); s.life = 0; burst(s.x, s.y, s.color, 7, 90); }
    }
    shots = shots.filter(s => s.life > 0 && s.x > camera - 100 && s.x < camera + W + 140 && s.y < H + 50 && s.y > -80);
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(.05, dt); p.vy = p.vy * Math.pow(.08, dt) + 35 * dt; p.life -= dt; }
    particles = particles.filter(p => p.life > 0);
    for (const s of slashes) s.life -= dt;
    slashes = slashes.filter(s => s.life > 0);
    const targetCamera = clamp(player.x - W * .38, 0, worldEnd - W);
    camera += (targetCamera - camera) * Math.min(1, dt * 5);
    shake = Math.max(0, shake - dt * 25);
  }

  function polygon(points, fill, stroke, width = 1) {
    ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#101327'); sky.addColorStop(.52, '#17142d'); sky.addColorStop(1, '#090d19');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * .52, H * .48, 10, W * .52, H * .48, H * .68);
    glow.addColorStop(0, '#56316e55'); glow.addColorStop(.55, '#2922491c'); glow.addColorStop(1, '#080d1900');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      let x = (s.x - camera * .16) % (W + 80); if (x < -40) x += W + 80;
      ctx.globalAlpha = s.a * (.7 + Math.sin(elapsed * 1.7 + s.p) * .3);
      ctx.fillStyle = s.r > 1.4 ? '#b7a3ff' : '#89e9e2';
      ctx.fillRect(x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
    const horizon = floorY() - 13;
    for (let i = -2; i < 13; i++) {
      const x = i * 150 - (camera * .32 % 150);
      const height = 50 + ((i * 47 + 240) % 93);
      polygon([[x - 60, horizon], [x - 10, horizon - height], [x + 8, horizon - 48], [x + 45, horizon - height * .74], [x + 95, horizon]], '#131528', '#29253e', 1);
      ctx.fillStyle = '#282243'; ctx.fillRect(x - 11, horizon - height + 12, 2, 19);
    }
    const riftX = W * .51 - camera * .04;
    ctx.save(); ctx.translate(riftX, H * .48); ctx.scale(1, .63);
    ctx.strokeStyle = '#b769ff28'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, H * .22, H * .22, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#65efe01c'; ctx.beginPath(); ctx.ellipse(0, 0, H * .28, H * .28, 0, .3, Math.PI * 1.9); ctx.stroke(); ctx.restore();
    const ground = ctx.createLinearGradient(0, floorY(), 0, H);
    ground.addColorStop(0, '#27223c'); ground.addColorStop(.11, '#19172c'); ground.addColorStop(1, '#090e1a');
    ctx.fillStyle = ground; ctx.fillRect(0, floorY(), W, H - floorY());
    ctx.fillStyle = '#8f6bb0'; ctx.globalAlpha = .7; ctx.fillRect(0, floorY(), W, 2); ctx.globalAlpha = 1;
    for (let i = 0; i < 32; i++) {
      const x = (i * 97 - camera * .7) % (W + 100); const xx = x < -50 ? x + W + 100 : x;
      ctx.fillStyle = i % 3 ? '#493852' : '#735474'; ctx.fillRect(xx, floorY() + 14 + (i * 19) % 48, 2 + i % 3, 1);
    }
  }

  function drawPlatforms() {
    for (const p of platforms) {
      ctx.fillStyle = '#080d18'; ctx.fillRect(p.x, p.y, p.w, p.h + 12);
      ctx.fillStyle = '#38304d'; ctx.fillRect(p.x, p.y + 3, p.w, p.h + 6);
      ctx.fillStyle = '#8a6ba3'; ctx.fillRect(p.x, p.y, p.w, 3);
      ctx.fillStyle = '#68e6d3'; ctx.globalAlpha = .62; ctx.fillRect(p.x + 8, p.y, 22, 2); ctx.globalAlpha = 1;
      for (let x = p.x + 18; x < p.x + p.w - 8; x += 35) {
        ctx.fillStyle = '#201c32'; ctx.fillRect(x, p.y + 9, 6, 2);
      }
    }
  }

  function drawPlayer() {
    const px = player.x, py = player.y, cx = px + player.w / 2;
    if (player.invuln > 0 && Math.floor(elapsed * 19) % 2 === 0) return;
    if (player.dashTime > 0) {
      for (let i = 3; i > 0; i--) {
        ctx.globalAlpha = .10 + (4 - i) * .07; ctx.fillStyle = '#76f6df';
        ctx.fillRect(px - player.face * i * 12, py + 7, player.w, player.h - 10);
      }
      ctx.globalAlpha = 1;
    }
    const run = Math.sin(player.anim) * (player.grounded ? 3 : 0);
    ctx.save(); ctx.translate(cx, py); ctx.scale(player.face, 1);
    ctx.fillStyle = '#070a14'; ctx.fillRect(-13, 39 + run, 10, 9); ctx.fillRect(3, 39 - run, 10, 9);
    ctx.fillStyle = '#4d426f'; ctx.fillRect(-12, 38 + run, 9, 7); ctx.fillRect(4, 38 - run, 9, 7);
    polygon([[-13, 13], [11, 12], [15, 36], [8, 41], [-12, 37]], '#283249', '#69708a', 1);
    polygon([[-12, 17], [-24, 38], [-18, 42], [-6, 26]], '#684c84', '#a16ab3', 1);
    ctx.fillStyle = '#edc2a9'; ctx.fillRect(-10, 2, 20, 17);
    ctx.fillStyle = '#22253a'; ctx.fillRect(-12, -1, 23, 8); ctx.fillRect(-9, -5, 17, 7);
    ctx.fillStyle = '#7df5df'; ctx.fillRect(2, 7, 5, 3); ctx.shadowColor = '#69ffee'; ctx.shadowBlur = 9; ctx.fillRect(3, 7, 3, 2); ctx.shadowBlur = 0;
    ctx.fillStyle = '#d1d9e7'; ctx.fillRect(8, 20, 4, 14);
    ctx.restore();
    if (player.attackCd > .19) {
      ctx.save(); ctx.translate(cx + player.face * 13, py + 27); ctx.scale(player.face, 1);
      ctx.strokeStyle = '#8dffe8'; ctx.lineWidth = 4; ctx.shadowColor = '#82ffed'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(0, 0, 35, -.95, .95); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.strokeStyle = '#fff4bd'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 34, -.72, .6); ctx.stroke(); ctx.restore();
    }
  }

  function drawBoss() {
    if (boss.hp <= 0) return;
    const x = boss.x, y = boss.y, cx = x + boss.w / 2, pulse = Math.sin(elapsed * 4) * 3;
    const tint = boss.hitFlash > 0 ? '#fff1ff' : '#241c3d';
    if (boss.mode === 'windup') {
      if (boss.attackType === 'slam') {
        const ringX = clamp(player.x + player.w / 2, camera + 20, camera + W - 20);
        ctx.globalAlpha = .5 + Math.sin(elapsed * 14) * .16; ctx.strokeStyle = '#ff718d'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(ringX, floorY() - 3, 42 + (1 - boss.timer / (boss.phase === 3 ? .48 : .7)) * 27, 9, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ff718d'; ctx.fillRect(ringX - 2, floorY() - 13, 4, 10); ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = '#dd8aff'; ctx.globalAlpha = .55 + Math.sin(elapsed * 18) * .3; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, y + 40, 29 + Math.sin(elapsed * 11) * 4, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
    ctx.save(); ctx.translate(cx, y); ctx.scale(boss.face, 1);
    ctx.shadowColor = '#a54ce5'; ctx.shadowBlur = 25 + pulse;
    polygon([[-34, 30], [-28, 6], [-17, 0], [15, 2], [33, 22], [28, 70], [42, 94], [10, 83], [-4, 101], [-17, 82], [-39, 93], [-30, 66]], tint, '#9d62b8', 2);
    ctx.shadowBlur = 0;
    polygon([[-26, 42], [-50, 72], [-39, 81], [-13, 62]], '#322248', '#7b4c91', 1);
    polygon([[22, 41], [47, 69], [38, 79], [13, 61]], '#322248', '#7b4c91', 1);
    polygon([[-26, 11], [-39, -1], [-32, 19], [-20, 22]], '#5a3d72', '#b77bd0', 1);
    polygon([[17, 10], [34, -3], [29, 21], [16, 23]], '#5a3d72', '#b77bd0', 1);
    ctx.fillStyle = '#101321'; ctx.fillRect(-21, 21, 43, 21);
    ctx.fillStyle = boss.phase === 3 ? '#84fff0' : '#fa86ff'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 16;
    ctx.fillRect(-12, 28, 8, 4); ctx.fillRect(7, 28, 8, 4); ctx.shadowBlur = 0;
    ctx.fillStyle = '#7b56a4'; ctx.fillRect(-10, 50, 20, 4);
    ctx.fillStyle = '#bd77d9'; ctx.fillRect(-4, 61, 8, 19);
    ctx.fillStyle = '#77e9db'; ctx.fillRect(-2, 65, 4, 10);
    ctx.restore();
    const barW = boss.w + 12;
    ctx.fillStyle = '#0a0c18'; ctx.fillRect(cx - barW / 2, y - 14, barW, 4);
    ctx.fillStyle = '#d27aff'; ctx.fillRect(cx - barW / 2, y - 14, barW * boss.hp / 100, 4);
  }

  function drawEffects() {
    for (const s of shots) {
      ctx.save(); ctx.translate(s.x + s.w / 2, s.y + s.h / 2);
      ctx.fillStyle = s.color; ctx.shadowColor = s.color; ctx.shadowBlur = 17;
      if (s.ground) { ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h); ctx.fillStyle = '#ffe4ff'; ctx.fillRect(-s.w / 2 + 5, -2, s.w - 10, 3); }
      else { ctx.beginPath(); ctx.arc(0, 0, s.w / 2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#f5dcff'; ctx.beginPath(); ctx.arc(-2, -2, 3, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 9;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    for (const s of slashes) {
      const cx = player.x + player.w / 2 + s.dir * 36;
      const progress = 1 - s.life / s.max;
      ctx.globalAlpha = 1 - progress; ctx.strokeStyle = '#bafff1'; ctx.lineWidth = 5 * (1 - progress * .45); ctx.shadowColor = '#76ffe6'; ctx.shadowBlur = 13;
      ctx.beginPath(); ctx.arc(cx, player.y + 24, 28 + progress * 12, s.dir === 1 ? -.9 + progress * .6 : Math.PI + .3 - progress * .6, s.dir === 1 ? .75 + progress * .6 : Math.PI + 2.05 - progress * .6); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground();
    ctx.save();
    if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake * .45, shake * .45));
    ctx.translate(-camera, 0);
    drawPlatforms(); drawBoss(); drawPlayer(); drawEffects();
    ctx.restore();
    if (state === 'playing') {
      const prompt = Math.abs((boss.x + boss.w / 2) - (player.x + player.w / 2)) < 115 && boss.mode !== 'windup' ? 'STRIKE THE WARDEN' : '';
      if (prompt) {
        ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#d6c6ff'; ctx.globalAlpha = .8;
        ctx.fillText(prompt, boss.x + boss.w / 2 - camera, boss.y - 25); ctx.globalAlpha = 1;
      }
    }
  }

  function frame(now) {
    const dt = Math.min(.04, Math.max(0, (now - last) / 1000 || 0)); last = now;
    update(dt); draw(); requestAnimationFrame(frame);
  }

  function togglePause() {
    if (state === 'playing') setState('paused');
    else if (state === 'paused') { setState('playing'); last = performance.now(); }
  }
  ui.start.addEventListener('click', startGame);
  ui.again.addEventListener('click', startGame);
  ui.resume.addEventListener('click', togglePause);
  ui.pauseBtn.addEventListener('click', togglePause);
  ui.soundBtn.addEventListener('click', () => {
    soundOn = !soundOn; ui.soundBtn.style.color = soundOn ? '#76f6df' : '';
    ui.soundBtn.setAttribute('aria-label', soundOn ? 'Mute sound' : 'Enable sound');
    if (soundOn) audioBlip(520, .08, 'sine', .02);
  });
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) event.preventDefault();
    keys.add(event.code);
    if (event.repeat) return;
    if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') jump();
    if (event.code === 'KeyJ' || event.code === 'KeyZ' || event.code === 'Enter') attack();
    if (event.code === 'KeyK' || event.code === 'KeyX') dash();
    if (event.code === 'Escape' || event.code === 'KeyP') togglePause();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('pointerdown', (event) => { if (event.button === 0) attack(); });
  document.querySelectorAll('[data-control]').forEach((button) => {
    const control = button.dataset.control;
    const press = (event) => {
      event.preventDefault(); event.stopPropagation(); button.classList.add('active');
      try { button.setPointerCapture(event.pointerId); } catch (_) { }
      if (control === 'left' || control === 'right') held[control] = true;
      if (control === 'jump') jump(); if (control === 'attack') attack(); if (control === 'dash') dash();
    };
    const release = (event) => {
      event.preventDefault(); button.classList.remove('active');
      if (control === 'left' || control === 'right') held[control] = false;
    };
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  });

  resize(); reset(); setState('title'); requestAnimationFrame((t) => { last = t; frame(t); });
})();
