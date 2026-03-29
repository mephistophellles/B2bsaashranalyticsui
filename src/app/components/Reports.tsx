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

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/economy/defaults");
      if (res.ok) {
        const j = await res.json();
        if (typeof j.suggested_essi === "number") {
          setEcon((e) => ({ ...e, essi_score: j.suggested_essi }));
        }
      }
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 shadow-sm">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Upload size={20} /> Загрузка опросов
          </h2>
          <p className="text-sm text-gray-600">
            Колонки: employee_id, survey_date, score_block1..score_block5
          </p>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            disabled={importBusy}
            onChange={(e) => void onUpload(e)}
          />
          {importStatus && (
            <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
              {importBusy ? "Обработка… " : ""}
              {importStatus}
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 shadow-sm">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText size={20} /> Экспорт отчётов
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={reportBusy}
              onClick={() => void generateReport("summary")}
              className="px-4 py-2 rounded-xl text-white font-medium bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] disabled:opacity-50"
            >
              PDF
            </button>
            <button
              type="button"
              disabled={reportBusy}
              onClick={() => void generateReport("summary_excel")}
              className="px-4 py-2 rounded-xl border border-[#0052FF] text-[#0052FF] font-medium disabled:opacity-50 hover:bg-blue-50"
            >
              Excel
            </button>
            {readyReportId != null && (
              <button
                type="button"
                onClick={() => void downloadReady()}
                className="px-4 py-2 rounded-xl bg-green-600 text-white font-medium"
              >
                Скачать .{readyReportExt}
              </button>
            )}
          </div>
          {reportStatus && (
            <p className="text-sm text-gray-700">{reportBusy ? "Подождите… " : ""}{reportStatus}</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 shadow-sm">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Calculator size={20} /> Экономический эффект
        </h2>
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
        <button
          type="button"
          onClick={() => void calcEconomy()}
          className="px-4 py-2 rounded-xl border border-gray-300 font-medium hover:bg-gray-50"
        >
          Рассчитать
        </button>
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
