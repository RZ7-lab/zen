export type ClipId =
  | "intro"
  | "idle"
  | "playerStrike"
  | "enemyAssault"
  | "breakState"
  | "breakIdle"
  | "finisher"
  | "victory";

export interface VideoClip {
  id: ClipId;
  src: string;
  loop: boolean;
  label: string;
}

export const CLIPS: Record<ClipId, VideoClip> = {
  intro: {
    id: "intro",
    src: "/video/boss_intro.mp4",
    loop: false,
    label: "Boss intro",
  },
  idle: {
    id: "idle",
    src: "/video/boss_idle.mp4",
    loop: true,
    label: "Boss idle loop",
  },
  playerStrike: {
    id: "playerStrike",
    src: "/video/player_strike.mp4",
    loop: false,
    label: "Player combo",
  },
  enemyAssault: {
    id: "enemyAssault",
    src: "/video/enemy_assault.mp4",
    loop: false,
    label: "Enemy assault",
  },
  breakState: {
    id: "breakState",
    src: "/video/break_state.mp4",
    loop: false,
    label: "Break state",
  },
  breakIdle: {
    id: "breakIdle",
    src: "/video/break_idle.mp4",
    loop: true,
    label: "Break idle loop",
  },
  finisher: {
    id: "finisher",
    src: "/video/finisher.mp4",
    loop: false,
    label: "Finisher",
  },
  victory: {
    id: "victory",
    src: "/video/victory.mp4",
    loop: false,
    label: "Victory",
  },
};

export const POSTER_SRC = "/video/poster.jpg";
