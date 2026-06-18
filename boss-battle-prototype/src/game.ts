import type { ClipId } from "./clips";

export type BattlePhase =
  | "title"
  | "intro"
  | "playerChoice"
  | "playerAction"
  | "enemyAction"
  | "breakOpportunity"
  | "finisher"
  | "victory"
  | "defeat";

export type QteOutcome = "perfect" | "guard" | "miss";

export interface BattleAction {
  id: "seal" | "staff" | "skyfall" | "guard";
  label: string;
  command: string;
  cost: number;
  damage: number;
  posture: number;
  focus: number;
  description: string;
}

export interface EnemyHit {
  label: string;
  atMs: number;
  damage: number;
  postureReward: number;
  apReward: number;
  focusReward: number;
  venomOnGuard?: number;
  venomOnMiss?: number;
}

export interface EnemyMove {
  id: "legSweep" | "bloodRain" | "webPierce";
  label: string;
  detail: string;
  hits: EnemyHit[];
}

export interface QteState extends EnemyHit {
  startedAt: number;
  moveId: EnemyMove["id"];
  hitIndex: number;
  openMs: number;
  perfectStartMs: number;
  perfectEndMs: number;
  closeMs: number;
  resolved: boolean;
  outcome?: QteOutcome;
}

export interface BattleState {
  phase: BattlePhase;
  clip: ClipId;
  turn: number;
  playerHp: number;
  playerMaxHp: number;
  bossHp: number;
  bossMaxHp: number;
  bossPosture: number;
  bossPhase: 1 | 2;
  bossWeak: number;
  ap: number;
  maxAp: number;
  guard: number;
  focus: number;
  venom: number;
  pendingActionId?: BattleAction["id"];
  enemyMoveId?: EnemyMove["id"];
  qte?: QteState;
  qteHint: string;
  toast: string;
  log: string[];
}

export const ACTIONS: BattleAction[] = [
  {
    id: "seal",
    label: "金刚印",
    command: "破势",
    cost: 2,
    damage: 18,
    posture: 42,
    focus: 1,
    description: "低消耗破势技，适合推进 BREAK。",
  },
  {
    id: "staff",
    label: "锡杖连打",
    command: "连击",
    cost: 3,
    damage: 28,
    posture: 22,
    focus: 1,
    description: "造成易伤。后续重击与奥义伤害提高。",
  },
  {
    id: "skyfall",
    label: "大藏天崩",
    command: "重击",
    cost: 4,
    damage: 42,
    posture: 28,
    focus: 1,
    description: "高伤害重击，吃易伤加成。",
  },
  {
    id: "guard",
    label: "观照",
    command: "守势",
    cost: 1,
    damage: 0,
    posture: 0,
    focus: 2,
    description: "回复生命，获得护持，净化一层中毒。",
  },
];

export const ENEMY_MOVES: EnemyMove[] = [
  {
    id: "legSweep",
    label: "蛛足三连",
    detail: "连续三次物理扑杀，适合练习防反节奏。",
    hits: [
      { label: "第一扑", atMs: 3950, damage: 12, postureReward: 8, apReward: 1, focusReward: 0 },
      { label: "横扫", atMs: 6600, damage: 14, postureReward: 10, apReward: 1, focusReward: 0 },
      { label: "穿刺", atMs: 8300, damage: 18, postureReward: 14, apReward: 1, focusReward: 1 },
    ],
  },
  {
    id: "bloodRain",
    label: "血雨垂丝",
    detail: "两段慢速重击，格挡失败会叠中毒。",
    hits: [
      {
        label: "血丝牵引",
        atMs: 4700,
        damage: 16,
        postureReward: 12,
        apReward: 1,
        focusReward: 1,
        venomOnMiss: 1,
      },
      {
        label: "血雨坠落",
        atMs: 8400,
        damage: 24,
        postureReward: 18,
        apReward: 2,
        focusReward: 1,
        venomOnGuard: 1,
        venomOnMiss: 2,
      },
    ],
  },
  {
    id: "webPierce",
    label: "蛛网突刺",
    detail: "二阶段高压招式，四段短窗口连续判定。",
    hits: [
      { label: "钩足", atMs: 3300, damage: 10, postureReward: 6, apReward: 1, focusReward: 0 },
      { label: "回拉", atMs: 5050, damage: 12, postureReward: 8, apReward: 1, focusReward: 0 },
      {
        label: "毒刺",
        atMs: 6900,
        damage: 18,
        postureReward: 12,
        apReward: 1,
        focusReward: 1,
        venomOnMiss: 1,
      },
      {
        label: "终刺",
        atMs: 8700,
        damage: 26,
        postureReward: 18,
        apReward: 2,
        focusReward: 1,
        venomOnGuard: 1,
        venomOnMiss: 2,
      },
    ],
  },
];

export const INITIAL_STATE: BattleState = {
  phase: "title",
  clip: "idle",
  turn: 1,
  playerHp: 118,
  playerMaxHp: 118,
  bossHp: 176,
  bossMaxHp: 176,
  bossPosture: 0,
  bossPhase: 1,
  bossWeak: 0,
  ap: 6,
  maxAp: 9,
  guard: 0,
  focus: 0,
  venom: 0,
  qteHint: "等待敌意显形",
  toast: "伞尸蛛母在殿前垂伏，血灯照出蛛足的影。",
  log: ["视频负责演出，TypeScript 负责回合、资源、状态与判定。"],
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function actionById(id: BattleAction["id"]) {
  return ACTIONS.find((action) => action.id === id);
}

export function moveById(id?: EnemyMove["id"]) {
  return ENEMY_MOVES.find((move) => move.id === id);
}

export function selectEnemyMove(turn: number, bossPhase: 1 | 2) {
  if (bossPhase === 2) {
    return turn % 2 === 0 ? ENEMY_MOVES[2] : ENEMY_MOVES[1];
  }
  return turn % 3 === 0 ? ENEMY_MOVES[1] : ENEMY_MOVES[0];
}

export function pushLog(state: BattleState, line: string): string[] {
  return [line, ...state.log].slice(0, 6);
}

export function createQte(
  startedAt: number,
  moveId: EnemyMove["id"],
  hitIndex: number,
  hit: EnemyHit,
): QteState {
  return {
    ...hit,
    startedAt,
    moveId,
    hitIndex,
    openMs: 0,
    perfectStartMs: 360,
    perfectEndMs: 690,
    closeMs: 1120,
    resolved: false,
  };
}

export function judgeQte(qte: QteState, now: number): QteOutcome {
  const elapsed = now - qte.startedAt;
  if (elapsed >= qte.perfectStartMs && elapsed <= qte.perfectEndMs) {
    return "perfect";
  }
  if (elapsed >= qte.openMs && elapsed <= qte.closeMs) {
    return "guard";
  }
  return "miss";
}
