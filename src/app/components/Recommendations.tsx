import { Lightbulb, Clock, CheckCircle2, AlertCircle, Users, TrendingUp } from "lucide-react";

const recommendations = [
  {
    id: 1,
    title: "Внедрение тимбилдинга",
    description:
      "Команда разработки показывает признаки снижения уровня взаимодействия. Рекомендуем организовать ежеквартальные мероприятия и межфункциональные воркшопы для улучшения командной динамики и коммуникации.",
    category: "Командное взаимодействие",
    priority: "high",
    status: "new",
    affectedEmployees: 12,
    estimatedImpact: "+8% ESSI",
    timeframe: "2-4 недели",
    insights: [
      "3 инженера сообщили об ощущении изоляции",
      "Показатели сотрудничества упали на 15% в этом квартале",
      "Удаленная работа влияет на сплоченность команды",
    ],
  },
  {
    id: 2,
    title: "План развития карьеры для лучших сотрудников",
    description:
      "Три сотрудника (Сара Иванова, София Лебедева, Елена Волкова) близки к повышению и показывают исключительные результаты. Создание четких путей карьерного роста поможет удержать лучшие кадры.",
    category: "Карьерный рост",
    priority: "medium",
    status: "in_progress",
    affectedEmployees: 3,
    estimatedImpact: "+12% удержание",
    timeframe: "1-2 месяца",
    insights: [
      "Все трое превысили целевые показатели 3 квартала подряд",
      "Выразили интерес к руководящим должностям",
      "Высокий риск перехода к конкурентам",
    ],
  },
  {
    id: 3,
    title: "Балансировка нагрузки для отдела продаж",
    description:
      "Отдел продаж сообщает о высоком уровне стресса и признаках выгорания. Рассмотрите перераспределение клиентов и внедрение политики work-life balance.",
    category: "Благополучие",
    priority: "high",
    status: "new",
    affectedEmployees: 8,
    estimatedImpact: "+10% продуктивность",
    timeframe: "1-2 недели",
    insights: [
      "Средняя переработка: 12 часов/неделю",
      "Уровень стресса вырос на 22%",
      "Два члена команды в зоне риска выгорания",
    ],
  },
  {
    id: 4,
    title: "Программа наставничества для младших разработчиков",
    description:
      "Младшие разработчики, особенно Дмитрий Козлов, выиграют от структурированного наставничества. Их объединение с опытными коллегами ускорит рост и снизит раннюю текучесть кадров.",
    category: "Развитие",
    priority: "medium",
    status: "new",
    affectedEmployees: 5,
    estimatedImpact: "+15% рост навыков",
    timeframe: "3-6 месяцев",
    insights: [
      "Младшие разработчики тратят на задачи на 40% больше времени",
      "Ограниченный доступ к руководству старших коллег",
      "Высокий потенциал для быстрого улучшения",
    ],
  },
  {
    id: 5,
    title: "Улучшение программы признания заслуг",
    description:
      "Опросы сотрудников указывают на желание лучшего признания. Внедрите систему peer-to-peer признания и ежеквартальные награды за достижения.",
    category: "Вовлеченность",
    priority: "low",
    status: "completed",
    affectedEmployees: 45,
    estimatedImpact: "+6% вовлеченность",
    timeframe: "Завершено",
    insights: [
      "Признание упомянуто в 67% опросов",
      "Лучшие сотрудники чувствуют недооценку",
      "Недорогая инициатива с высокой отдачей",
    ],
  },
  {
    id: 6,
    title: "Пересмотр политики гибкого графика",
    description:
      "Анализ показывает, что сотрудники с гибким графиком на 18% более продуктивны. Рассмотрите расширение опций гибкой работы во всех отделах.",
    category: "Политика",
    priority: "medium",
    status: "in_progress",
    affectedEmployees: 45,
    estimatedImpact: "+18% удовлетворенность",
    timeframe: "1 месяц",
    insights: [
      "Удаленные сотрудники на 18% продуктивнее",
      "Гибкость — самая востребованная льгота",
      "Минимальные изменения инфраструктуры",
    ],
  },
];

export default function Recommendations() {
  const priorityColors = {
    high: "bg-red-100 text-red-700 border-red-200",
    medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
    low: "bg-blue-100 text-blue-700 border-blue-200",
  };

  const statusIcons = {
    new: <AlertCircle className="text-blue-600" size={20} />,
    in_progress: <Clock className="text-yellow-600" size={20} />,
    completed: <CheckCircle2 className="text-green-600" size={20} />,
  };

  const statusLabels = {
    new: "Новая",
    in_progress: "В работе",
    completed: "Завершена",
  };

  const priorityLabels = {
    high: "Высокий приоритет",
    medium: "Средний приоритет",
    low: "Низкий приоритет",
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Рекомендации ИИ
        </h1>
        <p className="text-gray-600">
          Аналитические инсайты и рекомендации для улучшения вовлеченности и продуктивности сотрудников
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Lightbulb className="text-[#0052FF]" size={20} />
            </div>
            <div>
              <div className="text-sm text-gray-600">Всего</div>
              <div className="text-2xl font-bold text-gray-900">
                {recommendations.length}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <AlertCircle className="text-red-600" size={20} />
            </div>
            <div>
              <div className="text-sm text-gray-600">Высокий приоритет</div>
              <div className="text-2xl font-bold text-red-600">
                {recommendations.filter((r) => r.priority === "high").length}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center">
              <Clock className="text-yellow-600" size={20} />
            </div>
            <div>
              <div className="text-sm text-gray-600">В работе</div>
              <div className="text-2xl font-bold text-yellow-600">
                {
                  recommendations.filter((r) => r.status === "in_progress")
                    .length
                }
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <CheckCircle2 className="text-green-600" size={20} />
            </div>
            <div>
              <div className="text-sm text-gray-600">Завершено</div>
              <div className="text-2xl font-bold text-green-600">
                {recommendations.filter((r) => r.status === "completed").length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recommendations List */}
      <div className="space-y-4">
        {recommendations.map((rec) => (
          <div
            key={rec.id}
            className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0052FF] to-[#4D7CFF] flex items-center justify-center flex-shrink-0">
                <Lightbulb className="text-white" size={24} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {rec.title}
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 font-medium">
                        {rec.category}
                      </span>
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
                          priorityColors[
                            rec.priority as keyof typeof priorityColors
                          ]
                        }`}
                      >
                        {priorityLabels[rec.priority as keyof typeof priorityLabels]}
                      </span>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    {statusIcons[rec.status as keyof typeof statusIcons]}
                    <span>
                      {statusLabels[rec.status as keyof typeof statusLabels]}
                    </span>
                  </div>
                </div>

                <p className="text-gray-600 mb-4 leading-relaxed">
                  {rec.description}
                </p>

                {/* Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-gray-400" />
                    <div>
                      <div className="text-xs text-gray-500">Затронуто</div>
                      <div className="text-sm font-medium text-gray-900">
                        {rec.affectedEmployees} сотрудников
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp size={16} className="text-gray-400" />
                    <div>
                      <div className="text-xs text-gray-500">
                        Ожидаемый эффект
                      </div>
                      <div className="text-sm font-medium text-green-600">
                        {rec.estimatedImpact}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-gray-400" />
                    <div>
                      <div className="text-xs text-gray-500">Сроки</div>
                      <div className="text-sm font-medium text-gray-900">
                        {rec.timeframe}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Insights */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                    Ключевые инсайты
                  </div>
                  <ul className="space-y-1">
                    {rec.insights.map((insight, idx) => (
                      <li
                        key={idx}
                        className="text-sm text-gray-600 flex items-start gap-2"
                      >
                        <span className="text-[#0052FF] mt-1">•</span>
                        <span>{insight}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 mt-4">
                  {rec.status !== "completed" && (
                    <>
                      <button className="px-4 py-2 bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] text-white rounded-lg hover:shadow-lg transition-all font-medium text-sm">
                        Выполнить
                      </button>
                      <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm">
                        Подробнее
                      </button>
                    </>
                  )}
                  {rec.status === "completed" && (
                    <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm">
                      Результаты
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
