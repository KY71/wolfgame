// POST /api/game/[id]/act —— 套用玩家輸入,續跑到下一個暫停點。
// body: { action: "speak"|"vote"|"handshake"|"nightKill", text?, targetId? }
import { NextResponse } from "next/server";
import { runFlow } from "@/lib/game/flow";
import {
  applyHumanHandshake,
  applyHumanNightKill,
  applyHumanSpeak,
  applyHumanVote,
} from "@/lib/game/flow";
import { getAgent, loadGame, saveGame, toPublicView } from "@/lib/store";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const state = loadGame(id);
  if (!state) {
    return NextResponse.json({ error: "找不到遊戲" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action as string;

  // 只在正在等待對應輸入時才套用(防亂送)
  const w = state.waitingFor;
  if (!w) {
    return NextResponse.json(toPublicView(state));
  }

  if (action === "speak" && w.type === "speak") {
    applyHumanSpeak(state, String(body.text ?? "").slice(0, 500));
  } else if (action === "vote" && w.type === "vote") {
    const t = body.targetId ?? null;
    applyHumanVote(state, t);
  } else if (action === "handshake" && w.type === "handshake") {
    if (typeof body.targetId !== "string") {
      return NextResponse.json({ error: "需要 targetId" }, { status: 400 });
    }
    applyHumanHandshake(state, body.targetId);
  } else if (action === "nightKill" && w.type === "nightKill") {
    if (typeof body.targetId !== "string") {
      return NextResponse.json({ error: "需要 targetId" }, { status: 400 });
    }
    applyHumanNightKill(state, body.targetId);
  } else {
    return NextResponse.json({ error: "動作與目前等待不符" }, { status: 400 });
  }

  await runFlow(state, getAgent());
  saveGame(state);

  return NextResponse.json(toPublicView(state));
}
