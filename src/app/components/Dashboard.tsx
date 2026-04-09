import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  TrendingUp,
  TrendingDown,
  Users,
  AlertTriangle,
  Activity,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ReferenceDot,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { apiFetch } from "@/api/client";

type DashboardPayload = {
  essi_index: number;
  essi_delta_pct: number;
  engagement_pct: number;
  engagement_delta_pct: number;
  risk_level: string;
  risk_crisis_count: number;
  risk_zone_count: number;
  risk_at_risk_total: number;
  risk_indexed_employees: number;
  risk_employees_delta_pct: number | null;
  productivity_pct: number;
  productivity_delta_pct: number;
  essi_series: { id: string; month: string; value: number }[];
  essi_blocks: {
    block_index: number;
    title: string;
    value: number;
    interpretation: string;
    action_hint: string;
  }[];
  block_percentages: { block_index: number; title: string; value: number }[];
  department_bars: { id: string; department: string; essi: number }[];
  recent_employees: {
    id: string;
    name: string;
    department: string;
    essi: number;
    trend: string;
    status: string;
  }[];
  recommendations_preview: {
    id: string;
    title: string;
    description: string;
    priority: string;
    status: string;
  }[];
};
type EventPoint = {
  id: number;
  event_date: string;
  event_type: string;
  title: string;
  description: string | null;
  level: "organization" | "department";
  department_id: number | null;
};

function parseDepartmentId(rawId: string): number | null {
  const numeric = Number(rawId);
  if (Number.isInteger(numeric) && numeric > 0) return numeric;
  const match = rawId.match(/(\d+)$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState(6);
  const [events, setEvents] = useState<EventPoint[]>([]);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [essiBreakdownOpen, setEssiBreakdownOpen] = useState(false);
  const [engagementOpen, setEngagementOpen] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
  const [productivityOpen, setProductivityOpen] = useState(false);
  const periodRef = useRef<HTMLDivElement>(null);

  function renderTrend(trend: string) {
    if (trend === "up") return <TrendingUp className="text-green-600" size={18} />;
    if (trend === "down") return <TrendingDown className="text-red-600" size={18} />;
    if (trend === "stable") return <div className="w-4 h-0.5 bg-gray-400" title="Стабильно" />;
    return <span className="text-xs text-gray-400">нет данных</span>;
  }

  useEffect(() => {
    void (async () => {
      setError(null);
      const res = await apiFetch(`/reports/dashboard?months=${months}`);
      if (!res.ok) {
        setError("Произошла ошибка. Попробуйте повторить действие.");
        setData(null);
        return;
      }
      setData(await res.json());
      const eventsRes = await apiFetch(`/reports/events?months=${months}`);
      if (eventsRes.ok) {
        const rows = (await eventsRes.json()) as EventPoint[];
        setEvents(rows);
      } else {
        setEvents([]);
      }
    })();
  }, [months]);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!periodRef.current?.contains(event.target as Node)) {
        setPeriodOpen(false);
      }
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  if (error) {
    return <div className="p-6 text-red-600">{error}</div>;
  }
  if (!data) {
    return (
      <div className="p-6 text-gray-500 flex items-center justify-center min-h-[40vh]">
        Идёт обработка данных. Это займёт несколько секунд.
      </div>
    );
  }

  const essiData = data.essi_series;
  const departmentData = data.department_bars
    .map((item) => ({
      ...item,
      departmentId: parseDepartmentId(item.id),
    }));
  const recentEmployees = data.recent_employees;
  const recommendations = data.recommendations_preview;
  const blockMetrics = data.essi_blocks ?? [];
  const blockPercentages = data.block_percentages ?? [];
  const strongestBlocks = [...blockPercentages].sort((a, b) => b.value - a.value).slice(0, 2);
  const weakestBlocks = [...blockPercentages].sort((a, b) => a.value - b.value).slice(0, 2);
  const sparseData =
    data.department_bars.length === 0 && data.recent_employees.length === 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center shadow-sm">
            <Activity className="text-[#0052FF]" size={26} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Главная</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={periodRef}>
            <button
              type="button"
              className="text-sm text-gray-700 flex items-center gap-2 border border-gray-300 rounded-xl px-3 py-2 bg-white hover:border-[#0052FF]"
              onClick={() => setPeriodOpen((x) => !x)}
            >
              Период ESSI: <span className="font-medium">{months} мес.</span>
            </button>
            {periodOpen && (
              <div className="absolute right-0 mt-1 w-36 rounded-xl border border-gray-200 bg-white shadow-lg z-20 py-1">
                {[3, 6, 12, 24].map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${months === m ? "text-[#0052FF] font-medium" : "text-gray-700"}`}
                    onClick={() => {
                      setMonths(m);
                      setPeriodOpen(false);
                    }}
                  >
                    {m} мес.
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {sparseData && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 shadow-sm space-y-2 leading-relaxed">
          <p>
            <strong className="font-semibold">Мало данных.</strong> Данные появятся после прохождения диагностики. Вы
            сможете увидеть состояние команды, причины изменений и рекомендации.
          </p>
          <p>
            Для демо выполните{" "}
            <code className="text-xs bg-white/80 px-1.5 py-0.5 rounded border border-amber-200">
              python -m scripts.seed
            </code>{" "}
            в каталоге backend или загрузите CSV на странице «Отчёты».
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          role="button"
          tabIndex={0}
          className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
          title="Индекс отражает текущее состояние команды и помогает выявить зоны риска и точки роста. Нажмите для расшифровки."
          onClick={() => { setEssiBreakdownOpen((v) => !v); setEngagementOpen(false); setRiskOpen(false); setProductivityOpen(false); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { setEssiBreakdownOpen((v) => !v); setEngagementOpen(false); setRiskOpen(false); setProductivityOpen(false); }
          }}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-sm text-gray-600 mb-1">Индекс ESSI</div>
              <div className="text-3xl font-bold text-gray-900">{data.essi_index}</div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Activity className="text-[#0052FF]" size={20} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-green-600">
              <TrendingUp size={16} />
              <span className="text-sm font-medium">{data.essi_delta_pct > 0 ? "+" : ""}
                {data.essi_delta_pct}%</span>
            </div>
            <span className="text-xs text-gray-500">к прошлому периоду</span>
          </div>
          <div className="mt-3" style={{ height: 48 }}>
            <ResponsiveContainer width="100%" height={48}>
              <AreaChart data={essiData}>
                <defs>
                  <linearGradient id="essiSparklineGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0052FF" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#0052FF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#0052FF"
                  strokeWidth={2}
                  fill="url(#essiSparklineGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
          title="Степень включённости работников в деятельность организации. Нажмите для подробностей."
          onClick={() => { setEngagementOpen((v) => !v); setEssiBreakdownOpen(false); setRiskOpen(false); setProductivityOpen(false); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { setEngagementOpen((v) => !v); setEssiBreakdownOpen(false); setRiskOpen(false); setProductivityOpen(false); }
          }}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-sm text-gray-600 mb-1">Вовлеченность</div>
              <div className="text-3xl font-bold text-gray-900">{data.engagement_pct}%</div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <Users className="text-green-600" size={20} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1 ${
                data.engagement_delta_pct >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {data.engagement_delta_pct >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              <span className="text-sm font-medium">
                {data.engagement_delta_pct > 0 ? "+" : ""}
                {data.engagement_delta_pct}%
              </span>
            </div>
            <span className="text-xs text-gray-500">к прошлому периоду</span>
          </div>
          <div className="mt-3" style={{ height: 48 }}>
            <ResponsiveContainer width="100%" height={48}>
              <AreaChart data={essiData.map((d) => ({ ...d, value: d.value - 5 }))}>
                <defs>
                  <linearGradient id="engagementSparklineGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#10B981"
                  strokeWidth={2}
                  fill="url(#engagementSparklineGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
          title="Сотрудники, состояние которых требует дополнительного внимания. Нажмите для подробностей."
          onClick={() => { setRiskOpen((v) => !v); setEssiBreakdownOpen(false); setEngagementOpen(false); setProductivityOpen(false); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { setRiskOpen((v) => !v); setEssiBreakdownOpen(false); setEngagementOpen(false); setProductivityOpen(false); }
          }}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-sm text-gray-600 mb-1">Уровень риска</div>
              <div className="text-3xl font-bold text-gray-900">{data.risk_level}</div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center">
              <AlertTriangle className="text-yellow-600" size={20} />
            </div>
          </div>
          <p className="text-sm text-gray-700 leading-snug">
            <span className="font-semibold text-gray-900">{data.risk_at_risk_total}</span> в зоне
            риска по методике
            {data.risk_indexed_employees > 0 && (
              <>
                {" "}
                из <span className="font-medium">{data.risk_indexed_employees}</span> с индексом
              </>
            )}
            .
          </p>
          {data.risk_employees_delta_pct != null && (
            <p className="text-xs text-gray-500 mt-1">
              Изменение к прошлому периоду: {data.risk_employees_delta_pct > 0 ? "+" : ""}
              {data.risk_employees_delta_pct}%
            </p>
          )}
        </div>

        <div
          role="button"
          tabIndex={0}
          className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
          title="Модельный показатель продуктивности на основе ESSI. Нажмите для подробностей."
          onClick={() => { setProductivityOpen((v) => !v); setEssiBreakdownOpen(false); setEngagementOpen(false); setRiskOpen(false); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { setProductivityOpen((v) => !v); setEssiBreakdownOpen(false); setEngagementOpen(false); setRiskOpen(false); }
          }}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-sm text-gray-600 mb-1">Продуктивность (модель)</div>
              <div className="text-3xl font-bold text-gray-900">{data.productivity_pct}%</div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
              <Activity className="text-purple-600" size={20} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1 ${
                data.productivity_delta_pct >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {data.productivity_delta_pct >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              <span className="text-sm font-medium">
                {data.productivity_delta_pct > 0 ? "+" : ""}
                {data.productivity_delta_pct}%
              </span>
            </div>
            <span className="text-xs text-gray-500">к прошлому периоду (модель)</span>
          </div>
          <div className="mt-3" style={{ height: 48 }}>
            <ResponsiveContainer width="100%" height={48}>
              <AreaChart data={essiData.map((d) => ({ ...d, value: d.value + 10 }))}>
                <defs>
                  <linearGradient id="productivitySparklineGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#8B5CF6"
                  strokeWidth={2}
                  fill="url(#productivitySparklineGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {engagementOpen && (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Вовлечённость: что измеряется</h2>
        <p className="text-sm text-gray-600 mb-4">
          Вовлечённость отражает <strong>степень включённости работников</strong> в деятельность организации
          (Блок 3 методики ESSI — «Трудовая мотивация и вовлечённость»). Показатель формируется на основе
          пяти диагностических утверждений.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-4">
          {[
            { idx: 1, text: "Понимание влияния своей работы на общий успех организации" },
            { idx: 2, text: "Интерес к профессиональной деятельности" },
            { idx: 3, text: "Готовность к дополнительным усилиям ради общего результата" },
            { idx: 4, text: "Ощущение смысла и значимости своей работы" },
            { idx: 5, text: "Генерация идей по улучшению работы организации" },
          ].map((item) => (
            <div key={item.idx} className="rounded-xl border border-gray-200 px-3 py-3">
              <div className="text-xs text-gray-500">Утверждение {item.idx}</div>
              <div className="text-sm text-gray-900 mt-1 leading-relaxed">{item.text}</div>
            </div>
          ))}
        </div>
        <div className={`rounded-xl border px-4 py-3 ${
          data.engagement_pct >= 80
            ? "border-green-200 bg-green-50/60"
            : data.engagement_pct >= 60
              ? "border-gray-200 bg-gray-50/60"
              : "border-amber-200 bg-amber-50/60"
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5 ${
              data.engagement_pct >= 80
                ? "text-green-700 bg-green-100"
                : data.engagement_pct >= 60
                  ? "text-gray-700 bg-gray-200"
                  : "text-amber-700 bg-amber-100"
            }`}>
              {data.engagement_pct >= 80 ? "Высокая вовлечённость" : data.engagement_pct >= 60 ? "Удовлетворительно" : "Зона внимания"}
            </span>
            <span className="text-sm font-bold text-gray-900">{data.engagement_pct}%</span>
          </div>
          <p className="text-xs text-gray-700 leading-relaxed">
            {data.engagement_pct >= 80
              ? "Сотрудники видят смысл своей работы, включены в процессы и готовы прилагать дополнительные усилия. Поддерживайте практики признания и обратной связи."
              : data.engagement_pct >= 60
                ? "Вовлечённость на приемлемом уровне, но есть потенциал роста. Обратите внимание на прозрачность целей и возможности для инициативы."
                : "Вовлечённость ниже ожидаемого. Рекомендуется проверить, ощущают ли сотрудники значимость своей работы и имеют ли возможность влиять на процессы."}
          </p>
        </div>
      </div>
      )}

      {riskOpen && (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Уровень риска: интерпретация</h2>
        <p className="text-sm text-gray-600 mb-4">
          Уровень риска определяется на основе интегрального индекса ESSI каждого сотрудника.
          Методика выделяет зоны состояния, которые позволяют выявлять сотрудников, чьё положение
          в трудовой среде требует внимания руководства.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
          <div className="rounded-xl border border-red-200 bg-red-50/50 px-3 py-3">
            <div className="text-xs text-red-600 font-medium">Кризис</div>
            <div className="text-lg font-bold text-red-700 mt-1">ESSI &lt; 40</div>
            <div className="text-xs text-red-800 mt-1.5 leading-relaxed">
              Критическое снижение устойчивости. Высокий риск потери работоспособности, увольнения. Требуются срочные меры.
            </div>
            <div className="mt-2 text-sm font-semibold text-red-900">{data.risk_crisis_count} чел.</div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-3">
            <div className="text-xs text-amber-600 font-medium">Зона риска</div>
            <div className="text-lg font-bold text-amber-700 mt-1">ESSI 40–60</div>
            <div className="text-xs text-amber-800 mt-1.5 leading-relaxed">
              Социальная устойчивость под угрозой. Факторы среды ограничивают реализацию потенциала. Необходим мониторинг.
            </div>
            <div className="mt-2 text-sm font-semibold text-amber-900">{data.risk_zone_count} чел.</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50/50 px-3 py-3">
            <div className="text-xs text-gray-600 font-medium">Удовлетворительно</div>
            <div className="text-lg font-bold text-gray-700 mt-1">ESSI 60–80</div>
            <div className="text-xs text-gray-700 mt-1.5 leading-relaxed">
              Приемлемый уровень устойчивости. Есть потенциал улучшения через точечные изменения условий.
            </div>
            <div className="mt-2 text-sm font-semibold text-gray-900">
              {Math.max(0, data.risk_indexed_employees - data.risk_at_risk_total - (data.risk_indexed_employees > 0 ? 0 : 0))} чел.
            </div>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50/50 px-3 py-3">
            <div className="text-xs text-green-600 font-medium">Высокая устойчивость</div>
            <div className="text-lg font-bold text-green-700 mt-1">ESSI ≥ 80</div>
            <div className="text-xs text-green-800 mt-1.5 leading-relaxed">
              Условия среды способствуют раскрытию человеческого потенциала. Практики стоит сохранять и масштабировать.
            </div>
          </div>
        </div>
        <div className={`rounded-xl border px-4 py-3 ${
          data.risk_at_risk_total === 0
            ? "border-green-200 bg-green-50/60"
            : data.risk_at_risk_total <= 2
              ? "border-amber-200 bg-amber-50/60"
              : "border-red-200 bg-red-50/60"
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5 ${
              data.risk_at_risk_total === 0
                ? "text-green-700 bg-green-100"
                : data.risk_at_risk_total <= 2
                  ? "text-amber-700 bg-amber-100"
                  : "text-red-700 bg-red-100"
            }`}>
              {data.risk_at_risk_total === 0 ? "Нет сотрудников в риске" : `${data.risk_at_risk_total} в зоне риска`}
            </span>
            {data.risk_indexed_employees > 0 && (
              <span className="text-xs text-gray-500">из {data.risk_indexed_employees} с индексом</span>
            )}
          </div>
          <p className="text-xs text-gray-700 leading-relaxed">
            {data.risk_at_risk_total === 0
              ? "Все сотрудники с рассчитанным индексом находятся выше порога риска. Продолжайте поддерживать текущие условия труда и социальную среду."
              : data.risk_crisis_count > 0
                ? "Есть сотрудники в кризисной зоне (ESSI < 40). Рекомендуется оперативно выявить факторы снижения и принять меры — именно здесь формируются основные потери продуктивности и риски текучести."
                : "Сотрудники в зоне риска (ESSI 40–60) требуют внимания. Проведите анализ по блокам методики, чтобы определить, какие факторы ограничивают устойчивость."}
          </p>
        </div>
      </div>
      )}

      {productivityOpen && (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Продуктивность: как рассчитывается</h2>
        <p className="text-sm text-gray-600 mb-4">
          Показатель продуктивности — <strong>модельная оценка</strong>, производная от динамики ESSI.
          Отдельный опрос продуктивности не проводится. Значение формируется как среднее ESSI за период
          с поправкой +10 п.п. (максимум 100%).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl border border-gray-200 px-3 py-3">
            <div className="text-xs text-gray-500">Источник данных</div>
            <div className="text-sm text-gray-900 mt-1 leading-relaxed">
              Интегральный индекс ESSI по всем 5 блокам методики за выбранный период
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 px-3 py-3">
            <div className="text-xs text-gray-500">Формула</div>
            <div className="text-sm text-gray-900 mt-1 leading-relaxed">
              Среднее ESSI за период + 10 п.п., ограничено 100%
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 px-3 py-3">
            <div className="text-xs text-gray-500">Экономический смысл</div>
            <div className="text-sm text-gray-900 mt-1 leading-relaxed">
              Потери продуктивности: (1 − ESSI/100) × ФОТ × k, где k = 1,5–2,0
            </div>
          </div>
        </div>
        <div className={`rounded-xl border px-4 py-3 ${
          data.productivity_pct >= 85
            ? "border-green-200 bg-green-50/60"
            : data.productivity_pct >= 70
              ? "border-gray-200 bg-gray-50/60"
              : "border-amber-200 bg-amber-50/60"
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5 ${
              data.productivity_pct >= 85
                ? "text-green-700 bg-green-100"
                : data.productivity_pct >= 70
                  ? "text-gray-700 bg-gray-200"
                  : "text-amber-700 bg-amber-100"
            }`}>
              {data.productivity_pct >= 85 ? "Высокая продуктивность" : data.productivity_pct >= 70 ? "Умеренная" : "Ниже ожидаемого"}
            </span>
            <span className="text-sm font-bold text-gray-900">{data.productivity_pct}%</span>
          </div>
          <p className="text-xs text-gray-700 leading-relaxed">
            {data.productivity_pct >= 85
              ? "Условия организации способствуют высокой реализации человеческого потенциала. Потери от снижения продуктивности минимальны."
              : data.productivity_pct >= 70
                ? "Продуктивность на приемлемом уровне. Улучшение условий по слабым блокам ESSI может повысить показатель."
                : "Значительная часть потенциала не реализуется. Рекомендуется проанализировать блоки ESSI и выявить ограничивающие факторы."}
          </p>
        </div>
      </div>
      )}

      {essiBreakdownOpen && (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Расшифровка ESSI</h2>
        <p className="text-sm text-gray-600 mb-4">
          <strong>ESSI</strong> — Employee Social Sustainability Index (Индекс социальной устойчивости работника) —
          интегральная характеристика состояния работника в трудовой среде, отражающая способность сохранять
          и реализовывать человеческий потенциал в условиях организации. Состоит из 5 блоков методики.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          {blockMetrics.map((b) => {
            const isStrong = strongestBlocks.some((s) => s.block_index === b.block_index);
            const isWeak = weakestBlocks.some((w) => w.block_index === b.block_index);
            return (
              <div
                key={b.block_index}
                className={`rounded-xl border px-3 py-3 ${
                  isStrong
                    ? "border-green-200 bg-green-50/50"
                    : isWeak
                      ? "border-amber-200 bg-amber-50/50"
                      : "border-gray-200"
                }`}
                title={`Что это: ${b.title}. Зачем: понимать источник динамики ESSI. Что делать: ${b.action_hint}`}
              >
                <div className="text-xs text-gray-500">Блок {b.block_index}</div>
                <div className="text-sm font-medium text-gray-900 line-clamp-2">{b.title}</div>
                <div className="text-xl font-bold text-[#0052FF] mt-2">{b.value.toFixed(1)}</div>
                {isStrong && (
                  <>
                    <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 rounded-full px-2 py-0.5">
                      Сильная сторона
                    </div>
                    <div className="text-xs text-green-800 mt-1.5 leading-relaxed">
                      {b.block_index === 1 && "Условия труда способствуют сохранению баланса и работоспособности."}
                      {b.block_index === 2 && "Коллектив поддерживает доброжелательную атмосферу и открытый диалог."}
                      {b.block_index === 3 && "Сотрудники включены в деятельность и видят смысл своей работы."}
                      {b.block_index === 4 && "Система вознаграждения воспринимается как справедливая и прозрачная."}
                      {b.block_index === 5 && "Сотрудники чувствуют себя энергичными, стресс не носит критического характера."}
                    </div>
                  </>
                )}
                {isWeak && (
                  <>
                    <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
                      Зона внимания
                    </div>
                    <div className="text-xs text-amber-800 mt-1.5 leading-relaxed">
                      {b.block_index === 1 && "Обратите внимание на нагрузку, ресурсы и баланс работы и личной жизни."}
                      {b.block_index === 2 && "Возможны трудности в коммуникации или конструктивном решении конфликтов."}
                      {b.block_index === 3 && "Стоит усилить вовлечённость: обратная связь, значимость результатов."}
                      {b.block_index === 4 && "Пересмотрите прозрачность поощрений и качество обратной связи."}
                      {b.block_index === 5 && "Риск переутомления или выгорания — проверьте нагрузку и условия."}
                    </div>
                  </>
                )}
                {!isStrong && !isWeak && (
                  <div className="text-xs text-gray-500 mt-1">{b.interpretation}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Динамика ESSI</h2>
          {essiData.length === 0 ? (
            <p className="text-sm text-gray-500">
              Данные появятся после прохождения диагностики. Вы сможете увидеть состояние команды, причины изменений и
              рекомендации.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={essiData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="month" stroke="#6B7280" fontSize={12} />
                <YAxis stroke="#6B7280" fontSize={12} />
                <Tooltip
                  cursor={{ fill: "transparent" }}
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #E5E7EB",
                    borderRadius: "8px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#0052FF"
                  strokeWidth={3}
                  dot={{ fill: "#0052FF", r: 4 }}
                  activeDot={{ r: 6 }}
                />
                {events.map((ev) => {
                  const monthKey = ev.event_date.slice(0, 7);
                  const point = essiData.find((p) => p.id === monthKey);
                  if (!point) return null;
                  return (
                    <ReferenceDot
                      key={ev.id}
                      x={point.month}
                      y={point.value}
                      r={5}
                      fill="#F59E0B"
                      stroke="#B45309"
                      label={{
                        value: "E",
                        position: "top",
                        fill: "#92400E",
                        fontSize: 10,
                      }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
          {essiData.length > 0 && (
            <p className="text-xs text-gray-500 mt-3 leading-relaxed">
              График показывает изменение показателя во времени и позволяет отслеживать динамику и эффект действий.
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Ключевые сигналы</h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <span className="text-gray-600">Изменение ESSI</span>
              <span className={`font-semibold ${data.essi_delta_pct >= 0 ? "text-green-600" : "text-red-600"}`}>
                {data.essi_delta_pct > 0 ? "+" : ""}
                {data.essi_delta_pct}%
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <span className="text-gray-600">Сотрудники в риске</span>
              <span className="font-semibold text-gray-900">{data.risk_at_risk_total}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <span className="text-gray-600">События за период</span>
              <span className="font-semibold text-gray-900">{events.length}</span>
            </div>
          </div>
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Последние события</div>
            {events.length === 0 ? (
              <p className="text-sm text-gray-500">Нет событий за выбранный период.</p>
            ) : (
              <div className="space-y-2">
                {events.slice(0, 3).map((ev) => (
                  <div key={ev.id} className="text-xs text-gray-600" title={ev.description ?? ""}>
                    <span className="font-medium">{ev.event_date}</span> · {ev.title}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-3">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Сравнение отделов</h2>
          {departmentData.length === 0 ? (
            <p className="text-sm text-gray-500 leading-relaxed">
              Данные появятся после прохождения диагностики. Вы сможете увидеть состояние команды, причины изменений и
              рекомендации.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={departmentData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="department" stroke="#6B7280" fontSize={12} />
                <YAxis stroke="#6B7280" fontSize={12} />
                <Tooltip
                  cursor={{ fill: "transparent" }}
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #E5E7EB",
                    borderRadius: "8px",
                  }}
                />
                <Bar
                  dataKey="essi"
                  fill="#0052FF"
                  activeBar={{ fill: "#4D7CFF" }}
                  radius={[8, 8, 0, 0]}
                  cursor="pointer"
                  onClick={(barData) => {
                    const departmentId = barData?.payload?.departmentId;
                    if (typeof departmentId === "number") {
                      navigate(`/departments/${departmentId}`);
                    }
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
          {departmentData.length > 0 && (
            <p className="text-xs text-gray-500 mt-3 leading-relaxed">
              Диаграмма сравнивает ESSI по отделам и помогает увидеть различия и приоритеты действий.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Последние обновления</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Имя</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Отдел</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">ESSI</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Статус</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Тренд</th>
                </tr>
              </thead>
              <tbody>
                {recentEmployees.length === 0 && (
                  <tr>
                    <td className="py-5 px-4 text-sm text-gray-500" colSpan={5}>
                      Данные появятся после прохождения диагностики. Вы сможете увидеть состояние команды, причины
                      изменений и рекомендации.
                    </td>
                  </tr>
                )}
                {recentEmployees.map((employee) => (
                  <tr
                    key={employee.id}
                    role="link"
                    tabIndex={0}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/employees/${employee.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ")
                        navigate(`/employees/${employee.id}`);
                    }}
                  >
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">{employee.name}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{employee.department}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium ${
                          employee.essi >= 80
                            ? "bg-green-100 text-green-700"
                            : employee.essi >= 60
                              ? "bg-yellow-100 text-yellow-700"
                              : employee.essi >= 40
                                ? "bg-orange-100 text-orange-800"
                                : "bg-red-100 text-red-700"
                        }`}
                      >
                        {employee.essi}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{employee.status}</td>
                    <td className="py-3 px-4">{renderTrend(employee.trend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Рекомендации ИИ</h2>
          <div className="space-y-3">
            {recommendations.length === 0 && (
              <p className="text-sm text-gray-500 leading-relaxed">
                Данные появятся после прохождения диагностики. Вы сможете увидеть состояние команды, причины изменений
                и рекомендации.
              </p>
            )}
            {recommendations.map((rec) => (
              <Link
                key={rec.id}
                to="/recommendations"
                className="block p-4 border border-gray-200 rounded-lg hover:border-[#0052FF] transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-medium text-gray-900 text-sm">{rec.title}</h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      rec.priority === "high"
                        ? "bg-red-100 text-red-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {rec.status}
                  </span>
                </div>
                <p className="text-xs text-gray-600">{rec.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
