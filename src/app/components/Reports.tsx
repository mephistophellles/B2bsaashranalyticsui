import { useEffect, useState } from "react";
import { FileText, Upload, Calculator, RefreshCw } from "lucide-react";
import {
  apiFetch,
  downloadWithAuth,
  parseErrorMessage,
  sleep,
} from "@/api/client";

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
    void loadHistory();
  }, []);

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

  async function generateReport(kind: "summary" | "summary_excel") {
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
      setReadyReportExt(kind === "summary_excel" ? "xlsx" : "pdf");
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
        setReadyReportExt((j.kind === "summary_excel" || j.kind === "excel") ? "xlsx" : "pdf");
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2 tracking-tight">Отчеты и данные</h1>
        <p className="text-gray-600">Импорт CSV/XLSX, PDF/Excel, пересчёт индексов, экономика</p>
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
              Форматы: CSV, XLSX, XLS. После выбора файла дождитесь сообщения о завершении импорта.
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
          <p className="text-xs text-gray-500 leading-snug">Сводка: PDF или Excel, затем скачивание.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={reportBusy}
              onClick={() => void generateReport("summary")}
              className="px-3 py-1.5 text-sm rounded-lg text-white font-medium bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] disabled:opacity-50"
            >
              PDF
            </button>
            <button
              type="button"
              disabled={reportBusy}
              onClick={() => void generateReport("summary_excel")}
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
              onClick={() => void downloadWithAuth("/reports/demo-template", "demo_hr_case_template.xlsx")}
              className="px-3 py-1.5 text-sm rounded-lg border border-emerald-600 text-emerald-700 font-medium hover:bg-emerald-50"
            >
              Демо-кейс Excel
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
            className="px-4 py-2 rounded-xl border border-gray-300 font-medium hover:bg-gray-50"
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
          </div>
        )}
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
            <select
              className="mt-1 w-full border rounded-xl px-2 py-2"
              value={eventForm.event_type}
              onChange={(ev) => setEventForm({ ...eventForm, event_type: ev.target.value })}
            >
              <option value="training">Обучение</option>
              <option value="kpi_change">Изменение KPI</option>
              <option value="process_change">Изменение процесса</option>
              <option value="other">Другое</option>
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            Заголовок
            <input
              className="mt-1 w-full border rounded-xl px-2 py-2"
              value={eventForm.title}
              onChange={(ev) => setEventForm({ ...eventForm, title: ev.target.value })}
              required
            />
          </label>
          <label className="text-sm md:col-span-1">
            Уровень
            <select
              className="mt-1 w-full border rounded-xl px-2 py-2"
              value={eventForm.level}
              onChange={(ev) =>
                setEventForm({ ...eventForm, level: ev.target.value as "organization" | "department" })
              }
            >
              <option value="organization">Организация</option>
              <option value="department">Отдел</option>
            </select>
          </label>
          {eventForm.level === "department" && (
            <label className="text-sm md:col-span-1">
              ID отдела
              <input
                type="number"
                className="mt-1 w-full border rounded-xl px-2 py-2"
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-3">История импортов</h3>
          <div className="space-y-2">
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
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-3">История экспортов</h3>
          <div className="space-y-2">
            {exportHistory.length === 0 && <p className="text-sm text-gray-500">Нет отчётов.</p>}
            {exportHistory.map((exp) => (
              <div key={exp.id} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <div className="font-medium">
                  Отчёт #{exp.id} ({exp.kind === "summary_excel" || exp.kind === "excel" ? "Excel" : "PDF"})
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
                          `report_${exp.id}.${exp.kind === "summary_excel" || exp.kind === "excel" ? "xlsx" : "pdf"}`,
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
        </div>
      </div>
    </div>
  );
}
