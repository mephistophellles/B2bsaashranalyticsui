import { useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";
import { apiFetch } from "@/api/client";

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

export default function MyRecommendations() {
  const [items, setItems] = useState<Rec[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/me/recommendations");
      if (!res.ok) {
        setErr("Не удалось загрузить рекомендации");
        return;
      }
      setItems(await res.json());
    })();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center shadow-sm">
          <Lightbulb className="text-amber-600" size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Мои рекомендации</h1>
          <p className="text-gray-600 text-sm">Советы для вашего отдела (только просмотр)</p>
        </div>
      </div>
      {err && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          {err}
        </div>
      )}
      {!err && items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-gray-500">
          Пока нет рекомендаций для вашего отдела.
        </div>
      )}
      <div className="space-y-4">
        {items.map((r) => (
          <div
            key={r.id}
            className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:border-[#0052FF]/30 transition-colors"
          >
            <div className="font-semibold text-gray-900">{r.title}</div>
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">{r.description}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  r.priority === "high"
                    ? "bg-red-100 text-red-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {r.priority}
              </span>
              <span className="text-xs text-gray-500 px-2.5 py-1 rounded-full bg-gray-100">
                {r.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
