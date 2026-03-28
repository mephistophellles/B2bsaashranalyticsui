import { useEffect, useState } from "react";
import { apiFetch } from "@/api/client";

type Summary = {
  name: string;
  department: string;
  essi: number;
  position: string | null;
};

export default function EmployeeHome() {
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/me/summary");
      if (res.ok) setData(await res.json());
    })();
  }, []);

  if (!data) {
    return <div className="p-6 text-gray-500">Загрузка профиля…</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Здравствуйте, {data.name}</h1>
      <p className="text-gray-600">{data.position}</p>
      <p className="text-gray-600">Отдел: {data.department}</p>
      <div className="rounded-2xl border border-gray-200 bg-white p-8 max-w-sm text-center">
        <div className="text-sm text-gray-500 mb-2">Ваш ESSI</div>
        <div className="text-5xl font-bold text-[#0052FF]">{Math.round(data.essi)}</div>
      </div>
    </div>
  );
}
