// 遊戲儲存 + agent 選擇 + 公開視角序列化。
// ★ 目前用行程內記憶體(僅適合本地 `next dev` 單行程開發)。
//   部署到 Vercel 時要換成 Vercel KV —— 換這一個檔案即可。
import type { Agent } from "./game/agent";
import { MockAgent } from "./game/agent";
import type { GameState, Role, WaitingFor } from "./game/types";

const games = new Map<string, GameState>();

export function saveGame(s: GameState): void {
  games.set(s.gameId, s);
}
export function loadGame(id: string): GameState | undefined {
  return games.get(id);
}

/** 有 GEMINI_API_KEY 就用 Gemini,否則用 Mock(方便本地無 key 也能玩) */
export function getAgent(): Agent {
  if (process.env.GEMINI_API_KEY) {
    // 動態載入,避免無 key 環境載入 SDK 出錯
    const { GeminiAgent } = require("./gemini/agent") as typeof import("./gemini/agent");
    return new GeminiAgent();
  }
  return new MockAgent();
}

/** 送給前端的公開視角 —— ★ 絕不含存活玩家的 role */
export interface PublicView {
  gameId: string;
  day: number;
  phase: GameState["phase"];
  roster: { id: string; name: string; alive: boolean }[];
  publicLog: GameState["publicLog"];
  waitingFor: WaitingFor | null;
  winner: GameState["winner"];
  you: { id: string; name: string; role: Role }; // 只有你自己的身份
  usingMock: boolean;
}

export function toPublicView(s: GameState): PublicView {
  const human = s.players.find((p) => p.isHuman)!;
  return {
    gameId: s.gameId,
    day: s.day,
    phase: s.phase,
    roster: s.players.map((p) => ({ id: p.id, name: p.name, alive: p.alive })),
    publicLog: s.publicLog,
    waitingFor: s.waitingFor,
    winner: s.winner,
    you: { id: human.id, name: human.name, role: human.role },
    usingMock: !process.env.GEMINI_API_KEY,
  };
}
