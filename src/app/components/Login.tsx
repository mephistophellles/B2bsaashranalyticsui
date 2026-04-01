import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/auth/AuthContext";

export default function Login() {
  const { login, user, loading } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("manager");
  const [password, setPassword] = useState("manager123");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    nav("/", { replace: true });
  }, [loading, user, nav]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      await login(username, password);
    } catch {
      setErr("Не удалось войти. Проверьте, что API запущен (порт 8000) и прокси Vite включён.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] text-gray-600">
        Загрузка…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-8 shadow-sm space-y-6"
      >
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] bg-clip-text text-transparent">
            ПОТЕНКОР
          </h1>
          <p className="text-sm text-gray-500 mt-1">Вход в систему</p>
        </div>
        {err && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {err}
          </div>
        )}
        <div className="space-y-2">
          <label className="text-sm text-gray-600">Логин</label>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#0052FF] outline-none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-gray-600">Пароль</label>
          <input
            type="password"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#0052FF] outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 rounded-xl font-semibold text-white bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] hover:opacity-95 disabled:opacity-60 shadow-md"
        >
          {submitting ? "Вход…" : "Войти"}
        </button>
        <p className="text-xs text-gray-400 text-center">
          Демо: manager/manager123 или employee/employee123
        </p>
      </form>
    </div>
  );
}
