// 狼人殺 × LLM 網頁遊戲 — 核心型別
// 原則:規則引擎全在程式碼;LLM 只產生「發言」與「決策」。

/** 陣營/身份 */
export type Role = "wolf" | "villager";

/** NPC 代號(6 人池,每局抽 4) */
export type NpcCode = "R" | "S" | "F" | "K" | "Z" | "N";

/** 遊戲階段 */
export type Phase =
  | "intro" // 第一天早上:自我介紹
  | "night" // 夜晚:狼人行動(第一夜為平安夜)
  | "day_announce" // 白天:公布死訊、檢查勝負
  | "day_discuss" // 白天:一般討論
  | "vote" // 投票
  | "handshake_discuss" // 握手前討論(剩 3 人)
  | "handshake" // 握手選擇
  | "ended"; // 遊戲結束

/** 勝利陣營 */
export type Winner = "villagers" | "wolf";

/** 玩家(NPC 或人類) */
export interface Player {
  id: string; // 唯一 id(NPC 用代號,人類用 "human")
  name: string; // 顯示名稱
  isHuman: boolean;
  code: NpcCode | "HUMAN";
  role: Role; // ★ 祕密:絕不送到前端(除了玩家自己)
  alive: boolean;
}

/** 公開日誌的一則紀錄(唯一會送給前端的內容) */
export type LogEntry =
  | { type: "host"; text: string } // 主持人旁白
  | { type: "speech"; speakerId: string; speakerName: string; text: string } // 玩家/NPC 發言
  | { type: "death"; playerId: string; playerName: string; role: Role; cause: "night" | "vote" } // 死亡揭露
  | { type: "vote_result"; tally: Record<string, number>; exiledId: string | null } // 投票結果
  | { type: "handshake_result"; choices: Record<string, string>; winner: Winner } // 握手結果
  | { type: "phase"; phase: Phase; day: number }; // 階段轉換標記

/** 完整遊戲狀態(存後端 / KV;role 欄位絕不外送) */
export interface GameState {
  gameId: string;
  day: number; // 第幾天(從 1 開始)
  phase: Phase;
  players: Player[];
  publicLog: LogEntry[];
  // 暫存資訊(未揭曉,絕不外送)
  pendingNightKill: string | null; // 本夜狼人選定的目標 id
  pendingVotes: Record<string, string | null>; // playerId -> 投票對象 id(null = 棄票/未投)
  pendingHandshake: Record<string, string>; // playerId -> 伸手對象 id
  winner: Winner | null;
  // ---- 流程機(server 專用,不外送)----
  stage: Stage; // 巨觀階段指標
  agenda: Step[]; // 待執行的步驟佇列
  waitingFor: WaitingFor | null; // 若非 null,表示正等待人類輸入
}

/** 巨觀階段(流程機用) */
export type Stage =
  | "intro"
  | "night1"
  | "day2"
  | "mainNight"
  | "mainDay"
  | "handshake"
  | "end"
  | "done";

/** 佇列中的一個步驟(server 專用) */
export type Step =
  | { kind: "host"; text: string }
  | { kind: "npcSpeak"; playerId: string; instruction: string }
  | { kind: "humanSpeak"; instruction: string }
  | { kind: "nightKill" }
  | { kind: "vote" }
  | { kind: "handshake" };

/** 候選對象(給前端顯示選項) */
export interface Candidate {
  id: string;
  name: string;
}

/** 正在等待人類的哪種輸入(會送給前端) */
export type WaitingFor =
  | { type: "speak"; instruction: string }
  | { type: "vote"; candidates: Candidate[] }
  | { type: "handshake"; candidates: Candidate[] }
  | { type: "nightKill"; candidates: Candidate[] };
