// Gemini 版的決策/發言引擎,實作 game/agent.ts 的 Agent 介面。
// 只在後端執行(API key 在伺服器環境變數)。
//
// ★ 用官方目前維護中的 @google/genai SDK(舊版 @google/generative-ai
//   已於 2025-08-31 EOL,呼叫會失敗)。
import { GoogleGenAI, Type } from "@google/genai";
import type { Agent, AgentView } from "../game/agent";
import { buildDecisionPrompt, buildSpeakPrompt } from "./prompt";

// ★ 用 alias「gemini-flash-latest」而非釘死版本號:固定版本(如
//   gemini-2.5-flash)會被 Google 對新 API key 下架,回 404「no longer
//   available to new users」,導致所有呼叫失敗、NPC 全部沉默不語。
//   alias 永遠指向當前維護中的 flash 模型,可根治這類下架問題。
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

function nameOf(view: AgentView, id: string): string {
  return view.roster.find((p) => p.id === id)?.name ?? id;
}

export class GeminiAgent implements Agent {
  private ai: GoogleGenAI;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) throw new Error("缺少 GEMINI_API_KEY 環境變數");
    this.ai = new GoogleGenAI({ apiKey: key });
  }

  async speak(view: AgentView, instruction: string): Promise<string> {
    const prompt = buildSpeakPrompt(view, instruction);
    try {
      const res = await this.ai.models.generateContent({
        model: MODEL,
        contents: prompt,
      });
      return (res.text ?? "").trim() || `(${view.self.name} 沉默不語)`;
    } catch (err) {
      console.error(
        `[gemini] speak 失敗 model=${MODEL} player=${view.self.id}:`,
        err instanceof Error ? err.message : err,
      );
      return `(${view.self.name} 沉默不語)`;
    }
  }

  private async decide(
    view: AgentView,
    kind: "kill" | "vote" | "handshake",
    candidates: string[],
    allowNull: boolean,
  ): Promise<string | null> {
    const cands = candidates.map((id) => ({ id, name: nameOf(view, id) }));
    const prompt = buildDecisionPrompt(view, kind, cands);

    // 重試一次;仍失敗或不合法則 fallback 隨機(不讓遊戲卡死)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await this.ai.models.generateContent({
          model: MODEL,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                target: { type: Type.STRING, nullable: allowNull },
                reason: { type: Type.STRING },
              },
              required: ["target"],
            },
          },
        });
        const parsed = JSON.parse(res.text ?? "{}") as {
          target: string | null;
        };
        const t = parsed.target;
        if (t === null && allowNull) return null;
        if (t && candidates.includes(t)) return t;
      } catch (err) {
        console.error(
          `[gemini] decide(${kind}) 失敗 model=${MODEL} player=${view.self.id} attempt=${attempt}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  async decideNightKill(view: AgentView, candidates: string[]): Promise<string> {
    return (await this.decide(view, "kill", candidates, false)) as string;
  }
  async decideVote(
    view: AgentView,
    candidates: string[],
  ): Promise<string | null> {
    return this.decide(view, "vote", candidates, true);
  }
  async decideHandshake(
    view: AgentView,
    candidates: string[],
  ): Promise<string> {
    return (await this.decide(view, "handshake", candidates, false)) as string;
  }
}
