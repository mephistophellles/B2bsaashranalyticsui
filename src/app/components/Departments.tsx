import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Building2, Pencil, Trash2, Plus, X } from "lucide-react";
import { apiFetch, parseErrorMessage } from "@/api/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type Row = {
  id: number;
  name: string;
  employee_count: number;
  avg_essi: number;
};

export default function Departments() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "employee_count" | "avg_essi">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const pageSize = 6;
  const [newName, setNewName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Row | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [addFormOpen, setAddFormOpen] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String((page - 1) * pageSize),
      sort_by: sortBy,
      sort_order: sortOrder,
    });
    if (q.trim()) params.set("q", q.trim());
    const res = await apiFetch(`/departments/page?${params}`);
    if (res.ok) {
      const j = (await res.json()) as { items: Row[]; total: number };
      setRows(j.items ?? []);
      setTotal(j.total ?? 0);
    }
  }, [page, q, sortBy, sortOrder]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!msg) return;
    const timer = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [msg]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [total, page]);

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

  async function renameDept() {
    if (!renameTarget || !renameName.trim()) return;
    setRenameBusy(true);
    const res = await apiFetch(`/departments/${renameTarget.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: renameName.trim() }),
    });
    if (!res.ok) {
      setMsg(await parseErrorMessage(res));
      setRenameBusy(false);
      return;
    }
    setRenameTarget(null);
    setRenameBusy(false);
    await load();
  }

  async function deleteDept() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    const res = await apiFetch(`/departments/${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) {
      setMsg(await parseErrorMessage(res));
      setDeleteBusy(false);
      return;
    }
    setDeleteTarget(null);
    setDeleteBusy(false);
    await load();
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center shadow-sm">
          <Building2 className="text-[#0052FF]" size={26} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Отделы</h1>
          <p className="text-sm text-gray-600">Сводка, создание и редактирование</p>
        </div>
      </div>

      {msg && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2">{msg}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-end">
        <label className="text-sm text-gray-600 flex flex-col gap-1">
          Поиск
          <input
            className="h-11 border rounded-xl px-3 w-56"
            placeholder="Название отдела"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="text-sm text-gray-600 flex flex-col gap-1">
          Сортировка
          <Select
            value={sortBy}
            onValueChange={(value) => {
              setSortBy(value as typeof sortBy);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-11 min-w-44 rounded-xl border-gray-300 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Название</SelectItem>
              <SelectItem value="employee_count">Число сотрудников</SelectItem>
              <SelectItem value="avg_essi">Средний ESSI</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="text-sm text-gray-600 flex flex-col gap-1">
          Порядок
          <Select
            value={sortOrder}
            onValueChange={(value) => {
              setSortOrder(value as typeof sortOrder);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-11 min-w-44 rounded-xl border-gray-300 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">По возрастанию</SelectItem>
              <SelectItem value="desc">По убыванию</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setAddFormOpen((v) => !v)}
            className={`flex items-center gap-2 h-11 px-4 rounded-xl font-medium text-sm transition-all ${
              addFormOpen
                ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                : "bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] text-white hover:shadow-lg"
            }`}
          >
            {addFormOpen ? <X size={18} /> : <Plus size={18} />}
            <span>{addFormOpen ? "Закрыть" : "Добавить отдел"}</span>
          </button>
        </div>
      </div>

      {addFormOpen && (
        <form
          onSubmit={(e) => void createDept(e)}
          className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-end shadow-sm"
        >
          <div className="flex items-center justify-between w-full mb-1">
            <h2 className="text-sm font-semibold text-gray-800">Новый отдел</h2>
            <button type="button" onClick={() => setAddFormOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
          <label className="flex-1 min-w-[200px] text-sm text-gray-600 flex flex-col gap-1">
            Название
            <input
              className="w-full border rounded-xl px-3 py-2"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Введите название отдела"
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
      )}

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
                  onClick={() => {
                    setRenameTarget(d);
                    setRenameName(d.name);
                  }}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                  <Pencil size={14} /> Переименовать
                </button>
                <button
                  type="button"
                  disabled={d.employee_count > 0}
                  onClick={() => setDeleteTarget(d)}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:hover:bg-transparent"
                  title={d.employee_count > 0 ? "Нельзя удалить: в отделе есть сотрудники" : "Удалить отдел"}
                >
                  <Trash2 size={14} /> Удалить
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between text-sm">
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
          Страница {page} из {Math.max(1, Math.ceil(total / pageSize))} · всего {total}
        </span>
        <button
          type="button"
          disabled={page >= Math.ceil(total / pageSize)}
          onClick={() => setPage((p) => p + 1)}
          className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40"
        >
          Вперёд
        </button>
      </div>
      <Dialog open={renameTarget != null} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Переименование отдела</DialogTitle>
            <DialogDescription>Введите новое название отдела.</DialogDescription>
          </DialogHeader>
          <input
            className="w-full border rounded-xl px-3 py-2"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            placeholder="Название отдела"
          />
          <DialogFooter>
            <button
              type="button"
              className="px-4 py-2 rounded-xl border border-gray-300"
              onClick={() => setRenameTarget(null)}
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={renameBusy || !renameName.trim()}
              className="px-4 py-2 rounded-xl bg-[#0052FF] text-white disabled:opacity-50"
              onClick={() => void renameDept()}
            >
              {renameBusy ? "Сохранение..." : "Сохранить"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteTarget != null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удаление отдела</DialogTitle>
            <DialogDescription>
              Подтвердите удаление отдела {deleteTarget ? `«${deleteTarget.name}»` : ""}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              className="px-4 py-2 rounded-xl border border-gray-300"
              onClick={() => setDeleteTarget(null)}
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={deleteBusy}
              className="px-4 py-2 rounded-xl bg-red-600 text-white disabled:opacity-50"
              onClick={() => void deleteDept()}
            >
              {deleteBusy ? "Удаление..." : "Удалить"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
