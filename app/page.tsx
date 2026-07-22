"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicView } from "@/lib/store";

type Log = PublicView["publicLog"][number];

export default function Home() {
  const [view, setView] = useState<PublicView | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [speech, setSpeech] = useState("");
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [view?.publicLog.length]);

  async function startGame() {
    setLoading(true);
    try {
      const res = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || "你" }),
      });
      setView(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function act(payload: Record<string, unknown>) {
    if (!view) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/game/${view.gameId}/act`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setView(await res.json());
      setSpeech("");
    } finally {
      setLoading(false);
    }
  }

  const roleLabel = (r: string) => (r === "wolf" ? "🐺 狼人" : "🧑‍🌾 村民");

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-6 text-neutral-100">
      <h1 className="mb-1 text-2xl font-bold">🌙 狼人殺 × LLM</h1>
      <p className="mb-4 text-sm text-neutral-400">
        5 人局 · 1 狼 · 你與 4 名 NPC 對決
      </p>

      {!view && (
        <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-4">
          <input
            className="mb-3 w-full rounded border border-neutral-600 bg-neutral-800 px-3 py-2"
            placeholder="你的名字(可留空)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="w-full rounded bg-indigo-600 py-2 font-semibold hover:bg-indigo-500 disabled:opacity-50"
            onClick={startGame}
            disabled={loading}
          >
            {loading ? "發牌中……" : "開始遊戲"}
          </button>
        </div>
      )}

      {view && (
        <>
          {/* 你的身份 + 名冊 */}
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-sm">
            <span className="font-semibold">
              你的身份:{roleLabel(view.you.role)}
            </span>
            <span className="text-neutral-500">·</span>
            <span>第 {view.day} 天</span>
            {view.usingMock && (
              <span className="ml-auto rounded bg-amber-800/60 px-2 py-0.5 text-xs">
                Mock 模式(未設 GEMINI_API_KEY)
              </span>
            )}
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {view.roster.map((p) => (
              <span
                key={p.id}
                className={`rounded px-2 py-1 text-xs ${
                  p.alive
                    ? "bg-neutral-800 text-neutral-200"
                    : "bg-neutral-900 text-neutral-600 line-through"
                }`}
              >
                {p.name}
                {p.id === view.you.id ? "(你)" : ""}
              </span>
            ))}
          </div>

          {/* 公開日誌 */}
          <div className="mb-4 h-[50vh] space-y-2 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-950 p-3">
            {view.publicLog.map((e, i) => (
              <LogLine key={i} e={e} youId={view.you.id} />
            ))}
            <div ref={logEndRef} />
          </div>

          {/* 互動區 */}
          {view.winner ? (
            <div className="rounded-lg border border-indigo-700 bg-indigo-950 p-4 text-center">
              <p className="mb-3 text-lg font-bold">
                {view.winner === "villagers" ? "🧑‍🌾 村民勝利" : "🐺 狼人勝利"}
              </p>
              <button
                className="rounded bg-indigo-600 px-4 py-2 hover:bg-indigo-500"
                onClick={() => setView(null)}
              >
                再來一局
              </button>
            </div>
          ) : view.waitingFor ? (
            <Interaction
              w={view.waitingFor}
              loading={loading}
              speech={speech}
              setSpeech={setSpeech}
              act={act}
            />
          ) : (
            <p className="text-center text-neutral-500">處理中……</p>
          )}
        </>
      )}
    </main>
  );
}

function LogLine({ e, youId }: { e: Log; youId: string }) {
  if (e.type === "host")
    return <p className="text-sm italic text-amber-300">🎙️ {e.text}</p>;
  if (e.type === "speech")
    return (
      <p className="text-sm">
        <span
          className={`font-semibold ${e.speakerId === youId ? "text-indigo-300" : "text-neutral-200"}`}
        >
          {e.speakerName}
          {e.speakerId === youId ? "(你)" : ""}:
        </span>{" "}
        <span className="text-neutral-300">{e.text}</span>
      </p>
    );
  if (e.type === "death")
    return (
      <p className="text-sm font-medium text-red-400">
        ☠️ {e.playerName}
        {e.cause === "night" ? "昨晚被殺害" : "被投票放逐"},身份是
        {e.role === "wolf" ? "狼人 🐺" : "村民 🧑‍🌾"}。
      </p>
    );
  if (e.type === "vote_result")
    return (
      <p className="text-sm text-neutral-400">
        🗳️ 投票結果:
        {Object.entries(e.tally)
          .map(([k, v]) => `${k}(${v}票)`)
          .join(", ") || "無人投票"}
        {e.exiledId ? "" : " —— 平票,無人出局"}
      </p>
    );
  if (e.type === "handshake_result")
    return (
      <p className="text-sm text-purple-300">
        🤝 握手結束 —— {e.winner === "villagers" ? "村民" : "狼人"}勝
      </p>
    );
  return null;
}

function Interaction({
  w,
  loading,
  speech,
  setSpeech,
  act,
}: {
  w: NonNullable<PublicView["waitingFor"]>;
  loading: boolean;
  speech: string;
  setSpeech: (s: string) => void;
  act: (p: Record<string, unknown>) => void;
}) {
  if (w.type === "speak")
    return (
      <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-3">
        <p className="mb-2 text-xs text-neutral-400">
          輪到你發言 · {w.instruction}
        </p>
        <textarea
          className="mb-2 w-full rounded border border-neutral-600 bg-neutral-800 px-3 py-2"
          rows={2}
          value={speech}
          onChange={(e) => setSpeech(e.target.value)}
          placeholder="說點什麼……"
        />
        <button
          className="w-full rounded bg-indigo-600 py-2 hover:bg-indigo-500 disabled:opacity-50"
          disabled={loading || !speech.trim()}
          onClick={() => act({ action: "speak", text: speech })}
        >
          發言
        </button>
      </div>
    );

  const title =
    w.type === "vote"
      ? "🗳️ 投票放逐誰?"
      : w.type === "handshake"
        ? "🤝 你要向誰伸手?"
        : "🐺 今晚要殺誰?";

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-3">
      <p className="mb-2 text-sm font-medium">{title}</p>
      <div className="flex flex-wrap gap-2">
        {w.candidates.map((c) => (
          <button
            key={c.id}
            className="rounded bg-neutral-800 px-3 py-2 text-sm hover:bg-indigo-600 disabled:opacity-50"
            disabled={loading}
            onClick={() =>
              act({
                action:
                  w.type === "vote"
                    ? "vote"
                    : w.type === "handshake"
                      ? "handshake"
                      : "nightKill",
                targetId: c.id,
              })
            }
          >
            {c.name}
          </button>
        ))}
        {w.type === "vote" && (
          <button
            className="rounded bg-neutral-800 px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-700 disabled:opacity-50"
            disabled={loading}
            onClick={() => act({ action: "vote", targetId: null })}
          >
            棄票
          </button>
        )}
      </div>
    </div>
  );
}
