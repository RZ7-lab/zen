import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  Activity,
  Gauge,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Sword,
  Zap,
} from "lucide-react";
import { CLIPS, POSTER_SRC, type ClipId } from "./clips";
import {
  ACTIONS,
  INITIAL_STATE,
  actionById,
  clamp,
  createQte,
  judgeQte,
  moveById,
  pushLog,
  selectEnemyMove,
  type BattleAction,
  type BattleState,
  type EnemyMove,
  type QteOutcome,
} from "./game";

interface StageLayer {
  key: number;
  clipId: ClipId;
  status: "active" | "pending" | "leaving";
}

function StageVideoLayer({
  layerKey,
  clipId,
  audioMuted,
  status,
  onReady,
  onEnded,
}: {
  layerKey: number;
  clipId: ClipId;
  audioMuted: boolean;
  status: StageLayer["status"];
  onReady: (layerKey: number) => void;
  onEnded: (clipId: ClipId) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onEndedRef = useRef(onEnded);
  const clip = CLIPS[clipId];
  const active = status === "active";

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let disposed = false;

    const markReady = () => {
      if (disposed) return;
      onReady(layerKey);
    };

    video.addEventListener("loadeddata", markReady, { once: true });
    video.load();
    if (video.readyState >= 2) markReady();

    return () => {
      disposed = true;
      video.removeEventListener("loadeddata", markReady);
    };
  }, [clip.id, clipId, layerKey, onReady]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!active) return;
    let settled = false;
    let fallbackTimer = 0;

    const finish = () => {
      if (settled || clip.loop || !active) return;
      settled = true;
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      onEndedRef.current(clip.id);
    };

    const armFallback = () => {
      if (fallbackTimer || clip.loop || !active || !Number.isFinite(video.duration) || video.duration <= 0) return;
      fallbackTimer = window.setTimeout(finish, video.duration * 1000 + 350);
    };

    video.addEventListener("ended", finish);
    video.addEventListener("loadedmetadata", armFallback, { once: true });
    if (video.readyState >= 1) armFallback();
    const play = async () => {
      try {
        await video.play();
      } catch {
        video.muted = true;
        await video.play().catch(() => {
          // The title screen waits for user intent; if a browser still refuses playback,
          // the user can press Start or toggle audio to unlock it.
        });
      }
    };
    play();
    return () => {
      settled = true;
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      video.removeEventListener("ended", finish);
    };
  }, [active, clip.id, clip.loop, clipId]);

  return (
    <video
      ref={videoRef}
      className={`stage-video-layer is-${status}`}
      poster={POSTER_SRC}
      muted={audioMuted || clip.loop}
      loop={clip.loop}
      playsInline
      preload="auto"
    >
      <source src={clip.src} type="video/mp4" />
    </video>
  );
}

function VideoStage({
  clipId,
  audioMuted,
  onEnded,
}: {
  clipId: ClipId;
  audioMuted: boolean;
  onEnded: (clipId: ClipId) => void;
}) {
  const layerKey = useRef(0);
  const [layers, setLayers] = useState<StageLayer[]>(() => [{ key: 0, clipId, status: "active" }]);
  const cleanupTimers = useRef<number[]>([]);

  const cleanupLeavingLayers = useCallback(() => {
    const timer = window.setTimeout(() => {
      setLayers((currentLayers) => currentLayers.filter((layer) => layer.status !== "leaving"));
    }, 420);
    cleanupTimers.current.push(timer);
  }, []);

  useEffect(
    () => () => {
      cleanupTimers.current.forEach((timer) => window.clearTimeout(timer));
      cleanupTimers.current = [];
    },
    [],
  );

  const handleLayerReady = useCallback(
    (readyKey: number) => {
      let activated = false;
      setLayers((currentLayers) => {
        const canActivate = currentLayers.some((layer) => layer.key === readyKey && layer.status === "pending");
        if (!canActivate) return currentLayers;
        activated = true;
        return currentLayers.map((layer) => {
          if (layer.key === readyKey && layer.status === "pending") {
            return { ...layer, status: "active" as const };
          }
          if (layer.status === "active") {
            return { ...layer, status: "leaving" as const };
          }
          return layer;
        });
      });
      if (activated) cleanupLeavingLayers();
    },
    [cleanupLeavingLayers],
  );

  useEffect(() => {
    const nextKey = layerKey.current + 1;
    setLayers((currentLayers) => {
      const currentActive = currentLayers.find((layer) => layer.status === "active");
      const currentPending = currentLayers.find((layer) => layer.status === "pending");
      if (currentActive?.clipId === clipId) return currentLayers;
      if (currentPending?.clipId === clipId) return currentLayers;
      layerKey.current = nextKey;
      return [
        ...currentLayers.map((layer) => (layer.status === "pending" ? { ...layer, status: "leaving" as const } : layer)),
        { key: nextKey, clipId, status: "pending" as const },
      ];
    });
    cleanupLeavingLayers();
  }, [clipId]);

  return (
    <div className="stage-video-stack" aria-hidden="true">
      {layers.map((layer) => (
        <StageVideoLayer
          key={layer.key}
          layerKey={layer.key}
          clipId={layer.clipId}
          audioMuted={audioMuted}
          status={layer.status}
          onReady={handleLayerReady}
          onEnded={onEnded}
        />
      ))}
    </div>
  );
}

function Meter({
  value,
  max,
  label,
  tone = "warm",
}: {
  value: number;
  max: number;
  label: string;
  tone?: "warm" | "red" | "blue";
}) {
  const ratio = clamp(value / max, 0, 1);
  return (
    <div className="meter" data-tone={tone}>
      <div className="meter-label">
        <span>{label}</span>
        <strong>
          {Math.ceil(value)} / {max}
        </strong>
      </div>
      <div className="meter-track">
        <span style={{ transform: `scaleX(${ratio})` }} />
      </div>
    </div>
  );
}

function ActionIcon({ id }: { id: BattleAction["id"] }) {
  if (id === "guard") return <Shield size={18} />;
  if (id === "staff") return <Zap size={18} />;
  if (id === "skyfall") return <Sparkles size={18} />;
  return <Sword size={18} />;
}

function actionEnabled(state: BattleState, action: BattleAction) {
  return state.phase === "playerChoice" && state.ap >= action.cost;
}

export function App() {
  const [battle, setBattle] = useState<BattleState>(INITIAL_STATE);
  const [audioMuted, setAudioMuted] = useState(true);
  const [clockNow, setClockNow] = useState(() => performance.now());
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const timer = window.setTimeout(fn, ms);
    timers.current.push(timer);
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (battle.phase !== "enemyAction" || !battle.qte) return;
    let frame = 0;
    const tick = () => {
      setClockNow(performance.now());
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [battle.phase, battle.qte]);

  const beginEnemyHit = useCallback((move: EnemyMove, hitIndex: number) => {
    const hit = move.hits[hitIndex];
    if (!hit) return;
    setBattle((state) => {
      if (state.phase !== "enemyAction" || state.enemyMoveId !== move.id) return state;
      return {
        ...state,
        qte: createQte(performance.now(), move.id, hitIndex, hit),
        qteHint: hit.label,
        toast: `${move.label}：${hit.label}`,
      };
    });
  }, []);

  const resolveDefense = useCallback((forcedOutcome?: QteOutcome, fromTimeout = false) => {
    setBattle((state) => {
      if (state.phase !== "enemyAction" || !state.qte || state.qte.resolved) {
        return state;
      }

      const outcome = forcedOutcome ?? judgeQte(state.qte, performance.now());
      const rawDamage =
        outcome === "perfect"
          ? 0
          : outcome === "guard"
            ? Math.ceil(state.qte.damage * 0.36)
            : state.qte.damage;
      const damage = Math.max(0, rawDamage - state.guard * 3);
      const venomGain =
        outcome === "miss"
          ? state.qte.venomOnMiss ?? 0
          : outcome === "guard"
            ? state.qte.venomOnGuard ?? 0
            : 0;
      const postureReward = outcome === "perfect" ? state.qte.postureReward : outcome === "guard" ? Math.ceil(state.qte.postureReward / 2) : 0;
      const apReward = outcome === "perfect" ? state.qte.apReward : outcome === "guard" ? 1 : 0;
      const focusReward = outcome === "perfect" ? state.qte.focusReward : 0;
      const counterDamage = outcome === "perfect" ? 4 : 0;
      const label =
        outcome === "perfect"
          ? "PERFECT PARRY"
          : outcome === "guard"
            ? "GUARD"
            : fromTimeout
              ? "TOO LATE"
              : "MISS";

      return {
        ...state,
        playerHp: Math.max(0, state.playerHp - damage),
        bossHp: Math.max(0, state.bossHp - counterDamage),
        bossPosture: clamp(state.bossPosture + postureReward, 0, 100),
        ap: clamp(state.ap + apReward, 0, state.maxAp),
        focus: clamp(state.focus + focusReward, 0, 8),
        venom: clamp(state.venom + venomGain, 0, 5),
        qte: { ...state.qte, resolved: true, outcome },
        qteHint: label,
        toast:
          outcome === "perfect"
            ? "完美防反：无伤、回收资源，并反压姿态。"
            : outcome === "guard"
              ? "格挡成功：承受少量伤害。"
              : "判定失败：蛛足撕开防线。",
        log: pushLog(
          state,
          `${label}：${state.qte.label}，受到 ${damage} 伤害，反击 ${counterDamage}，姿态反压 +${postureReward}。`,
        ),
      };
    });
  }, []);

  const scheduleEnemyHits = useCallback(
    (move: EnemyMove) => {
      move.hits.forEach((hit, index) => {
        schedule(() => beginEnemyHit(move, index), hit.atMs);
        schedule(() => resolveDefense("miss", true), hit.atMs + 1180);
      });
    },
    [beginEnemyHit, resolveDefense, schedule],
  );

  const startEnemyTurn = useCallback(() => {
    clearTimers();
    let selectedMove: EnemyMove | undefined;
    setBattle((state) => {
      selectedMove = selectEnemyMove(state.turn, state.bossPhase);
      return {
        ...state,
        phase: "enemyAction",
        clip: "enemyAssault",
        enemyMoveId: selectedMove.id,
        qte: undefined,
        toast: `${selectedMove.label} 起手。整段敌方动作会完整播放。`,
        qteHint: "看准金圈",
        log: pushLog(state, `敌方回合：${selectedMove.label}。${selectedMove.detail}`),
      };
    });

    window.setTimeout(() => {
      if (selectedMove) scheduleEnemyHits(selectedMove);
    }, 0);
  }, [clearTimers, scheduleEnemyHits]);

  const enterPlayerChoice = useCallback(
    (message?: string, advanceTurn = false) => {
      clearTimers();
      setBattle((state) => ({
        ...state,
        phase: "playerChoice",
        clip: "idle",
        qte: undefined,
        pendingActionId: undefined,
        enemyMoveId: undefined,
        turn: state.turn + (advanceTurn ? 1 : 0),
        ap: clamp(state.ap + 2, 3, state.maxAp),
        guard: Math.max(0, state.guard - 1),
        toast: message ?? "轮到你行动。选一式，压低蛛母的姿态。",
        qteHint: "敌方回合按 Space 或点击防反",
      }));
    },
    [clearTimers],
  );

  const showVictory = useCallback(
    (message = "蛛母坠入灯阵，殿前雨声终于压过了嘶鸣。") => {
      clearTimers();
      setBattle((state) => ({
        ...state,
        phase: "victory",
        clip: "victory",
        qte: undefined,
        pendingActionId: undefined,
        enemyMoveId: undefined,
        toast: "胜利",
        log: pushLog(state, message),
      }));
    },
    [clearTimers],
  );

  const showDefeat = useCallback(
    (message = "血灯倒转，行者被蛛足钉在殿阶之前。") => {
      clearTimers();
      setBattle((state) => ({
        ...state,
        phase: "defeat",
        clip: "idle",
        qte: undefined,
        pendingActionId: undefined,
        enemyMoveId: undefined,
        toast: "战败",
        log: pushLog(state, message),
      }));
    },
    [clearTimers],
  );

  const enterBreak = useCallback(() => {
    clearTimers();
    setBattle((state) => ({
      ...state,
      phase: "breakOpportunity",
      clip: "breakState",
      qte: undefined,
      pendingActionId: undefined,
      enemyMoveId: undefined,
      ap: clamp(state.ap + 2, 4, state.maxAp),
      focus: clamp(state.focus + 2, 0, 8),
      bossPosture: 100,
      toast: "BREAK：蛛母姿态崩裂，等待整段破防演出。",
      log: pushLog(state, "破防触发。破防演出完整播放后可接奥义。"),
    }));
  }, [clearTimers]);

  const finishEnemyTurn = useCallback(() => {
    clearTimers();
    setBattle((state) => {
      if (state.playerHp <= 0) {
        return {
          ...state,
          phase: "defeat",
          clip: "idle",
          qte: undefined,
          enemyMoveId: undefined,
          toast: "战败",
          log: pushLog(state, "敌方攻势结束，行者已经倒下。"),
        };
      }

      if (state.bossHp <= 0) {
        return {
          ...state,
          phase: "victory",
          clip: "victory",
          qte: undefined,
          enemyMoveId: undefined,
          toast: "防反反击击溃蛛母，胜利演出开始。",
          log: pushLog(state, "敌方攻势结束，蛛母已被反击击溃。"),
        };
      }

      if (state.bossPosture >= 100) {
        return {
          ...state,
          phase: "breakOpportunity",
          clip: "breakState",
          qte: undefined,
          enemyMoveId: undefined,
          toast: "防反压满姿态，触发 BREAK。",
          log: pushLog(state, "敌方回合结束，完美防反累计触发破防。"),
        };
      }

      const venomDamage = state.venom * 4;
      const playerHp = Math.max(0, state.playerHp - venomDamage);
      const venom = Math.max(0, state.venom - 1);
      const log =
        venomDamage > 0
          ? pushLog(state, `中毒结算：受到 ${venomDamage} 伤害，中毒层数 -1。`)
          : state.log;

      if (playerHp <= 0) {
        return {
          ...state,
          playerHp,
          venom,
          phase: "defeat",
          clip: "idle",
          qte: undefined,
          enemyMoveId: undefined,
          toast: "毒血发作，行者倒下。",
          log,
        };
      }

      return {
        ...state,
        playerHp,
        venom,
        phase: "playerChoice",
        clip: "idle",
        qte: undefined,
        pendingActionId: undefined,
        enemyMoveId: undefined,
        turn: state.turn + 1,
        ap: clamp(state.ap + 2, 3, state.maxAp),
        guard: Math.max(0, state.guard - 1),
        toast: "敌方动作完整结束。重新选择攻击式。",
        qteHint: "敌方回合按 Space 或点击防反",
        log,
      };
    });
  }, [clearTimers]);

  const resolvePlayerAction = useCallback(() => {
    clearTimers();
    let moveToSchedule: EnemyMove | undefined;
    setBattle((state) => {
      const action = state.pendingActionId ? actionById(state.pendingActionId) : undefined;
      if (!action || state.phase !== "playerAction") return state;

      const weakBonus = state.bossWeak * (action.id === "skyfall" ? 6 : 3);
      const damage = action.damage + weakBonus;
      const posture = action.posture + (action.id === "seal" ? 8 : 0);
      const bossHp = Math.max(0, state.bossHp - damage);
      const bossPosture = clamp(state.bossPosture + posture, 0, 100);
      const bossPhase: 1 | 2 = bossHp <= state.bossMaxHp * 0.5 ? 2 : state.bossPhase;
      const bossWeak =
        action.id === "staff"
          ? clamp(state.bossWeak + 1, 0, 3)
          : action.id === "skyfall"
            ? 0
            : state.bossWeak;
      const guard = action.id === "guard" ? 3 : state.guard;
      const healed = action.id === "guard" ? 12 : 0;
      const venom = action.id === "guard" ? Math.max(0, state.venom - 1) : state.venom;
      const playerHp = clamp(state.playerHp + healed, 0, state.playerMaxHp);
      const logLine =
        action.id === "guard"
          ? `观照：回复 ${healed} 生命，获得 3 护持，净化 1 层中毒。`
          : `${action.label} 命中，造成 ${damage} 伤害，姿态 +${posture}。`;
      const nextState = {
        ...state,
        bossHp,
        bossPosture,
        bossPhase,
        bossWeak,
        guard,
        playerHp,
        venom,
        focus: clamp(state.focus + action.focus, 0, 8),
        pendingActionId: undefined,
        log: pushLog(state, bossPhase !== state.bossPhase ? `${logLine} 蛛母进入二阶段。` : logLine),
      };

      if (bossHp <= 0) {
        return {
          ...nextState,
          phase: "victory",
          clip: "victory",
          toast: "最后一击落定，等待胜利演出。",
        };
      }

      if (bossPosture >= 100) {
        return {
          ...nextState,
          phase: "breakOpportunity",
          clip: "breakState",
          toast: "BREAK：动作完整结算后进入破防演出。",
        };
      }

      const enemyMove = selectEnemyMove(state.turn, bossPhase);
      moveToSchedule = enemyMove;
      return {
        ...nextState,
        phase: "enemyAction",
        clip: "enemyAssault",
        enemyMoveId: enemyMove.id,
        qte: undefined,
        toast: `${enemyMove.label} 起手。整段敌方动作会完整播放。`,
        qteHint: "看准金圈",
        log: pushLog(nextState, `敌方回合：${enemyMove.label}。${enemyMove.detail}`),
      };
    });

    window.setTimeout(() => {
      if (moveToSchedule) scheduleEnemyHits(moveToSchedule);
    }, 0);
  }, [clearTimers, scheduleEnemyHits]);

  const performAction = useCallback(
    (id: BattleAction["id"]) => {
      const action = actionById(id);
      if (!action) return;
      clearTimers();

      setBattle((state) => {
        if (!actionEnabled(state, action)) return state;
        return {
          ...state,
          phase: "playerAction",
          clip: "playerStrike",
          ap: state.ap - action.cost,
          pendingActionId: id,
          toast: `${action.label} 起手。等待动作完整播放后结算。`,
          log: pushLog(state, `消耗 ${action.cost} AP：${action.label}`),
        };
      });
    },
    [clearTimers],
  );

  const performFinisher = useCallback(() => {
    clearTimers();
    setBattle((state) => {
      if (state.phase !== "breakOpportunity" || state.clip !== "breakIdle" || state.focus < 2) return state;
      return {
        ...state,
        phase: "finisher",
        clip: "finisher",
        ap: Math.max(0, state.ap - 2),
        focus: Math.max(0, state.focus - 2),
        toast: "奥义：大藏天崩。整段奥义会完整播放。",
        log: pushLog(state, "行者引动佛光，准备终结破防窗口。"),
      };
    });
  }, [clearTimers]);

  const resolveFinisher = useCallback(() => {
    clearTimers();
    let moveToSchedule: EnemyMove | undefined;
    setBattle((state) => {
      if (state.phase !== "finisher") return state;
      const damage = 164 + state.bossWeak * 10;
      const bossHp = Math.max(0, state.bossHp - damage);
      const nextState = {
        ...state,
        bossHp,
        bossPosture: 0,
        bossWeak: 0,
        log: pushLog(state, `奥义造成 ${damage} 伤害，姿态重置。`),
      };

      if (bossHp <= 0) {
        return {
          ...nextState,
          phase: "victory",
          clip: "victory",
          toast: "奥义结束，胜利演出开始。",
        };
      }

      const enemyMove = selectEnemyMove(state.turn, state.bossPhase);
      moveToSchedule = enemyMove;
      return {
        ...nextState,
        phase: "enemyAction",
        clip: "enemyAssault",
        enemyMoveId: enemyMove.id,
        qte: undefined,
        toast: `奥义重创蛛母，但她还活着。${enemyMove.label} 起手。`,
        qteHint: "看准金圈",
        log: pushLog(nextState, `敌方回合：${enemyMove.label}。${enemyMove.detail}`),
      };
    });

    window.setTimeout(() => {
      if (moveToSchedule) scheduleEnemyHits(moveToSchedule);
    }, 0);
  }, [clearTimers, scheduleEnemyHits]);

  const startBattle = useCallback(() => {
    clearTimers();
    setBattle({
      ...INITIAL_STATE,
      phase: "intro",
      clip: "intro",
      toast: "Boss 进入战斗镜头。登场演出完整播放后进入第一回合。",
      log: ["战斗开始：视频结束事件驱动状态推进。", ...INITIAL_STATE.log],
    });
  }, [clearTimers]);

  const resetBattle = useCallback(() => {
    clearTimers();
    setBattle(INITIAL_STATE);
  }, [clearTimers]);

  const handleClipEnded = useCallback(
    (clipId: ClipId) => {
      if (clipId !== battle.clip) return;
      if (battle.phase === "intro") {
        enterPlayerChoice("蛛母显形。第一回合，先打姿态。");
      } else if (battle.phase === "playerAction") {
        resolvePlayerAction();
      } else if (battle.phase === "enemyAction") {
        finishEnemyTurn();
      } else if (battle.phase === "breakOpportunity") {
        setBattle((state) =>
          state.phase === "breakOpportunity"
            ? {
                ...state,
                clip: "breakIdle",
                toast: "蛛母跪伏。按奥义结束这轮压制，或等待后续设计扩展普通追击。",
              }
            : state,
        );
      } else if (battle.phase === "finisher") {
        resolveFinisher();
      }
    },
    [battle.clip, battle.phase, enterPlayerChoice, finishEnemyTurn, resolveFinisher, resolvePlayerAction],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        resolveDefense();
      }
      if (event.key === "1") performAction("seal");
      if (event.key === "2") performAction("staff");
      if (event.key === "3") performAction("skyfall");
      if (event.key === "4") performAction("guard");
      if (event.key === "Enter") performFinisher();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [performAction, performFinisher, resolveDefense]);

  const bossHpPercent = useMemo(
    () => Math.round((battle.bossHp / battle.bossMaxHp) * 100),
    [battle.bossHp, battle.bossMaxHp],
  );

  const enemyMove = moveById(battle.enemyMoveId);
  const qteElapsed =
    battle.qte && battle.phase === "enemyAction"
      ? clamp((clockNow - battle.qte.startedAt) / battle.qte.closeMs, 0, 1)
      : 0;

  return (
    <main className="battle-shell" data-phase={battle.phase}>
      <VideoStage clipId={battle.clip} audioMuted={audioMuted} onEnded={handleClipEnded} />
      <div className="vignette" />
      <div className="rain-grain" />

      <section className="top-hud" aria-label="战斗状态">
        <div className="boss-block">
          <div className="boss-name">
            <span>伞尸蛛母</span>
            <strong>
              PHASE {battle.bossPhase} · {bossHpPercent}%
            </strong>
          </div>
          <Meter value={battle.bossHp} max={battle.bossMaxHp} label="血量" tone="red" />
          <Meter value={battle.bossPosture} max={100} label="姿态" tone="warm" />
        </div>

        <div className="round-chip">
          <Gauge size={16} />
          <span>TURN {battle.turn}</span>
        </div>
      </section>

      <section className="left-hud" aria-label="角色状态">
        <div className="player-card">
          <div className="portrait-mark">行</div>
          <div>
            <span className="eyebrow">无相行者</span>
            <Meter value={battle.playerHp} max={battle.playerMaxHp} label="生命" tone="blue" />
          </div>
        </div>
        <div className="resource-row">
          <span>
            AP <strong>{battle.ap}</strong>/{battle.maxAp}
          </span>
          <span>
            FOCUS <strong>{battle.focus}</strong>
          </span>
          <span>
            GUARD <strong>{battle.guard}</strong>
          </span>
        </div>
        <div className="status-row">
          <span>
            VENOM <strong>{battle.venom}</strong>
          </span>
          <span>
            WEAK <strong>{battle.bossWeak}</strong>
          </span>
        </div>
        {enemyMove && (
          <div className="enemy-intent">
            <strong>{enemyMove.label}</strong>
            <span>{enemyMove.detail}</span>
          </div>
        )}
      </section>

      <aside className="combat-log" aria-label="战斗日志">
        {battle.log.map((line, index) => (
          <p key={`${index}-${line}`}>{line}</p>
        ))}
      </aside>

      <div className="center-toast" data-phase={battle.phase}>
        {battle.toast}
      </div>

      {battle.phase === "title" && (
        <section className="start-panel" aria-label="开始战斗">
          <div className="start-copy">
            <span>Seedance2 video layer prototype</span>
            <h1>伞尸蛛母 Boss 战</h1>
            <p>完整动作播放、回合选择、破防、二阶段与敌方回合多段时机防反。</p>
          </div>
          <button className="primary-start" onClick={startBattle}>
            <Play size={20} />
            开始战斗
          </button>
        </section>
      )}

      {battle.phase === "enemyAction" && battle.qte && (
        <button
          className="qte-button"
          onClick={() => resolveDefense()}
          style={{ "--qte-progress": qteElapsed } as CSSProperties}
          aria-label={battle.qte.resolved ? battle.qteHint : "防反 PARRY"}
          disabled={battle.qte.resolved}
        >
          <span>{battle.qte.resolved ? battle.qteHint : "PARRY"}</span>
          <small>{battle.qte.label}</small>
        </button>
      )}

      <section className="command-deck" aria-label="战斗指令">
        {battle.phase === "breakOpportunity" ? (
          <button className="finisher-card" onClick={performFinisher} disabled={battle.focus < 2 || battle.clip !== "breakIdle"}>
            <Sparkles size={22} />
            <span>
              <strong>奥义 大藏天崩</strong>
              <small>
                {battle.clip === "breakIdle" ? "Enter · 消耗 2 FOCUS，破防追击" : "破防演出播放中"}
              </small>
            </span>
          </button>
        ) : (
          ACTIONS.map((action, index) => (
            <button
              key={action.id}
              className="action-card"
              disabled={!actionEnabled(battle, action)}
              onClick={() => performAction(action.id)}
              title={action.description}
            >
              <ActionIcon id={action.id} />
              <span>
                <strong>{action.label}</strong>
                <small>
                  {index + 1} · {action.command} · {action.cost} AP
                </small>
              </span>
            </button>
          ))
        )}
      </section>

      {(battle.phase === "victory" || battle.phase === "defeat") && (
        <button className="reset-button" onClick={resetBattle}>
          <RotateCcw size={17} />
          重新挑战
        </button>
      )}

      <button className="mute-button" onClick={() => setAudioMuted((muted) => !muted)}>
        <Activity size={16} />
        {audioMuted ? "音频关" : "音频开"}
      </button>
    </main>
  );
}
