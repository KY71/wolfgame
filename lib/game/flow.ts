// 可暫停/續跑的流程機。
// runFlow() 一直往前推進,直到需要人類輸入(回傳 waitingFor)或遊戲結束。
// 人類輸入由 API 層套用後,再呼叫一次 runFlow 續跑。
import type { Agent } from "./agent";
import { buildView } from "./agent";
import type { Candidate, GameState, Step, Winner } from "./types";
import {
  addHost,
  addSpeech,
  alivePlayers,
  applyNightKill,
  checkWinner,
  judgeHandshake,
  shouldHandshake,
  tallyAndExile,
  wolfPlayer,
} from "./engine";

function candidatesExcept(s: GameState, exceptId: string): Candidate[] {
  return alivePlayers(s)
    .filter((p) => p.id !== exceptId)
    .map((p) => ({ id: p.id, name: p.name }));
}

function nonWolfCandidates(s: GameState): Candidate[] {
  return alivePlayers(s)
    .filter((p) => p.role !== "wolf")
    .map((p) => ({ id: p.id, name: p.name }));
}

function endGame(s: GameState, winner: Winner): void {
  s.winner = winner;
  s.phase = "ended";
  s.stage = "done";
  s.agenda = [];
  addHost(
    s,
    winner === "villagers" ? "村民陣營勝利!狼人被找了出來。" : "狼人陣營勝利!",
  );
}

/** 排入一個討論階段:humanSpeaks 次「NPC 輪 + 人類發言」,最後補一輪 NPC 收尾 */
function enqueueDiscussion(
  s: GameState,
  humanSpeaks: number,
  label: string,
): void {
  const npcOrder = () =>
    alivePlayers(s)
      .filter((p) => !p.isHuman)
      .map((p) => p.id)
      // 每輪順序隨機
      .sort(() => Math.random() - 0.5);

  for (let r = 0; r < humanSpeaks; r++) {
    for (const id of npcOrder()) {
      s.agenda.push({ kind: "npcSpeak", playerId: id, instruction: label });
    }
    if (alivePlayers(s).some((p) => p.isHuman)) {
      s.agenda.push({ kind: "humanSpeak", instruction: label });
    }
  }
  // AI 收尾一輪
  for (const id of npcOrder()) {
    s.agenda.push({ kind: "npcSpeak", playerId: id, instruction: `${label}(收尾)` });
  }
}

/** 當 agenda 清空時,依 stage 排入下一段步驟,並設定「預設下一 stage」 */
function enqueueStage(s: GameState): void {
  switch (s.stage) {
    case "intro": {
      s.phase = "intro";
      // 自我介紹:NPC 先、人類最後
      for (const p of alivePlayers(s).filter((x) => !x.isHuman)) {
        s.agenda.push({ kind: "npcSpeak", playerId: p.id, instruction: "自我介紹" });
      }
      if (alivePlayers(s).some((p) => p.isHuman)) {
        s.agenda.push({ kind: "humanSpeak", instruction: "自我介紹" });
      }
      s.stage = "night1";
      break;
    }
    case "night1": {
      s.phase = "night";
      s.agenda.push({ kind: "host", text: "夜晚降臨……第一夜,平安無事,無人死亡。" });
      s.stage = "day2";
      break;
    }
    case "day2": {
      s.day = 2;
      s.phase = "day_discuss";
      s.agenda.push({
        kind: "host",
        text: "昨晚平安無事,但我必須提醒大家——我們之中有一隻狼人,請多加小心。",
      });
      enqueueDiscussion(s, 1, "第二天討論");
      s.stage = "mainNight";
      break;
    }
    case "mainNight": {
      s.phase = "night";
      s.agenda.push({ kind: "host", text: "夜晚降臨,狼人正在行動……" });
      s.agenda.push({ kind: "nightKill" });
      s.stage = "mainDay"; // 預設;nightKill 執行後可能改成 handshake/end
      break;
    }
    case "mainDay": {
      s.day += 1;
      s.phase = "day_discuss";
      enqueueDiscussion(s, 3, `第 ${s.day} 天討論`);
      s.agenda.push({ kind: "vote" });
      s.stage = "mainNight"; // 預設;vote 執行後可能改成 handshake/end
      break;
    }
    case "handshake": {
      s.phase = "handshake_discuss";
      s.agenda.push({ kind: "host", text: "只剩三人。這是最後的心理博弈。" });
      enqueueDiscussion(s, 2, "握手前討論");
      s.agenda.push({ kind: "handshake" });
      s.stage = "done";
      break;
    }
    default:
      break;
  }
}

/** nightKill / vote 之後檢查勝負與握手,調整 stage */
function postDeath(s: GameState): void {
  const w = checkWinner(s);
  if (w) {
    endGame(s, w);
    return;
  }
  if (shouldHandshake(s)) {
    s.agenda = [];
    s.stage = "handshake";
  }
}

/**
 * 推進遊戲直到需要人類輸入或結束。
 * 回傳後,若 s.waitingFor 非 null 表示在等玩家;若 s.phase==="ended" 表示結束。
 */
export async function runFlow(s: GameState, agent: Agent): Promise<void> {
  s.waitingFor = null;

  for (let guard = 0; guard < 500; guard++) {
    if (s.phase === "ended") return;

    if (s.agenda.length === 0) {
      enqueueStage(s);
      if (s.agenda.length === 0) return; // 沒東西可排(done)
      continue;
    }

    const step = s.agenda[0];

    switch (step.kind) {
      case "host": {
        addHost(s, step.text);
        s.agenda.shift();
        break;
      }
      case "npcSpeak": {
        const view = buildView(s, step.playerId);
        const text = await agent.speak(view, step.instruction);
        addSpeech(s, step.playerId, text);
        s.agenda.shift();
        break;
      }
      case "humanSpeak": {
        // 若人類已出局就跳過
        const human = s.players.find((p) => p.isHuman);
        if (!human || !human.alive) {
          s.agenda.shift();
          break;
        }
        s.waitingFor = { type: "speak", instruction: step.instruction };
        return; // 暫停等玩家發言
      }
      case "nightKill": {
        const wolf = wolfPlayer(s);
        if (!wolf || !wolf.alive) {
          s.agenda.shift();
          break;
        }
        const cands = nonWolfCandidates(s);
        if (wolf.isHuman) {
          s.waitingFor = { type: "nightKill", candidates: cands };
          return; // 暫停等玩家(玩家是狼)挑刀
        }
        const target = await agent.decideNightKill(
          buildView(s, wolf.id),
          cands.map((c) => c.id),
        );
        applyNightKill(s, target);
        s.agenda.shift();
        s.phase = "day_announce";
        postDeath(s);
        break;
      }
      case "vote": {
        const human = s.players.find((p) => p.isHuman);
        // 人類先投(隱藏),NPC 才投
        if (human && human.alive && s.pendingVotes[human.id] === undefined) {
          s.waitingFor = {
            type: "vote",
            candidates: candidatesExcept(s, human.id),
          };
          return;
        }
        // 收集 NPC 投票
        for (const p of alivePlayers(s).filter((x) => !x.isHuman)) {
          if (s.pendingVotes[p.id] !== undefined) continue;
          const cands = candidatesExcept(s, p.id).map((c) => c.id);
          s.pendingVotes[p.id] = await agent.decideVote(buildView(s, p.id), cands);
        }
        s.phase = "vote";
        tallyAndExile(s, s.pendingVotes);
        s.pendingVotes = {};
        s.agenda.shift();
        postDeath(s);
        break;
      }
      case "handshake": {
        const human = s.players.find((p) => p.isHuman);
        if (human && human.alive && s.pendingHandshake[human.id] === undefined) {
          s.waitingFor = {
            type: "handshake",
            candidates: candidatesExcept(s, human.id),
          };
          return;
        }
        for (const p of alivePlayers(s).filter((x) => !x.isHuman)) {
          if (s.pendingHandshake[p.id] !== undefined) continue;
          const cands = candidatesExcept(s, p.id).map((c) => c.id);
          s.pendingHandshake[p.id] = await agent.decideHandshake(
            buildView(s, p.id),
            cands,
          );
        }
        s.phase = "handshake";
        const winner = judgeHandshake(s, s.pendingHandshake);
        endGame(s, winner);
        return;
      }
    }
  }
}

// ---- 套用人類輸入(由 API 層呼叫)----

export function applyHumanSpeak(s: GameState, text: string): void {
  const human = s.players.find((p) => p.isHuman);
  if (!human) return;
  addSpeech(s, human.id, text);
  // 消耗掉那個 humanSpeak 步驟
  if (s.agenda[0]?.kind === "humanSpeak") s.agenda.shift();
  s.waitingFor = null;
}

export function applyHumanVote(s: GameState, targetId: string | null): void {
  const human = s.players.find((p) => p.isHuman);
  if (!human) return;
  s.pendingVotes[human.id] = targetId;
  s.waitingFor = null;
}

export function applyHumanHandshake(s: GameState, targetId: string): void {
  const human = s.players.find((p) => p.isHuman);
  if (!human) return;
  s.pendingHandshake[human.id] = targetId;
  s.waitingFor = null;
}

export function applyHumanNightKill(s: GameState, targetId: string): void {
  applyNightKill(s, targetId);
  if (s.agenda[0]?.kind === "nightKill") s.agenda.shift();
  s.phase = "day_announce";
  postDeath(s);
  s.waitingFor = null;
}
