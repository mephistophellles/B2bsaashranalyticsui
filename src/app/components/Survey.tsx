import { useEffect, useState } from "react";
import { apiFetch } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";

type Q = { id: number; block_index: number; order_in_block: number; text: string };

export default function Survey() {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<Q[]>([]);
  const [scores, setScores] = useState<Record<number, number>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/surveys/template");
      if (res.ok) setQuestions(await res.json());
    })();
  }, []);

  async function submit() {
    setMsg(null);
    const byBlock: Record<number, number[]> = {};
    for (const q of questions) {
      const v = scores[q.id];
      if (v == null) {
        setMsg("Ответьте на все вопросы");
        return;
      }
      if (!byBlock[q.block_index]) byBlock[q.block_index] = [];
      byBlock[q.block_index].push(v);
    }
    const blocks = Object.entries(byBlock)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, vals]) => ({
        block_index: Number(k),
        scores: vals,
      }));
    const res = await apiFetch("/surveys", {
      method: "POST",
      body: JSON.stringify({ blocks }),
    });
    if (res.ok) setMsg("Спасибо! Ответы сохранены.");
    else setMsg("Ошибка отправки");
  }

  if (user?.role !== "employee") {
    return (
      <div className="p-6 text-gray-600">
        Опрос доступен сотрудникам. Войдите как employee/employee123.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Опрос ESSI</h1>
      <p className="text-sm text-gray-500">
        Оцените по шкале 1–5 (1 — совсем не согласен, 5 — полностью согласен).
      </p>
      <div className="space-y-4">
        {questions.map((q) => (
          <div key={q.id} className="border border-gray-200 rounded-xl p-4 bg-white">
            <div className="text-sm font-medium text-gray-900 mb-2">{q.text}</div>
            <select
              className="border border-gray-300 rounded-lg px-2 py-1"
              value={scores[q.id] ?? ""}
              onChange={(e) =>
                setScores((s) => ({ ...s, [q.id]: Number(e.target.value) }))
              }
            >
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {msg && <div className="text-sm text-gray-700">{msg}</div>}
      <button
        type="button"
        onClick={() => void submit()}
        className="px-4 py-2 rounded-lg text-white bg-gradient-to-r from-[#0052FF] to-[#4D7CFF]"
      >
        Отправить
      </button>
    </div>
  );
}
