import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Building2, Pencil, Trash2 } from "lucide-react";
import { apiFetch, parseErrorMessage } from "@/api/client";

type Row = {
  id: number;
  name: string;
  employee_count: number;
  avg_essi: number;
};

export default function Departments() {
  const [rows, setRows] = useState<Row[]>([]);
  const [newName, setNewName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch("/departments");
    if (res.ok) setRows(await res.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createDept(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch("/departments", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) {
        setMsg(await parseErrorMessage(res));
        return;
      }
      setNewName("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function renameDept(id: number, current: string) {
    const name = window.prompt("Новое название отдела", current);
    if (name == null || !name.trim()) return;
    const res = await apiFetch(`/departments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!res.ok) {
      setMsg(await parseErrorMessage(res));
      return;
    }
    await load();
  }

  async function deleteDept(id: number, name: string) {
    if (!confirm(`Удалить отдел «${name}»? Только если в нём нет сотрудников.`)) return;
    const res = await apiFetch(`/departments/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setMsg(await parseErrorMessage(res));
      return;
    }
    await load();
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Отделы</h1>
        <p className="text-gray-600">Сводка, создание и редактирование</p>
      </div>

      {msg && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2">{msg}</div>
      )}

      <form
        onSubmit={(e) => void createDept(e)}
        className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-end max-w-xl"
      >
        <label className="flex-1 min-w-[200px] text-sm">
          Новый отдел
          <input
            className="mt-1 w-full border rounded-xl px-3 py-2"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Название"
            required
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 rounded-xl bg-[#0052FF] text-white font-medium disabled:opacity-50"
        >
          {busy ? "…" : "Создать"}
        </button>
      </form>

      {rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-gray-500">
          Нет отделов в базе. Создайте отдел выше или выполните seed.
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map((d) => (
          <div
            key={d.id}
            className="bg-white rounded-xl border border-gray-200 p-5 flex gap-4 items-start shadow-sm"
          >
            <Link
              to={`/departments/${d.id}`}
              className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 hover:bg-blue-100"
            >
              <Building2 className="text-[#0052FF]" size={24} />
            </Link>
            <div className="min-w-0 flex-1">
              <Link to={`/departments/${d.id}`} className="font-semibold text-gray-900 hover:text-[#0052FF]">
                {d.name}
              </Link>
              <div className="text-sm text-gray-500 mt-1">Сотрудников: {d.employee_count}</div>
              <div className="text-lg font-bold text-[#0052FF] mt-2">ESSI {d.avg_essi.toFixed(1)}</div>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => void renameDept(d.id, d.name)}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                  <Pencil size={14} /> Переименовать
                </button>
                <button
                  type="button"
                  onClick={() => void deleteDept(d.id, d.name)}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                >
                  <Trash2 size={14} /> Удалить
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
