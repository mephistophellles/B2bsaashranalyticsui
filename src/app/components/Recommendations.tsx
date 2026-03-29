import { useCallback, useEffect, useState } from "react";
import { Lightbulb, CheckCircle2 } from "lucide-react";
import { apiFetch, parseErrorMessage } from "@/api/client";

type Rec = {
  id: number;
  department_id: number;
  title: string;
  description: string;
  priority: string;
  status: string;
  created_at: string;
  model_version: string | null;
};

export default function Recommendations() {
  const [items, setItems] = useState<Rec[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const res = await apiFetch("/recommendations");
    if (!res.ok) {
      setErr(await parseErrorMessage(res));
      return;
    }
    setItems(await res.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markDone(id: number) {
    setBusyId(id);
    try {
      const res = await apiFetch(`/recommendations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Выполнено" }),
      });
      if (!res.ok) {
        setErr(await parseErrorMessage(res));
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center shadow-sm">
          <Lightbulb className="text-amber-600" size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Рекомендации</h1>
          <p className="text-gray-600 text-sm">Правила и ML; отметьте выполнение</p>
        </div>
      </div>
      {err && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          {err}
        </div>
      )}
      {!err && items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-gray-500">
          Нет рекомендаций. Загрузите опросы или запустите пересчёт на странице «Отчёты».
        </div>
      )}
      <div className="space-y-4">
        {items.map((r) => (
          <div
            key={r.id}
            className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:border-[#0052FF]/30 transition-colors"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-gray-900">{r.title}</div>
                <div className="text-sm text-gray-600 mt-2 leading-relaxed">{r.description}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    r.priority === "high"
                      ? "bg-red-100 text-red-700"
                      : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {r.priority}
                </span>
                <span className="text-xs text-gray-500">{r.status}</span>
                {r.status !== "Выполнено" && (
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void markDone(r.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCircle2 size={14} />
                    {busyId === r.id ? "…" : "Выполнено"}
                  </button>
                )}
              </div>
            </div>
            {r.model_version && (
              <p className="text-xs text-gray-400 mt-2">model: {r.model_version}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
