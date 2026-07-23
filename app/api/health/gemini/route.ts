// GET /api/health/gemini —— 診斷用:直接對 Gemini 打一次最小呼叫,
// 把真實結果/錯誤以 JSON 回傳。用來排查「NPC 全部沉默不語」時,
// 不必再翻 Vercel Logs——瀏覽器打開這個網址就能看到真正的失敗原因。
//
// ★ 只回傳除錯所需的最小資訊,絕不回傳 API key 本身。
import { NextResponse } from "next/server";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export async function GET() {
  const hasKey = Boolean(process.env.GEMINI_API_KEY);
  const keyLen = process.env.GEMINI_API_KEY?.length ?? 0;

  const base = {
    hasKey,
    keyLen, // 只給長度,方便判斷是不是貼成空字串/含引號,不外洩內容
    model: MODEL,
    usingMock: !hasKey, // 與遊戲同一套判斷:沒 key 就是 Mock
  };

  if (!hasKey) {
    return NextResponse.json({
      ok: false,
      ...base,
      error: "GEMINI_API_KEY 未設定,遊戲會走 Mock(NPC 罐頭發言)。",
    });
  }

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const started = Date.now();
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: "請只回覆兩個字:正常",
    });
    const text = (res.text ?? "").trim();
    return NextResponse.json({
      ok: text.length > 0,
      ...base,
      latencyMs: Date.now() - started,
      textLen: text.length,
      sample: text.slice(0, 40), // 前 40 字,確認真的有回內容
    });
  } catch (err) {
    // 把真實錯誤攤開來,這才是「沉默不語」的根因
    const e = err as { message?: string; status?: number; name?: string };
    return NextResponse.json({
      ok: false,
      ...base,
      errorName: e?.name ?? null,
      status: e?.status ?? null,
      error: e?.message ?? String(err),
    });
  }
}
