import { useEffect, useState } from "react";
import { FileText, Upload, Calculator } from "lucide-react";
import { apiFetch } from "@/api/client";

export default function Reports() {
  const [jobMsg, setJobMsg] = useState<string | null>(null);
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
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    const res = await apiFetch("/surveys/upload", {
      method: "POST",
      body: fd,
    });
    if (res.status === 202) {
      const j = await res.json();
      setJobMsg(`Импорт поставлен в очередь, job #${j.id}`);
    } else {
      setJobMsg("Ошибка загрузки");
    }
  }

  async function generatePdf() {
    const res = await apiFetch("/reports", {
      method: "POST",
      body: JSON.stringify({ kind: "summary" }),
    });
    if (res.status === 202) {
      const j = await res.json();
      setJobMsg(`Отчёт формируется, id #${j.id}. Скачайте через /api/reports/${j.id}/download когда готово.`);
    }
  }

  async function calcEconomy() {
    const res = await apiFetch("/economy/calculate", {
      method: "POST",
      body: JSON.stringify(econ),
    });
    if (res.ok) setEconResult(await res.json());
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Отчеты и данные</h1>
        <p className="text-gray-600">Импорт CSV/XLSX, генерация PDF, экономический расчёт</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Upload size={20} /> Загрузка опросов
          </h2>
          <p className="text-sm text-gray-600">
            Колонки: employee_id, survey_date, score_block1..score_block5
          </p>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => void onUpload(e)} />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText size={20} /> PDF отчёт
          </h2>
          <button
            type="button"
            onClick={() => void generatePdf()}
            className="px-4 py-2 rounded-lg text-white bg-gradient-to-r from-[#0052FF] to-[#4D7CFF]"
          >
            Сгенерировать
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Calculator size={20} /> Экономический эффект
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <label className="text-sm">
            ФОТ
            <input
              className="mt-1 w-full border rounded-lg px-2 py-1"
              type="number"
              value={econ.fot}
              onChange={(e) => setEcon({ ...econ, fot: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            k
            <input
              className="mt-1 w-full border rounded-lg px-2 py-1"
              type="number"
              step="0.0001"
              value={econ.k}
              onChange={(e) => setEcon({ ...econ, k: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            C_replace
            <input
              className="mt-1 w-full border rounded-lg px-2 py-1"
              type="number"
              value={econ.c_replace}
              onChange={(e) => setEcon({ ...econ, c_replace: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            ESSI
            <input
              className="mt-1 w-full border rounded-lg px-2 py-1"
              type="number"
              value={econ.essi_score}
              onChange={(e) => setEcon({ ...econ, essi_score: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            Ушедших
            <input
              className="mt-1 w-full border rounded-lg px-2 py-1"
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
          className="px-4 py-2 rounded-lg border border-gray-300"
        >
          Рассчитать
        </button>
        {econResult && (
          <div className="text-sm text-gray-700 space-y-1">
            <div>Потери эффективности: {econResult.loss_efficiency}</div>
            <div>Потери текучести: {econResult.loss_turnover}</div>
            <div className="font-semibold">Итого: {econResult.loss_total}</div>
          </div>
        )}
      </div>

      {jobMsg && (
        <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          {jobMsg}
        </div>
      )}
    </div>
  );
}
