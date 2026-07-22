# 🌙 狼人殺 × LLM 網頁遊戲

5 人局(4 NPC + 你,1 狼)的狼人殺,NPC 由 LLM(Gemini)扮演,含握手結局。

## 架構

- **前端**(`app/page.tsx`):畫面 + 編排,只收得到「公開日誌 + 你自己的身份」。
- **後端**(`app/api/game/...`):唯一掌握祕密的地方。規則引擎全在程式碼,LLM 只產生「發言」與「決策」。
- **LLM**:每個 NPC 一個 sub-agent,context 裡物理上不含其他人的身份 → 真隔離。

核心程式:

| 檔案 | 作用 |
|---|---|
| `lib/game/types.ts` | 型別 |
| `lib/game/personalities.ts` | 6 個 NPC 個性設定 |
| `lib/game/engine.ts` | 純規則引擎(發牌/計票/握手/勝負) |
| `lib/game/agent.ts` | 決策介面 + 隔離視角 `buildView` + MockAgent |
| `lib/game/flow.ts` | 可暫停/續跑的流程機 |
| `lib/gemini/agent.ts` | Gemini 版 agent |
| `lib/store.ts` | 儲存 + 公開視角序列化(去除祕密) |

## 本地執行

```bash
npm install
npm run dev        # http://localhost:3000
```

沒設 `GEMINI_API_KEY` 時會用 **Mock 模式**(NPC 發言是罐頭,但整局流程/規則完全可玩)。
要接真 LLM:複製 `.env.example` 成 `.env.local`,填入 `GEMINI_API_KEY`。

## 測試規則引擎(不需 key / 不連網)

```bash
npx tsx scripts/test-engine.ts   # 自動跑 300 局,檢查規則不變量
```

## 部署到 Vercel(待辦)

目前遊戲狀態存**行程內記憶體**,僅適合本地單行程開發。上 Vercel 前需把 `lib/store.ts`
的儲存換成 **Vercel KV**(其餘不用動)。

## 進度

- [x] M0 專案骨架
- [x] M1 純規則引擎(300 局驗證通過)
- [x] M2 Gemini sub-agent
- [x] M3 前後端串接、本地可玩(Mock 模式)
- [ ] M3.5 接真 Gemini key 實測
- [ ] M4 部署(Vercel KV)+ UI 打磨
