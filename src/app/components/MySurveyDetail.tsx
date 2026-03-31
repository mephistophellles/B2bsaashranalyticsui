import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { apiFetch, parseErrorMessage } from "@/api/client";

type SurveyDetail = {
  id: number;
  survey_date: string;
  source: string;
  score_block1: number;
  score_block2: number;
  score_block3: number;
  score_block4: number;
  score_block5: number;
  essi: number;
  block_percentages: number[];
};

export default function MySurveyDetail() {
  const { id } = useParams<{ id: string }>();
  const [row, setRow] = useState<SurveyDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      setErr(null);
      setRow(null);
      const res = await apiFetch(`/me/surveys/${id}`);
      if (!res.ok) {
        setErr(await parseErrorMessage(res));
        return;
      }
      setRow(await res.json());
    })();
  }, [id]);

  if (err) {
    return (
      <div className="p-6 max-w-lg space-y-4">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-[#0052FF] hover:underline">
          <ArrowLeft size={16} /> На главную
        </Link>
        <p className="text-sm text-red-600">{err}</p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="p-6 text-gray-500 flex items-center justify-center min-h-[30vh]">
        Загрузка…
      </div>
    );
  }

  const blocks = [
    row.score_block1,
    row.score_block2,
    row.score_block3,
    row.score_block4,
    row.score_block5,
  ];
  const dateLabel = new Date(row.survey_date).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="p-6 max-w-lg space-y-6">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-[#0052FF] hover:underline">
        <ArrowLeft size={16} /> На главную
      </Link>

      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <ClipboardList className="text-[#0052FF]" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Опрос</h1>
          <p className="text-sm text-gray-600 mt-0.5">{dateLabel}</p>
          <p className="text-xs text-gray-500 mt-1">
            Источник: {row.source === "ui" ? "интерфейс" : "импорт"}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm text-center">
        <div className="text-xs text-gray-500 uppercase tracking-wide">Итоговый ESSI</div>
        <div className="text-4xl font-bold text-[#0052FF] mt-1">{row.essi}</div>
        <p className="text-xs text-gray-500 mt-2">Процент от максимума по методике: сумма block sums / 125 × 100</p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80 text-left text-gray-600">
              <th className="px-4 py-2 font-medium">Блок</th>
              <th className="px-4 py-2 font-medium text-right">Сумма баллов</th>
              <th className="px-4 py-2 font-medium text-right">% от максимума по блоку</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {blocks.map((v, i) => (
              <tr key={i}>
                <td className="px-4 py-2.5 text-gray-900">{i + 1}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-800">{v}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-800">
                  {row.block_percentages[i]?.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
