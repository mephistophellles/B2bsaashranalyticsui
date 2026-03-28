import { FileText, Download, Calendar, TrendingUp, Users, Activity } from "lucide-react";
import { useState } from "react";

const reportsData = [
  {
    id: 1,
    title: "Ежемесячный отчет по ESSI",
    description: "Комплексный анализ индекса ESSI по всем отделам",
    type: "ESSI Analysis",
    lastGenerated: "15 Мар 2026",
    format: "PDF",
    size: "2.4 МБ",
    icon: Activity,
    color: "blue",
  },
  {
    id: 2,
    title: "Отчет по вовлеченности сотрудников",
    description: "Анализ уровня вовлеченности и удовлетворенности",
    type: "Engagement",
    lastGenerated: "10 Мар 2026",
    format: "PDF",
    size: "1.8 МБ",
    icon: Users,
    color: "green",
  },
  {
    id: 3,
    title: "Отчет по продуктивности",
    description: "Метрики продуктивности по отделам и сотрудникам",
    type: "Productivity",
    lastGenerated: "05 Мар 2026",
    format: "XLSX",
    size: "856 КБ",
    icon: TrendingUp,
    color: "purple",
  },
  {
    id: 4,
    title: "Квартальный отчет",
    description: "Итоги работы за квартал по всем показателям",
    type: "Quarterly",
    lastGenerated: "01 Мар 2026",
    format: "PDF",
    size: "4.2 МБ",
    icon: Calendar,
    color: "orange",
  },
  {
    id: 5,
    title: "Отчет по текучести кадров",
    description: "Анализ увольнений и удержания сотрудников",
    type: "Retention",
    lastGenerated: "20 Фев 2026",
    format: "PDF",
    size: "1.2 МБ",
    icon: Users,
    color: "red",
  },
  {
    id: 6,
    title: "Отчет по рекомендациям",
    description: "Статус выполнения рекомендаций ИИ",
    type: "Recommendations",
    lastGenerated: "12 Фев 2026",
    format: "PDF",
    size: "980 КБ",
    icon: FileText,
    color: "indigo",
  },
];

const reportTemplates = [
  {
    id: 1,
    name: "Еженедельный обзор",
    description: "Краткий обзор ключевых метрик за неделю",
  },
  {
    id: 2,
    name: "Ежемесячный анализ",
    description: "Детальный анализ всех показателей за месяц",
  },
  {
    id: 3,
    name: "Квартальный отчет",
    description: "Комплексный отчет с трендами и прогнозами",
  },
  {
    id: 4,
    name: "Индивидуальный отчет",
    description: "Персонализированный отчет по выбранным метрикам",
  },
];

export default function Reports() {
  const [selectedPeriod, setSelectedPeriod] = useState("month");

  const colorClasses: Record<string, { bg: string; text: string }> = {
    blue: { bg: "bg-blue-50", text: "text-blue-600" },
    green: { bg: "bg-green-50", text: "text-green-600" },
    purple: { bg: "bg-purple-50", text: "text-purple-600" },
    orange: { bg: "bg-orange-50", text: "text-orange-600" },
    red: { bg: "bg-red-50", text: "text-red-600" },
    indigo: { bg: "bg-indigo-50", text: "text-indigo-600" },
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Отчеты</h1>
        <p className="text-gray-600">
          Создавайте и скачивайте аналитические отчеты
        </p>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Создать новый отчет
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Период
            </label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0052FF] focus:border-transparent bg-white"
            >
              <option value="week">Последняя неделя</option>
              <option value="month">Последний месяц</option>
              <option value="quarter">Последний квартал</option>
              <option value="year">Последний год</option>
              <option value="custom">Выбрать даты</option>
            </select>
          </div>

          <div className="flex gap-3 pt-7">
            <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] text-white rounded-lg hover:shadow-lg transition-all font-medium">
              <FileText size={18} />
              <span>Создать отчет</span>
            </button>
            <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">
              <Calendar size={18} />
              <span>Запланировать</span>
            </button>
          </div>
        </div>
      </div>

      {/* Report Templates */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Шаблоны отчетов</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {reportTemplates.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer hover:border-[#0052FF]"
            >
              <div className="flex items-start gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#0052FF] to-[#4D7CFF] flex items-center justify-center flex-shrink-0">
                  <FileText className="text-white" size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-sm mb-1">
                    {template.name}
                  </h3>
                  <p className="text-xs text-gray-600">{template.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Reports */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Последние отчеты
        </h2>
        <div className="space-y-4">
          {reportsData.map((report) => {
            const IconComponent = report.icon;
            const colors = colorClasses[report.color];

            return (
              <div
                key={report.id}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center flex-shrink-0`}
                  >
                    <IconComponent className={colors.text} size={24} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {report.title}
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                          {report.description}
                        </p>
                      </div>
                      <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] text-white rounded-lg hover:shadow-lg transition-all font-medium text-sm">
                        <Download size={16} />
                        <span>Скачать</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Calendar size={14} />
                        {report.lastGenerated}
                      </span>
                      <span>•</span>
                      <span>{report.format}</span>
                      <span>•</span>
                      <span>{report.size}</span>
                      <span>•</span>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
                        {report.type}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Empty State for scheduled reports */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Запланированные отчеты
        </h2>
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Calendar className="mx-auto text-gray-400 mb-3" size={48} />
          <p className="text-gray-600 mb-1">
            У вас нет запланированных отчетов
          </p>
          <p className="text-sm text-gray-500">
            Настройте автоматическую генерацию отчетов по расписанию
          </p>
        </div>
      </div>
    </div>
  );
}
