// 把遊戲狀態組成給 Gemini 的 prompt。
// 結構:[共用前綴:規則 + 個性 + 公開日誌] + [私有:自己的身份]。
// 共用前綴所有 agent 相同,私有部分放最後 —— 隔離邊界 + 對快取友善。
import type { AgentView } from "../game/agent";
import type { LogEntry } from "../game/types";
import { PERSONALITIES } from "../game/personalities";

/** 遊戲規則(共用前綴,對所有 agent 一致) */
const RULES = `你正在玩一場「狼人殺」文字遊戲,共 5 名玩家(4 名 NPC + 1 名人類),其中 1 名是狼人,其餘 4 名是村民。

規則:
- 狼人白天偽裝成村民,可以說謊、誤導;夜晚可殺害一名玩家。
- 村民不知道誰是狼人,靠白天討論推理,投票放逐可疑者。
- 勝利:村民找出並放逐狼人(或握手階段孤立狼人)則村民勝;狼人存活到與村民 1v1(或握手騙到村民)則狼人勝。
- 剩 3 人時進入「握手階段」:三人各選一人伸手,兩村民互選則村民勝,任一村民選到狼則狼勝。

重要原則:人類玩家與 NPC 地位完全相同,不因對方是真人而給予優待、迴避攻擊或預設信任。`;

/** 渲染公開日誌成可讀的對話紀錄 */
function renderLog(log: LogEntry[]): string {
  const lines: string[] = [];
  for (const e of log) {
    switch (e.type) {
      case "host":
        lines.push(`【主持人】${e.text}`);
        break;
      case "speech":
        lines.push(`${e.speakerName}:${e.text}`);
        break;
      case "death":
        lines.push(
          `【死亡】${e.playerName} ${e.cause === "night" ? "昨晚被殺" : "被投票放逐"},身份是${e.role === "wolf" ? "狼人" : "村民"}。`,
        );
        break;
      case "vote_result":
        lines.push(
          `【投票結果】${e.exiledId ? `${e.exiledId} 被放逐` : "平票,無人出局"}。`,
        );
        break;
      case "phase":
        // 階段標記不放進 prompt(對玩家/模型是雜訊)
        break;
      case "handshake_result":
        break;
    }
  }
  return lines.length ? lines.join("\n") : "(尚無公開發言)";
}

/** 描述自己的身份(私有後綴) */
function selfSection(view: AgentView): string {
  const persona =
    view.self.id in PERSONALITIES
      ? PERSONALITIES[view.self.id as keyof typeof PERSONALITIES].persona
      : "";
  let s = `你扮演的角色是「${view.self.name}」。\n你的個性:${persona}\n`;
  if (view.self.isWolf) {
    s += `\n★ 你的祕密身份是【狼人】。白天發言要裝成村民,可以轉移嫌疑、拉攏信任,但絕不可直接說出自己是狼。依你的個性行動,只是攻擊對象變成無辜的人。`;
  } else {
    s += `\n你的身份是【村民】。你不知道誰是狼人,要靠推理找出來。`;
  }
  return s;
}

/** 公開名冊 */
function rosterSection(view: AgentView): string {
  const rows = view.roster
    .map((p) => `- ${p.name}${p.alive ? "" : "(已出局)"}`)
    .join("\n");
  return `目前玩家:\n${rows}`;
}

/** 組發言 prompt */
export function buildSpeakPrompt(view: AgentView, instruction: string): string {
  return [
    RULES,
    "",
    rosterSection(view),
    "",
    "=== 目前為止的公開發言與事件 ===",
    renderLog(view.publicLog),
    "",
    "=== 你的身份(其他人不知道)===",
    selfSection(view),
    "",
    `=== 現在請你發言 ===`,
    `情境:${instruction}`,
    `請以「${view.self.name}」的口吻、符合你的個性,說一段自然、簡短有力的話(1~3 句,繁體中文)。只輸出發言內容本身,不要加引號或旁白。`,
  ].join("\n");
}

/** 組決策 prompt(挑刀 / 投票 / 握手)。候選人以名稱列出,回傳 JSON。 */
export function buildDecisionPrompt(
  view: AgentView,
  kind: "kill" | "vote" | "handshake",
  candidates: { id: string; name: string }[],
): string {
  const candList = candidates.map((c) => `- ${c.name}(id: ${c.id})`).join("\n");
  const task =
    kind === "kill"
      ? "你是狼人,選擇今晚要殺的目標。優先殺對狼人威脅最大的人(邏輯強、已開始懷疑你的人)。禁止空刀,必須選一人。"
      : kind === "vote"
        ? "根據目前討論,選擇你要投票放逐的對象。你也可以選擇棄票(target 設為 null)。"
        : "這是握手階段,選擇你要伸手的對象。若你是村民,設法找出另一位村民互握;若你是狼,選最可能回選你的村民。";
  return [
    RULES,
    "",
    rosterSection(view),
    "",
    "=== 目前為止的公開發言與事件 ===",
    renderLog(view.publicLog),
    "",
    "=== 你的身份(其他人不知道)===",
    selfSection(view),
    "",
    "=== 你的決策 ===",
    task,
    "候選對象:",
    candList,
    "",
    `請只輸出 JSON,格式:{"target": "候選人的 id", "reason": "簡短理由"}。${kind === "vote" ? 'target 可為 null 表示棄票。' : "target 必須是候選人之一的 id。"}`,
  ].join("\n");
}
