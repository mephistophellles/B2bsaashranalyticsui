import { useEffect, useState } from "react";
import { FileText, Upload, Calculator, RefreshCw } from "lucide-react";
import {
  apiFetch,
  downloadWithAuth,
  parseErrorMessage,
  sleep,
} from "@/api/client";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type JobRow = { id: number; status: string; detail: string | null };
type ExportRow = {
  id: number;
  kind?: string;
  status: string;
  download_url: string | null;
  detail: string | null;
  created_at?: string;
};
type JobPage = { items: JobRow[] };
type ExportPage = { items: ExportRow[] };
type ManagementEvent = {
  id: number;
  event_date: string;
  event_type: string;
  title: string;
  description: string | null;
  level: "organization" | "department";
  department_id: number | null;
};
type ExplainReason = {
  code: string;
  label: string;
  detail: string;
  weight: number;
  source_type: string;
};
type DecisionPayload = {
  generated_at: string;
  months: number;
  overview: {
    essi_index: number;
    essi_delta_pct: number;
    engagement_pct: number;
    productivity_pct: number;
    risk_level: string;
    risk_at_risk_total: number;
    risk_indexed_employees: number;
    summary: string[];
  };
  dynamics: {
    months: number;
    essi_series: { id: string; month: string; value: number }[];
    latest_value: number;
    previous_value: number;
    delta_pct: number;
  };
  strengths: {
    block_index: number;
    title: string;
    value: number;
    note: string;
    what_it_means: string;
    reason_text: string;
    actions: string;
  }[];
  risk_zones: {
    id: string;
    name: string;
    department: string;
    essi: number;
    status: string;
    what_it_means: string;
    reason_text: string;
    actions: string;
  }[];
  causes: {
    title: string;
    source: string;
    reasons: ExplainReason[];
    what_it_means: string;
    reason_text: string;
    actions: string;
  }[];
  recommendations: {
    id: number;
    title: string;
    description: string;
    priority: string;
    status: string;
    source?: string | null;
    expected_effect?: string | null;
    structured_reasons: ExplainReason[];
    what_it_means: string;
    reason_text: string;
    actions: string;
  }[];
  economic_effect: {
    essi_score: number;
    fot: number | null;
    k: number | null;
    c_replace: number | null;
    departed_count: number | null;
    loss_efficiency: number | null;
    loss_turnover: number | null;
    loss_total: number | null;
    behavioral_effects: {
      code: string;
      label: string;
      intensity: number;
      what_it_means: string;
    }[];
    business_impacts: {
      metric: string;
      value: number;
      driver: string;
    }[];
    scenario: {
      current: { loss_efficiency: number; loss_turnover: number; loss_total: number };
      improved: { loss_efficiency: number; loss_turnover: number; loss_total: number };
      savings_potential: number;
    } | null;
    assumptions: string[];
  };
};

async function pollJob(jobId: number): Promise<JobRow> {
  for (let i = 0; i < 120; i++) {
    const res = await apiFetch(`/jobs/${jobId}`);
    if (!res.ok) throw new Error(await parseErrorMessage(res));
    const j = (await res.json()) as JobRow;
    if (j.status === "success" || j.status === "failed") return j;
    await sleep(600);
  }
  throw new Error("Таймаут ожидания импорта");
}

async function pollExport(reportId: number): Promise<ExportRow> {
  for (let i = 0; i < 120; i++) {
    const res = await apiFetch(`/reports/exports/${reportId}`);
    if (!res.ok) throw new Error(await parseErrorMessage(res));
    const j = (await res.json()) as ExportRow;
    if (j.status === "success" || j.status === "failed") return j;
    await sleep(600);
  }
  throw new Error("Таймаут ожидания отчёта");
}

export default function Reports() {
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [reportStatus, setReportStatus] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [readyReportId, setReadyReportId] = useState<number | null>(null);
  const [readyReportExt, setReadyReportExt] = useState<"pdf" | "xlsx">("pdf");
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState<string | null>(null);
  const [econ, setEcon] = useState({
    fot: 10_000_000,
    k: 0.001,
    c_replace: 500_000,
    essi_score: 82,
    departed_count: 2,
  });
  const [econResult, setEconResult] = useState<{
    loss_efficiency: number;
    loss_turnover: number;
    loss_total: number;
  } | null>(null);
  const [econErr, setEconErr] = useState<string | null>(null);
  const [econDraftBusy, setEconDraftBusy] = useState(false);
  const [econDraftMsg, setEconDraftMsg] = useState<string | null>(null);
  const [jobHistory, setJobHistory] = useState<JobRow[]>([]);
  const [exportHistory, setExportHistory] = useState<ExportRow[]>([]);
  const [events, setEvents] = useState<ManagementEvent[]>([]);
  const [decision, setDecision] = useState<DecisionPayload | null>(null);
  const [decisionMonths, setDecisionMonths] = useState(6);
  const [decisionErr, setDecisionErr] = useState<string | null>(null);
  const [explainDictVersion, setExplainDictVersion] = useState<string | null>(null);
  const [eventBusy, setEventBusy] = useState(false);
  const [eventForm, setEventForm] = useState({
    event_date: new Date().toISOString().slice(0, 10),
    event_type: "training",
    title: "",
    description: "",
    level: "organization" as "organization" | "department",
    department_id: "",
  });

  async function loadHistory() {
    const [jobsRes, exportsRes] = await Promise.all([
      apiFetch("/jobs?kind=survey_import&limit=10&offset=0"),
      apiFetch("/reports/exports?limit=10&offset=0"),
    ]);
    if (jobsRes.ok) {
      const j = (await jobsRes.json()) as JobPage;
      setJobHistory(j.items ?? []);
    }
    if (exportsRes.ok) {
      const e = (await exportsRes.json()) as ExportPage;
      setExportHistory(e.items ?? []);
    }
    const eventsRes = await apiFetch("/reports/events?months=12");
    if (eventsRes.ok) {
      const rows = (await eventsRes.json()) as ManagementEvent[];
      setEvents(rows);
    }
  }

  async function loadDecision(months = decisionMonths) {
    setDecisionErr(null);
    const [res, dictRes] = await Promise.all([
      apiFetch(`/reports/decision?months=${months}`),
      apiFetch("/reports/explainability-dictionary"),
    ]);
    if (!res.ok) {
      setDecisionErr(await parseErrorMessage(res));
      setDecision(null);
      return;
    }
    setDecision((await res.json()) as DecisionPayload);
    if (dictRes.ok) {
      const dict = (await dictRes.json()) as { version?: string };
      setExplainDictVersion(dict.version ?? null);
    }
  }

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/economy/defaults");
      if (!res.ok) return;
      const j = await res.json();
      setEcon((e) => ({
        ...e,
        essi_score: typeof j.suggested_essi === "number" ? j.suggested_essi : e.essi_score,
        fot: typeof j.draft_fot === "number" ? j.draft_fot : e.fot,
        k: typeof j.draft_k === "number" ? j.draft_k : e.k,
        c_replace: typeof j.draft_c_replace === "number" ? j.draft_c_replace : e.c_replace,
        departed_count:
          typeof j.draft_departed_count === "number" ? j.draft_departed_count : e.departed_count,
      }));
    })();
    void loadDecision();
    void loadHistory();
  }, []);

  useEffect(() => {
    void loadDecision(decisionMonths);
  }, [decisionMonths]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setImportBusy(true);
    setImportStatus(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await apiFetch("/surveys/upload", {
        method: "POST",
        body: fd,
      });
      if (res.status !== 202) {
        setImportStatus(await parseErrorMessage(res));
        return;
      }
      const j = (await res.json()) as { id: number };
      setImportStatus(`Импорт #${j.id}…`);
      const done = await pollJob(j.id);
      if (done.status === "failed") {
        setImportStatus(`Ошибка импорта: ${done.detail ?? "неизвестно"}`);
      } else {
        setImportStatus(`Готово: ${done.detail ?? "импорт завершён"}`);
      }
      await loadHistory();
    } catch (err) {
      setImportStatus(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setImportBusy(false);
    }
  }

  async function generateReport(kind: "decision_pdf" | "decision_excel") {
    setReportBusy(true);
    setReportStatus(null);
    setReadyReportId(null);
    try {
      const res = await apiFetch("/reports", {
        method: "POST",
        body: JSON.stringify({ kind }),
      });
      if (res.status !== 202) {
        setReportStatus(await parseErrorMessage(res));
        return;
      }
      const j = (await res.json()) as { id: number };
      setReportStatus(`Отчёт #${j.id} формируется…`);
      const done = await pollExport(j.id);
      if (done.status === "failed") {
        setReportStatus(`Ошибка: ${done.detail ?? "сбой"}`);
        return;
      }
      setReadyReportId(j.id);
      setReadyReportExt(kind === "decision_excel" ? "xlsx" : "pdf");
      setReportStatus("Готово к скачиванию");
      await loadHistory();
    } catch (err) {
      setReportStatus(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setReportBusy(false);
    }
  }

  async function downloadReady() {
    if (readyReportId == null) return;
    const ext = readyReportExt;
    const name = `report_${readyReportId}.${ext}`;
    try {
      await downloadWithAuth(`/reports/${readyReportId}/download`, name);
    } catch {
      setReportStatus("Не удалось скачать (файл ещё не готов?)");
    }
  }

  async function retryExport(reportId: number) {
    setReportBusy(true);
    setReportStatus(`Повторный запуск отчёта #${reportId}…`);
    try {
      const res = await apiFetch(`/reports/${reportId}/retry`, { method: "POST" });
      if (res.status !== 202) {
        setReportStatus(await parseErrorMessage(res));
        return;
      }
      const j = (await res.json()) as { id: number; kind: string };
      const done = await pollExport(j.id);
      if (done.status === "failed") {
        setReportStatus(`Ошибка: ${done.detail ?? "сбой"}`);
      } else {
        setReadyReportId(j.id);
        setReadyReportExt((j.kind === "decision_excel" || j.kind === "summary_excel" || j.kind === "excel") ? "xlsx" : "pdf");
        setReportStatus("Готово к скачиванию");
      }
      await loadHistory();
    } catch (err) {
      setReportStatus(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setReportBusy(false);
    }
  }

  async function recalculate() {
    setRecalcBusy(true);
    setRecalcMsg(null);
    try {
      const res = await apiFetch("/indices/recalculate", { method: "POST" });
      if (!res.ok) {
        setRecalcMsg(await parseErrorMessage(res));
        return;
      }
      setRecalcMsg("Пересчёт поставлен в очередь. Обновите дашборд через несколько секунд.");
    } catch {
      setRecalcMsg("Ошибка запроса");
    } finally {
      setRecalcBusy(false);
    }
  }

  async function calcEconomy() {
    setEconErr(null);
    const res = await apiFetch("/economy/calculate", {
      method: "POST",
      body: JSON.stringify(econ),
    });
    if (res.ok) {
      setEconResult(await res.json());
      return;
    }
    setEconErr(await parseErrorMessage(res));
  }

  async function saveEconomyDrafts() {
    setEconDraftBusy(true);
    setEconDraftMsg(null);
    try {
      const res = await apiFetch("/economy/drafts", {
        method: "PATCH",
        body: JSON.stringify({
          default_fot: econ.fot,
          default_k: econ.k,
          default_c_replace: econ.c_replace,
          default_departed_count: econ.departed_count,
        }),
      });
      if (!res.ok) {
        setEconDraftMsg(await parseErrorMessage(res));
        return;
      }
      setEconDraftMsg("Черновики сохранены");
    } finally {
      setEconDraftBusy(false);
    }
  }

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();
    setEventBusy(true);
    try {
      const body: Record<string, unknown> = {
        event_date: eventForm.event_date,
        event_type: eventForm.event_type,
        title: eventForm.title,
        description: eventForm.description || null,
        level: eventForm.level,
      };
      if (eventForm.level === "department" && eventForm.department_id) {
        body.department_id = Number(eventForm.department_id);
      }
      const res = await apiFetch("/reports/events", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setReportStatus(await parseErrorMessage(res));
        return;
      }
      setEventForm((s) => ({ ...s, title: "", description: "", department_id: "" }));
      await loadHistory();
    } finally {
      setEventBusy(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 text-sm text-blue-900">
        Центр данных: импорт опросов, пересчёт индексов, отчёты и управленческие события.
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Отчеты и данные</h1>
          <div className="hidden sm:flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2">
            <FileText className="text-[#0052FF]" size={16} />
            <span className="text-xs font-medium text-blue-900">Управленческая отчетность</span>
          </div>
        </div>
        <p className="text-gray-600">Импорт CSV/XLSX, PDF/Excel, пересчёт индексов, экономика и ML-контур</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Decision-report</h2>
          <label className="text-sm text-gray-600 flex items-center gap-2">
            Период
            <select
              className="border rounded-xl px-2 py-1.5 bg-white"
              value={decisionMonths}
              onChange={(e) => setDecisionMonths(Number(e.target.value))}
            >
              {[3, 6, 12, 24].map((m) => (
                <option key={m} value={m}>{m} мес.</option>
              ))}
            </select>
          </label>
        </div>
        {explainDictVersion && (
          <p className="text-xs text-blue-700">
            Explainability-контур: единый словарь интерпретаций версии {explainDictVersion}.
          </p>
        )}
        {decisionErr && <p className="text-sm text-red-600">{decisionErr}</p>}
        {!decisionErr && !decision && <p className="text-sm text-gray-500">Загрузка decision-report…</p>}
        {decision && (
          <div className="space-y-6">
            <section className="rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-2">1) Общая ситуация</h3>
              <div className="grid md:grid-cols-4 gap-3 text-sm">
                <div className="rounded-lg border border-gray-200 px-3 py-2">ESSI: <span className="font-semibold">{decision.overview.essi_index}</span></div>
                <div className="rounded-lg border border-gray-200 px-3 py-2">Дельта: <span className="font-semibold">{decision.overview.essi_delta_pct}%</span></div>
                <div className="rounded-lg border border-gray-200 px-3 py-2">Риск: <span className="font-semibold">{decision.overview.risk_level}</span></div>
                <div className="rounded-lg border border-gray-200 px-3 py-2">В зоне риска: <span className="font-semibold">{decision.overview.risk_at_risk_total}</span></div>
              </div>
              <ul className="mt-3 space-y-1 text-sm text-gray-700">
                {decision.overview.summary.map((s) => <li key={s}>- {s}</li>)}
              </ul>
            </section>

            <section className="rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-2">2) Динамика</h3>
              <p className="text-sm text-gray-700 mb-2">
                Период: {decision.dynamics.months} мес. · Текущее: {decision.dynamics.latest_value} · Предыдущее: {decision.dynamics.previous_value} · Дельта: {decision.dynamics.delta_pct}%
              </p>
              <div className="grid md:grid-cols-6 gap-2">
                {decision.dynamics.essi_series.map((p) => (
                  <div key={p.id} className="rounded-lg border border-gray-200 px-2 py-2 text-xs text-gray-700">
                    <div className="font-medium">{p.month}</div>
                    <div>{p.value}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-2">3) Сильные стороны</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-3 py-2">Блок</th>
                      <th className="text-left px-3 py-2">Значение</th>
                      <th className="text-left px-3 py-2">Что означает</th>
                      <th className="text-left px-3 py-2">Причина</th>
                      <th className="text-left px-3 py-2">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decision.strengths.map((s) => (
                      <tr key={`${s.block_index}-${s.title}`} className="border-b border-gray-100 align-top">
                        <td className="px-3 py-2 font-medium">{s.title}</td>
                        <td className="px-3 py-2">{s.value}</td>
                        <td className="px-3 py-2 whitespace-normal break-words">{s.what_it_means}</td>
                        <td className="px-3 py-2 whitespace-normal break-words">{s.reason_text}</td>
                        <td className="px-3 py-2 whitespace-normal break-words">{s.actions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-2">4) Зоны риска</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-3 py-2">Сотрудник</th>
                      <th className="text-left px-3 py-2">Отдел</th>
                      <th className="text-left px-3 py-2">ESSI</th>
                      <th className="text-left px-3 py-2">Статус</th>
                      <th className="text-left px-3 py-2">Что означает</th>
                      <th className="text-left px-3 py-2">Причина</th>
                      <th className="text-left px-3 py-2">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decision.risk_zones.map((r) => (
                      <tr key={r.id} className="border-b border-gray-100 align-top">
                        <td className="px-3 py-2 font-medium">{r.name}</td>
                        <td className="px-3 py-2">{r.department}</td>
                        <td className="px-3 py-2">{r.essi}</td>
                        <td className="px-3 py-2">{r.status}</td>
                        <td className="px-3 py-2 whitespace-normal break-words">{r.what_it_means}</td>
                        <td className="px-3 py-2 whitespace-normal break-words">{r.reason_text}</td>
                        <td className="px-3 py-2 whitespace-normal break-words">{r.actions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-2">5) Причины</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-3 py-2">Кейс</th>
                      <th className="text-left px-3 py-2">Источник</th>
                      <th className="text-left px-3 py-2">Фактор</th>
                      <th className="text-left px-3 py-2">Что означает</th>
                      <th className="text-left px-3 py-2">Причина</th>
                      <th className="text-left px-3 py-2">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decision.causes.map((c) => (
                      <tr key={c.title} className="border-b border-gray-100 align-top">
                        <td className="px-3 py-2 font-medium">{c.title}</td>
                        <td className="px-3 py-2">{c.source}</td>
                        <td className="px-3 py-2 whitespace-normal break-words">
                          {c.reasons.slice(0, 2).map((reason) => reason.label).join("; ") || "—"}
                        </td>
                        <td className="px-3 py-2 whitespace-normal break-words">{c.what_it_means}</td>
                        <td className="px-3 py-2 whitespace-normal break-words">{c.reason_text}</td>
                        <td className="px-3 py-2 whitespace-normal break-words">{c.actions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-2">6) Рекомендации</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-3 py-2">Рекомендация</th>
                      <th className="text-left px-3 py-2">Приоритет</th>
                      <th className="text-left px-3 py-2">Статус</th>
                      <th className="text-left px-3 py-2">Что означает</th>
                      <th className="text-left px-3 py-2">Причина</th>
                      <th className="text-left px-3 py-2">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decision.recommendations.map((r) => (
                      <tr key={r.id} className="border-b border-gray-100 align-top">
                        <td className="px-3 py-2">
                          <div className="font-medium">{r.title}</div>
                          {r.expected_effect && <div className="text-xs text-green-700 mt-1">Эффект: {r.expected_effect}</div>}
                        </td>
                        <td className="px-3 py-2">{r.priority}</td>
                        <td className="px-3 py-2">{r.status}</td>
                        <td className="px-3 py-2 whitespace-normal break-words">{r.what_it_means}</td>
                        <td className="px-3 py-2 whitespace-normal break-words">{r.reason_text}</td>
                        <td className="px-3 py-2 whitespace-normal break-words">{r.actions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-2">7) Экономический эффект</h3>
              <div className="text-sm text-gray-700 space-y-1">
                <div>ESSI: {decision.economic_effect.essi_score}</div>
                <div>Потери эффективности: {decision.economic_effect.loss_efficiency ?? "—"}</div>
                <div>Потери текучести: {decision.economic_effect.loss_turnover ?? "—"}</div>
                <div className="font-semibold">Итого: {decision.economic_effect.loss_total ?? "—"}</div>
              </div>
              {decision.economic_effect.behavioral_effects?.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[600px] text-sm border border-gray-200 rounded-xl overflow-hidden">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Поведенческий эффект</th>
                        <th className="px-3 py-2 text-left font-medium">Интенсивность</th>
                        <th className="px-3 py-2 text-left font-medium">Что означает</th>
                      </tr>
                    </thead>
                    <tbody>
                      {decision.economic_effect.behavioral_effects.map((item) => (
                        <tr key={item.code} className="border-t border-gray-100">
                          <td className="px-3 py-2">{item.label}</td>
                          <td className="px-3 py-2">{item.intensity}</td>
                          <td className="px-3 py-2 whitespace-normal break-words">{item.what_it_means}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {decision.economic_effect.business_impacts?.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[600px] text-sm border border-gray-200 rounded-xl overflow-hidden">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Метрика бизнеса</th>
                        <th className="px-3 py-2 text-left font-medium">Влияние</th>
                        <th className="px-3 py-2 text-left font-medium">Драйвер</th>
                      </tr>
                    </thead>
                    <tbody>
                      {decision.economic_effect.business_impacts.map((item) => (
                        <tr key={`${item.metric}-${item.driver}`} className="border-t border-gray-100">
                          <td className="px-3 py-2">{item.metric}</td>
                          <td className="px-3 py-2">{item.value}</td>
                          <td className="px-3 py-2 whitespace-normal break-words">{item.driver}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {decision.economic_effect.scenario && (
                <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                  Сценарий current vs improved: текущие потери {decision.economic_effect.scenario.current.loss_total},
                  при улучшении {decision.economic_effect.scenario.improved.loss_total}, потенциал экономии{" "}
                  {decision.economic_effect.scenario.savings_potential}.
                </div>
              )}
              <ul className="mt-2 space-y-1 text-xs text-gray-600">
                {decision.economic_effect.assumptions.map((a) => <li key={a}>- {a}</li>)}
              </ul>
            </section>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        Операции: импорт, пересчёт, экспорт, события и история запусков.
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3 shadow-sm">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <RefreshCw size={20} /> Пересчёт индексов ESSI
        </h2>
        <p className="text-sm text-gray-600">
          Пересчитать индексы по последним опросам и обновить рекомендации (фоновая задача).
        </p>
        <button
          type="button"
          disabled={recalcBusy}
          onClick={() => void recalculate()}
          className="px-4 py-2 rounded-xl border border-gray-300 font-medium disabled:opacity-50 hover:bg-gray-50"
        >
          {recalcBusy ? "Запрос…" : "Пересчитать"}
        </button>
        {recalcMsg && (
          <p className="text-sm text-gray-700">{recalcMsg}</p>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] gap-4 items-start">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 shadow-sm">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Upload size={20} /> Загрузка опросов
          </h2>
          <p className="text-sm text-gray-600">
            Колонки: employee_id, survey_date, score_block1..score_block5. Каждый score_blockX — сумма по 5 вопросам блока, диапазон 5..25.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              id="survey-import-file"
              type="file"
              accept=".csv,.xlsx,.xls"
              disabled={importBusy}
              onChange={(e) => void onUpload(e)}
              className="sr-only"
            />
            <label
              htmlFor="survey-import-file"
              className={`inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] shadow-lg shadow-[#0052FF]/25 ring-2 ring-[#0052FF]/20 cursor-pointer hover:opacity-95 hover:ring-[#0052FF]/40 transition-all select-none ${
                importBusy ? "opacity-50 pointer-events-none cursor-not-allowed" : ""
              }`}
            >
              <Upload size={22} strokeWidth={2.25} aria-hidden />
              {importBusy ? "Обработка файла…" : "Выберите файл"}
            </label>
            <span className="text-sm text-gray-500">
              Форматы: CSV, XLSX, XLS. Используйте шаблон импорта и проверьте диапазон score_blockX: 5..25.
            </span>
          </div>
          {importStatus && (
            <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
              {importBusy ? "Обработка… " : ""}
              {importStatus}
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2 shadow-sm w-full xl:max-w-sm">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <FileText size={18} /> Экспорт отчётов
          </h2>
          <p className="text-xs text-gray-500 leading-snug">Decision-report: PDF или Excel, затем скачивание.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={reportBusy}
              onClick={() => void generateReport("decision_pdf")}
              className="px-3 py-1.5 text-sm rounded-lg text-white font-medium bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] disabled:opacity-50"
            >
              PDF
            </button>
            <button
              type="button"
              disabled={reportBusy}
              onClick={() => void generateReport("decision_excel")}
              className="px-3 py-1.5 text-sm rounded-lg border border-[#0052FF] text-[#0052FF] font-medium disabled:opacity-50 hover:bg-blue-50"
            >
              Excel
            </button>
            {readyReportId != null && (
              <button
                type="button"
                onClick={() => void downloadReady()}
                className="px-3 py-1.5 text-sm rounded-lg bg-green-600 text-white font-medium"
              >
                Скачать .{readyReportExt}
              </button>
            )}
            <button
              type="button"
              onClick={() => void downloadWithAuth("/reports/demo-template", "survey_import_template.xlsx")}
              className="px-3 py-1.5 text-sm rounded-lg border border-emerald-600 text-emerald-700 font-medium hover:bg-emerald-50"
            >
              Шаблон импорта Excel
            </button>
          </div>
          {reportStatus && (
            <p className="text-xs text-gray-700">{reportBusy ? "Подождите… " : ""}{reportStatus}</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 shadow-sm">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Calculator size={20} /> Экономический эффект
        </h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          Значение ESSI при открытии страницы подставляется из среднего ESSI организации по данным опросов в системе.
          ФОТ, коэффициент k, C_replace и число ушедших вводятся вручную по вашей методике; автоматической подтяжки из бухгалтерии или кадров нет.
        </p>
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <div className="font-medium text-gray-900 mb-1">Прозрачная логика расчета</div>
          <div>Потери эффективности = ФОТ × k × (100 - ESSI)</div>
          <div>Потери текучести = C_replace × Ушедшие</div>
          <div className="font-semibold mt-1">Итого потерь = Потери эффективности + Потери текучести</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <label className="text-sm">
            ФОТ
            <input
              className="mt-1 w-full border rounded-xl px-2 py-1.5"
              type="number"
              value={econ.fot}
              onChange={(e) => setEcon({ ...econ, fot: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            k
            <input
              className="mt-1 w-full border rounded-xl px-2 py-1.5"
              type="number"
              step="0.0001"
              value={econ.k}
              onChange={(e) => setEcon({ ...econ, k: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            C_replace
            <input
              className="mt-1 w-full border rounded-xl px-2 py-1.5"
              type="number"
              value={econ.c_replace}
              onChange={(e) => setEcon({ ...econ, c_replace: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            ESSI
            <input
              className="mt-1 w-full border rounded-xl px-2 py-1.5"
              type="number"
              value={econ.essi_score}
              onChange={(e) => setEcon({ ...econ, essi_score: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            Ушедших
            <input
              className="mt-1 w-full border rounded-xl px-2 py-1.5"
              type="number"
              value={econ.departed_count}
              onChange={(e) =>
                setEcon({ ...econ, departed_count: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void calcEconomy()}
            className="px-4 py-2 rounded-xl bg-[#0052FF] text-white font-medium hover:bg-[#0047db]"
          >
            Рассчитать
          </button>
          <button
            type="button"
            disabled={econDraftBusy}
            onClick={() => void saveEconomyDrafts()}
            className="px-4 py-2 rounded-xl bg-gray-100 text-gray-800 font-medium hover:bg-gray-200 disabled:opacity-50"
          >
            {econDraftBusy ? "Сохранение…" : "Сохранить черновики (ФОТ, k, C, ушедшие)"}
          </button>
        </div>
        {econDraftMsg && (
          <p className="text-sm text-gray-600">{econDraftMsg}</p>
        )}
        {econErr && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{econErr}</p>
        )}
        {econResult && (
          <div className="text-sm text-gray-700 space-y-1">
            <div>Потери эффективности: {econResult.loss_efficiency}</div>
            <div>Потери текучести: {econResult.loss_turnover}</div>
            <div className="font-semibold">Итого: {econResult.loss_total}</div>
            <div className="text-xs text-gray-500 pt-1">
              Интерпретация: чем выше ESSI и ниже текучесть, тем меньше суммарные потери и выше управленческая
              устойчивость.
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold">ML-контур и развитие рекомендаций</h2>
        <p className="text-sm text-gray-600">
          Текущий режим: гибрид правил и ML. Система сначала использует проверяемые правила, а при достаточном объеме
          данных усиливает точность прогнозной моделью.
        </p>
        <div className="grid md:grid-cols-3 gap-3 text-sm">
          <div className="rounded-xl border border-gray-200 px-3 py-3">
            <div className="font-medium text-gray-900">Этап 1</div>
            <div className="text-gray-600 mt-1">Стабильные правила, прозрачные пороги, контроль качества данных.</div>
          </div>
          <div className="rounded-xl border border-gray-200 px-3 py-3">
            <div className="font-medium text-gray-900">Этап 2</div>
            <div className="text-gray-600 mt-1">ML-прогноз динамики ESSI и усиление рекомендаций по рисковым группам.</div>
          </div>
          <div className="rounded-xl border border-gray-200 px-3 py-3">
            <div className="font-medium text-gray-900">Этап 3</div>
            <div className="text-gray-600 mt-1">Контур самообучения: измерение эффекта выполненных рекомендаций.</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Управленческие события</h2>
        <p className="text-sm text-gray-600">
          Отмечайте действия (обучение, смена KPI и т.д.), чтобы на графике динамики видеть связь с изменением ESSI.
        </p>
        <form onSubmit={(e) => void createEvent(e)} className="grid md:grid-cols-6 gap-3 items-end">
          <label className="text-sm md:col-span-1">
            Дата
            <input
              type="date"
              className="mt-1 w-full border rounded-xl px-2 py-2"
              value={eventForm.event_date}
              onChange={(ev) => setEventForm({ ...eventForm, event_date: ev.target.value })}
              required
            />
          </label>
          <label className="text-sm md:col-span-1">
            Тип
            <Select
              value={eventForm.event_type}
              onValueChange={(value) => setEventForm({ ...eventForm, event_type: value })}
            >
              <SelectTrigger className="mt-1 w-full h-11 rounded-xl border-gray-300 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="training">Обучение</SelectItem>
                <SelectItem value="kpi_change">Изменение KPI</SelectItem>
                <SelectItem value="process_change">Изменение процесса</SelectItem>
                <SelectItem value="other">Другое</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="text-sm md:col-span-2">
            Заголовок
            <input
              className="mt-1 w-full h-11 border rounded-xl px-3"
              value={eventForm.title}
              onChange={(ev) => setEventForm({ ...eventForm, title: ev.target.value })}
              required
            />
          </label>
          <label className="text-sm md:col-span-1">
            Уровень
            <Select
              value={eventForm.level}
              onValueChange={(value) =>
                setEventForm({ ...eventForm, level: value as "organization" | "department" })
              }
            >
              <SelectTrigger className="mt-1 w-full h-11 rounded-xl border-gray-300 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="organization">Организация</SelectItem>
                <SelectItem value="department">Отдел</SelectItem>
              </SelectContent>
            </Select>
          </label>
          {eventForm.level === "department" && (
            <label className="text-sm md:col-span-1">
              ID отдела
              <input
                type="number"
                className="mt-1 w-full h-11 border rounded-xl px-3"
                value={eventForm.department_id}
                onChange={(ev) => setEventForm({ ...eventForm, department_id: ev.target.value })}
                required
              />
            </label>
          )}
          <button
            type="submit"
            disabled={eventBusy}
            className="px-4 py-2 rounded-xl bg-[#0052FF] text-white font-medium disabled:opacity-50"
          >
            {eventBusy ? "..." : "Добавить"}
          </button>
          <label className="text-sm md:col-span-6">
            Описание
            <input
              className="mt-1 w-full border rounded-xl px-2 py-2"
              value={eventForm.description}
              onChange={(ev) => setEventForm({ ...eventForm, description: ev.target.value })}
              placeholder="Что сделали и зачем"
            />
          </label>
        </form>
        <div className="space-y-2">
          {events.length === 0 ? (
            <p className="text-sm text-gray-500">События не добавлены.</p>
          ) : (
            events.slice(0, 10).map((ev) => (
              <div key={ev.id} className="rounded-xl border border-gray-200 px-3 py-2">
                <div className="text-sm font-medium text-gray-900">{ev.event_date} · {ev.title}</div>
                <div className="text-xs text-gray-500">{ev.event_type} · {ev.level}</div>
                {ev.description && <div className="text-xs text-gray-600 mt-1">{ev.description}</div>}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
        <p className="text-sm text-gray-600 mb-2">
          История нужна для контроля фоновых задач, просмотра ошибок и повторного запуска/скачивания результатов.
        </p>
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="imports">
            <AccordionTrigger className="text-base font-semibold text-gray-900">
              История импортов
            </AccordionTrigger>
            <AccordionContent className="pb-0">
              <div className="space-y-2 max-h-[18rem] overflow-y-auto pr-1">
                {jobHistory.length === 0 && <p className="text-sm text-gray-500">Нет задач импорта.</p>}
                {jobHistory.map((job) => (
                  <div key={job.id} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <div className="font-medium">Импорт #{job.id}</div>
                    <div className="text-xs text-gray-500">
                      Статус: {job.status} {job.detail ? `· ${job.detail}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="exports">
            <AccordionTrigger className="text-base font-semibold text-gray-900">
              История экспортов
            </AccordionTrigger>
            <AccordionContent className="pb-0">
              <div className="space-y-2 max-h-[18rem] overflow-y-auto pr-1">
                {exportHistory.length === 0 && <p className="text-sm text-gray-500">Нет отчётов.</p>}
                {exportHistory.map((exp) => (
                  <div key={exp.id} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <div className="font-medium">
                      Отчёт #{exp.id} ({exp.kind === "decision_excel" || exp.kind === "summary_excel" || exp.kind === "excel" ? "Excel" : "PDF"})
                    </div>
                    <div className="text-xs text-gray-500">
                      Статус: {exp.status} {exp.detail ? `· ${exp.detail}` : ""}
                    </div>
                    <div className="mt-2 flex gap-2">
                      {exp.download_url && (
                        <button
                          type="button"
                          className="px-2 py-1 rounded-lg text-xs bg-green-600 text-white"
                          onClick={() =>
                            void downloadWithAuth(
                              exp.download_url!.replace("/api", ""),
                              `report_${exp.id}.${exp.kind === "decision_excel" || exp.kind === "summary_excel" || exp.kind === "excel" ? "xlsx" : "pdf"}`,
                            )
                          }
                        >
                          Скачать
                        </button>
                      )}
                      {exp.status === "failed" && (
                        <button
                          type="button"
                          className="px-2 py-1 rounded-lg text-xs border border-[#0052FF] text-[#0052FF]"
                          onClick={() => void retryExport(exp.id)}
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
