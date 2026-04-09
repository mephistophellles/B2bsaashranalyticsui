import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ClipboardList } from "lucide-react";
import { apiFetch, parseErrorMessage } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import EmployeeTrustFAQ from "./EmployeeTrustFAQ";

type Q = { id: number; block_index: number; order_in_block: number; text: string };

const CONSENT_KEY = "potential_pd_consent_v1";
const SURVEY_SHUFFLE_SEED_KEY = "potential_survey_shuffle_seed_v1";

const SURVEY_SUCCESS_MESSAGE = "Спасибо! Ответы сохранены.";

const FALLBACK_BLOCK_TITLES: Record<number, string> = {
  1: "Блок 1",
  2: "Блок 2",
  3: "Блок 3",
  4: "Блок 4",
  5: "Блок 5",
};

export default function Survey() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const campaignIdParam = searchParams.get("campaign");
  const campaignId =
    campaignIdParam && /^\d+$/.test(campaignIdParam) ? Number(campaignIdParam) : null;
  const [questions, setQuestions] = useState<Q[]>([]);
  const [blockTitles, setBlockTitles] = useState<Record<number, string>>({});
  const [scores, setScores] = useState<Record<number, number>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [consentOk, setConsentOk] = useState(() => sessionStorage.getItem(CONSENT_KEY) === "1");
  const [consentBusy, setConsentBusy] = useState(false);
  const [blockStep, setBlockStep] = useState(0);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(0);

  useEffect(() => {
    const existing = sessionStorage.getItem(SURVEY_SHUFFLE_SEED_KEY);
    if (existing && /^\d+$/.test(existing)) {
      setShuffleSeed(Number(existing));
      return;
    }
    const generated = Math.floor(Math.random() * 1_000_000_000);
    sessionStorage.setItem(SURVEY_SHUFFLE_SEED_KEY, String(generated));
    setShuffleSeed(generated);
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/surveys/template");
      if (!res.ok) return;
      const data = (await res.json()) as {
        questions: Q[];
        block_titles: { block_index: number; title: string }[];
      };
      setQuestions(data.questions ?? []);
      const titles: Record<number, string> = {};
      for (const row of data.block_titles ?? []) {
        titles[row.block_index] = row.title;
      }
      setBlockTitles(titles);
    })();
  }, []);

  const blocks = useMemo(() => {
    const map = new Map<number, Q[]>();
    for (const q of questions) {
      const arr = map.get(q.block_index) ?? [];
      arr.push(q);
      map.set(q.block_index, arr);
    }
    function hashWithSeed(id: number) {
      const x = Math.sin(id * 99991 + shuffleSeed) * 10000;
      return x - Math.floor(x);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([idx, qs]) => ({
        blockIndex: idx,
        questions: [...qs].sort((a, b) => hashWithSeed(a.id) - hashWithSeed(b.id)),
      }));
  }, [questions, shuffleSeed]);

  const current = blocks[blockStep];
  const progress = blocks.length ? ((blockStep + 1) / blocks.length) * 100 : 0;

  async function acceptConsent() {
    setConsentBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch("/consent", {
        method: "POST",
        body: JSON.stringify({ accepted: true }),
      });
      if (!res.ok) {
        setMsg(await parseErrorMessage(res));
        return;
      }
      sessionStorage.setItem(CONSENT_KEY, "1");
      setConsentOk(true);
    } catch {
      setMsg("Произошла ошибка. Попробуйте повторить действие.");
    } finally {
      setConsentBusy(false);
    }
  }

  async function submit() {
    setMsg(null);
    const byBlock: Record<number, number[]> = {};
    for (const q of questions) {
      const v = scores[q.id];
      if (v == null) {
        setMsg("Ответьте на все вопросы");
        return;
      }
      if (!byBlock[q.block_index]) byBlock[q.block_index] = [];
      byBlock[q.block_index].push(v);
    }
    const bodyBlocks = Object.entries(byBlock)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, vals]) => ({
        block_index: Number(k),
        scores: vals,
      }));
    setSubmitBusy(true);
    try {
      const payload: Record<string, unknown> = { blocks: bodyBlocks };
      if (campaignId != null) payload.campaign_id = campaignId;
      const res = await apiFetch("/surveys", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (res.ok) setMsg(SURVEY_SUCCESS_MESSAGE);
      else setMsg(await parseErrorMessage(res));
    } catch {
      setMsg("Произошла ошибка. Попробуйте повторить действие.");
    } finally {
      setSubmitBusy(false);
    }
  }

  if (user?.role !== "employee") {
    return (
      <div className="p-6 text-gray-600 rounded-2xl border border-dashed border-gray-200 bg-white max-w-xl">
        Опрос доступен сотрудникам. Войдите как <code className="text-sm bg-gray-100 px-1 rounded">employee</code>.
      </div>
    );
  }

  if (!consentOk) {
    return (
      <div className="p-6 max-w-xl space-y-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Согласие на обработку ПДн</h1>
          <div className="hidden sm:flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2">
            <ClipboardList className="text-[#0052FF]" size={16} />
            <span className="text-xs font-medium text-blue-900">Юридическое подтверждение</span>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4 text-sm text-gray-700 leading-relaxed">
          <p>
            Перед прохождением опроса необходимо согласие на обработку персональных данных в соответствии с
            ФЗ-152. Данные используются для расчёта обезличенных показателей и рекомендаций для организации.
          </p>
          <p className="text-[#0052FF]">
            Это диагностика условий и процессов, не личная оценка сотрудника.
          </p>
          {msg && <p className="text-red-600">{msg}</p>}
          <button
            type="button"
            disabled={consentBusy}
            onClick={() => void acceptConsent()}
            className="w-full py-3 rounded-2xl font-semibold text-white bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] disabled:opacity-50 shadow-md"
          >
            {consentBusy ? "Отправка…" : "Согласен, продолжить"}
          </button>
        </div>
      </div>
    );
  }

  if (msg === SURVEY_SUCCESS_MESSAGE) {
    return (
      <div className="p-6 max-w-xl rounded-2xl border border-green-200 bg-green-50/80 text-green-900 space-y-4">
        <h2 className="text-xl font-bold">Спасибо!</h2>
        <div className="text-sm space-y-2 leading-relaxed">
          <p>Результат сформирован на основе ваших ответов и отражает текущую рабочую ситуацию.</p>
          <p>Он может изменяться при изменении условий работы.</p>
          <p>Результат используется для улучшения процессов и условий внутри команды.</p>
        </div>
        <Link
          to="/my-recommendations"
          className="inline-flex px-4 py-2 rounded-xl bg-green-700 text-white text-sm font-medium hover:bg-green-800"
        >
          К рекомендациям
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Опрос ESSI</h1>
          <div className="hidden sm:flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2">
            <ClipboardList className="text-[#0052FF]" size={16} />
            <span className="text-xs font-medium text-blue-900">Диагностика условий труда</span>
          </div>
        </div>
        {campaignId != null && (
          <p className="text-sm text-[#0052FF] font-medium mt-1">Кампания #{campaignId}</p>
        )}
        <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700 space-y-2 leading-relaxed">
          <p>Диагностика позволяет выявить факторы, влияющие на работу, и определить возможные улучшения.</p>
          <p>Чем точнее ответы, тем более точными будут рекомендации.</p>
          <p>Результаты не используются для оценки и не влекут негативных последствий.</p>
        </div>
        <p className="text-sm text-gray-500 mt-3">
          Блок {blockStep + 1} из {blocks.length || 1}. Шкала Лайкерта: 1 — полностью не согласен; 2 — скорее не
          согласен; 3 — затрудняюсь ответить; 4 — скорее согласен; 5 — полностью согласен.
        </p>
        <p className="text-sm text-blue-900 mt-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
          Система анализирует данные в динамике. Показатели отражают текущую рабочую ситуацию.
        </p>
      </div>
      <EmployeeTrustFAQ compact />
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-gray-600 leading-relaxed">
        Отвечайте, исходя из текущей ситуации. Система анализирует общие закономерности, а не отдельные ответы.
      </p>
      {current && (
        <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0052FF] uppercase tracking-wide">
            Блок {current.blockIndex}.{" "}
            {blockTitles[current.blockIndex] ?? FALLBACK_BLOCK_TITLES[current.blockIndex] ?? ""}
          </h2>
          {current.questions.map((q) => (
            <div key={q.id} className="space-y-3 pb-4 border-b border-gray-100 last:border-0 last:pb-0">
              <p className="text-sm font-medium text-gray-900 leading-snug">{q.text}</p>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setScores((s) => ({ ...s, [q.id]: n }))}
                    className={`min-w-[2.75rem] py-2.5 px-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                      scores[q.id] === n
                        ? "border-[#0052FF] bg-[#0052FF] text-white shadow-md"
                        : "border-gray-200 text-gray-700 hover:border-[#0052FF]/50"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {msg && msg !== SURVEY_SUCCESS_MESSAGE && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2">{msg}</div>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={blockStep === 0}
          onClick={() => setBlockStep((s) => Math.max(0, s - 1))}
          className="px-5 py-2.5 rounded-xl border border-gray-300 font-medium disabled:opacity-40"
        >
          Назад
        </button>
        {blockStep < blocks.length - 1 ? (
          <button
            type="button"
            onClick={() => {
              for (const q of current?.questions ?? []) {
                if (scores[q.id] == null) {
                  setMsg("Ответьте на все вопросы в этом блоке");
                  return;
                }
              }
              setMsg(null);
              setBlockStep((s) => s + 1);
            }}
            className="px-5 py-2.5 rounded-xl font-medium text-white bg-gradient-to-r from-[#0052FF] to-[#4D7CFF]"
          >
            Далее
          </button>
        ) : (
          <button
            type="button"
            disabled={submitBusy}
            onClick={() => void submit()}
            className="px-5 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] shadow-md disabled:opacity-50"
          >
            {submitBusy ? "Отправка…" : "Отправить"}
          </button>
        )}
      </div>
    </div>
  );
}
