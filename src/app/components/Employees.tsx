import { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Search,
  Filter,
  Download,
  Mail,
  Phone,
} from "lucide-react";

const employeesData = [
  {
    id: 1,
    name: "Сара Иванова",
    email: "sara.i@company.com",
    phone: "+7 495 123-45-01",
    department: "Разработка",
    position: "Старший разработчик",
    essi: 92,
    engagement: 88,
    productivity: 94,
    trend: "up",
    status: "Отлично",
    joinDate: "Янв 2022",
  },
  {
    id: 2,
    name: "Михаил Петров",
    email: "mikhail.p@company.com",
    phone: "+7 495 123-45-02",
    department: "Продажи",
    position: "Менеджер по продажам",
    essi: 78,
    engagement: 82,
    productivity: 75,
    trend: "up",
    status: "Хорошо",
    joinDate: "Мар 2021",
  },
  {
    id: 3,
    name: "Анна Смирнова",
    email: "anna.s@company.com",
    phone: "+7 495 123-45-03",
    department: "Маркетинг",
    position: "Менеджер по маркетингу",
    essi: 85,
    engagement: 86,
    productivity: 84,
    trend: "stable",
    status: "Хорошо",
    joinDate: "Июл 2020",
  },
  {
    id: 4,
    name: "Дмитрий Козлов",
    email: "dmitry.k@company.com",
    phone: "+7 495 123-45-04",
    department: "Разработка",
    position: "Младший разработчик",
    essi: 65,
    engagement: 62,
    productivity: 68,
    trend: "down",
    status: "Риск",
    joinDate: "Сен 2023",
  },
  {
    id: 5,
    name: "Елена Волкова",
    email: "elena.v@company.com",
    phone: "+7 495 123-45-05",
    department: "HR",
    position: "HR-специалист",
    essi: 88,
    engagement: 90,
    productivity: 86,
    trend: "up",
    status: "Отлично",
    joinDate: "Фев 2021",
  },
  {
    id: 6,
    name: "Артем Новиков",
    email: "artem.n@company.com",
    phone: "+7 495 123-45-06",
    department: "Финансы",
    position: "Финансовый аналитик",
    essi: 76,
    engagement: 74,
    productivity: 78,
    trend: "stable",
    status: "Хорошо",
    joinDate: "Май 2022",
  },
  {
    id: 7,
    name: "София Лебедева",
    email: "sofia.l@company.com",
    phone: "+7 495 123-45-07",
    department: "Разработка",
    position: "Тех. руководитель",
    essi: 94,
    engagement: 92,
    productivity: 96,
    trend: "up",
    status: "Отлично",
    joinDate: "Ноя 2019",
  },
  {
    id: 8,
    name: "Роман Соколов",
    email: "roman.s@company.com",
    phone: "+7 495 123-45-08",
    department: "Продажи",
    position: "Руководитель продаж",
    essi: 82,
    engagement: 84,
    productivity: 80,
    trend: "up",
    status: "Хорошо",
    joinDate: "Авг 2020",
  },
];

export default function Employees() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("Все");

  const departments = [
    "Все",
    "Разработка",
    "Продажи",
    "Маркетинг",
    "HR",
    "Финансы",
  ];

  const filteredEmployees = employeesData.filter((emp) => {
    const matchesSearch =
      emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.position.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDepartment =
      selectedDepartment === "Все" || emp.department === selectedDepartment;

    return matchesSearch && matchesDepartment;
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Сотрудники</h1>
        <p className="text-gray-600">
          Управление и мониторинг продуктивности и вовлеченности сотрудников
        </p>
      </div>

      {/* Filters & Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[300px]">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              <input
                type="text"
                placeholder="Поиск по имени, email или должности..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0052FF] focus:border-transparent"
              />
            </div>
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-500" />
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0052FF] focus:border-transparent bg-white"
            >
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* Export Button */}
          <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] text-white rounded-lg hover:shadow-lg transition-all">
            <Download size={18} />
            <span className="font-medium">Экспорт</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">Всего сотрудников</div>
          <div className="text-2xl font-bold text-gray-900">
            {employeesData.length}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">Отлично</div>
          <div className="text-2xl font-bold text-green-600">
            {employeesData.filter((e) => e.status === "Отлично").length}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">Хорошо</div>
          <div className="text-2xl font-bold text-blue-600">
            {employeesData.filter((e) => e.status === "Хорошо").length}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">В зоне риска</div>
          <div className="text-2xl font-bold text-red-600">
            {employeesData.filter((e) => e.status === "Риск").length}
          </div>
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">
                  Сотрудник
                </th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">
                  Должность
                </th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">
                  Отдел
                </th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">
                  ESSI
                </th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">
                  Вовлеченность
                </th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">
                  Продуктивность
                </th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">
                  Статус
                </th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">
                  Тренд
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((employee) => (
                <tr
                  key={employee.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <td className="py-4 px-6">
                    <div>
                      <div className="font-medium text-gray-900">
                        {employee.name}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Mail size={12} />
                          {employee.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="text-sm text-gray-900">
                      {employee.position}
                    </div>
                    <div className="text-xs text-gray-500">
                      С {employee.joinDate}
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                      {employee.department}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-lg font-bold ${
                          employee.essi >= 85
                            ? "text-green-600"
                            : employee.essi >= 70
                            ? "text-yellow-600"
                            : "text-red-600"
                        }`}
                      >
                        {employee.essi}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="text-sm text-gray-900">
                      {employee.engagement}%
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="text-sm text-gray-900">
                      {employee.productivity}%
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        employee.status === "Отлично"
                          ? "bg-green-100 text-green-700"
                          : employee.status === "Хорошо"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {employee.status}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    {employee.trend === "up" && (
                      <div className="flex items-center gap-1 text-green-600">
                        <TrendingUp size={18} />
                        <span className="text-sm font-medium">Рост</span>
                      </div>
                    )}
                    {employee.trend === "down" && (
                      <div className="flex items-center gap-1 text-red-600">
                        <TrendingDown size={18} />
                        <span className="text-sm font-medium">Спад</span>
                      </div>
                    )}
                    {employee.trend === "stable" && (
                      <div className="flex items-center gap-1 text-gray-500">
                        <div className="w-4 h-0.5 bg-gray-400"></div>
                        <span className="text-sm font-medium">Стабильно</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredEmployees.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-2">Сотрудники не найдены</div>
            <div className="text-sm text-gray-500">
              Попробуйте изменить параметры поиска или фильтры
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
