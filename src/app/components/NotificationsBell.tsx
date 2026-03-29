import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { apiFetch, parseErrorMessage } from "@/api/client";

type N = {
  id: number;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<N[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await apiFetch("/me/notifications");
    if (res.ok) setItems(await res.json());
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const unread = items.filter((x) => !x.read_at).length;

  async function markRead(id: number) {
    const res = await apiFetch(`/me/notifications/${id}/read`, { method: "PATCH" });
    if (res.ok) void load();
    else console.warn(await parseErrorMessage(res));
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Уведомления"
        onClick={() => {
          setOpen((o) => !o);
          void load();
        }}
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-[#0052FF] rounded-full">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1">
          {items.length === 0 ? (
            <p className="px-3 py-4 text-sm text-gray-500 text-center">Нет уведомлений</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`w-full text-left px-3 py-2.5 border-b border-gray-100 hover:bg-gray-50 text-sm ${
                  n.read_at ? "opacity-70" : ""
                }`}
                onClick={() => void markRead(n.id)}
              >
                <div className="font-medium text-gray-900">{n.title}</div>
                {n.body && <div className="text-xs text-gray-600 mt-0.5 line-clamp-2">{n.body}</div>}
                <div className="text-[10px] text-gray-400 mt-1">
                  {new Date(n.created_at).toLocaleString()}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
