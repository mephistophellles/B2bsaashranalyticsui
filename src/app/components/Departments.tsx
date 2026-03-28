import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { apiFetch } from "@/api/client";

type Row = {
  id: number;
  name: string;
  employee_count: number;
  avg_essi: number;
};

export default function Departments() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/departments");
      if (res.ok) setRows(await res.json());
    })();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Отделы</h1>
        <p className="text-gray-600">Сводка по отделам и среднему ESSI</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map((d) => (
          <div
            key={d.id}
            className="bg-white rounded-xl border border-gray-200 p-5 flex gap-4 items-start"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <Building2 className="text-[#0052FF]" size={24} />
            </div>
            <div>
              <div className="font-semibold text-gray-900">{d.name}</div>
              <div className="text-sm text-gray-500 mt-1">
                Сотрудников: {d.employee_count}
              </div>
              <div className="text-lg font-bold text-[#0052FF] mt-2">
                ESSI {d.avg_essi.toFixed(1)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
