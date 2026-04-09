import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Search } from "lucide-react";
import { apiFetch } from "@/api/client";

type Hit = { kind: string; id: number; label: string };

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (term: string) => {
    const t = term.trim();
    if (t.length < 1) {
      setHits([]);
      setBusy(false);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/search?q=${encodeURIComponent(t)}`);
    if (res.ok) {
      setHits(await res.json());
    } else {
      setHits([]);
      setError("Произошла ошибка. Попробуйте повторить действие.");
    }
    setBusy(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(q), 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, runSearch]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  function go(hit: Hit) {
    setOpen(false);
    setQ("");
    setHits([]);
    if (hit.kind === "employee") navigate(`/employees/${hit.id}`);
    else if (hit.kind === "department") navigate(`/departments/${hit.id}`);
  }

  return (
    <div ref={wrapRef} className="flex-1 max-w-md relative">
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          size={18}
        />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Поиск сотрудников и отделов…"
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0052FF] focus:border-transparent"
        />
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-72 overflow-y-auto py-1">
          {q.trim().length < 1 && (
            <p className="px-3 py-2 text-xs text-gray-500">Начните ввод для поиска</p>
          )}
          {q.trim().length >= 1 && busy && (
            <p className="px-3 py-2 text-xs text-gray-500">Идёт обработка данных…</p>
          )}
          {q.trim().length >= 1 && !busy && error && (
            <p className="px-3 py-2 text-xs text-red-600">{error}</p>
          )}
          {q.trim().length >= 1 && !busy && !error && hits.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-500">Ничего не найдено</p>
          )}
          {hits.length > 0 && (
            <ul>
              {hits.map((h) => (
                <li key={`${h.kind}-${h.id}`}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between gap-2"
                    onClick={() => go(h)}
                  >
                    <span className="text-gray-900 truncate">{h.label}</span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {h.kind === "employee" ? "Сотрудник" : "Отдел"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
