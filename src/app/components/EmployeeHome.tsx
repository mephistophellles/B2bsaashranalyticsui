import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Lightbulb } from "lucide-react";
import { apiFetch } from "@/api/client";
import EmployeeTrustFAQ from "./EmployeeTrustFAQ";

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

type CampaignRow = {
  id: number;
  name: string;
  status: string;
  completed: boolean;
};

const PREVIEW_COUNT = 2;

export default function EmployeeHome() {
  const [data, setData] = useState<Summary | null>(null);
  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [allRecs, setAllRecs] = useState<Rec[]>([]);
  const [activeCampaigns, setActiveCampaigns] = useState<CampaignRow[]>([]);
  const [pastCampaigns, setPastCampaigns] = useState<CampaignRow[]>([]);

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
      if (res.ok) setAllRecs(await res.json());
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/me/campaigns?include_closed=true");
      if (!res.ok) return;
      const rows = (await res.json()) as CampaignRow[];
      setActiveCampaigns(rows.filter((c) => c.status === "active"));
      setPastCampaigns(rows.filter((c) => c.status === "closed"));
    })();
  }, []);

  if (!data) {
    return (
      <div className="p-6 text-gray-500">
        Идёт обработка данных. Это займёт несколько секунд.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 max-w-2xl">
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-4 text-sm text-blue-900">
        <p className="leading-relaxed">
          Здесь вы можете пройти диагностику, увидеть результат и понять, какие факторы влияют на вашу рабочую
          ситуацию. Результаты не являются оценкой личности.
        </p>
        <a href="#employee-faq" className="inline-block mt-2 font-medium underline">
          Подробнее о том, как работает ESSI
        </a>
      </div>
      <div className="rounded-2xl border border-green-100 bg-gradient-to-r from-green-50 to-emerald-50 px-4 py-3 text-sm text-green-900 space-y-2">
        <p className="leading-relaxed">
          Результаты помогают улучшить условия работы, снизить нагрузку и повысить стабильность.
        </p>
        <p className="leading-relaxed font-medium">
          Это безопасный инструмент обратной связи между сотрудниками и руководством.
        </p>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
        <p className="font-medium text-gray-900">Прозрачность данных</p>
        <p className="mt-1">
          Вы всегда можете перечитать юридические условия и понять, как применяются результаты диагностики в рабочем
          контуре.
        </p>
        <Link to="/consent" className="inline-block mt-2 text-[#0052FF] font-medium hover:underline">
          Открыть условия обработки данных
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold">Здравствуйте, {data.name}</h1>
        <p className="text-gray-600">{data.position}</p>
        <p className="text-gray-600">Отдел: {data.department}</p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-8 max-w-sm text-center shadow-sm">
        <div className="text-sm text-gray-500 mb-2">Ваш ESSI</div>
        <div className="text-5xl font-bold text-[#0052FF]">{Math.round(data.essi)}</div>
        <p className="text-xs text-gray-500 mt-2">
          ESSI показывает текущую устойчивость рабочего состояния по 5 блокам методики.
        </p>
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

      {activeCampaigns.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-800">Активные кампании</h2>
          <ul className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 text-sm shadow-sm">
            {activeCampaigns.map((c) => (
              <li key={c.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium text-gray-900">{c.name}</div>
                  <div className="text-xs text-gray-500">
                    {c.completed ? "Пройдено" : "Не пройдено"}
                  </div>
                </div>
                {!c.completed ? (
                  <Link
                    to={`/survey?campaign=${c.id}`}
                    className="text-sm font-semibold text-[#0052FF] hover:underline shrink-0"
                  >
                    Пройти
                  </Link>
                ) : (
                  <span className="text-xs text-green-700 font-medium shrink-0">Готово</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {pastCampaigns.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-800">Прошедшие кампании</h2>
          <ul className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 text-sm shadow-sm">
            {pastCampaigns.map((c) => (
              <li key={c.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium text-gray-900">{c.name}</div>
                  <div className="text-xs text-gray-500">
                    {c.completed ? "Была пройдена" : "Не пройдена"}
                  </div>
                </div>
                <span className="text-xs text-gray-500 font-medium shrink-0">Закрыта</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {allRecs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-800">Рекомендации для отдела</h2>
          <div className="space-y-3">
            {allRecs.slice(0, PREVIEW_COUNT).map((r) => (
              <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-sm">
                <div className="font-medium text-gray-900">{r.title}</div>
                <p className="text-gray-600 mt-1 line-clamp-3 leading-relaxed">{r.description}</p>
                <Link
                  to={`/my-recommendations/${r.id}`}
                  className="inline-block mt-2 text-sm font-medium text-[#0052FF] hover:underline"
                >
                  Подробнее
                </Link>
              </div>
            ))}
          </div>
          {allRecs.length > PREVIEW_COUNT && (
            <p className="text-sm text-gray-600">
              Всего рекомендаций: {allRecs.length}. На главной показаны первые {PREVIEW_COUNT}.{" "}
              <Link to="/my-recommendations" className="font-medium text-[#0052FF] hover:underline">
                Открыть полный список
              </Link>
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-800">Мои опросы</h2>
        {surveys.length === 0 ? (
          <p className="text-sm text-gray-500">Пока нет записей. Пройдите опрос выше.</p>
        ) : (
          <ul className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 text-sm shadow-sm">
            {surveys.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/my-surveys/${s.id}`}
                  className="px-4 py-3 flex justify-between gap-4 w-full text-left hover:bg-gray-50 focus-visible:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0052FF]/30 transition-colors"
                >
                  <span className="text-gray-900">{s.survey_date}</span>
                  <span className="text-gray-500 shrink-0">
                    {s.source === "ui" ? "В интерфейсе" : "Импорт"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <EmployeeTrustFAQ />
    </div>
  );
}
