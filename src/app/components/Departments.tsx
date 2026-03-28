import { Building2, Users, TrendingUp, TrendingDown, Award } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const departmentsData = [
  {
    id: "dept1",
    name: "Разработка",
    head: "София Лебедева",
    employees: 15,
    essi: 85,
    engagement: 88,
    productivity: 90,
    trend: "up",
    growth: "+5.2%",
    status: "excellent",
  },
  {
    id: "dept2",
    name: "Продажи",
    head: "Роман Соколов",
    employees: 10,
    essi: 78,
    engagement: 82,
    productivity: 76,
    trend: "stable",
    growth: "+1.2%",
    status: "good",
  },
  {
    id: "dept3",
    name: "Маркетинг",
    head: "Анна Смирнова",
    employees: 8,
    essi: 82,
    engagement: 86,
    productivity: 84,
    trend: "up",
    growth: "+3.8%",
    status: "excellent",
  },
  {
    id: "dept4",
    name: "HR",
    head: "Елена Волкова",
    employees: 6,
    essi: 80,
    engagement: 90,
    productivity: 82,
    trend: "up",
    growth: "+2.5%",
    status: "excellent",
  },
  {
    id: "dept5",
    name: "Финансы",
    head: "Артем Новиков",
    employees: 6,
    essi: 76,
    engagement: 74,
    productivity: 78,
    trend: "down",
    growth: "-1.8%",
    status: "needs-attention",
  },
];

const performanceTrendData = [
  { id: "m1", month: "Янв", Разработка: 80, Продажи: 75, Маркетинг: 79, HR: 78, Финансы: 78 },
  { id: "m2", month: "Фев", Разработка: 82, Продажи: 76, Маркетинг: 80, HR: 79, Финансы: 77 },
  { id: "m3", month: "Мар", Разработка: 83, Продажи: 77, Маркетинг: 81, HR: 79, Финансы: 76 },
  { id: "m4", month: "Апр", Разработка: 84, Продажи: 77, Маркетинг: 81, HR: 80, Финансы: 76 },
  { id: "m5", month: "Май", Разработка: 85, Продажи: 78, Маркетинг: 82, HR: 80, Финансы: 76 },
];

export default function Departments() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Отделы</h1>
        <p className="text-gray-600">
          Анализ производительности и динамики по отделам
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Building2 className="text-[#0052FF]" size={20} />
            </div>
            <div>
              <div className="text-sm text-gray-600">Всего отделов</div>
              <div className="text-2xl font-bold text-gray-900">
                {departmentsData.length}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <Users className="text-green-600" size={20} />
            </div>
            <div>
              <div className="text-sm text-gray-600">Всего сотрудников</div>
              <div className="text-2xl font-bold text-gray-900">
                {departmentsData.reduce((sum, dept) => sum + dept.employees, 0)}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
              <Award className="text-purple-600" size={20} />
            </div>
            <div>
              <div className="text-sm text-gray-600">Средний ESSI</div>
              <div className="text-2xl font-bold text-gray-900">
                {Math.round(
                  departmentsData.reduce((sum, dept) => sum + dept.essi, 0) /
                    departmentsData.length
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center">
              <TrendingUp className="text-yellow-600" size={20} />
            </div>
            <div>
              <div className="text-sm text-gray-600">Рост в среднем</div>
              <div className="text-2xl font-bold text-green-600">+2.2%</div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Trend Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Динамика производительности отделов
        </h2>
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={performanceTrendData}>
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
                key="line-dev"
                type="monotone"
                dataKey="Разработка"
                stroke="#0052FF"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                key="line-sales"
                type="monotone"
                dataKey="Продажи"
                stroke="#10B981"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                key="line-marketing"
                type="monotone"
                dataKey="Маркетинг"
                stroke="#8B5CF6"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                key="line-hr"
                type="monotone"
                dataKey="HR"
                stroke="#F59E0B"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                key="line-finance"
                type="monotone"
                dataKey="Финансы"
                stroke="#EF4444"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Departments Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {departmentsData.map((dept) => (
          <div
            key={dept.id}
            className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0052FF] to-[#4D7CFF] flex items-center justify-center">
                  <Building2 className="text-white" size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {dept.name}
                  </h3>
                  <p className="text-sm text-gray-600">
                    Руководитель: {dept.head}
                  </p>
                </div>
              </div>
              {dept.trend === "up" && (
                <div className="flex items-center gap-1 text-green-600">
                  <TrendingUp size={20} />
                  <span className="text-sm font-medium">{dept.growth}</span>
                </div>
              )}
              {dept.trend === "down" && (
                <div className="flex items-center gap-1 text-red-600">
                  <TrendingDown size={20} />
                  <span className="text-sm font-medium">{dept.growth}</span>
                </div>
              )}
              {dept.trend === "stable" && (
                <div className="flex items-center gap-1 text-gray-500">
                  <div className="w-5 h-0.5 bg-gray-400"></div>
                  <span className="text-sm font-medium">{dept.growth}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-4 gap-4 mb-4">
              <div>
                <div className="text-xs text-gray-600 mb-1">Сотрудники</div>
                <div className="text-lg font-bold text-gray-900">
                  {dept.employees}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">ESSI</div>
                <div
                  className={`text-lg font-bold ${
                    dept.essi >= 85
                      ? "text-green-600"
                      : dept.essi >= 75
                      ? "text-yellow-600"
                      : "text-red-600"
                  }`}
                >
                  {dept.essi}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">Вовлеченность</div>
                <div className="text-lg font-bold text-gray-900">
                  {dept.engagement}%
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">Продуктивность</div>
                <div className="text-lg font-bold text-gray-900">
                  {dept.productivity}%
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                  dept.status === "excellent"
                    ? "bg-green-100 text-green-700"
                    : dept.status === "good"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {dept.status === "excellent"
                  ? "Отлично"
                  : dept.status === "good"
                  ? "Хорошо"
                  : "Требует внимания"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
