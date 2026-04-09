import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
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
        Идёт обработка данных…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F4F6] p-4 md:p-6">
      <div className="mx-auto max-w-6xl rounded-2xl overflow-hidden border border-gray-200 bg-white shadow-sm min-h-[78vh] grid grid-cols-1 lg:grid-cols-[1.05fr_1.45fr]">
        <aside
          className="text-white p-10 lg:p-12 flex flex-col justify-between"
          style={{
            backgroundColor: "#0A4D9A",
            backgroundImage: `
              linear-gradient(135deg, #0A3F86 0%, #0A4D9A 42%, #0D5CB4 100%),
              radial-gradient(120% 70% at -10% 10%, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 75%),
              radial-gradient(140% 75% at 115% 35%, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 78%),
              radial-gradient(160% 80% at -15% 75%, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 82%),
              radial-gradient(150% 85% at 110% 105%, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 85%)
            `,
            backgroundBlendMode: "normal, screen, screen, screen, screen",
          }}
        >
          <div className="space-y-8 mt-5 lg:mt-8">
            <div>
              <h1 className="text-4xl font-bold leading-tight">ПОТЕНКОР</h1>
              <p className="mt-4 text-sm text-blue-100 max-w-md leading-relaxed">
                PotenCore показывает текущее состояние команды, выявляет причины изменений и ключевые зоны риска.
                Система превращает данные в понятные управленческие решения.
              </p>
            </div>
          </div>
          <p className="text-sm text-blue-100 max-w-md">
            Каждый показатель сопровождается объяснением, а каждая рекомендация - конкретным действием и ожидаемым
            эффектом.
          </p>
        </aside>

        <div className="p-6 md:p-10 lg:p-14 flex items-center justify-center">
          <form onSubmit={onSubmit} className="w-full max-w-md space-y-5">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Вход в систему</h2>
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
              className="w-full h-12 rounded-xl font-semibold text-white bg-[#005AB6] hover:bg-[#004E9E] disabled:opacity-60 shadow-md transition-colors"
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
