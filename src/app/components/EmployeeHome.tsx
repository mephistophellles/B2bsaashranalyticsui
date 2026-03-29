import { useEffect, useState } from "react";
import { Link } from "react-router";
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
      <div className="rounded-2xl border border-gray-200 bg-white p-8 max-w-sm text-center shadow-sm">
        <div className="text-sm text-gray-500 mb-2">Ваш ESSI</div>
        <div className="text-5xl font-bold text-[#0052FF]">{Math.round(data.essi)}</div>
      </div>
      <Link
        to="/survey"
        className="inline-flex items-center justify-center px-5 py-2.5 rounded-2xl font-semibold text-white bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] shadow-md w-fit"
      >
        Пройти опрос
      </Link>
    </div>
  );
}
