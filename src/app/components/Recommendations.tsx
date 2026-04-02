import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Lightbulb, CheckCircle2, X } from "lucide-react";
import { apiFetch, parseErrorMessage } from "@/api/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type Rec = {
  id: number;
  department_id: number;
  title: string;
  description: string;
  priority: string;
  status: string;
  created_at: string;
  model_version: string | null;
  source?: string | null;
  rationale?: string | null;
  expected_effect?: string | null;
};

export default function Recommendations() {
  const { id: routeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [items, setItems] = useState<Rec[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setErr(null);
    const q = new URLSearchParams();
    if (statusFilter !== "all") q.set("status", statusFilter);
    if (priorityFilter !== "all") q.set("priority", priorityFilter);
    if (search.trim()) q.set("q", search.trim());
    const res = await apiFetch(`/recommendations${q.toString() ? `?${q}` : ""}`);
    if (!res.ok) {
      setErr(await parseErrorMessage(res));
      return;
    }
    setItems(await res.json());
  }, [statusFilter, priorityFilter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!routeId || items.length === 0) return;
    const found = items.some((x) => String(x.id) === routeId);
    if (!found) navigate("/recommendations", { replace: true });
  }, [routeId, items, navigate]);

  const selected = routeId ? items.find((x) => String(x.id) === routeId) : undefined;

  async function markDone(id: number, e: React.MouseEvent) {
    e.stopPropagation();
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
      if (routeId === String(id)) navigate("/recommendations", { replace: true });
    } finally {
      setBusyId(null);
    }
  }

  function closeDetail() {
    navigate("/recommendations");
  }

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-2xl border border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 text-sm text-amber-900">
        Подсказки к действиям: для каждой рекомендации показываем основание, ожидаемый эффект и источник (правила/ML).
      </div>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center shadow-sm">
          <Lightbulb className="text-amber-600" size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Рекомендации</h1>
          <p className="text-gray-600 text-sm">Правила и ML; отметьте выполнение. Карточку можно открыть целиком.</p>
          <p className="text-xs text-gray-500 mt-1">
            Сейчас используется гибридный подход: правила на актуальных данных + опциональное ML-обучение
            (LightGBM) после накопления достаточного объема наблюдений.
          </p>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-wrap gap-5 items-end">
        <label className="text-sm text-gray-600">
          Поиск
          <input
            className="mt-2 h-11 border rounded-xl px-3 w-72"
            placeholder="Название или текст"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="text-sm text-gray-600">
          Статус
          <Select
            value={statusFilter}
            onValueChange={setStatusFilter}
          >
            <SelectTrigger className="mt-2 h-11 min-w-48 rounded-xl border-gray-300 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="Новая">Новая</SelectItem>
              <SelectItem value="Выполнено">Выполнено</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="text-sm text-gray-600">
          Приоритет
          <Select
            value={priorityFilter}
            onValueChange={setPriorityFilter}
          >
            <SelectTrigger className="mt-2 h-11 min-w-48 rounded-xl border-gray-300 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="high">high</SelectItem>
              <SelectItem value="medium">medium</SelectItem>
              <SelectItem value="low">low</SelectItem>
            </SelectContent>
          </Select>
        </label>
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
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/recommendations/${r.id}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") navigate(`/recommendations/${r.id}`);
            }}
            className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:border-[#0052FF]/30 transition-colors text-left cursor-pointer"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-gray-900">{r.title}</div>
                <div className="text-sm text-gray-600 mt-2 leading-relaxed line-clamp-3">{r.description}</div>
                {r.rationale && (
                  <div className="mt-2 text-xs text-gray-600 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5">
                    Основание: {r.rationale}
                  </div>
                )}
                {r.expected_effect && (
                  <div className="mt-1 text-xs text-green-700 rounded-lg border border-green-100 bg-green-50 px-2.5 py-1.5">
                    Ожидаемый эффект: {r.expected_effect}
                  </div>
                )}
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
                    onClick={(e) => void markDone(r.id, e)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl bg-[#0052FF] text-white hover:bg-[#0047db] disabled:opacity-50"
                  >
                    <CheckCircle2 size={14} />
                    {busyId === r.id ? "…" : "Отметить выполненной"}
                  </button>
                )}
              </div>
            </div>
            {r.model_version && (
              <p className="text-xs text-gray-400 mt-2">
                model: {r.model_version}
                {r.source ? ` · источник: ${r.source}` : ""}
              </p>
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
            aria-labelledby="rec-detail-title"
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between gap-4 items-start mb-4">
              <h2 id="rec-detail-title" className="text-lg font-semibold text-gray-900 pr-8">
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
            {selected.rationale && (
              <p className="text-xs text-gray-600 mt-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                Основание: {selected.rationale}
              </p>
            )}
            {selected.expected_effect && (
              <p className="text-xs text-green-700 mt-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                Ожидаемый эффект: {selected.expected_effect}
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-4 text-xs text-gray-500">
              <span>Статус: {selected.status}</span>
              <span>Приоритет: {selected.priority}</span>
              {selected.source && <span>Источник: {selected.source}</span>}
              {selected.model_version && <span>Версия: {selected.model_version}</span>}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={closeDetail}
                className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Закрыть
              </button>
              {selected.status !== "Выполнено" && (
                <button
                  type="button"
                  disabled={busyId === selected.id}
                  onClick={(e) => void markDone(selected.id, e)}
                  className="px-4 py-2 rounded-xl bg-[#0052FF] text-white text-sm font-medium hover:bg-[#0047db] disabled:opacity-50"
                >
                  {busyId === selected.id ? "…" : "Отметить выполненной"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
