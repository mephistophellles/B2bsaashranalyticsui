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
  status: string;
  download_url: string | null;
  detail: string | null;
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
    </div>
  );
}
