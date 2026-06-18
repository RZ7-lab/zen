/* =========================================================================
 * engine.js —— 纯 H5「双 video 无缝切换」播放引擎
 *
 * 设计要点（对应技术方案）：
 *  1. 两个 <video> 叠放，一个 active(可见)、一个 standby(透明)。切换片段时先把
 *     新片段灌进 standby，就绪后交叉淡入并互换角色 —— 避免单 video 换 src 时的黑屏。
 *  2. transition: 'fade' 用于过场；'cut' + flash 用于命中/弹反瞬间，用一帧白闪盖住接缝
 *     （回合制天然有「打击那一下」可藏剪辑点，比动作游戏宽容得多）。
 *  3. preloadAll(): 垂直切片阶段把全部片段 fetch 成 blob 常驻内存，切换零延迟。
 *     生产版应改为「预缓冲下一组候选片段」的滑动窗口（见 README）。
 *  4. onTime(t,dur): 每帧回调当前播放时间 —— 弹反窗口判定靠它读 currentTime。
 * ========================================================================= */
class ClipPlayer {
  constructor(rootEl) {
    this.root = rootEl;
    this.a = this._makeVideo();
    this.b = this._makeVideo();
    this.active = this.a;
    this.standby = this.b;
    this.active.style.opacity = '1';
    this.cache = {};        // clipId -> blobURL
    this.onTime = null;     // (currentTime, duration) => void，每 tick
    this._ticker = null;

    this.flashEl = document.createElement('div');
    this.flashEl.className = 'vfx-flash';
    this.root.appendChild(this.flashEl);
  }

  _makeVideo() {
    const v = document.createElement('video');
    v.muted = true;                 // 片段无音轨，BGM/SFX 由独立层负责
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto';
    v.className = 'clip-video';
    v.style.opacity = '0';
    this.root.appendChild(v);
    return v;
  }

  /* 预加载全部片段为 blob（带进度回调） */
  async preloadAll(clips, onProgress) {
    const ids = Object.keys(clips);
    let done = 0;
    for (const id of ids) {
      try {
        const res = await fetch(clips[id].src);
        const blob = await res.blob();
        this.cache[id] = URL.createObjectURL(blob);
      } catch (e) {
        console.error('预加载失败:', id, e);
      }
      done++;
      onProgress && onProgress(done, ids.length, id);
    }
  }

  /*
   * 播放片段。返回 Promise：
   *   - 非循环：在片段自然播放结束时 resolve
   *   - 循环：立即 resolve（调用方自行决定何时切走）
   */
  play(id, opts = {}) {
    const { loop = false, transition = 'fade', flash = false, fadeMs = 160 } = opts;
    const url = this.cache[id];
    return new Promise((resolve) => {
      if (!url) { console.warn('缺少片段:', id); resolve(); return; }
      const next = this.standby;
      next.loop = loop;
      next.src = url;

      const start = () => {
        next.removeEventListener('loadeddata', start);
        try { next.currentTime = 0; } catch (e) {}
        next.muted = false;        // 保留片段自带音轨（首次播放发生在「入局」点击之后，满足自动播放手势要求）
        next.volume = 1;
        const p = next.play();
        if (p && p.catch) p.catch(() => {});
        if (flash) this.flash();

        const cut = (transition === 'cut');
        const dur = cut ? 0 : fadeMs;
        const trans = cut ? 'none' : `opacity ${dur}ms ease-out`;
        const prev = this.active;
        // 真·交叉淡入：新片段淡入的同时旧片段同步淡出
        next.style.transition = trans;
        next.style.opacity = '1';
        prev.style.transition = trans;
        prev.style.opacity = '0';

        // 互换角色，并把上一段淡出音量 + 暂停（否则循环待机片段的音轨会叠在底下继续播）
        this.active = next;
        this.standby = prev;
        this._retire(prev, dur);
        this._ensureRaf();

        if (loop) {
          resolve();
        } else {
          const onEnd = () => { this.active.removeEventListener('ended', onEnd); resolve(); };
          this.active.addEventListener('ended', onEnd);
        }
      };

      if (next.readyState >= 2) start();
      else next.addEventListener('loadeddata', start);
    });
  }

  _ensureRaf() {
    if (this._ticker) return;
    // 用 setInterval 而非 requestAnimationFrame 驱动时间回调：rAF 在标签页不可见/不绘制时会被冻结
    // （弹反窗口判定不能因为切后台或无头环境而失效）；30Hz 足够驱动弹反环与计时。
    this._ticker = setInterval(() => {
      // onTime 抛异常绝不能拖垮整个计时循环
      try { if (this.onTime && this.active) this.onTime(this.active.currentTime, this.active.duration || 0); }
      catch (e) { /* 吞掉，保证循环存活 */ }
    }, 33);
  }

  /* 让上一段淡出音量并暂停，避免与新片段音轨重叠（淡出时长跟随画面过渡） */
  _retire(v, fadeMs = 160) {
    if (!v || v.paused || !v.src) return;
    const v0 = v.volume, steps = 9, dt = Math.max(14, Math.round(Math.max(fadeMs, 120) / steps));
    let i = 0;
    const id = setInterval(() => {
      i++;
      v.volume = Math.max(0, v0 * (1 - i / steps));
      if (i >= steps) { clearInterval(id); try { v.pause(); } catch (e) {} v.volume = 1; }
    }, dt);
  }

  /* 一帧白闪，用于盖住硬切接缝 / 强调命中 */
  flash() {
    this.flashEl.classList.remove('go');
    void this.flashEl.offsetWidth;   // 强制重排以重启动画
    this.flashEl.classList.add('go');
  }
}

window.ClipPlayer = ClipPlayer;
