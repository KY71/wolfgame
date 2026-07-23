// 遊戲驅動器:把規則引擎串成一整局。
// M1 用 MockAgent 自動跑完,驗證規則正確性;
// M3 後端會照這個順序,但每一步拆成一次 API 呼叫、由前端編排。
import type { Agent } from "./agent";
import { buildView } from "./agent";
import type { GameState, Winner } from "./types";
import {
  addHost,
  addSpeech,
  alivePlayers,
  applyNightKill,
  checkWinner,
  createGame,
  judgeHandshake,
  shouldHandshake,
  tallyAndExile,
  wolfPlayer,
} from "./engine";

function endGame(s: GameState, winner: Winner): void {
  s.winner = winner;
  s.phase = "ended";
  addHost(
    s,
    winner === "villagers" ? "村民陣營勝利!狼人被找了出來。" : "狼人陣營勝利!",
  );
}

/** 讓某階段所有存活者依序發言一輪 */
async function speakRound(
  s: GameState,
  agent: Agent,
  instruction: string,
): Promise<void> {
  for (const p of alivePlayers(s)) {
    const text = await agent.speak(buildView(s, p.id), instruction);
    addSpeech(s, p.id, text);
  }
}

/** 執行握手階段並結束遊戲 */
async function runHandshake(s: GameState, agent: Agent): Promise<void> {
  s.phase = "handshake_discuss";
  addHost(s, "只剩三人。這是最後的心理博弈。");
  await speakRound(s, agent, "握手前討論(1/2)");
  await speakRound(s, agent, "握手前討論(2/2)");

  s.phase = "handshake";
  const choices: Record<string, string> = {};
  for (const p of alivePlayers(s)) {
    // 握手隔離:各自選擇,不把別人的握手目標放進 view
    const candidates = alivePlayers(s)
      .filter((x) => x.id !== p.id)
      .map((x) => x.id);
    choices[p.id] = await agent.decideHandshake(buildView(s, p.id), candidates);
  }
  const winner = judgeHandshake(s, choices);
  endGame(s, winner);
}

/**
 * 完整跑一局(自動、用同一個 agent 扮演所有人)。
 * 回傳最終狀態。
 */
export async function runGame(seed: number, agent: Agent): Promise<GameState> {
  const s = createGame({ gameId: `test-${seed}`, humanName: "你", seed });

  // === 前期(固定,僅一次)===
  // 第一天早上:自我介紹
  await speakRound(s, agent, "自我介紹");

  // 第一夜:平安夜
  s.phase = "night";
  applyNightKill(s, null);

  // 第二天早上:提醒 + 一輪討論 + 跳過投票
  s.day = 2;
  s.phase = "day_discuss";
  addHost(
    s,
    "昨晚平安無事,但我必須提醒大家——我們之中有一隻狼人,請多加小心。",
  );
  await speakRound(s, agent, "第二天討論");

  // === 第二夜起:主循環 ===
  let day = 2;
  for (let guard = 0; guard < 50; guard++) {
    // --- 夜晚:每夜必殺(禁止空刀)---
    s.phase = "night";
    const wolf = wolfPlayer(s)!;
    if (wolf.alive) {
      const candidates = alivePlayers(s)
        .filter((p) => p.role !== "wolf")
        .map((p) => p.id);
      const target = await agent.decideNightKill(
        buildView(s, wolf.id),
        candidates,
      );
      applyNightKill(s, target);
    }

    // 白天公布 → 檢查勝負 / 握手
    s.phase = "day_announce";
    let w = checkWinner(s);
    if (w) return endGame(s, w), s;
    if (shouldHandshake(s)) return (await runHandshake(s, agent)), s;

    // --- 一般討論(玩家發言 3 次)---
    day++;
    s.day = day;
    s.phase = "day_discuss";
    for (let r = 0; r < 3; r++) {
      await speakRound(s, agent, `第 ${day} 天討論(${r + 1}/3)`);
    }

    // --- 投票 ---
    s.phase = "vote";
    const votes: Record<string, string | null> = {};
    for (const p of alivePlayers(s)) {
      // 投票隔離:NPC 的 view 不含別人的票(玩家的票在真實遊戲中先暫存)
      const candidates = alivePlayers(s)
        .filter((x) => x.id !== p.id)
        .map((x) => x.id);
      votes[p.id] = await agent.decideVote(buildView(s, p.id), candidates);
    }
    tallyAndExile(s, votes);

    // 檢查勝負 / 握手
    w = checkWinner(s);
    if (w) return endGame(s, w), s;
    if (shouldHandshake(s)) return (await runHandshake(s, agent)), s;
  }

  return s;
}
