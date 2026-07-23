// 遊戲儲存 + agent 選擇 + 公開視角序列化(去除身份祕密)。
//
// 儲存後端:
//   - 有 REDIS_URL(Vercel 上連了 Redis)→ 用 Redis,跨 serverless 實例共用狀態。
//   - 沒有 → 行程內記憶體 Map(本地 `next dev` 開發用)。
import type { Redis } from "ioredis";
import type { Agent } from "./game/agent";
import { MockAgent } from "./game/agent";
import type { GameState, Role, WaitingFor } from "./game/types";

const TTL_SECONDS = 60 * 60 * 6; // 遊戲狀態保留 6 小時後自動清除
const keyOf = (id: string) => `game:${id}`;

// ---- Redis 單例(warm invocation 之間重用連線)----
let redisClient: Redis | null = null;
function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!redisClient) {
    // 動態載入,避免無 Redis 的環境載入時出錯
    const IORedis = require("ioredis") as typeof import("ioredis").default;
    redisClient = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    redisClient.on("error", (e: Error) => console.error("[redis]", e.message));
  }
  return redisClient;
}

// ---- 本地記憶體 fallback ----
const memory = new Map<string, GameState>();

export async function saveGame(s: GameState): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set(keyOf(s.gameId), JSON.stringify(s), "EX", TTL_SECONDS);
  } else {
    memory.set(s.gameId, s);
  }
}

export async function loadGame(id: string): Promise<GameState | undefined> {
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get(keyOf(id));
    return raw ? (JSON.parse(raw) as GameState) : undefined;
  }
  return memory.get(id);
}

/** 有 GEMINI_API_KEY 就用 Gemini,否則用 Mock(方便本地無 key 也能玩) */
export function getAgent(): Agent {
  if (process.env.GEMINI_API_KEY) {
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
