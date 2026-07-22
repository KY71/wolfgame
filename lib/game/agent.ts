// 決策/發言介面 —— 隔離邊界就在這裡。
// buildView() 是關鍵:它替某位玩家投影出「他該看到的世界」,
// 物理上排除其他玩家的身份。M1 用 MockAgent,M2 換成 Gemini 實作。
import type { GameState, LogEntry, Player, Role } from "./types";
import { alivePlayers, findPlayer } from "./engine";

/** 一位玩家的「視角」——絕不含其他玩家的 role */
export interface AgentView {
  self: {
    id: string;
    name: string;
    role: Role; // 只有自己的身份
    isWolf: boolean;
  };
  /** 公開名冊(只有 id/name/alive,沒有 role) */
  roster: { id: string; name: string; alive: boolean }[];
  aliveIds: string[]; // 存活者 id(可作為決策目標範圍)
  publicLog: LogEntry[];
  day: number;
  phase: GameState["phase"];
}

/**
 * 替某位玩家建立隔離視角。
 * ★ 這是資訊隔離的核心:除了自己,任何人的 role 都不放進來。
 * (已死亡玩家的身份已在 publicLog 的 death 事件中公開,屬公開資訊)
 */
export function buildView(s: GameState, playerId: string): AgentView {
  const self = findPlayer(s, playerId);
  if (!self) throw new Error(`buildView: 找不到玩家 ${playerId}`);
  return {
    self: {
      id: self.id,
      name: self.name,
      role: self.role,
      isWolf: self.role === "wolf",
    },
    roster: s.players.map((p) => ({ id: p.id, name: p.name, alive: p.alive })),
    aliveIds: alivePlayers(s).map((p) => p.id),
    publicLog: s.publicLog,
    day: s.day,
    phase: s.phase,
  };
}

/** 決策/發言引擎介面(M1: mock;M2: Gemini) */
export interface Agent {
  /** 產生一段公開發言 */
  speak(view: AgentView, instruction: string): Promise<string>;
  /** 狼人挑刀:回傳目標 id(從 candidates 中選,禁止空刀) */
  decideNightKill(view: AgentView, candidates: string[]): Promise<string>;
  /** 投票:回傳目標 id 或 null(棄票) */
  decideVote(view: AgentView, candidates: string[]): Promise<string | null>;
  /** 握手:回傳伸手對象 id(從 candidates 中選) */
  decideHandshake(view: AgentView, candidates: string[]): Promise<string>;
}

/** M1 用的假引擎:隨機但合法的決策 + 罐頭發言,用來驗證規則流程 */
export class MockAgent implements Agent {
  private rng: () => number;
  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }
  private pick<T>(arr: T[]): T {
    return arr[Math.floor(this.rng() * arr.length)];
  }
  async speak(view: AgentView, instruction: string): Promise<string> {
    return `[${view.self.name} 的發言 · ${instruction}]`;
  }
  async decideNightKill(view: AgentView, candidates: string[]): Promise<string> {
    return this.pick(candidates);
  }
  async decideVote(
    view: AgentView,
    candidates: string[],
  ): Promise<string | null> {
    return this.pick(candidates);
  }
  async decideHandshake(
    view: AgentView,
    candidates: string[],
  ): Promise<string> {
    return this.pick(candidates);
  }
}
