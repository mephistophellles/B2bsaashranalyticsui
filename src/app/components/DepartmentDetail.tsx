import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { apiFetch, parseErrorMessage } from "@/api/client";

type DepartmentEmployee = {
  id: number;
  name: string;
  status: string;
  essi: number;
  position: string | null;
};
type BlockMetric = {
  block_index: number;
  title: string;
  value: number;
  interpretation: string;
  action_hint: string;
};

export default function DepartmentDetail() {
  const { id } = useParams<{ id: string }>();
  const [name, setName] = useState("");
  const [avgEssi, setAvgEssi] = useState<number | null>(null);
  const [employees, setEmployees] = useState<DepartmentEmployee[]>([]);
  const [blocks, setBlocks] = useState<BlockMetric[]>([]);
  const [riskContributors, setRiskContributors] = useState<DepartmentEmployee[]>([]);
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
      const res = await apiFetch(`/departments/${id}/breakdown`);
      if (!res.ok) return;
      const j = (await res.json()) as {
        blocks: BlockMetric[];
        risk_contributors: DepartmentEmployee[];
      };
      setBlocks(j.blocks ?? []);
      setRiskContributors(j.risk_contributors ?? []);
    })();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const res = await apiFetch(`/employees/page?department_id=${id}&limit=50&offset=0`);
      if (!res.ok) return;
      const j = (await res.json()) as { items: DepartmentEmployee[] };
      setEmployees(j.items ?? []);
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
    <div className="p-6 max-w-3xl space-y-6">
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          <div className="rounded-xl border border-gray-200 px-3 py-2">
            <div className="text-xs text-gray-500">Сотрудников</div>
            <div className="text-lg font-semibold text-gray-900">{employees.length}</div>
          </div>
          <div className="rounded-xl border border-gray-200 px-3 py-2">
            <div className="text-xs text-gray-500">Высокая устойчивость</div>
            <div className="text-lg font-semibold text-green-700">
              {employees.filter((e) => e.status === "Высокая устойчивость").length}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 px-3 py-2">
            <div className="text-xs text-gray-500">Зона риска</div>
            <div className="text-lg font-semibold text-amber-700">
              {employees.filter((e) => e.status === "Зона риска").length}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 px-3 py-2">
            <div className="text-xs text-gray-500">Кризис</div>
            <div className="text-lg font-semibold text-red-700">
              {employees.filter((e) => e.status === "Кризис").length}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Индексы по 5 блокам</h2>
        {blocks.length === 0 ? (
          <p className="text-sm text-gray-500">Пока нет данных по блокам.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {blocks.map((b) => (
              <div key={b.block_index} className="rounded-xl border border-gray-200 px-3 py-3">
                <div className="text-xs text-gray-500">Блок {b.block_index}</div>
                <div className="font-medium text-gray-900">{b.title}</div>
                <div className="text-lg font-semibold text-[#0052FF]">{b.value.toFixed(1)}</div>
                <div className="text-xs text-gray-500">{b.interpretation}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Кто формирует риск/падение</h2>
        {riskContributors.length === 0 ? (
          <p className="text-sm text-gray-500">Нет данных по риску.</p>
        ) : (
          <div className="space-y-2">
            {riskContributors.slice(0, 5).map((employee) => (
              <Link
                key={employee.id}
                to={`/employees/${employee.id}`}
                className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2 hover:border-[#0052FF]"
              >
                <div>
                  <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                  <div className="text-xs text-gray-500">{employee.status}</div>
                </div>
                <div className="text-sm font-semibold text-gray-900">ESSI {employee.essi}</div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Сотрудники отдела</h2>
        {employees.length === 0 ? (
          <p className="text-sm text-gray-500">Нет сотрудников в отделе.</p>
        ) : (
          <div className="space-y-2">
            {employees.map((employee) => (
              <Link
                key={employee.id}
                to={`/employees/${employee.id}`}
                className="block rounded-xl border border-gray-200 px-3 py-2 hover:border-[#0052FF] transition-colors"
              >
                <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                <div className="text-xs text-gray-500">
                  {employee.position ?? "—"} · ESSI {employee.essi} · {employee.status}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
