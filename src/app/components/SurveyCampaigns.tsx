import { useCallback, useEffect, useState } from "react";
import { apiFetch, parseErrorMessage } from "@/api/client";

type Campaign = {
  id: number;
  name: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
};

export default function SurveyCampaigns() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    const res = await apiFetch("/surveys/campaigns");
    if (!res.ok) {
      setErr(await parseErrorMessage(res));
      return;
    }
    setItems(await res.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch("/surveys/campaigns", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        setErr(await parseErrorMessage(res));
        return;
      }
      setName("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function closeCampaign(id: number) {
    setErr(null);
    const res = await apiFetch(`/surveys/campaigns/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "closed" }),
    });
    if (!res.ok) setErr(await parseErrorMessage(res));
    else void load();
  }

  return (
    <div className="p-6 space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Опросные кампании</h1>
        <p className="text-gray-600 text-sm mt-1">
          Сотрудники видят активные кампании на главной и могут пройти опрос с привязкой к кампании.
        </p>
      </div>

      <form
        onSubmit={(e) => void createCampaign(e)}
        className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3"
      >
        <h2 className="text-sm font-semibold text-gray-800">Новая кампания</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="flex-1 min-w-[12rem] border rounded-xl px-3 py-2"
            placeholder="Название"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-xl bg-[#0052FF] text-white font-medium disabled:opacity-50"
          >
            {busy ? "Создание…" : "Создать"}
          </button>
        </div>
      </form>

      {err && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{err}</p>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Название</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Статус</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Создана</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  Пока нет кампаний
                </td>
              </tr>
            )}
            {items.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50/80">
                <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      c.status === "active"
                        ? "text-xs px-2 py-1 rounded-full bg-green-100 text-green-800 font-medium"
                        : "text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600"
                    }
                  >
                    {c.status === "active" ? "Активна" : "Закрыта"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{c.created_at?.slice(0, 10) ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  {c.status === "active" && (
                    <button
                      type="button"
                      onClick={() => void closeCampaign(c.id)}
                      className="text-sm font-medium text-amber-700 hover:underline"
                    >
                      Закрыть
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
