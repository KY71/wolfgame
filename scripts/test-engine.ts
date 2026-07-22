// M1 驗證:用 MockAgent 自動跑多局,檢查規則不變量,並印一局完整過程。
// 執行:npx tsx scripts/test-engine.ts
import { MockAgent } from "../lib/game/agent";
import { runGame } from "../lib/game/driver";
import { makeRng, wolfPlayer } from "../lib/game/engine";
import type { GameState, LogEntry } from "../lib/game/types";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("不變量失敗: " + msg);
}

function checkInvariants(s: GameState): void {
  // 1. 遊戲必須結束且有勝負
  assert(s.phase === "ended", "遊戲未結束");
  assert(s.winner === "villagers" || s.winner === "wolf", "沒有勝負");

  // 2. 夜刀從未殺到狼
  for (const e of s.publicLog) {
    if (e.type === "death" && e.cause === "night") {
      assert(e.role !== "wolf", "夜晚殺到了狼(不該發生)");
    }
  }

  // 3. 死者不會在死後發言
  const deadAt = new Map<string, number>();
  s.publicLog.forEach((e: LogEntry, i: number) => {
    if (e.type === "death") deadAt.set(e.playerId, i);
    if (e.type === "speech") {
      const d = deadAt.get(e.speakerId);
      assert(d === undefined || i < d, `死者 ${e.speakerName} 死後仍發言`);
    }
  });

  // 4. 勝負與結局一致
  const wolf = wolfPlayer(s)!;
  const handshakeEnded = s.publicLog.some((e) => e.type === "handshake_result");
  if (!handshakeEnded) {
    if (s.winner === "villagers") assert(!wolf.alive, "村民勝但狼還活著");
    if (s.winner === "wolf") assert(wolf.alive, "狼勝但狼已死");
  }
}

async function main() {
  const N = 300;
  const stats = { villagers: 0, wolf: 0, byHandshake: 0, byVote: 0, byKill: 0 };

  for (let i = 0; i < N; i++) {
    const agent = new MockAgent(makeRng(i * 7919 + 13));
    const s = await runGame(i, agent);
    checkInvariants(s);
    stats[s.winner as "villagers" | "wolf"]++;
    if (s.publicLog.some((e) => e.type === "handshake_result")) stats.byHandshake++;
    else {
      const last = [...s.publicLog].reverse().find((e) => e.type === "death") as
        | Extract<LogEntry, { type: "death" }>
        | undefined;
      if (last?.cause === "vote") stats.byVote++;
      else stats.byKill++;
    }
  }

  console.log(`✅ ${N} 局全部通過不變量檢查`);
  console.log("勝負分佈:", stats);

  // 印一局完整過程
  console.log("\n===== 範例對局(seed=1)=====");
  const s = await runGame(1, new MockAgent(makeRng(999)));
  console.log(
    "身份:",
    s.players.map((p) => `${p.name}=${p.role}`).join(", "),
  );
  for (const e of s.publicLog) {
    if (e.type === "host") console.log(`🎙️  ${e.text}`);
    else if (e.type === "speech") console.log(`💬 ${e.speakerName}: ${e.text}`);
    else if (e.type === "death")
      console.log(
        `☠️  ${e.playerName}(${e.role})被${e.cause === "night" ? "夜殺" : "放逐"}`,
      );
    else if (e.type === "vote_result")
      console.log(`🗳️  票數:`, e.tally, "→", e.exiledId ?? "無人出局");
    else if (e.type === "handshake_result")
      console.log(`🤝 握手:`, e.choices, "→", e.winner, "勝");
    else if (e.type === "phase") console.log(`--- 第${e.day}天 · ${e.phase} ---`);
  }
  console.log(`\n🏆 勝方: ${s.winner}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
