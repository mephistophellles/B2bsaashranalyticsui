import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Lightbulb } from "lucide-react";
import { apiFetch } from "@/api/client";

type Summary = {
  name: string;
  department: string;
  essi: number;
  position: string | null;
};

type SurveyRow = {
  id: number;
  survey_date: string;
  source: string;
};

type Rec = { id: number; title: string; description: string; priority: string };

export default function EmployeeHome() {
  const [data, setData] = useState<Summary | null>(null);
  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [recs, setRecs] = useState<Rec[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/me/summary");
      if (res.ok) setData(await res.json());
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/me/surveys");
      if (res.ok) setSurveys(await res.json());
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/me/recommendations");
      if (res.ok) {
        const j = (await res.json()) as Rec[];
        setRecs(j.slice(0, 2));
      }
    })();
  }, []);

  if (!data) {
    return <div className="p-6 text-gray-500">Загрузка профиля…</div>;
  }

  return (
    <div className="p-6 space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Здравствуйте, {data.name}</h1>
        <p className="text-gray-600">{data.position}</p>
        <p className="text-gray-600">Отдел: {data.department}</p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-8 max-w-sm text-center shadow-sm">
        <div className="text-sm text-gray-500 mb-2">Ваш ESSI</div>
        <div className="text-5xl font-bold text-[#0052FF]">{Math.round(data.essi)}</div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/survey"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-2xl font-semibold text-white bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] shadow-md"
        >
          Пройти опрос
        </Link>
        <Link
          to="/my-recommendations"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl font-semibold border-2 border-[#0052FF] text-[#0052FF] hover:bg-blue-50"
        >
          <Lightbulb size={18} />
          Все рекомендации
        </Link>
      </div>

      {recs.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-800">Рекомендации для отдела</h2>
          <div className="space-y-2">
            {recs.map((r) => (
              <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-sm">
                <div className="font-medium text-gray-900">{r.title}</div>
                <p className="text-gray-600 mt-1 line-clamp-2">{r.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-800">Мои опросы</h2>
        {surveys.length === 0 ? (
          <p className="text-sm text-gray-500">Пока нет записей. Пройдите опрос выше.</p>
        ) : (
          <ul className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 text-sm shadow-sm">
            {surveys.map((s) => (
              <li key={s.id} className="px-4 py-3 flex justify-between gap-4">
                <span>{s.survey_date}</span>
                <span className="text-gray-500">{s.source === "ui" ? "В интерфейсе" : "Импорт"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
