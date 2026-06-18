/* =========================================================================
 * game.js —— 回合制 + 实时弹反 战斗状态机（对标《33号远征队》）
 *
 * 战斗循环：
 *   入场 → [玩家回合: 菜单选招 → 播放招式片段 → 结算伤害/破防]
 *        → [BOSS回合: 播放蓄力片段 → 弹反窗口(读 video.currentTime 判定)
 *                     → 成功:弹反片段 / 失手:受击片段]
 *        → 破防(BREAK)处决 → 阶段转换 → 胜/败
 *
 * 关键：视频片段「状态无关」，血量/气/架势全部活在本文件的数据 + DOM，
 *      片段只负责「演出」。这样片段数量是有限可控的。
 * ========================================================================= */
(() => {
  const $ = (id) => document.getElementById(id);
  const rng = ([a, b]) => Math.floor(a + Math.random() * (b - a + 1));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const stage = $('stage');
  const cp = new ClipPlayer(stage);
  const sfx = new Sfx();

  let M, player, boss, phaseIdx, qi, state = 'boot';

  /* ---------- 启动 ---------- */
  async function boot() {
    M = await (await fetch('manifest.json')).json();
    $('boss-name').textContent = M.boss.name;
    $('title-boss').textContent = M.boss.name;
    buildSkills();
    await cp.preloadAll(M.clips, (d, t) => {
      const pct = Math.round((d / t) * 100);
      $('load-bar-fill').style.width = pct + '%';
      $('load-pct').textContent = pct + '%';
    });
    $('loading').classList.add('hidden');
    $('title').classList.remove('hidden');
  }

  function startGame() {
    $('title').classList.add('hidden');
    $('result').classList.add('hidden');
    $('game').classList.add('playing');
    player = { hp: M.player.hp, hpMax: M.player.hp };
    qi = M.player.qiStart;
    phaseIdx = 0;
    const ph = M.boss.phases[0];
    boss = { hp: ph.hp, hpMax: ph.hp, posture: 0, postureMax: ph.postureMax };
    renderAll();
    runIntro();
  }

  /* ---------- 流程 ---------- */
  async function runIntro() {
    state = 'busy';
    status('鬼市 · 折命娘现身');
    sfx._ensure();
    await cp.play('intro');
    await toIdle();
    playerTurn();
  }

  async function toIdle() { await cp.play('idle', { loop: true }); }

  function playerTurn() {
    state = 'player';
    status('你的回合 — 出招');
    renderQi();      // 回合开始统一重渲染，避免攻击直接触发破防/换阶段时跳过渲染导致气珠/血条显示滞后
    renderPlayer();
    enableSkills(true);
    $('parry-btn').classList.add('hidden');
  }

  async function useSkill(skill) {
    if (state !== 'player') return;
    if (qi < skill.cost) { banner('气不足', 'warn'); sfx.miss(); return; }
    enableSkills(false);
    state = 'busy';
    qi -= skill.cost;

    if (skill.type === 'attack') {
      skill.id === 'ultimate' ? sfx.ultimate() : sfx.swing();
      await cp.play(skill.clip, { flash: skill.id === 'ultimate' });
      const dmg = rng(skill.dmg);
      const crit = Math.random() < 0.18;
      const real = crit ? Math.round(dmg * 1.5) : dmg;
      boss.hp = clamp(boss.hp - real, 0, boss.hpMax);
      boss.posture = clamp(boss.posture + skill.posture, 0, boss.postureMax);
      qi = clamp(qi + skill.qiGain, 0, M.player.qiMax);
      sfx.hit();
      floatNum(real, crit ? 'crit' : 'boss', crit);
      renderBoss();
      if (boss.hp <= 0) return phaseOrWin();
      if (boss.posture >= boss.postureMax) return doBreak();
    } else { // meditate
      sfx.heal();
      player.hp = clamp(player.hp + skill.heal, 0, player.hpMax);
      qi = clamp(qi + skill.qiGain, 0, M.player.qiMax);
      floatNum(skill.heal, 'heal');
      banner('金刚冥想', 'buff');
      renderPlayer();
    }
    renderQi();
    await wait(450);
    await toIdle();
    bossTurn();
  }

  async function bossTurn() {
    state = 'busy';
    status('BOSS 行动 — 看准时机弹反！');
    const parried = await bossAttackWithParry();

    if (parried) {
      sfx.parry();
      boss.posture = clamp(boss.posture + M.bossAttack.postureOnParry, 0, boss.postureMax);
      qi = clamp(qi + 1, 0, M.player.qiMax);
      banner('弹 反 !', 'parry');
      await cp.play('parry_success', { transition: 'cut', flash: true });
      renderBoss(); renderQi();
      if (boss.posture >= boss.postureMax) return doBreak();
    } else {
      const dmg = rng(M.bossAttack.dmg);
      player.hp = clamp(player.hp - dmg, 0, player.hpMax);
      sfx.hit();
      floatNum(dmg, 'player');
      banner('受 击', 'hurt');
      shake();
      await cp.play('player_hit', { transition: 'cut', flash: true });
      renderPlayer();
      if (player.hp <= 0) return defeat();
    }
    await wait(350);
    await toIdle();
    playerTurn();
  }

  /* 在蓄力片段播放期间开放弹反窗口；返回是否弹反成功 */
  function bossAttackWithParry() {
    return new Promise((resolve) => {
      const win = M.clips.boss_windup.parryWindow;
      let settled = false;
      const ring = $('parry-ring');

      const cleanup = () => {
        cp.onTime = null;
        window.removeEventListener('keydown', onKey);
        stage.removeEventListener('pointerdown', onTap);
        $('parry-btn').removeEventListener('click', onTap);
        ring.classList.remove('show', 'hot');
        $('parry-btn').classList.add('hidden');
      };
      const settle = (ok) => { if (settled) return; settled = true; cleanup(); resolve(ok); };

      const tryParry = () => {
        const t = cp.active ? cp.active.currentTime : 0;
        if (t >= win.start && t <= win.end) settle(true);
        else { banner('失 手', 'warn'); sfx.miss(); }
      };
      const onKey = (e) => {
        if (e.code === 'Space' || e.key === 'j' || e.key === 'J') { e.preventDefault(); tryParry(); }
      };
      const onTap = (e) => { e.preventDefault(); tryParry(); };

      $('parry-btn').classList.remove('hidden');
      cp.onTime = (t) => {
        if (t >= win.prompt && t <= win.end) {
          ring.classList.add('show');
          const hot = t >= win.start && t <= win.end;
          ring.classList.toggle('hot', hot);
          const p = clamp((t - win.prompt) / (win.end - win.prompt), 0, 1);
          $('parry-ring-shrink').style.transform = `scale(${1.7 - p * 1.0})`;
        } else {
          ring.classList.remove('show', 'hot');
        }
      };
      window.addEventListener('keydown', onKey);
      stage.addEventListener('pointerdown', onTap);
      $('parry-btn').addEventListener('click', onTap);

      cp.play('boss_windup').then(() => settle(false)); // 片段自然结束 = 没弹到
    });
  }

  async function doBreak() {
    state = 'busy';
    cp.onTime = null;
    sfx.break_();
    banner('破 防   B R E A K', 'break');
    shake();
    await cp.play('break_execute', { flash: true });
    boss.posture = 0;
    const dmg = 480 + rng([0, 260]);
    boss.hp = clamp(boss.hp - dmg, 0, boss.hpMax);
    floatNum(dmg, 'crit', true);
    renderBoss();
    if (boss.hp <= 0) return phaseOrWin();
    await wait(400);
    await toIdle();
    playerTurn();
  }

  async function phaseOrWin() {
    boss.hp = 0; renderBoss();
    if (phaseIdx < M.boss.phases.length - 1) {
      state = 'busy';
      phaseIdx++;
      banner('折 命 娘 · 二 相', 'phase');
      await cp.play('boss_phase2', { flash: true });
      const ph = M.boss.phases[phaseIdx];
      boss = { hp: ph.hp, hpMax: ph.hp, posture: 0, postureMax: ph.postureMax };
      $('boss-name').textContent = M.boss.name + ' 〔二相〕';
      renderBoss();
      await wait(300);
      await toIdle();
      playerTurn();
    } else {
      victory();
    }
  }

  async function victory() {
    state = 'end'; sfx.victory();
    await cp.play('victory');
    showResult('胜', '尘埃落定。你又近了「我」一步。');
  }
  async function defeat() {
    state = 'end';
    showResult('败', '人间没了渡口…… 再来一次。');
  }

  /* ---------- 渲染 ---------- */
  function renderAll() { renderBoss(); renderPlayer(); renderQi(); }
  function renderBoss() {
    $('boss-hp-fill').style.width = (boss.hp / boss.hpMax * 100) + '%';
    $('boss-hp-text').textContent = `${boss.hp} / ${boss.hpMax}`;
    const pp = boss.posture / boss.postureMax * 100;
    $('boss-posture-fill').style.width = pp + '%';
    $('boss-posture').classList.toggle('near', pp >= 80);
  }
  function renderPlayer() {
    $('player-hp-fill').style.width = (player.hp / player.hpMax * 100) + '%';
    $('player-hp-text').textContent = `${player.hp} / ${player.hpMax}`;
  }
  function renderQi() {
    const pips = $('qi-pips').children;
    for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('on', i < qi);
    refreshSkillAfford();
  }

  function buildSkills() {
    const bar = $('skill-bar');
    bar.innerHTML = '';
    M.skills.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'skill-btn';
      b.dataset.id = s.id;
      b.innerHTML = `<span class="sk-key">${i + 1}</span>
        <span class="sk-name">${s.name}</span>
        <span class="sk-cost">${s.cost > 0 ? '气×' + s.cost : (s.type === 'buff' ? '回复' : '蓄气')}</span>
        <span class="sk-hint">${s.hint}</span>`;
      b.addEventListener('click', () => useSkill(s));
      bar.appendChild(b);
    });
    window.addEventListener('keydown', (e) => {
      if (state !== 'player') return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= M.skills.length) useSkill(M.skills[n - 1]);
    });
  }
  function enableSkills(on) {
    $('skill-bar').classList.toggle('disabled', !on);
    if (on) refreshSkillAfford();
  }
  function refreshSkillAfford() {
    [...$('skill-bar').children].forEach((b) => {
      const s = M.skills.find((x) => x.id === b.dataset.id);
      b.classList.toggle('cant', qi < s.cost);
    });
  }

  /* ---------- 反馈特效 ---------- */
  function status(t) { $('status-line').textContent = t; }
  function banner(text, cls) {
    const el = document.createElement('div');
    el.className = 'banner ' + cls;
    el.textContent = text;
    $('fx-layer').appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }
  function floatNum(n, kind, big) {
    const el = document.createElement('div');
    el.className = 'dmg ' + kind + (big ? ' big' : '');
    el.textContent = (kind === 'heal' ? '+' : '') + n;
    el.style.left = (44 + Math.random() * 12) + '%';
    el.style.top = (kind === 'player' ? 58 : 40) + '%';
    $('fx-layer').appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }
  function shake() {
    stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
  }
  function showResult(big, sub) {
    $('result-big').textContent = big;
    $('result-sub').textContent = sub;
    $('result').classList.remove('hidden');
  }

  /* ---------- 绑定 ---------- */
  $('start-btn').addEventListener('click', startGame);
  $('retry-btn').addEventListener('click', startGame);
  boot();
})();
