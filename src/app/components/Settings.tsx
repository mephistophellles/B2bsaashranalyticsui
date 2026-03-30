import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Settings as SettingsIcon, User, Shield, KeyRound, ScrollText } from "lucide-react";
import { apiFetch, parseErrorMessage } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";

type EmpOpt = { id: number; name: string; department: string };

function ChangePasswordBlock() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next.length < 6) {
      setMsg("Новый пароль не короче 6 символов");
      return;
    }
    if (next !== again) {
      setMsg("Пароли не совпадают");
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      if (!res.ok) {
        setMsg(await parseErrorMessage(res));
        return;
      }
      setCurrent("");
      setNext("");
      setAgain("");
      setMsg("Пароль обновлён");
    } finally {
      setBusy(false);
    }
  }

  const msgClass =
    msg == null
      ? ""
      : msg.includes("обновлён")
        ? "text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2"
        : "text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2";

  return (
    <div className="pt-4 border-t border-gray-100 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2 text-gray-800">
        <KeyRound size={16} className="text-[#0052FF]" />
        Смена пароля
      </h3>
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-2 max-w-sm">
        <input
          type="password"
          className="border rounded-xl px-3 py-2 text-sm"
          placeholder="Текущий пароль"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
        <input
          type="password"
          className="border rounded-xl px-3 py-2 text-sm"
          placeholder="Новый пароль (мин. 6)"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={6}
        />
        <input
          type="password"
          className="border rounded-xl px-3 py-2 text-sm"
          placeholder="Повтор нового пароля"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={busy}
          className="px-3 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50 w-fit"
        >
          {busy ? "Сохранение…" : "Обновить пароль"}
        </button>
        {msg && <p className={`text-xs ${msgClass}`}>{msg}</p>}
      </form>
    </div>
  );
}

type AuditRow = {
  id: number;
  user_id: number | null;
  action: string;
  entity: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

type AuditLogsPage = {
  items: AuditRow[];
  has_more: boolean;
  offset: number;
  limit: number;
};

function AdminAuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [actionFilter, setActionFilter] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function fetchPage(offset: number): Promise<AuditLogsPage | null> {
    const q = new URLSearchParams({ limit: "50", offset: String(offset) });
    if (actionFilter.trim()) q.set("action", actionFilter.trim());
    const res = await apiFetch(`/audit/logs?${q}`);
    if (!res.ok) {
      setErr(await parseErrorMessage(res));
      return null;
    }
    const data = (await res.json()) as AuditLogsPage | AuditRow[];
    if (Array.isArray(data)) {
      return { items: data, has_more: false, offset: 0, limit: data.length };
    }
    return {
      items: data.items ?? [],
      has_more: Boolean(data.has_more),
      offset: data.offset ?? offset,
      limit: data.limit ?? 50,
    };
  }

  async function refresh() {
    setBusy(true);
    setErr(null);
    try {
      const page = await fetchPage(0);
      if (!page) {
        setRows([]);
        setHasMore(false);
        return;
      }
      setRows(page.items);
      setHasMore(page.has_more);
    } finally {
      setBusy(false);
    }
  }

  async function loadMore() {
    setBusy(true);
    setErr(null);
    try {
      const page = await fetchPage(rows.length);
      if (!page) return;
      setRows((prev) => [...prev, ...page.items]);
      setHasMore(page.has_more);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <ScrollText size={20} className="text-[#0052FF]" />
        Журнал аудита
      </h2>
      <p className="text-sm text-gray-600">
        События API (создание пользователей, опросы, отчёты и т.д.). Обновление по кнопке.
      </p>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-sm text-gray-600 flex flex-col gap-1">
          Фильтр по действию
          <input
            className="border rounded-xl px-3 py-2 w-56"
            placeholder="например survey_submit"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void refresh()}
          className="px-4 py-2 rounded-xl border border-gray-300 font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {busy ? "Загрузка…" : "Обновить"}
        </button>
      </div>
      {err && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{err}</p>}
      <div className="border border-gray-200 rounded-xl overflow-hidden overflow-x-auto max-h-[28rem] overflow-y-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 font-medium text-gray-600">Время (UTC)</th>
              <th className="px-3 py-2 font-medium text-gray-600">Действие</th>
              <th className="px-3 py-2 font-medium text-gray-600">Сущность</th>
              <th className="px-3 py-2 font-medium text-gray-600">user_id</th>
              <th className="px-3 py-2 font-medium text-gray-600">meta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && !busy && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  Нет записей
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50/80">
                <td className="px-3 py-2 whitespace-nowrap text-gray-700">{r.created_at}</td>
                <td className="px-3 py-2 font-mono text-gray-900">{r.action}</td>
                <td className="px-3 py-2 text-gray-600">{r.entity ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums text-gray-600">{r.user_id ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-gray-500 max-w-[12rem] truncate" title={JSON.stringify(r.meta)}>
                  {r.meta ? JSON.stringify(r.meta) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadMore()}
          className="px-4 py-2 rounded-xl border border-[#0052FF] text-[#0052FF] font-medium hover:bg-blue-50 disabled:opacity-50"
        >
          {busy ? "Загрузка…" : "Загрузить ещё"}
        </button>
      )}
    </div>
  );
}

function AdminCreateUser() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"employee" | "manager" | "admin">("employee");
  const [employeeId, setEmployeeId] = useState<number | "">("");
  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/employees");
      if (!res.ok) return;
      const rows = (await res.json()) as { id: number; name: string; department: string }[];
      setEmployees(rows.map((r) => ({ id: r.id, name: r.name, department: r.department })));
    })();
  }, []);

  useEffect(() => {
    if (role !== "employee") setEmployeeId("");
  }, [role]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (role === "employee" && employeeId === "") {
      setMsg("Для роли «Сотрудник» выберите сотрудника из списка.");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { username, password, role };
      if (role === "employee" && employeeId !== "") body.employee_id = employeeId;
      const res = await apiFetch("/admin/users", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setMsg(await parseErrorMessage(res));
        return;
      }
      setMsg("Пользователь создан");
      setUsername("");
      setPassword("");
      setEmployeeId("");
    } finally {
      setBusy(false);
    }
  }

  const msgClass =
    msg == null
      ? ""
      : msg.includes("создан")
        ? "text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2"
        : "text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2";

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Shield size={20} className="text-[#0052FF]" />
        Администрирование
      </h2>
      <p className="text-sm text-gray-600">
        Создание учётной записи. Для входа сотрудника в опрос выберите соответствующую запись из списка
        сотрудников.
      </p>
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-3 max-w-md">
        <input
          className="w-full border rounded-xl px-3 py-2"
          placeholder="Логин"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          type="password"
          className="w-full border rounded-xl px-3 py-2"
          placeholder="Пароль (мин. 6 символов)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
        <select
          className="w-full border rounded-xl px-3 py-2"
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
        >
          <option value="employee">Сотрудник</option>
          <option value="manager">Руководитель</option>
          <option value="admin">Администратор</option>
        </select>
        {role === "employee" && (
          <label className="block text-sm text-gray-600">
            Привязка к сотруднику
            <select
              className="mt-1 w-full border rounded-xl px-3 py-2 bg-white"
              value={employeeId === "" ? "" : String(employeeId)}
              onChange={(e) => {
                const v = e.target.value;
                setEmployeeId(v === "" ? "" : Number(v));
              }}
              required
            >
              <option value="">— выберите —</option>
              {employees.map((em) => (
                <option key={em.id} value={em.id}>
                  {em.name} ({em.department})
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 rounded-xl bg-[#0052FF] text-white font-medium disabled:opacity-50"
        >
          {busy ? "Создание…" : "Создать пользователя"}
        </button>
        {msg && <p className={`text-sm ${msgClass}`}>{msg}</p>}
      </form>
    </div>
  );
}

export default function Settings() {
  const { user, loading } = useAuth();

  return (
    <div className="p-6 space-y-8 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
          <SettingsIcon className="text-[#0052FF]" size={26} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Настройки</h1>
          <p className="text-gray-600 text-sm">Профиль и администрирование</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <User size={20} className="text-[#0052FF]" />
          Профиль
        </h2>
        {loading ? (
          <p className="text-sm text-gray-500">Загрузка…</p>
        ) : user ? (
          <dl className="grid gap-2 text-sm">
            <div className="flex gap-2">
              <dt className="text-gray-500 w-28">Логин</dt>
              <dd className="font-medium text-gray-900">{user.username}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 w-28">Роль</dt>
              <dd className="font-medium text-gray-900">{user.role}</dd>
            </div>
            {user.employee_id != null && (
              <div className="flex gap-2">
                <dt className="text-gray-500 w-28">employee_id</dt>
                <dd className="font-medium text-gray-900">{user.employee_id}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            Не удалось загрузить профиль. Выполните повторный{" "}
            <Link to="/login" className="underline font-medium">
              вход
            </Link>
            .
          </p>
        )}
        {user && <ChangePasswordBlock />}
      </div>

      {user?.role === "admin" && (
        <>
          <AdminAuditLog />
          <AdminCreateUser />
        </>
      )}

      {user && user.role !== "employee" && (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 p-4 text-sm text-gray-600">
          Нет данных на дашборде? Выполните{" "}
          <code className="text-xs bg-white px-1 rounded border">python -m scripts.seed</code> в каталоге{" "}
          <code className="text-xs bg-white px-1 rounded border">backend</code> или загрузите CSV на странице{" "}
          <Link to="/reports" className="text-[#0052FF] font-medium hover:underline">
            «Отчёты»
          </Link>
          .
        </div>
      )}
    </div>
  );
}
