import { useEffect, useState } from "react";
import { Link } from "react-router";
import { FileText, Upload, Calculator, RefreshCw, ChevronDown, ChevronUp, Info } from "lucide-react";
import {
  apiFetch,
  downloadWithAuth,
  parseErrorMessage,
  sleep,
} from "@/api/client";
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
type ManagementEvent = {
  id: number;
  event_date: string;
  event_type: string;
  title: string;
  description: string | null;
  level: "organization" | "department";
  department_id: number | null;
};
/** Годовой ФОТ и модель потерь — см. /economy/calculate */
const FTE_ASSUMPTION_FOR_EQUIV = 25;

function formatRub(n: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);
}

function computeLosses(essi: number, fot: number, k: number, cReplace: number, departed: number) {
  const safe = Math.min(99.9, Math.max(0, essi));
  const lossEff = (100 - safe) * fot * k;
  const lossTurn = departed * cReplace;
  const lossEfficiency = Math.round(lossEff * 100) / 100;
  const lossTurnover = Math.round(lossTurn * 100) / 100;
  return {
    loss_efficiency: lossEfficiency,
    loss_turnover: lossTurnover,
    loss_total: Math.round((lossEff + lossTurn) * 100) / 100,
  };
}

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
  const [reportOpen, setReportOpen] = useState(false);
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

  const [pdfDownloading, setPdfDownloading] = useState(false);

  async function downloadDecisionPdf() {
    setPdfDownloading(true);
    setReportStatus(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await downloadWithAuth(
        `/reports/decision-pdf?months=${decisionMonths}`,
        `Управленческий_отчёт_${today}.pdf`,
      );
    } catch (e) {
      setReportStatus(e instanceof Error ? e.message : "Не удалось скачать PDF");
    } finally {
      setPdfDownloading(false);
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
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center shadow-sm">
          <FileText className="text-[#0052FF]" size={26} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Отчеты и данные</h1>
          <p className="text-sm text-gray-600">Импорт, экспорт, пересчёт индексов и управленческие события</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3 shadow-sm">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Upload size={18} /> Загрузка опросов
          </h2>
          <div className="flex items-center gap-3">
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
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] cursor-pointer hover:opacity-95 transition-all select-none ${
                importBusy ? "opacity-50 pointer-events-none cursor-not-allowed" : ""
              }`}
            >
              <Upload size={16} aria-hidden />
              {importBusy ? "Обработка…" : "Выберите файл"}
            </label>
          </div>
          {importStatus && (
            <p className="text-xs text-gray-700 bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-100">
              {importBusy ? "Обработка… " : ""}{importStatus}
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3 shadow-sm">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <FileText size={18} /> Экспорт отчётов
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pdfDownloading}
              onClick={() => void downloadDecisionPdf()}
              className="px-3 py-1.5 text-sm rounded-lg text-white font-medium bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] disabled:opacity-50"
            >
              {pdfDownloading ? "Скачивание…" : "PDF"}
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
              Шаблон
            </button>
          </div>
          {reportStatus && (
            <p className="text-xs text-gray-700">{reportBusy ? "Подождите… " : ""}{reportStatus}</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3 shadow-sm">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <RefreshCw size={18} /> Пересчёт индексов
          </h2>
          <button
            type="button"
            disabled={recalcBusy}
            onClick={() => void recalculate()}
            className="px-4 py-2 text-sm rounded-xl border border-gray-300 font-medium disabled:opacity-50 hover:bg-gray-50"
          >
            {recalcBusy ? "Запрос…" : "Пересчитать"}
          </button>
          {recalcMsg && <p className="text-xs text-gray-600">{recalcMsg}</p>}
        </div>
      </div>

      <div className="space-y-4">
        <button
          type="button"
          className="flex items-center gap-2 w-full text-left"
          onClick={() => setReportOpen((v) => !v)}
        >
          <h2 className="text-lg font-semibold text-gray-900">Управленческий отчёт</h2>
          {reportOpen ? <ChevronUp size={20} className="text-gray-500" /> : <ChevronDown size={20} className="text-gray-500" />}
        </button>
        {reportOpen && (
        <>
        {decisionErr && <p className="text-sm text-red-600">{decisionErr}</p>}
        {!decisionErr && !decision && (
          <p className="text-sm text-gray-500">Идёт обработка данных. Это займёт несколько секунд.</p>
        )}
        {decision && (() => {
          const ov = decision.overview;
          const dyn = decision.dynamics;
          const eco = decision.economic_effect;
          const series = dyn.essi_series;
          const trendDir = dyn.delta_pct > 1 ? "рост" : dyn.delta_pct < -1 ? "снижение" : "плато";
          const essiLevel = ov.essi_index >= 80 ? "стабильное состояние" : ov.essi_index >= 60 ? "удовлетворительное, но с рисками" : "критическое, требует действий";
          const lossEffPct = Math.round((1 - ov.essi_index / 100) * 100);
          const topStrength = decision.strengths[0];
          const topWeak = decision.strengths.length > 1 ? [...decision.strengths].sort((a, b) => a.value - b.value)[0] : null;
          const highRecs = decision.recommendations.filter((r) => r.priority === "high");
          const medRecs = decision.recommendations.filter((r) => r.priority === "medium");
          const lowRecs = decision.recommendations.filter((r) => r.priority !== "high" && r.priority !== "medium");

          return (
          <div className="space-y-6">
            {/* 1. EXECUTIVE SUMMARY */}
            <section className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Ключевые выводы</h3>
              <ul className="space-y-2 text-sm text-gray-800">
                <li className="flex gap-2">
                  <span className="text-blue-600 font-bold shrink-0">1.</span>
                  ESSI = {ov.essi_index} — {essiLevel}
                  {topStrength && topWeak && ov.essi_index >= 60 && `, рост обеспечен преимущественно за счёт «${topStrength.title}» (${topStrength.value})`}
                </li>
                {topWeak && topWeak.value < 75 && (
                  <li className="flex gap-2">
                    <span className="text-blue-600 font-bold shrink-0">2.</span>
                    Риск скрытой просадки по блоку «{topWeak.title}» ({topWeak.value}) — при бездействии возможно снижение общего индекса
                  </li>
                )}
                {ov.risk_at_risk_total > 0 && (
                  <li className="flex gap-2">
                    <span className="text-blue-600 font-bold shrink-0">{topWeak && topWeak.value < 75 ? "3" : "2"}.</span>
                    {ov.risk_at_risk_total} сотрудник(ов) в зоне риска — потенциальные потери до {lossEffPct}% продуктивности по методике
                  </li>
                )}
                <li className="flex gap-2">
                  <span className="text-blue-600 font-bold shrink-0">{ov.risk_at_risk_total > 0 && topWeak && topWeak.value < 75 ? "4" : ov.risk_at_risk_total > 0 || (topWeak && topWeak.value < 75) ? "3" : "2"}.</span>
                  Тренд за {dyn.months} мес.: <strong>{trendDir}</strong> ({dyn.delta_pct > 0 ? "+" : ""}{dyn.delta_pct}%)
                  {trendDir === "плато" && " — без активных действий рост невозможен"}
                </li>
              </ul>
              <div className="mt-4 pt-3 border-t border-blue-200">
                <div className="text-xs uppercase tracking-wide text-blue-700 mb-2">Что делать прямо сейчас</div>
                <div className="space-y-1.5 text-sm text-gray-800">
                  {decision.risk_zones.length > 0 && (
                    <div className="flex gap-2"><span className="text-red-500 font-bold">1.</span> Провести 1:1 с сотрудниками в зоне риска ({decision.risk_zones.map((r) => r.name).slice(0, 3).join(", ")})</div>
                  )}
                  {topWeak && (
                    <div className="flex gap-2"><span className="text-amber-500 font-bold">{decision.risk_zones.length > 0 ? "2" : "1"}.</span> Углублённая диагностика по блоку «{topWeak.title}» — выявить корневую причину</div>
                  )}
                  <div className="flex gap-2"><span className="text-green-600 font-bold">{(decision.risk_zones.length > 0 ? 1 : 0) + (topWeak ? 1 : 0) + 1}.</span> Контроль нагрузки — проверить баланс задач и ресурсов</div>
                </div>
              </div>
            </section>

            {/* 2. ГДЕ ПРОБЛЕМА И ПОЧЕМУ ЭТО ВАЖНО */}
            <section className="rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Где проблема и почему это важно</h3>
              <div className={`rounded-lg px-4 py-3 mb-3 text-sm ${ov.essi_index >= 80 ? "bg-green-50 border border-green-200 text-green-900" : ov.essi_index >= 60 ? "bg-amber-50 border border-amber-200 text-amber-900" : "bg-red-50 border border-red-200 text-red-900"}`}>
                <strong>ESSI {ov.essi_index}</strong> = {ov.essi_index >= 80
                  ? "высокая устойчивость команды. Условия способствуют раскрытию потенциала, но стагнация отдельных блоков может привести к снижению."
                  : ov.essi_index >= 60
                    ? `удовлетворительное состояние, но уже наблюдается давление по ${topWeak ? `блоку «${topWeak.title}»` : "отдельным факторам"} — риск потери ${Math.max(3, lossEffPct)}–${Math.max(5, lossEffPct + 2)}% эффективности.`
                    : `критическая зона. Человеческий потенциал реализуется менее чем на ${ov.essi_index}%. Требуются срочные управленческие действия.`}
              </div>
              <div className="text-xs text-gray-500">Норма методики: ≥ 80 — высокая устойчивость, 60–80 — удовлетворительно, 40–60 — зона риска, &lt; 40 — кризис.</div>
            </section>

            {/* 3. ДИНАМИКА — ИНСАЙТНАЯ */}
            <section className="rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Динамика ESSI</h3>
              <div className="flex items-center gap-3 mb-3">
                <span className={`inline-flex items-center text-xs font-medium rounded-full px-2.5 py-1 ${trendDir === "рост" ? "bg-green-100 text-green-800" : trendDir === "снижение" ? "bg-red-100 text-red-800" : "bg-gray-200 text-gray-700"}`}>
                  {trendDir === "рост" ? "Рост" : trendDir === "снижение" ? "Снижение" : "Плато"}
                </span>
                <span className="text-sm text-gray-600">{dyn.previous_value} → {dyn.latest_value} за {dyn.months} мес. ({dyn.delta_pct > 0 ? "+" : ""}{dyn.delta_pct}%)</span>
              </div>
              <div className="grid md:grid-cols-6 gap-2 mb-3">
                {series.map((p, i) => {
                  const prev = i > 0 ? series[i - 1].value : p.value;
                  const diff = p.value - prev;
                  return (
                    <div key={p.id} className={`rounded-lg border px-2 py-2 text-xs ${diff > 0 ? "border-green-200 bg-green-50/50" : diff < 0 ? "border-red-200 bg-red-50/50" : "border-gray-200"}`}>
                      <div className="font-medium text-gray-700">{p.month}</div>
                      <div className="text-gray-900 font-semibold">{p.value}</div>
                      {i > 0 && <div className={`text-[10px] ${diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : "text-gray-400"}`}>{diff > 0 ? "+" : ""}{diff.toFixed(1)}</div>}
                    </div>
                  );
                })}
              </div>
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
                <strong>Почему:</strong>{" "}
                {trendDir === "рост"
                  ? `рост обеспечен улучшением ${topStrength ? `«${topStrength.title}»` : "отдельных блоков"}.${topWeak && topWeak.value < 75 ? ` При этом «${topWeak.title}» стагнирует (${topWeak.value}) — без внимания рост может остановиться.` : ""}`
                  : trendDir === "снижение"
                    ? `снижение связано с давлением по ${topWeak ? `блоку «${topWeak.title}» (${topWeak.value})` : "нескольким факторам"}. Необходимы корректирующие действия.`
                    : `индекс стабилен, но без роста. ${topWeak ? `Блок «${topWeak.title}» (${topWeak.value}) сдерживает прогресс` : "Необходимы точечные улучшения"}.`}
              </div>
            </section>

            {/* 4. СИЛЬНЫЕ СТОРОНЫ — ИНСТРУМЕНТ */}
            <section className="rounded-xl border border-green-200 bg-green-50/30 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Сильные стороны: как использовать</h3>
              <div className="space-y-3">
                {decision.strengths.map((s) => (
                  <div key={`${s.block_index}-${s.title}`} className="rounded-lg border border-green-100 bg-white px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">{s.title}</span>
                      <span className="text-xs font-medium text-green-700 bg-green-100 rounded-full px-2 py-0.5">{s.value}</span>
                    </div>
                    <p className="text-sm text-gray-700 mb-1">{s.what_it_means}</p>
                    <div className="text-sm text-green-800">
                      <strong>Применение:</strong>{" "}
                      {s.value >= 85
                        ? `Высокий показатель «${s.title}» можно использовать для внедрения изменений без сопротивления. Сотрудники готовы к новым инициативам в этой зоне.`
                        : `«${s.title}» — точка опоры. ${s.actions}`}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 5. ЗОНЫ РИСКА — ACTIONABLE */}
            {decision.risk_zones.length > 0 && (
            <section className="rounded-xl border border-red-200 bg-red-50/30 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Зоны риска: кто, что делать, когда</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-sm">
                  <thead>
                    <tr className="bg-red-50 border-b border-red-200">
                      <th className="text-left px-3 py-2">Сотрудник</th>
                      <th className="text-left px-3 py-2">Проблема</th>
                      <th className="text-left px-3 py-2">Риск</th>
                      <th className="text-left px-3 py-2">Действие</th>
                      <th className="text-left px-3 py-2">Срок</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decision.risk_zones.map((r) => (
                      <tr key={r.id} className="border-b border-red-100 align-top">
                        <td className="px-3 py-2">
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-gray-500">{r.department}</div>
                        </td>
                        <td className="px-3 py-2 whitespace-normal break-words">
                          ESSI {r.essi} — {r.essi < 40 ? "критическое снижение устойчивости" : "устойчивость под угрозой, потенциал ограничен"}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex text-xs font-medium rounded-full px-2 py-0.5 ${r.essi < 40 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                            {r.essi < 40 ? "Выгорание / уход" : "Снижение продуктивности"}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-normal break-words text-gray-800">
                          1:1 встреча + {r.actions}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600">
                          {r.essi < 40 ? "Эта неделя" : "До 2 недель"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            )}

            {/* 6. ЧТО БУДЕТ ЕСЛИ НИЧЕГО НЕ ДЕЛАТЬ */}
            <section className="rounded-xl border border-red-300 bg-red-50/60 p-5">
              <h3 className="font-semibold text-red-900 mb-3">Что будет, если ничего не делать</h3>
              <div className="grid md:grid-cols-3 gap-3">
                <div className="rounded-lg bg-white border border-red-200 px-4 py-3">
                  <div className="text-xs text-red-600 font-medium mb-1">Продуктивность</div>
                  <div className="text-lg font-bold text-red-800">−{Math.max(3, lossEffPct)}–{Math.max(5, lossEffPct + 2)}%</div>
                  <div className="text-xs text-gray-600 mt-1">Снижение эффективности из-за нереализованного потенциала</div>
                </div>
                <div className="rounded-lg bg-white border border-red-200 px-4 py-3">
                  <div className="text-xs text-red-600 font-medium mb-1">Текучесть</div>
                  <div className="text-lg font-bold text-red-800">{ov.risk_at_risk_total > 0 ? `+${ov.risk_at_risk_total} чел.` : "+1–2 чел."}</div>
                  <div className="text-xs text-gray-600 mt-1">Замена сотрудника обходится в 3–6 месячных зарплат</div>
                </div>
                <div className="rounded-lg bg-white border border-red-200 px-4 py-3">
                  <div className="text-xs text-red-600 font-medium mb-1">Управленческая нагрузка</div>
                  <div className="text-lg font-bold text-red-800">×1.5–2</div>
                  <div className="text-xs text-gray-600 mt-1">Рост нагрузки на менеджеров из-за компенсации проблем</div>
                </div>
              </div>
              {eco.loss_total != null && eco.loss_total > 0 && (
                <div className="mt-3 rounded-lg bg-white border border-red-200 px-4 py-3 text-sm">
                  <strong className="text-red-800">Оценка потерь:</strong>{" "}
                  {eco.loss_efficiency != null && <>эффективность: {eco.loss_efficiency.toLocaleString()} · </>}
                  {eco.loss_turnover != null && <>текучесть: {eco.loss_turnover.toLocaleString()} · </>}
                  <strong>итого: {eco.loss_total.toLocaleString()}</strong>
                </div>
              )}
            </section>

            {/* 7. КОРНЕВЫЕ ПРИЧИНЫ + СВЯЗЬ ФАКТОРОВ */}
            <section className="rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Корневые причины и связь факторов</h3>
              <div className="space-y-3">
                {decision.causes.map((c) => (
                  <div key={c.title} className="rounded-lg border border-gray-200 px-4 py-3">
                    <div className="font-medium text-gray-900 mb-1">{c.title}</div>
                    <div className="text-sm text-gray-700 mb-2">{c.what_it_means}</div>
                    {c.reasons.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {c.reasons.slice(0, 3).map((reason) => (
                          <span key={reason.code} className="inline-flex items-center text-xs bg-gray-100 text-gray-700 rounded-full px-2 py-0.5">
                            {reason.label}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-gray-500">
                      <strong>Причина:</strong> {c.reason_text} → <strong>Действие:</strong> {c.actions}
                    </div>
                  </div>
                ))}
              </div>
              {topWeak && decision.economic_effect.behavioral_effects?.length > 0 && (
                <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                  <div className="text-xs uppercase tracking-wide text-amber-700 mb-2">Цепочка влияния</div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-amber-900">
                    <span className="font-medium">{topWeak.title} ({topWeak.value})</span>
                    <span>→</span>
                    {decision.economic_effect.behavioral_effects.slice(0, 2).map((be, i) => (
                      <span key={be.code}>
                        {i > 0 && <span className="mx-1">→</span>}
                        <span className="font-medium">{be.label}</span>
                      </span>
                    ))}
                    <span>→</span>
                    <span className="font-medium">снижение продуктивности</span>
                  </div>
                </div>
              )}
            </section>

            {/* 8. РЕКОМЕНДАЦИИ С ПРИОРИТЕТАМИ */}
            <section className="rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Рекомендации по приоритетам</h3>
              {highRecs.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs uppercase tracking-wide text-red-700 mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500" /> Высокий приоритет — срочно
                  </div>
                  <div className="space-y-2">
                    {highRecs.map((r) => (
                      <div key={r.id} className="rounded-lg border border-red-200 bg-red-50/40 px-4 py-3">
                        <div className="font-medium text-gray-900">{r.title}</div>
                        <div className="text-sm text-gray-700 mt-1">{r.description}</div>
                        {r.expected_effect && <div className="text-xs text-green-700 mt-1">Ожидаемый эффект: {r.expected_effect}</div>}
                        <div className="text-xs text-gray-500 mt-1">Шаги: {r.actions}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {medRecs.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs uppercase tracking-wide text-amber-700 mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500" /> Средний приоритет — в течение месяца
                  </div>
                  <div className="space-y-2">
                    {medRecs.map((r) => (
                      <div key={r.id} className="rounded-lg border border-amber-200 bg-amber-50/40 px-4 py-3">
                        <div className="font-medium text-gray-900">{r.title}</div>
                        <div className="text-sm text-gray-700 mt-1">{r.description}</div>
                        {r.expected_effect && <div className="text-xs text-green-700 mt-1">Ожидаемый эффект: {r.expected_effect}</div>}
                        <div className="text-xs text-gray-500 mt-1">Шаги: {r.actions}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {lowRecs.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-green-700 mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500" /> Низкий приоритет — планово
                  </div>
                  <div className="space-y-2">
                    {lowRecs.map((r) => (
                      <div key={r.id} className="rounded-lg border border-green-200 bg-green-50/40 px-4 py-3">
                        <div className="font-medium text-gray-900">{r.title}</div>
                        <div className="text-sm text-gray-700 mt-1">{r.description}</div>
                        <div className="text-xs text-gray-500 mt-1">Шаги: {r.actions}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* 9. РЕШЕНИЯ ДЛЯ МЕНЕДЖЕРА */}
            <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Решения для менеджера</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-lg bg-white border border-blue-200 px-4 py-3">
                  <div className="text-xs uppercase tracking-wide text-blue-700 mb-2">На этой неделе</div>
                  <ul className="space-y-1.5 text-sm text-gray-800">
                    {decision.risk_zones.length > 0 && (
                      <li>• Провести 1:1 с {decision.risk_zones.length <= 3 ? decision.risk_zones.map((r) => r.name).join(", ") : `${decision.risk_zones.length} сотрудниками в зоне риска`}</li>
                    )}
                    {topWeak && <li>• Проверить загрузку по блоку «{topWeak.title}»</li>}
                    {highRecs.length > 0 && <li>• Запустить: {highRecs[0].title}</li>}
                    {decision.risk_zones.length === 0 && !topWeak && highRecs.length === 0 && <li>• Зафиксировать текущие практики как стандарт</li>}
                  </ul>
                </div>
                <div className="rounded-lg bg-white border border-blue-200 px-4 py-3">
                  <div className="text-xs uppercase tracking-wide text-blue-700 mb-2">В течение месяца</div>
                  <ul className="space-y-1.5 text-sm text-gray-800">
                    {medRecs.slice(0, 2).map((r) => <li key={r.id}>• {r.title}</li>)}
                    {topWeak && <li>• Повысить «{topWeak.title}» до {Math.min(100, Math.round(topWeak.value + 5))}+</li>}
                    <li>• Контроль: повторный замер ESSI через 30 дней</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* 10. СЦЕНАРИИ */}
            <section className="rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Сценарии развития</h3>
              <div className="grid md:grid-cols-3 gap-3">
                <div className="rounded-lg border border-red-200 bg-red-50/40 px-4 py-3">
                  <div className="text-xs font-medium text-red-700 mb-1">Бездействие</div>
                  <div className="text-sm text-gray-700">
                    ESSI → {Math.max(30, ov.essi_index - 5)}–{ov.essi_index}, потеря {lossEffPct}%+ эффективности, рост текучести
                  </div>
                  {eco.scenario && <div className="text-xs text-red-600 mt-1">Потери: {eco.scenario.current.loss_total.toLocaleString()}</div>}
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50/40 px-4 py-3">
                  <div className="text-xs font-medium text-amber-700 mb-1">Минимальные действия</div>
                  <div className="text-sm text-gray-700">
                    ESSI → {ov.essi_index}–{Math.min(100, ov.essi_index + 3)}, стабилизация без роста, удержание команды
                  </div>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50/40 px-4 py-3">
                  <div className="text-xs font-medium text-green-700 mb-1">Полная реализация</div>
                  <div className="text-sm text-gray-700">
                    ESSI → {Math.min(100, ov.essi_index + 5)}–{Math.min(100, ov.essi_index + 10)}, рост продуктивности, снижение рисков
                  </div>
                  {eco.scenario && <div className="text-xs text-green-600 mt-1">Экономия: {eco.scenario.savings_potential.toLocaleString()}</div>}
                </div>
              </div>
            </section>
          </div>
          );
        })()}
        </>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Calculator size={20} /> Экономический эффект
          </h2>
          <p className="text-xs text-gray-500 max-w-md leading-relaxed">
            Оценка скрытых потерь по упрощённой модели. ФОТ и коэффициенты — ввод вручную; ESSI подставляется из опросов.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <label className="text-sm flex flex-col gap-1">
            <span className="text-gray-600">ФОТ (годовой), ₽</span>
            <input
              className="w-full border rounded-xl px-2 py-1.5"
              type="number"
              value={econ.fot}
              onChange={(e) => setEcon({ ...econ, fot: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm flex flex-col gap-1">
            <span className="text-gray-600 flex items-center gap-1">
              k
              <span className="text-gray-400" title="Чувствительность потерь эффективности к разрыву ESSI до 100">
                <Info size={14} />
              </span>
            </span>
            <input
              className="w-full border rounded-xl px-2 py-1.5"
              type="number"
              step="0.0001"
              value={econ.k}
              onChange={(e) => setEcon({ ...econ, k: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm flex flex-col gap-1">
            <span className="text-gray-600">C_replace, ₽</span>
            <input
              className="w-full border rounded-xl px-2 py-1.5"
              type="number"
              value={econ.c_replace}
              onChange={(e) => setEcon({ ...econ, c_replace: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm flex flex-col gap-1">
            <span className="text-gray-600">ESSI</span>
            <input
              className="w-full border rounded-xl px-2 py-1.5"
              type="number"
              value={econ.essi_score}
              onChange={(e) => setEcon({ ...econ, essi_score: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm flex flex-col gap-1">
            <span className="text-gray-600">Ушедших (за период)</span>
            <input
              className="w-full border rounded-xl px-2 py-1.5"
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
            {econDraftBusy ? "Сохранение…" : "Сохранить черновики"}
          </button>
        </div>
        {econDraftMsg && <p className="text-sm text-gray-600">{econDraftMsg}</p>}
        {econErr && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{econErr}</p>
        )}

        {econResult && (() => {
          const fot = econ.fot;
          const k = econ.k;
          const cRep = econ.c_replace;
          const dep = econ.departed_count;
          const essi = econ.essi_score;
          const eff = econResult.loss_efficiency;
          const turn = econResult.loss_turnover;
          const total = econResult.loss_total;
          const pctFot = fot > 0 ? (total / fot) * 100 : 0;
          const rubPerEssiPoint = fot * k;
          const deltaOneTurnover = cRep;
          const equivFte =
            fot > 0 ? (total / fot) * FTE_ASSUMPTION_FOR_EQUIV : 0;
          const scenarioNow = computeLosses(essi, fot, k, cRep, dep);
          const scenarioUp = computeLosses(Math.min(100, essi + 3), fot, k, cRep, dep);
          const scenarioDown = computeLosses(Math.max(0, essi - 3), fot, k, cRep, dep);
          const deficit = Math.max(0, 100 - Math.min(99.9, essi));
          const strainW = deficit / 55;
          const engW = deficit / 75;
          const focusW = deficit / 80;
          const wSum = strainW + engW + focusW || 1;
          const leverStrain = (eff * strainW) / wSum;
          const leverEng = (eff * engW) / wSum;
          const leverFocus = (eff * focusW) / wSum;
          let trigger: "critical" | "watch" | "ok" = "ok";
          if (pctFot > 5) trigger = "critical";
          else if (pctFot >= 2) trigger = "watch";

          return (
            <div className="space-y-5 pt-2 border-t border-gray-100">
              <div
                className={`rounded-xl border px-4 py-2 text-sm ${
                  trigger === "critical"
                    ? "border-red-200 bg-red-50 text-red-900"
                    : trigger === "watch"
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-green-200 bg-green-50 text-green-900"
                }`}
              >
                {trigger === "critical" && "🔴 Потери более 5% годового ФОТ — зона критического внимания."}
                {trigger === "watch" && "🟡 Потери 2–5% ФОТ — зона внимания; есть резерв для улучшений."}
                {trigger === "ok" && "🟢 Потери менее 2% ФОТ — в пределах ожидаемой модели."}
              </div>

              <div className="rounded-2xl border border-[#0052FF]/20 bg-gradient-to-br from-blue-50/90 to-indigo-50/80 p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-[#0052FF] mb-3">
                  Итоговые потери (модель годового ФОТ)
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="text-sm text-gray-700">
                      Потери эффективности:{" "}
                      <span className="font-semibold text-gray-900 tabular-nums">{formatRub(eff)}</span>
                    </div>
                    <div className="text-sm text-gray-700">
                      Потери текучести:{" "}
                      <span className="font-semibold text-gray-900 tabular-nums">{formatRub(turn)}</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900 pt-1 tabular-nums">
                      Итого: {formatRub(total)} <span className="text-sm font-normal text-gray-600">/ год (оценка)</span>
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/80 border border-blue-100 px-4 py-3 text-sm space-y-2">
                    <div className="font-medium text-gray-900">📊 В масштабе ФОТ</div>
                    <div>
                      <span className="text-gray-600">Доля потерь: </span>
                      <span className="font-semibold tabular-nums">{pctFot.toFixed(1)}%</span> от годового ФОТ
                    </div>
                    <div className="text-gray-700">
                      ≈ <span className="font-semibold tabular-nums">{equivFte.toFixed(1)}</span> условных сотрудников
                      «впустую» при оценке численности ≈{FTE_ASSUMPTION_FOR_EQUIV} чел. на весь ФОТ
                      <span className="text-gray-400" title="Упрощение: потери ÷ (ФОТ / численность), численность задана условно для наглядности.">
                        {" "}
                        <Info size={12} className="inline" />
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4">
                <h3 className="font-semibold text-gray-900 mb-2">🧠 Что это значит</h3>
                <ul className="text-sm text-gray-700 space-y-2 list-disc pl-5">
                  <li>
                    Каждый <strong>1 пункт ESSI</strong> вниз добавляет около{" "}
                    <strong className="tabular-nums">{formatRub(rubPerEssiPoint)}</strong> к потерям эффективности (при
                    текущих ФОТ и k).
                  </li>
                  <li>
                    Вы теряете эквивалент <strong>{equivFte.toFixed(1)}</strong> полных ставок в год при указанных
                    допущениях — прежде всего из‑за разрыва ESSI до 100 и текучести.
                  </li>
                  <li>
                    Потери текучести: каждый дополнительный уход ≈ <strong>{formatRub(deltaOneTurnover)}</strong> при
                    текущем C_replace.
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-2">🔮 Сценарии (ESSI)</h3>
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-3 py-2 font-medium">Сценарий</th>
                        <th className="text-left px-3 py-2 font-medium">ESSI</th>
                        <th className="text-left px-3 py-2 font-medium">Потери (оценка)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-100">
                        <td className="px-3 py-2">Сейчас</td>
                        <td className="px-3 py-2 tabular-nums">{essi.toFixed(1)}</td>
                        <td className="px-3 py-2 font-medium tabular-nums">{formatRub(scenarioNow.loss_total)}</td>
                      </tr>
                      <tr className="border-b border-gray-100 bg-green-50/40">
                        <td className="px-3 py-2">Улучшение +3 п.п.</td>
                        <td className="px-3 py-2 tabular-nums">{Math.min(100, essi + 3).toFixed(1)}</td>
                        <td className="px-3 py-2 font-medium text-green-800 tabular-nums">
                          {formatRub(scenarioUp.loss_total)}
                          <span className="text-xs font-normal text-green-700 ml-1">
                            (−{formatRub(Math.max(0, scenarioNow.loss_total - scenarioUp.loss_total))})
                          </span>
                        </td>
                      </tr>
                      <tr className="bg-red-50/30">
                        <td className="px-3 py-2">Падение −3 п.п.</td>
                        <td className="px-3 py-2 tabular-nums">{Math.max(0, essi - 3).toFixed(1)}</td>
                        <td className="px-3 py-2 font-medium text-red-800 tabular-nums">
                          {formatRub(scenarioDown.loss_total)}
                          <span className="text-xs font-normal text-red-700 ml-1">
                            (+{formatRub(Math.max(0, scenarioDown.loss_total - scenarioNow.loss_total))})
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Сценарии меняют только ESSI в модели; число ушедших и ФОТ неизменны — чтобы показать чувствительность к
                  индексу.
                </p>
              </div>

              <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
                <h3 className="font-semibold text-gray-900 mb-2">📉 На что сильнее всего влияют потери</h3>
                <ul className="text-sm text-gray-800 space-y-1.5">
                  <li>
                    <strong>ESSI −1 п.п.</strong> → потери эффективности примерно <strong>+{formatRub(rubPerEssiPoint)}</strong>{" "}
                    (линейная модель: (100−ESSI)×ФОТ×k).
                  </li>
                  <li>
                    <strong>Текучесть +1 человек</strong> → <strong>+{formatRub(deltaOneTurnover)}</strong> к потерям
                    замены.
                  </li>
                </ul>
              </div>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                <h3 className="font-semibold text-gray-900 mb-2">🛠 Как снизить потери (ориентиры по факторам)</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Доля «потерь эффективности» условно разбита по факторам из диагностики (напряжение, вовлечённость,
                  концентрация). Реальные меры — в{" "}
                  <Link to="/recommendations" className="text-[#0052FF] font-medium underline-offset-2 hover:underline">
                    рекомендациях
                  </Link>
                  .
                </p>
                <ul className="text-sm space-y-2">
                  <li className="flex flex-wrap justify-between gap-2 border-b border-emerald-100/80 pb-2">
                    <span>Снижение напряжения (рост ESSI по блоку условий)</span>
                    <span className="font-medium text-emerald-800 tabular-nums">до −{formatRub(leverStrain)}</span>
                  </li>
                  <li className="flex flex-wrap justify-between gap-2 border-b border-emerald-100/80 pb-2">
                    <span>Рост вовлечённости</span>
                    <span className="font-medium text-emerald-800 tabular-nums">до −{formatRub(leverEng)}</span>
                  </li>
                  <li className="flex flex-wrap justify-between gap-2">
                    <span>Улучшение концентрации</span>
                    <span className="font-medium text-emerald-800 tabular-nums">до −{formatRub(leverFocus)}</span>
                  </li>
                </ul>
                <p className="text-xs text-gray-500 mt-2">
                  Суммы не складываются в 100% экономии одновременно — это независимые рычаги к одной и той же части
                  потерь эффективности.
                </p>
              </div>

              <details className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
                <summary className="cursor-pointer font-medium text-gray-900 select-none">
                  Показать формулы расчёта
                </summary>
                <div className="mt-3 space-y-2 text-gray-700 font-mono text-xs leading-relaxed">
                  <p>Потери эффективности = ФОТ × k × (100 − ESSI)</p>
                  <p>Потери текучести = C_replace × число ушедших</p>
                  <p className="font-sans text-gray-600">Итого = сумма двух компонент. ESSI ограничен сверху 99,9 для устойчивости формулы.</p>
                </div>
              </details>
            </div>
          );
        })()}
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

    </div>
  );
}
