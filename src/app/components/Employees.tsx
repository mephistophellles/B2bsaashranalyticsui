import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  TrendingUp,
  TrendingDown,
  Search,
  Filter,
  Download,
  Mail,
} from "lucide-react";
import { apiFetch, parseErrorMessage } from "@/api/client";

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
    headers.join(","),
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
        .join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
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
  const [newName, setNewName] = useState("");
  const [newDeptId, setNewDeptId] = useState<number | "">("");
  const [newPosition, setNewPosition] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [createMsg, setCreateMsg] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);

  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    setSearchQuery((prev) => (prev === q ? prev : q));
  }, [searchParams]);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/employees");
      if (res.ok) setEmployeesData(await res.json());
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/departments");
      if (res.ok) {
        const r = (await res.json()) as { id: number; name: string }[];
        setDeptOptions(r.map((x) => ({ id: x.id, name: x.name })));
      }
    })();
  }, []);

  async function createEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (newDeptId === "") return;
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
      const res2 = await apiFetch("/employees");
      if (res2.ok) setEmployeesData(await res2.json());
    } finally {
      setCreateBusy(false);
    }
  }

  const departments = useMemo(() => {
    const s = new Set(employeesData.map((e) => e.department));
    return ["Все", ...Array.from(s)];
  }, [employeesData]);

  const filteredEmployees = employeesData.filter((emp) => {
    const matchesSearch =
      emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (emp.email ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (emp.position ?? "").toLowerCase().includes(searchQuery.toLowerCase());
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

      <form
        onSubmit={(e) => void createEmployee(e)}
        className="bg-white rounded-xl border border-gray-200 p-4 mb-6 space-y-3 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-gray-800">Добавить сотрудника</h2>
        {createMsg && <p className="text-sm text-red-600">{createMsg}</p>}
        <div className="flex flex-wrap gap-3 items-end">
          <input
            className="border rounded-xl px-3 py-2 min-w-[160px]"
            placeholder="ФИО"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
          <select
            className="border rounded-xl px-3 py-2 min-w-[140px]"
            value={newDeptId}
            onChange={(e) => setNewDeptId(Number(e.target.value))}
            required
          >
            <option value="">Отдел</option>
            {deptOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            className="border rounded-xl px-3 py-2 min-w-[140px]"
            placeholder="Должность"
            value={newPosition}
            onChange={(e) => setNewPosition(e.target.value)}
          />
          <input
            type="email"
            className="border rounded-xl px-3 py-2 min-w-[160px]"
            placeholder="Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <button
            type="submit"
            disabled={createBusy || newDeptId === ""}
            className="px-4 py-2 rounded-xl bg-[#0052FF] text-white font-medium text-sm disabled:opacity-50"
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
                }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0052FF] focus:border-transparent"
              />
            </div>
          </div>
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">Всего сотрудников</div>
          <div className="text-2xl font-bold text-gray-900">{employeesData.length}</div>
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
                  <td className="py-4 px-6">
                    {employee.trend === "up" && <TrendingUp className="text-green-600" size={18} />}
                    {employee.trend === "down" && <TrendingDown className="text-red-600" size={18} />}
                    {employee.trend === "stable" && <div className="w-4 h-0.5 bg-gray-400" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
