import { Fragment, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { apiFetch, parseErrorMessage } from "@/api/client";
import { essiFromBlockSums } from "@/utils/essi";

type SurveyRow = {
  id: number;
  survey_date: string;
  source: string;
  score_block1: number;
  score_block2: number;
  score_block3: number;
  score_block4: number;
  score_block5: number;
};

type Detail = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  department: string;
  position: string | null;
  essi: number;
  engagement: number;
  productivity: number;
  trend: string;
  status: string;
  join_date: string | null;
  surveys: SurveyRow[];
  redacted?: boolean;
  has_linked_user?: boolean;
};

type Dept = { id: number; name: string };
type BlockMetric = {
  block_index: number;
  title: string;
  value: number;
  interpretation: string;
  action_hint: string;
};
type Recommendation = {
  id: number;
  title: string;
  description: string;
  priority: string;
  status: string;
};

export default function EmployeeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [editName, setEditName] = useState("");
  const [editDeptId, setEditDeptId] = useState<number | "">("");
  const [editPosition, setEditPosition] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [expandedSurveyId, setExpandedSurveyId] = useState<number | null>(null);
  const [blocks, setBlocks] = useState<BlockMetric[]>([]);
  const [recommendedActions, setRecommendedActions] = useState<Recommendation[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    const res = await apiFetch(`/employees/${id}`);
    if (!res.ok) {
      setErr(await parseErrorMessage(res));
      setData(null);
      return;
    }
    const j = (await res.json()) as Detail;
    setData(j);
    setEditName(j.name);
    setEditPosition(j.position ?? "");
    setEditEmail(j.email ?? "");
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const res = await apiFetch(`/employees/${id}/breakdown`);
      if (!res.ok) return;
      const j = (await res.json()) as {
        blocks: BlockMetric[];
        recommendations: Recommendation[];
      };
      setBlocks(j.blocks ?? []);
      setRecommendedActions(j.recommendations ?? []);
    })();
  }, [id]);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/departments");
      if (!res.ok) return;
      const rows = (await res.json()) as { id: number; name: string }[];
      setDepts(rows.map((r) => ({ id: r.id, name: r.name })));
    })();
  }, []);

  useEffect(() => {
    if (!data) return;
    const m = depts.find((r) => r.name === data.department);
    if (m) setEditDeptId(m.id);
  }, [data, depts]);

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!id || editDeptId === "") return;
    setSaving(true);
    setMsg(null);
    try {
      const body = data?.redacted
        ? { department_id: editDeptId }
        : {
            name: editName,
            department_id: editDeptId,
            position: editPosition || null,
            email: editEmail || null,
          };
      const res = await apiFetch(`/employees/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setMsg(await parseErrorMessage(res));
        return;
      }
      setMsg("Сохранено");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!id || !confirm("Удалить сотрудника? Допустимо только без опросов и без учётной записи.")) return;
    setDeleteErr(null);
    const res = await apiFetch(`/employees/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setDeleteErr(await parseErrorMessage(res));
      return;
    }
    navigate("/employees", { replace: true });
  }

  if (err || !data) {
    return (
      <div className="p-6 space-y-4">
        <Link to="/employees" className="text-sm text-[#0052FF] inline-flex items-center gap-1">
          <ArrowLeft size={16} /> К списку
        </Link>
        <p className="text-red-600">{err ?? "Загрузка…"}</p>
      </div>
    );
  }

  const canDelete =
    !data.redacted && data.surveys.length === 0 && !data.has_linked_user;

  return (
    <div className="p-6 max-w-4xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          to="/employees"
          className="text-sm font-medium text-[#0052FF] inline-flex items-center gap-1 hover:underline"
        >
          <ArrowLeft size={16} /> Назад к списку
        </Link>
        {!data.redacted && (
          <button
            type="button"
            disabled={!canDelete}
            title={
              canDelete
                ? "Удалить карточку (без опросов и без привязанного логина)"
                : data.surveys.length > 0
                  ? "Сначала удалите или архивируйте историю опросов (API не позволяет удалить с опросами)"
                  : data.has_linked_user
                    ? "Отвяжите учётную запись пользователя от этого сотрудника"
                    : "Удаление недоступно"
            }
            onClick={() => void remove()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Trash2 size={16} /> Удалить
          </button>
        )}
      </div>

      {deleteErr && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">
          {deleteErr}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">{data.name}</h1>
        <p className="text-gray-600 mt-1">
          {data.position ?? "—"} · {data.department}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="text-xs text-gray-500">ESSI</div>
          <div className="text-2xl font-bold text-[#0052FF]">{data.essi}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-xs text-gray-500">Статус</div>
          <div className="text-lg font-semibold">{data.status}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-xs text-gray-500">Вовлечённость</div>
          <div className="text-lg font-semibold">{data.engagement}%</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-xs text-gray-500">Продуктивность</div>
          <div className="text-lg font-semibold">{data.productivity}%</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-3">Отклонения по 5 блокам</h2>
        {blocks.length === 0 ? (
          <p className="text-sm text-gray-500">Нет данных по блокам.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {blocks.map((b) => (
              <div
                key={b.block_index}
                className="rounded-xl border border-gray-200 px-3 py-3"
                title={b.action_hint}
              >
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
        <h2 className="text-lg font-semibold mb-3">Рекомендации по действиям</h2>
        {recommendedActions.length === 0 ? (
          <p className="text-sm text-gray-500">Рекомендаций пока нет.</p>
        ) : (
          <div className="space-y-3">
            {recommendedActions.map((r) => (
              <div key={r.id} className="rounded-xl border border-gray-200 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-gray-900">{r.title}</div>
                  <span className="text-xs text-gray-500">{r.priority}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">{r.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {data.redacted ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
            Режим приватности: ФИО и контакты скрыты. Можно сменить только отдел. Удаление карточки в этом
            режиме недоступно.
          </p>
          <form
            onSubmit={(e) => void saveEdit(e)}
            className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3 shadow-sm max-w-md"
          >
            <h2 className="text-lg font-semibold">Отдел</h2>
            {msg && <p className="text-sm text-gray-700">{msg}</p>}
            <select
              className="w-full border rounded-xl px-3 py-2"
              value={editDeptId}
              onChange={(e) => setEditDeptId(Number(e.target.value))}
              required
            >
              <option value="">—</option>
              {depts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={saving || editDeptId === ""}
              className="px-4 py-2 rounded-xl bg-[#0052FF] text-white font-medium disabled:opacity-50"
            >
              {saving ? "Сохранение…" : "Сохранить отдел"}
            </button>
          </form>
        </div>
      ) : (
        <form
          onSubmit={(e) => void saveEdit(e)}
          className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 shadow-sm"
        >
          <h2 className="text-lg font-semibold">Редактирование</h2>
          {msg && <p className="text-sm text-gray-700">{msg}</p>}
          <div className="grid md:grid-cols-2 gap-3">
            <label className="text-sm block">
              ФИО
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </label>
            <label className="text-sm block">
              Отдел
              <select
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={editDeptId}
                onChange={(e) => setEditDeptId(Number(e.target.value))}
                required
              >
                <option value="">—</option>
                {depts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm block">
              Должность
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={editPosition}
                onChange={(e) => setEditPosition(e.target.value)}
              />
            </label>
            <label className="text-sm block">
              Email
              <input
                type="email"
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving || editDeptId === ""}
            className="px-4 py-2 rounded-xl bg-[#0052FF] text-white font-medium disabled:opacity-50"
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b font-semibold">История опросов</div>
        {data.surveys.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">Нет записей опросов.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left py-2 px-2 w-10" aria-hidden />
                  <th className="text-left py-2 px-4">Дата</th>
                  <th className="text-left py-2 px-4">Источник</th>
                  <th className="text-left py-2 px-4">Блоки 1–5 (суммы)</th>
                </tr>
              </thead>
              <tbody>
                {data.surveys.map((s) => {
                  const open = expandedSurveyId === s.id;
                  const surveyEssi = essiFromBlockSums(
                    s.score_block1,
                    s.score_block2,
                    s.score_block3,
                    s.score_block4,
                    s.score_block5,
                  );
                  return (
                    <Fragment key={s.id}>
                      <tr
                        role="button"
                        tabIndex={0}
                        className="border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => setExpandedSurveyId((x) => (x === s.id ? null : s.id))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ")
                            setExpandedSurveyId((x) => (x === s.id ? null : s.id));
                        }}
                      >
                        <td className="py-2 px-2 text-gray-500">
                          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </td>
                        <td className="py-2 px-4">{s.survey_date}</td>
                        <td className="py-2 px-4">{s.source === "ui" ? "В интерфейсе" : s.source}</td>
                        <td className="py-2 px-4 font-mono text-xs">
                          {s.score_block1.toFixed(1)} · {s.score_block2.toFixed(1)} ·{" "}
                          {s.score_block3.toFixed(1)} · {s.score_block4.toFixed(1)} ·{" "}
                          {s.score_block5.toFixed(1)}
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-slate-50 border-b border-gray-100">
                          <td colSpan={4} className="px-4 py-3 text-sm text-gray-700">
                            <div className="font-semibold text-gray-900 mb-2">
                              ИСУР по этому опросу: {surveyEssi} (сумма блоков / 125 × 100)
                            </div>
                            <ul className="list-disc list-inside space-y-1 text-gray-600">
                              <li>Блок 1: {s.score_block1.toFixed(1)}</li>
                              <li>Блок 2: {s.score_block2.toFixed(1)}</li>
                              <li>Блок 3: {s.score_block3.toFixed(1)}</li>
                              <li>Блок 4: {s.score_block4.toFixed(1)}</li>
                              <li>Блок 5: {s.score_block5.toFixed(1)}</li>
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
