import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { apiFetch, parseErrorMessage } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";

type Q = { id: number; block_index: number; order_in_block: number; text: string };

const CONSENT_KEY = "potential_pd_consent_v1";

export default function Survey() {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<Q[]>([]);
  const [scores, setScores] = useState<Record<number, number>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [consentOk, setConsentOk] = useState(() => sessionStorage.getItem(CONSENT_KEY) === "1");
  const [consentBusy, setConsentBusy] = useState(false);
  const [blockStep, setBlockStep] = useState(0);
  const [submitBusy, setSubmitBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/surveys/template");
      if (res.ok) setQuestions(await res.json());
    })();
  }, []);

  const blocks = useMemo(() => {
    const map = new Map<number, Q[]>();
    for (const q of questions) {
      const arr = map.get(q.block_index) ?? [];
      arr.push(q);
      map.set(q.block_index, arr);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([idx, qs]) => ({ blockIndex: idx, questions: qs.sort((a, b) => a.order_in_block - b.order_in_block) }));
  }, [questions]);

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
      setMsg("Ошибка сети");
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
      const res = await apiFetch("/surveys", {
        method: "POST",
        body: JSON.stringify({ blocks: bodyBlocks }),
      });
      if (res.ok) setMsg("Спасибо! Ответы сохранены.");
      else setMsg(await parseErrorMessage(res));
    } catch {
      setMsg("Ошибка сети. Проверьте подключение и попробуйте снова.");
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
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Согласие на обработку ПДн</h1>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4 text-sm text-gray-700 leading-relaxed">
          <p>
            Перед прохождением опроса необходимо согласие на обработку персональных данных в соответствии с
            ФЗ-152. Данные используются для расчёта обезличенных показателей и рекомендаций для организации.
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

  if (msg === "Спасибо! Ответы сохранены.") {
    return (
      <div className="p-6 max-w-xl rounded-2xl border border-green-200 bg-green-50/80 text-green-900 space-y-4">
        <h2 className="text-xl font-bold">Спасибо!</h2>
        <p className="text-sm">Ваши ответы сохранены.</p>
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
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Опрос ESSI</h1>
        <p className="text-sm text-gray-500 mt-1">
          Блок {blockStep + 1} из {blocks.length || 1}. Шкала: 1 — не согласен, 5 — полностью согласен.
        </p>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      {current && (
        <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0052FF] uppercase tracking-wide">
            Блок {current.blockIndex}
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
      {msg && msg !== "Спасибо! Ответы сохранены." && (
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
