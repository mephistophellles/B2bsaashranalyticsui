import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  TrendingUp,
  TrendingDown,
  Search,
  Filter,
  Download,
  Mail,
  Users,
} from "lucide-react";
import { apiFetch, parseErrorMessage } from "@/api/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const latinRegex = /[A-Za-z]/;
const cyrillicRegex = /[А-Яа-яЁё]/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Emp = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  department: string;
  position: string | null;
  essi: number;
  engagement: number;
  productivity: number;
  trend: string;
  status: string;
  join_date: string | null;
};

type DeptOpt = { id: number; name: string };

function exportEmployeesCsv(rows: Emp[]) {
  const headers = [
    "id",
    "name",
    "email",
    "department",
    "position",
    "essi",
    "engagement",
    "productivity",
    "status",
    "trend",
  ];
  const esc = (v: string | number) => {
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    "sep=;",
    headers.join(";"),
    ...rows.map((e) =>
      [
        e.id,
        e.name,
        e.email ?? "",
        e.department,
        e.position ?? "",
        e.essi,
        e.engagement,
        e.productivity,
        e.status,
        e.trend,
      ]
        .map(esc)
        .join(";"),
    ),
  ];
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `employees_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Employees() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [employeesData, setEmployeesData] = useState<Emp[]>([]);
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") ?? "");
  const [selectedDepartment, setSelectedDepartment] = useState("Все");
  const [deptOptions, setDeptOptions] = useState<DeptOpt[]>([]);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [newName, setNewName] = useState("");
  const [newDeptId, setNewDeptId] = useState<number | "">("");
  const [newPosition, setNewPosition] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [createMsg, setCreateMsg] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const nameError =
    newName.trim().length > 0 && latinRegex.test(newName)
      ? "Поле ФИО должно быть на кириллице."
      : null;
  const positionError =
    newPosition.trim().length > 0 && latinRegex.test(newPosition)
      ? "Поле должности должно быть на кириллице."
      : null;
  const emailError =
    newEmail.trim().length === 0
      ? null
      : cyrillicRegex.test(newEmail)
        ? "Email не должен содержать кириллицу."
        : !emailRegex.test(newEmail.trim())
          ? "Введите корректный email."
          : null;
  const hasValidationError = Boolean(nameError || positionError || emailError);

  function renderTrend(trend: string) {
    if (trend === "up") return <TrendingUp className="text-green-600" size={18} />;
    if (trend === "down") return <TrendingDown className="text-red-600" size={18} />;
    if (trend === "stable") return <div className="w-4 h-0.5 bg-gray-400" title="Стабильно" />;
    return <span className="text-xs text-gray-400">нет данных</span>;
  }

  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    setSearchQuery((prev) => (prev === q ? prev : q));
  }, [searchParams]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(totalEmployees / pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [totalEmployees, page]);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/departments");
      if (res.ok) {
        const r = (await res.json()) as { id: number; name: string }[];
        setDeptOptions(r.map((x) => ({ id: x.id, name: x.name })));
      }
    })();
  }, []);

  useEffect(() => {
    const departmentId =
      selectedDepartment === "Все"
        ? null
        : deptOptions.find((d) => d.name === selectedDepartment)?.id ?? null;
    const offset = (page - 1) * pageSize;
    const q = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
    });
    if (searchQuery.trim()) q.set("q", searchQuery.trim());
    if (departmentId != null) q.set("department_id", String(departmentId));
    void (async () => {
      const res = await apiFetch(`/employees/page?${q}`);
      if (!res.ok) return;
      const data = (await res.json()) as { items: Emp[]; total: number };
      setEmployeesData(data.items ?? []);
      setTotalEmployees(data.total ?? 0);
    })();
  }, [searchQuery, selectedDepartment, page, deptOptions]);

  async function createEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (newDeptId === "" || hasValidationError) return;
    setCreateBusy(true);
    setCreateMsg(null);
    try {
      const res = await apiFetch("/employees", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          department_id: newDeptId,
          position: newPosition.trim() || null,
          email: newEmail.trim() || null,
        }),
      });
      if (!res.ok) {
        setCreateMsg(await parseErrorMessage(res));
        return;
      }
      setNewName("");
      setNewPosition("");
      setNewEmail("");
      const res2 = await apiFetch("/employees/page?limit=20&offset=0");
      if (res2.ok) {
        const pageData = (await res2.json()) as { items: Emp[]; total: number };
        setEmployeesData(pageData.items ?? []);
        setTotalEmployees(pageData.total ?? 0);
        setPage(1);
      }
    } finally {
      setCreateBusy(false);
    }
  }

  const departments = useMemo(() => ["Все", ...deptOptions.map((d) => d.name)], [deptOptions]);
  const totalPages = Math.max(1, Math.ceil(totalEmployees / pageSize));
  const filteredEmployees = employeesData;

  return (
    <div className="p-6">
      <div className="mb-4 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 text-sm text-blue-900">
        Команда и метрики по сотрудникам: добавляйте новых сотрудников и отслеживайте динамику ESSI.
      </div>
      <div className="mb-6 space-y-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold text-gray-900">Сотрудники</h1>
          <div className="hidden sm:flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2">
            <Users className="text-[#0052FF]" size={16} />
            <span className="text-xs font-medium text-blue-900">Состав и динамика команды</span>
          </div>
        </div>
        <p className="text-gray-600">
          Управление и мониторинг продуктивности и вовлеченности сотрудников
        </p>
      </div>

      <form
        onSubmit={(e) => void createEmployee(e)}
        className="bg-white rounded-xl border border-gray-200 p-4 mb-6 space-y-3 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-gray-800">Добавить сотрудника</h2>
        {createMsg && <p className="text-sm text-red-600">{createMsg}</p>}
        <div className="flex flex-wrap gap-3 items-start">
          <div className="min-w-[220px] flex-1">
            <input
              className={`w-full h-11 border rounded-xl px-3 text-sm ${
                nameError ? "border-red-400 bg-red-50" : "border-gray-300"
              }`}
              placeholder="ФИО"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
            {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
          </div>
          <div className="min-w-[200px]">
            <Select
              value={newDeptId === "" ? "" : String(newDeptId)}
              onValueChange={(value) => setNewDeptId(value === "" ? "" : Number(value))}
            >
              <SelectTrigger className="w-full h-11 rounded-xl border-gray-300 bg-white text-sm">
                <SelectValue placeholder="Отдел" />
              </SelectTrigger>
              <SelectContent>
                {deptOptions.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[220px] flex-1">
            <input
              className={`w-full h-11 border rounded-xl px-3 text-sm ${
                positionError ? "border-red-400 bg-red-50" : "border-gray-300"
              }`}
              placeholder="Должность"
              value={newPosition}
              onChange={(e) => setNewPosition(e.target.value)}
            />
            {positionError && <p className="mt-1 text-xs text-red-600">{positionError}</p>}
          </div>
          <div className="min-w-[240px] flex-1">
            <input
              type="email"
              className={`w-full h-11 border rounded-xl px-3 text-sm ${
                emailError ? "border-red-400 bg-red-50" : "border-gray-300"
              }`}
              placeholder="Email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
            {emailError && <p className="mt-1 text-xs text-red-600">{emailError}</p>}
          </div>
          <button
            type="submit"
            disabled={createBusy || newDeptId === "" || hasValidationError}
            className="h-11 px-5 rounded-xl bg-[#0052FF] text-white font-medium text-sm disabled:opacity-50"
          >
            {createBusy ? "…" : "Создать"}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
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
                onChange={(e) => {
                  const v = e.target.value;
                  setSearchQuery(v);
                  setSearchParams(v.trim() ? { q: v.trim() } : {}, { replace: true });
                  setPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0052FF] focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 pb-[1px]">
            <Filter size={18} className="text-gray-500" />
            <Select
              value={selectedDepartment}
              onValueChange={(value) => {
                setSelectedDepartment(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-10 min-w-48 rounded-lg border-gray-300 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {departments.map((dept) => (
                  <SelectItem key={dept} value={dept}>
                    {dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <button
            type="button"
            onClick={() => exportEmployeesCsv(filteredEmployees)}
            disabled={filteredEmployees.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
          >
            <Download size={18} />
            <span className="font-medium">Экспорт CSV</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">Всего сотрудников</div>
          <div className="text-2xl font-bold text-gray-900">{employeesData.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">Высокая устойчивость</div>
          <div className="text-2xl font-bold text-green-600">
            {employeesData.filter((e) => e.status === "Высокая устойчивость").length}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">Удовлетворительно</div>
          <div className="text-2xl font-bold text-blue-600">
            {employeesData.filter((e) => e.status === "Удовлетворительно").length}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">Зона риска</div>
          <div className="text-2xl font-bold text-amber-600">
            {employeesData.filter((e) => e.status === "Зона риска").length}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">Новые сотрудники</div>
          <div className="text-2xl font-bold text-sky-600">
            {employeesData.filter((e) => e.status === "Новый сотрудник").length}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">Кризис</div>
          <div className="text-2xl font-bold text-red-600">
            {employeesData.filter((e) => e.status === "Кризис").length}
          </div>
        </div>
      </div>

      {employeesData.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-gray-500 mb-6">
          Сотрудники не найдены. Запустите seed или проверьте API.
        </div>
      )}
      {employeesData.length > 0 && filteredEmployees.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 text-center text-gray-600 mb-6 text-sm">
          Нет сотрудников по выбранным фильтрам.
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-3 text-xs text-gray-500 border-b border-gray-100">
          Показано {filteredEmployees.length} из {totalEmployees}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Сотрудник</th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Должность</th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Отдел</th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">ESSI</th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Вовлеченность</th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Продуктивность</th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Статус</th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Тренд</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((employee) => (
                <tr
                  key={employee.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(`/employees/${employee.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      navigate(`/employees/${employee.id}`);
                  }}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <td className="py-4 px-6">
                    <div>
                      <div className="font-medium text-gray-900">{employee.name}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Mail size={12} />
                          {employee.email ?? "—"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="text-sm text-gray-900">{employee.position ?? "—"}</div>
                    <div className="text-xs text-gray-500">
                      {employee.join_date ? `С ${employee.join_date}` : ""}
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                      {employee.department}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <span className="font-semibold text-gray-900">{employee.essi}</span>
                  </td>
                  <td className="py-4 px-6 text-sm text-gray-700">{employee.engagement}%</td>
                  <td className="py-4 px-6 text-sm text-gray-700">{employee.productivity}%</td>
                  <td className="py-4 px-6 text-sm text-gray-700">{employee.status}</td>
                  <td className="py-4 px-6">{renderTrend(employee.trend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
          {page > 1 ? (
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-gray-300"
            >
              Назад
            </button>
          ) : (
            <div />
          )}
          <span className="text-gray-600">
            Страница {page} из {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40"
          >
            Вперёд
          </button>
        </div>
      </div>
    </div>
  );
}
