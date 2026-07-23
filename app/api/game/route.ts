// POST /api/game —— 開新局,推進到第一個需要玩家輸入的點,回傳公開視角。
import { NextResponse } from "next/server";
import { createGame } from "@/lib/game/engine";
import { runFlow } from "@/lib/game/flow";
import { getAgent, saveGame, toPublicView } from "@/lib/store";

export async function POST(req: Request) {
  let humanName = "你";
  try {
    const body = await req.json();
    if (body?.name && typeof body.name === "string") humanName = body.name.slice(0, 20);
  } catch {
    // 沒帶 body 就用預設
  }

  const gameId = `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const state = createGame({ gameId, humanName });

  await runFlow(state, getAgent());
  saveGame(state);

  return NextResponse.json(toPublicView(state));
}
