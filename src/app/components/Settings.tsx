import { useEffect, useState } from "react";
import { Settings as SettingsIcon, User, Shield, KeyRound } from "lucide-react";
import { apiFetch, parseErrorMessage } from "@/api/client";
import type { UserMe } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";

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
        {msg && <p className="text-xs text-gray-600">{msg}</p>}
      </form>
    </div>
  );
}

function AdminCreateUser() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"employee" | "manager" | "admin">("employee");
  const [employeeId, setEmployeeId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = { username, password, role };
      const eid = employeeId.trim();
      if (eid) body.employee_id = Number(eid);
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

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Shield size={20} className="text-[#0052FF]" />
        Администрирование
      </h2>
      <p className="text-sm text-gray-600">
        Создание учётной записи. Для сотрудника укажите <code className="text-xs bg-gray-100 px-1 rounded">employee_id</code> из БД.
      </p>
      <form onSubmit={onSubmit} className="space-y-3 max-w-md">
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
        <input
          className="w-full border rounded-xl px-3 py-2"
          placeholder="employee_id (необязательно)"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 rounded-xl bg-[#0052FF] text-white font-medium disabled:opacity-50"
        >
          {busy ? "Создание…" : "Создать пользователя"}
        </button>
        {msg && <p className="text-sm text-gray-700">{msg}</p>}
      </form>
      <p className="text-xs text-gray-400">
        Полный аудит: откройте Swagger <code className="bg-gray-100 px-1 rounded">/docs</code> → GET /api/audit/logs (только admin).
      </p>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const [me, setMe] = useState<UserMe | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/auth/me");
      if (res.ok) setMe(await res.json());
    })();
  }, []);

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
        {me ? (
          <dl className="grid gap-2 text-sm">
            <div className="flex gap-2">
              <dt className="text-gray-500 w-28">Логин</dt>
              <dd className="font-medium text-gray-900">{me.username}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 w-28">Роль</dt>
              <dd className="font-medium text-gray-900">{me.role}</dd>
            </div>
            {me.employee_id != null && (
              <div className="flex gap-2">
                <dt className="text-gray-500 w-28">employee_id</dt>
                <dd className="font-medium text-gray-900">{me.employee_id}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="text-sm text-gray-500">Загрузка…</p>
        )}
        <ChangePasswordBlock />
      </div>

      {user?.role === "admin" && <AdminCreateUser />}

      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 p-4 text-sm text-gray-600">
        Нет данных на дашборде? Выполните <code className="text-xs bg-white px-1 rounded border">python -m scripts.seed</code> в каталоге{" "}
        <code className="text-xs bg-white px-1 rounded border">backend</code> или загрузите CSV на странице «Отчёты».
      </div>
    </div>
  );
}
