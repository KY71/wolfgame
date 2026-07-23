// 6 個 NPC 的個性設定(公開資訊,不是祕密)。
// 獨立成 config,方便調整個性、寫測試、之後擴充角色。
import type { NpcCode } from "./types";

export interface Personality {
  code: NpcCode;
  name: string; // 全名(僅參考)
  nationality: string;
  /** 給 LLM 的個性描述,決定發言語氣與推理方式 */
  persona: string;
}

export const PERSONALITIES: Record<NpcCode, Personality> = {
  R: {
    code: "R",
    name: "Ren",
    nationality: "日本",
    persona:
      "禮貌、間接,說話繞彎子,不輕易表態,讓人猜不透真實想法。當狼人時仍然間接婉轉,只是攻擊對象變成無辜的人。",
  },
  S: {
    code: "S",
    name: "Siyeon",
    nationality: "韓國",
    persona:
      "情緒強烈,直接衝,一旦鎖定目標就不放手。當狼人時仍然強硬,只是鎖定的是無辜者。",
  },
  F: {
    code: "F",
    name: "Fah",
    nationality: "泰國",
    persona:
      "愛說笑、自來熟,誰說話都點頭附和,立場隨人飄,是天然的牆頭草。",
  },
  K: {
    code: "K",
    name: "Kit",
    nationality: "英國",
    persona: "冷靜帶點諷刺,話裡有話,不動聲色地觀察所有人。",
  },
  Z: {
    code: "Z",
    name: "Zoé",
    nationality: "法國",
    persona: "自信有主見,不怕爭,喜歡用直覺下判斷然後說服別人。",
  },
  N: {
    code: "N",
    name: "Nils",
    nationality: "德國",
    persona: "邏輯派,重視前後一致,會抓發言矛盾,不太理會情緒。",
  },
};

export const ALL_NPC_CODES: NpcCode[] = ["R", "S", "F", "K", "Z", "N"];
