import { useEffect, useState } from "react";
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
  risk_employees_delta_pct: number;
  productivity_pct: number;
  productivity_delta_pct: number;
  essi_series: { id: string; month: string; value: number }[];
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

export default function Dashboard() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/reports/dashboard");
      if (!res.ok) {
        setError("Не удалось загрузить дашборд");
        return;
      }
      setData(await res.json());
    })();
  }, []);

  if (error) {
    return <div className="p-6 text-red-600">{error}</div>;
  }
  if (!data) {
    return (
      <div className="p-6 text-gray-500 flex items-center justify-center min-h-[40vh]">
        Загрузка…
      </div>
    );
  }

  const essiData = data.essi_series;
  const departmentData = data.department_bars;
  const recentEmployees = data.recent_employees;
  const recommendations = data.recommendations_preview;
  const sparseData =
    data.department_bars.length === 0 && data.recent_employees.length === 0;

  return (
    <div className="p-6 space-y-6">
      {sparseData && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 shadow-sm">
          <strong className="font-semibold">Мало данных.</strong> Выполните{" "}
          <code className="text-xs bg-white/80 px-1.5 py-0.5 rounded border border-amber-200">
            python -m scripts.seed
          </code>{" "}
          в каталоге backend или загрузите CSV на странице «Отчёты».
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
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

        <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
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
            <div className="flex items-center gap-1 text-green-600">
              <TrendingUp size={16} />
              <span className="text-sm font-medium">+{data.engagement_delta_pct}%</span>
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

        <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-sm text-gray-600 mb-1">Уровень риска</div>
              <div className="text-3xl font-bold text-gray-900">{data.risk_level}</div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center">
              <AlertTriangle className="text-yellow-600" size={20} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-green-600">
              <TrendingDown size={16} />
              <span className="text-sm font-medium">{data.risk_employees_delta_pct}%</span>
            </div>
            <span className="text-xs text-gray-500">сотрудников в зоне риска</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-sm text-gray-600 mb-1">Продуктивность</div>
              <div className="text-3xl font-bold text-gray-900">{data.productivity_pct}%</div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
              <Activity className="text-purple-600" size={20} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-green-600">
              <TrendingUp size={16} />
              <span className="text-sm font-medium">+{data.productivity_delta_pct}%</span>
            </div>
            <span className="text-xs text-gray-500">к прошлому периоду</span>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Динамика ESSI</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={essiData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="month" stroke="#6B7280" fontSize={12} />
              <YAxis stroke="#6B7280" fontSize={12} />
              <Tooltip
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
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Сравнение отделов</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={departmentData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="department" stroke="#6B7280" fontSize={12} />
              <YAxis stroke="#6B7280" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #E5E7EB",
                  borderRadius: "8px",
                }}
              />
              <Bar dataKey="essi" fill="#0052FF" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
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
                {recentEmployees.map((employee) => (
                  <tr
                    key={employee.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">{employee.name}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{employee.department}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium ${
                          employee.essi >= 85
                            ? "bg-green-100 text-green-700"
                            : employee.essi >= 70
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {employee.essi}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{employee.status}</td>
                    <td className="py-3 px-4">
                      {employee.trend === "up" && (
                        <TrendingUp className="text-green-600" size={18} />
                      )}
                      {employee.trend === "down" && (
                        <TrendingDown className="text-red-600" size={18} />
                      )}
                      {employee.trend === "stable" && (
                        <div className="w-4 h-0.5 bg-gray-400" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Рекомендации ИИ</h2>
          <div className="space-y-3">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className="p-4 border border-gray-200 rounded-lg hover:border-[#0052FF] transition-colors cursor-pointer"
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
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
