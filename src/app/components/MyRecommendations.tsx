import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Lightbulb, X } from "lucide-react";
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

export default function MyRecommendations() {
  const { id: routeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [items, setItems] = useState<Rec[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [listReady, setListReady] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    setListReady(false);
    const res = await apiFetch("/me/recommendations");
    if (!res.ok) {
      const msg = await parseErrorMessage(res);
      setErr(
        res.status === 403
          ? "Нет доступа к рекомендациям для этой учётной записи."
          : msg || "Не удалось загрузить рекомендации",
      );
      setItems([]);
      setListReady(true);
      return;
    }
    setItems(await res.json());
    setListReady(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!routeId || !listReady || err) return;
    if (!items.some((x) => String(x.id) === routeId)) {
      navigate("/my-recommendations", { replace: true });
    }
  }, [routeId, listReady, err, items, navigate]);

  const selected = routeId ? items.find((x) => String(x.id) === routeId) : undefined;

  function closeDetail() {
    navigate("/my-recommendations");
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center shadow-sm">
          <Lightbulb className="text-amber-600" size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Мои рекомендации</h1>
          <p className="text-gray-600 text-sm">Советы для вашего отдела. Нажмите карточку, чтобы прочитать целиком.</p>
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
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/my-recommendations/${r.id}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") navigate(`/my-recommendations/${r.id}`);
            }}
            className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:border-[#0052FF]/30 transition-colors text-left cursor-pointer"
          >
            <div className="font-semibold text-gray-900">{r.title}</div>
            <div className="text-sm text-gray-600 mt-2 leading-relaxed line-clamp-3">{r.description}</div>
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
            {r.model_version && (
              <p className="text-xs text-gray-400 mt-2">model: {r.model_version}</p>
            )}
          </div>
        ))}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="presentation"
          onClick={closeDetail}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="my-rec-detail-title"
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between gap-4 items-start mb-4">
              <h2 id="my-rec-detail-title" className="text-lg font-semibold text-gray-900 pr-8">
                {selected.title}
              </h2>
              <button
                type="button"
                onClick={closeDetail}
                className="shrink-0 p-2 rounded-xl text-gray-500 hover:bg-gray-100"
                aria-label="Закрыть"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{selected.description}</p>
            <div className="flex flex-wrap gap-2 mt-4 text-xs text-gray-500">
              <span>Статус: {selected.status}</span>
              <span>Приоритет: {selected.priority}</span>
              {selected.model_version && <span>Версия: {selected.model_version}</span>}
            </div>
            <div className="mt-6">
              <button
                type="button"
                onClick={closeDetail}
                className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
