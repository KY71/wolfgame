// 純規則引擎 —— 不呼叫任何 LLM、不碰網路。
// 所有規則判斷(發牌/計票/握手/勝負)都在這裡,方便單獨測試。
import type { GameState, LogEntry, NpcCode, Player, Role, Winner } from "./types";
import { ALL_NPC_CODES, PERSONALITIES } from "./personalities";

/** 可設種子的亂數(mulberry32),讓測試可重現 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface CreateGameOptions {
  gameId: string;
  humanName: string;
  seed?: number; // 給定則可重現(測試用)
}

/**
 * 發牌:從 6 人池抽 4 NPC,加上人類共 5 人,隨機指定 1 名狼人。
 */
export function createGame(opts: CreateGameOptions): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = makeRng(seed);

  const chosenCodes = shuffle(ALL_NPC_CODES, rng).slice(0, 4) as NpcCode[];

  const players: Player[] = chosenCodes.map((code) => ({
    id: code,
    name: PERSONALITIES[code].name,
    isHuman: false,
    code,
    role: "villager",
    alive: true,
  }));
  players.push({
    id: "human",
    name: opts.humanName || "你",
    isHuman: true,
    code: "HUMAN",
    role: "villager",
    alive: true,
  });

  // 5 人中隨機選 1 狼
  const wolfIndex = Math.floor(rng() * players.length);
  players[wolfIndex].role = "wolf";

  return {
    gameId: opts.gameId,
    day: 1,
    phase: "intro",
    players,
    publicLog: [{ type: "phase", phase: "intro", day: 1 }],
    pendingNightKill: null,
    pendingVotes: {},
    pendingHandshake: {},
    winner: null,
    stage: "intro",
    agenda: [],
    waitingFor: null,
  };
}

// ---- 查詢 helpers ----

export const alivePlayers = (s: GameState): Player[] =>
  s.players.filter((p) => p.alive);

export const aliveWolves = (s: GameState): Player[] =>
  s.players.filter((p) => p.alive && p.role === "wolf");

export const aliveVillagers = (s: GameState): Player[] =>
  s.players.filter((p) => p.alive && p.role === "villager");

export const findPlayer = (s: GameState, id: string): Player | undefined =>
  s.players.find((p) => p.id === id);

export const wolfPlayer = (s: GameState): Player | undefined =>
  s.players.find((p) => p.role === "wolf");

function log(s: GameState, entry: LogEntry): void {
  s.publicLog.push(entry);
}

// ---- 發言(不改變規則狀態,只寫入公開日誌) ----

export function addSpeech(
  s: GameState,
  speakerId: string,
  text: string,
): void {
  const p = findPlayer(s, speakerId);
  if (!p) return;
  log(s, { type: "speech", speakerId, speakerName: p.name, text });
}

export function addHost(s: GameState, text: string): void {
  log(s, { type: "host", text });
}

// ---- 夜晚:狼人殺人 ----

/**
 * 套用夜晚結果。targetId 為 null 代表平安夜(第一夜)。
 * 第二夜起禁止空刀,targetId 必須是存活的非狼玩家。
 */
export function applyNightKill(s: GameState, targetId: string | null): void {
  if (targetId === null) {
    // 平安夜
    addHost(s, "昨晚平安無事,無人死亡。");
    return;
  }
  const target = findPlayer(s, targetId);
  if (!target || !target.alive) {
    throw new Error(`夜晚目標無效: ${targetId}`);
  }
  target.alive = false;
  log(s, {
    type: "death",
    playerId: target.id,
    playerName: target.name,
    role: target.role,
    cause: "night",
  });
}

// ---- 投票 ----

/**
 * 計票並放逐得票最多者。同票 → 無人出局。
 * votes: playerId -> 投票對象 id(null = 棄票)
 * 回傳被放逐者 id(或 null)。
 */
export function tallyAndExile(
  s: GameState,
  votes: Record<string, string | null>,
): string | null {
  const tally: Record<string, number> = {};
  for (const voterId of Object.keys(votes)) {
    const target = votes[voterId];
    if (!target) continue;
    tally[target] = (tally[target] ?? 0) + 1;
  }

  let max = 0;
  let leaders: string[] = [];
  for (const id of Object.keys(tally)) {
    if (tally[id] > max) {
      max = tally[id];
      leaders = [id];
    } else if (tally[id] === max) {
      leaders.push(id);
    }
  }

  // 同票或無票 → 無人出局
  const exiledId = leaders.length === 1 && max > 0 ? leaders[0] : null;

  if (exiledId) {
    const p = findPlayer(s, exiledId)!;
    p.alive = false;
    log(s, { type: "vote_result", tally, exiledId });
    log(s, {
      type: "death",
      playerId: p.id,
      playerName: p.name,
      role: p.role,
      cause: "vote",
    });
  } else {
    log(s, { type: "vote_result", tally, exiledId: null });
    addHost(s, "平票,無人出局。");
  }
  return exiledId;
}

// ---- 握手(剩 3 人) ----

/**
 * 握手判定。choices: playerId -> 伸手對象 id(三人各選一)。
 * - 兩位村民互選 → 村民勝(狼被孤立)
 * - 任一村民選到狼 → 狼勝(狼成功融入)
 */
export function judgeHandshake(
  s: GameState,
  choices: Record<string, string>,
): Winner {
  const alive = alivePlayers(s);
  const wolf = alive.find((p) => p.role === "wolf")!;
  const villagers = alive.filter((p) => p.role === "villager");

  // 任一村民伸手給狼 → 狼勝
  for (const v of villagers) {
    if (choices[v.id] === wolf.id) {
      log(s, { type: "handshake_result", choices, winner: "wolf" });
      return "wolf";
    }
  }
  // 兩村民互選 → 村民勝
  if (
    villagers.length === 2 &&
    choices[villagers[0].id] === villagers[1].id &&
    choices[villagers[1].id] === villagers[0].id
  ) {
    log(s, { type: "handshake_result", choices, winner: "villagers" });
    return "villagers";
  }
  // 其餘情況(村民各選不同、或選到自己等):狼沒被孤立,判狼勝
  log(s, { type: "handshake_result", choices, winner: "wolf" });
  return "wolf";
}

// ---- 勝負檢查 ----

/**
 * 檢查一般勝負(不含握手)。
 * - 狼被消滅 → 村民勝
 * - 存活狼數 ≥ 存活村民數 → 狼勝
 * 回傳 Winner 或 null(未分勝負)。
 */
export function checkWinner(s: GameState): Winner | null {
  const wolves = aliveWolves(s).length;
  const villagers = aliveVillagers(s).length;
  if (wolves === 0) return "villagers";
  if (wolves >= villagers) return "wolf";
  return null;
}

/** 是否進入握手階段(存活剛好 3 人且狼還在) */
export function shouldHandshake(s: GameState): boolean {
  return alivePlayers(s).length === 3 && aliveWolves(s).length === 1;
}
