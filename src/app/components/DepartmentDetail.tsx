import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { apiFetch, parseErrorMessage } from "@/api/client";

export default function DepartmentDetail() {
  const { id } = useParams<{ id: string }>();
  const [name, setName] = useState("");
  const [avgEssi, setAvgEssi] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [indexErr, setIndexErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const res = await apiFetch(`/departments/${id}`);
      if (!res.ok) {
        setErr(await parseErrorMessage(res));
        return;
      }
      const j = (await res.json()) as { id: number; name: string };
      setName(j.name);
    })();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const res = await apiFetch(`/departments/${id}/index`);
      if (!res.ok) {
        setIndexErr("Нет агрегированного ESSI по отделу");
        setAvgEssi(null);
        return;
      }
      const j = (await res.json()) as { avg_essi: number };
      setAvgEssi(j.avg_essi);
      setIndexErr(null);
    })();
  }, [id]);

  if (err) {
    return (
      <div className="p-6">
        <Link to="/departments" className="text-[#0052FF] text-sm inline-flex items-center gap-1">
          <ArrowLeft size={16} /> К отделам
        </Link>
        <p className="text-red-600 mt-4">{err}</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg space-y-6">
      <Link
        to="/departments"
        className="text-sm font-medium text-[#0052FF] inline-flex items-center gap-1 hover:underline"
      >
        <ArrowLeft size={16} /> Назад к отделам
      </Link>
      <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">{name || "…"}</h1>
        {avgEssi != null ? (
          <p className="mt-4 text-3xl font-bold text-[#0052FF]">Средний ESSI {avgEssi.toFixed(1)}</p>
        ) : (
          <p className="mt-4 text-sm text-gray-500">{indexErr}</p>
        )}
      </div>
    </div>
  );
}
