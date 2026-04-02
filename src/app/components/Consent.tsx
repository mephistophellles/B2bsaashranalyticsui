import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { apiFetch, parseErrorMessage } from "@/api/client";

type ConsentStatus = {
  accepted: boolean;
  accepted_at: string | null;
};

export default function Consent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<ConsentStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/consent/status");
      if (!res.ok) {
        setMsg(await parseErrorMessage(res));
        return;
      }
      setStatus(await res.json());
    })();
  }, []);

  async function accept() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch("/consent", {
        method: "POST",
        body: JSON.stringify({ accepted: true }),
      });
      if (!res.ok) {
        setMsg(await parseErrorMessage(res));
        return;
      }
      const next = new URLSearchParams(location.search).get("next") || "/";
      navigate(next, { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 text-sm text-blue-900">
        Перед прохождением опросов требуется согласие на обработку персональных данных.
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Согласие на обработку персональных данных</h1>
        <p className="text-sm text-gray-700 leading-relaxed">
          Платформа ПОТЕНКОР использует данные опросов и профильные данные сотрудника только для расчета индекса
          ESSI, выявления рисков, формирования рекомендаций и подготовки управленческой аналитики. Данные не
          используются для дисциплинарных решений без дополнительной проверки руководителем и HR.
        </p>
        <p className="text-sm text-gray-700 leading-relaxed">
          Вы можете в любой момент открыть эту страницу повторно из настроек и перечитать условия. Полный юридический
          текст может обновляться в рамках регуляторных требований.
        </p>

        {status?.accepted && status.accepted_at && (
          <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2">
            Согласие уже подтверждено: {status.accepted_at}
          </p>
        )}

        {msg && <p className="text-sm text-red-600">{msg}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void accept()}
            disabled={busy}
            className="px-4 py-2 rounded-xl bg-[#0052FF] text-white font-medium hover:bg-[#0047db] disabled:opacity-50"
          >
            {busy ? "Сохранение..." : "Подтверждаю согласие"}
          </button>
          <Link
            to="/settings"
            className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Вернуться в настройки
          </Link>
        </div>
      </div>
    </div>
  );
}
