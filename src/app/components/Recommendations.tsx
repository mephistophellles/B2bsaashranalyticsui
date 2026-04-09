import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Lightbulb, CheckCircle2, X, Target, ListChecks, CalendarClock, TrendingUp } from "lucide-react";
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
  problem?: string | null;
  cause?: string | null;
  action?: string | null;
  feedback_count?: number;
  last_feedback_result?: string | null;
};

function problemOneLine(r: Rec): string {
  const p = r.problem?.trim();
  if (p) return p.split(/\n/)[0].trim().slice(0, 280);
  const c = r.cause?.trim();
  if (c) return c.split(/\n/)[0].trim().slice(0, 280);
  const first = r.description.split(/\n/)[0]?.trim();
  if (first && first.length <= 280) return first;
  return r.title;
}

function splitActionSteps(text: string): string[] {
  const t = text.replace(/\r/g, "\n").replace(/Рекомендации:\s*/gi, "").trim();
  if (!t) return [];
  const byBullet = t.split(/[•\u2022]/).map((s) => s.trim()).filter(Boolean);
  if (byBullet.length > 1) return byBullet;
  const byNl = t.split(/\n/).map((s) => s.trim()).filter(Boolean);
  if (byNl.length > 1) return byNl;
  const bySemi = t.split(/;/).map((s) => s.trim()).filter(Boolean);
  if (bySemi.length > 1) return bySemi;
  if (t.length > 100) {
    const sentences = t.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 20);
    if (sentences.length >= 2) return sentences.map((s) => s.trim());
  }
  return [t];
}

const FALLBACK_ACTIONS = [
  "Назначить ответственного и дату контрольной проверки.",
  "Согласовать меры с руководителем подразделения.",
  "Зафиксировать договорённости в задаче или протоколе.",
];

function sentencesFromDescription(desc: string): string[] {
  return desc
    .replace(/\r/g, "\n")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 420)
    .slice(0, 4);
}

function buildActionSteps(r: Rec): string[] {
  let steps = r.action ? splitActionSteps(r.action) : [];
  if (steps.length < 3) {
    for (const s of sentencesFromDescription(r.description)) {
      if (!steps.some((x) => x.slice(0, 40) === s.slice(0, 40))) steps.push(s);
      if (steps.length >= 4) break;
    }
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of steps) {
    const key = s.slice(0, 100);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 4) break;
  }
  let i = 0;
  while (out.length < 3 && i < FALLBACK_ACTIONS.length) {
    const f = FALLBACK_ACTIONS[i];
    i += 1;
    if (!seen.has(f)) {
      seen.add(f);
      out.push(f);
    }
  }
  return out.slice(0, 4);
}

function deadlineByPriority(priority: string): string {
  switch (priority) {
    case "high":
      return "Первые шаги — в течение 5–7 рабочих дней; контрольный разбор — через 2 недели.";
    case "medium":
      return "Старт — в течение 2 недель; промежуточный итог — через 4 недели.";
    case "low":
      return "Планирование — в пределах месяца; оценка эффекта — по следующему циклу диагностики.";
    default:
      return "Срок согласуйте с календарём отдела; ориентир — 2–4 недели на первый этап.";
  }
}

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
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center shadow-sm">
          <Lightbulb className="text-amber-600" size={26} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Рекомендации</h1>
          <p className="text-sm text-gray-600">Управленческие меры на основе диагностики ESSI</p>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-wrap gap-5 items-end">
        <label className="text-sm text-gray-600 flex flex-col gap-1">
          Поиск
          <input
            className="h-11 border rounded-xl px-3 w-72"
            placeholder="Название или текст"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="text-sm text-gray-600 flex flex-col gap-1">
          Статус
          <Select
            value={statusFilter}
            onValueChange={setStatusFilter}
          >
            <SelectTrigger className="h-11 min-w-48 rounded-xl border-gray-300 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="Новая">Новая</SelectItem>
              <SelectItem value="Выполнено">Выполнено</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="text-sm text-gray-600 flex flex-col gap-1">
          Приоритет
          <Select
            value={priorityFilter}
            onValueChange={setPriorityFilter}
          >
            <SelectTrigger className="h-11 min-w-48 rounded-xl border-gray-300 bg-white">
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
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-3">
                <div className="font-semibold text-gray-900 text-base leading-snug">{r.title}</div>

                <div className="rounded-xl border-l-4 border-amber-400 bg-amber-50/80 pl-3 pr-2 py-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900/85 mb-1">
                    <Target size={12} className="shrink-0" aria-hidden />
                    Проблема
                  </div>
                  <p className="text-sm text-gray-900 leading-snug line-clamp-2">{problemOneLine(r)}</p>
                </div>

                <div>
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                    <ListChecks size={12} className="shrink-0 text-gray-400" aria-hidden />
                    Действия
                  </div>
                  <ol className="space-y-1.5 list-none m-0 p-0">
                    {buildActionSteps(r).map((step, idx) => (
                      <li key={idx} className="flex gap-2 text-sm text-gray-800 leading-snug">
                        <span
                          className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-[#0052FF]/12 text-[10px] font-bold text-[#0052FF]"
                          aria-hidden
                        >
                          {idx + 1}
                        </span>
                        <span className="line-clamp-2 min-w-0">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900/90 mb-0.5">
                    <TrendingUp size={12} className="shrink-0" aria-hidden />
                    Эффект
                  </div>
                  <p className="text-xs text-emerald-950 leading-relaxed line-clamp-2">
                    {r.expected_effect?.trim() ||
                      "Снижение скрытых потерь и рост устойчивости при закреплении мер."}
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    r.priority === "high"
                      ? "bg-red-100 text-red-700"
                      : r.priority === "low"
                        ? "bg-gray-100 text-gray-700"
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
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between gap-4 items-start mb-6">
              <h2 id="rec-detail-title" className="text-xl font-bold text-gray-900 pr-8 leading-snug">
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

            <div className="space-y-5">
              <section className="rounded-xl border-l-4 border-amber-400 bg-amber-50/80 pl-4 pr-3 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-900/90 mb-1.5">
                  <Target size={14} className="shrink-0" />
                  Проблема
                </div>
                <p className="text-sm font-medium text-gray-900 leading-snug">{problemOneLine(selected)}</p>
              </section>

              <section>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">
                  <ListChecks size={14} className="shrink-0" />
                  Действия (3–4 шага)
                </div>
                <ol className="space-y-3 list-none m-0 p-0">
                  {buildActionSteps(selected).map((step, idx) => (
                    <li key={idx} className="flex gap-3 text-sm text-gray-800 leading-relaxed">
                      <span
                        className="flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded-full bg-[#0052FF]/12 text-xs font-bold text-[#0052FF]"
                        aria-hidden
                      >
                        {idx + 1}
                      </span>
                      <span className="pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
              </section>

              <section className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-700 mb-1.5">
                  <CalendarClock size={14} className="shrink-0" />
                  Сроки
                </div>
                <p className="text-sm text-slate-800 leading-relaxed">{deadlineByPriority(selected.priority)}</p>
                <p className="text-xs text-slate-500 mt-2">
                  Ориентир по приоритету ({selected.priority}). Уточните даты под ваш календарь.
                </p>
              </section>

              <section className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-900 mb-1.5">
                  <TrendingUp size={14} className="shrink-0" />
                  Ожидаемый эффект
                </div>
                <p className="text-sm text-emerald-950 leading-relaxed">
                  {selected.expected_effect?.trim() ||
                    "Снижение скрытых потерь и рост устойчивости команды при закреплении мер; измеряйте по следующему циклу ESSI."}
                </p>
              </section>

              <details className="group rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3 text-sm">
                <summary className="cursor-pointer font-medium text-gray-800 list-none flex items-center gap-2">
                  <span className="text-gray-500 group-open:rotate-90 transition-transform">▸</span>
                  Контекст и основание
                </summary>
                <div className="mt-3 space-y-3 text-gray-700 leading-relaxed">
                  <p className="whitespace-pre-wrap">{selected.description}</p>
                  {selected.rationale && (
                    <p className="text-xs text-gray-600 border-t border-gray-200 pt-3">
                      <span className="font-semibold text-gray-700">Основание: </span>
                      {selected.rationale}
                    </p>
                  )}
                  {selected.cause && selected.cause !== selected.problem && (
                    <p className="text-xs text-gray-600">
                      <span className="font-semibold text-gray-700">Причина (развёрнуто): </span>
                      {selected.cause}
                    </p>
                  )}
                </div>
              </details>
            </div>

            <div className="mt-8 flex flex-wrap gap-3 pt-2 border-t border-gray-100">
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
