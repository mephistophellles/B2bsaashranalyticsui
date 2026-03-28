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

export default function Recommendations() {
  const [items, setItems] = useState<Rec[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/recommendations");
      if (res.ok) setItems(await res.json());
    })();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
          <Lightbulb className="text-amber-600" size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Рекомендации</h1>
          <p className="text-gray-600 text-sm">Сгенерированные правилами и ML</p>
        </div>
      </div>
      <div className="space-y-4">
        {items.map((r) => (
          <div
            key={r.id}
            className="bg-white border border-gray-200 rounded-xl p-5 hover:border-[#0052FF]/40 transition-colors"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-gray-900">{r.title}</div>
                <div className="text-sm text-gray-600 mt-2">{r.description}</div>
              </div>
              <div className="flex flex-col items-end gap-1 text-xs">
                <span
                  className={`px-2 py-0.5 rounded-full font-medium ${
                    r.priority === "high"
                      ? "bg-red-100 text-red-700"
                      : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {r.priority}
                </span>
                <span className="text-gray-500">{r.status}</span>
                {r.model_version && (
                  <span className="text-gray-400">model: {r.model_version}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
