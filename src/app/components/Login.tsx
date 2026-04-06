import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/auth/AuthContext";
import loginLogo from "@/assets/brand/potencore-login-icon.png";

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
    <div className="min-h-screen bg-[#F3F4F6] p-4 md:p-6">
      <div className="mx-auto max-w-6xl rounded-2xl overflow-hidden border border-gray-200 bg-white shadow-sm min-h-[78vh] grid grid-cols-1 lg:grid-cols-[1.05fr_1.45fr]">
        <aside className="bg-gradient-to-br from-[#0F5CBD] to-[#0A4A99] text-white p-10 lg:p-12 flex flex-col justify-between">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2.5 bg-white/10 border border-white/20 rounded-xl px-3 py-2">
              <img src={loginLogo} alt="PotenCore" className="h-10 w-10 rounded-xl object-contain" />
              <span className="text-white text-xl font-semibold tracking-tight">ПОТЕНКОР</span>
            </div>
            <div>
              <h1 className="text-4xl font-bold leading-tight">Вход в систему</h1>
              <p className="mt-4 text-sm text-blue-100 max-w-md leading-relaxed">
                PotenCore помогает компаниям понимать состояние сотрудников и команд, выявлять причины изменений и
                принимать более точные управленческие решения на основе данных.
              </p>
            </div>
          </div>
          <p className="text-sm text-blue-100 max-w-md">
            Надежный доступ к данным и управленческим инструментам платформы.
          </p>
        </aside>

        <div className="p-6 md:p-10 lg:p-14 flex items-center justify-center">
          <form onSubmit={onSubmit} className="w-full max-w-md space-y-5">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Войти</h2>
              <p className="text-sm text-gray-500 mt-1">Введите логин и пароль для доступа к платформе.</p>
            </div>

            {err && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {err}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm text-gray-700 font-medium">Логин</label>
              <input
                className="w-full h-12 border border-gray-300 rounded-xl px-3 focus:ring-2 focus:ring-[#0052FF] outline-none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-700 font-medium">Пароль</label>
              <input
                type="password"
                className="w-full h-12 border border-gray-300 rounded-xl px-3 focus:ring-2 focus:ring-[#0052FF] outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 rounded-xl font-semibold text-white bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] hover:opacity-95 disabled:opacity-60 shadow-md"
            >
              {submitting ? "Вход…" : "Войти"}
            </button>

            <p className="text-xs text-gray-500 leading-relaxed">
              Продолжая работу в системе, вы подтверждаете согласие с условиями обработки{" "}
              <Link to="/legal/consent" className="text-[#0052FF] hover:underline">
                персональных данных
              </Link>
              .
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
