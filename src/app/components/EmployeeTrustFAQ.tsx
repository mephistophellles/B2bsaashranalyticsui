import { Link } from "react-router";

type EmployeeTrustFAQProps = {
  compact?: boolean;
};

const FAQ_ITEMS = [
  {
    q: "Что такое ESSI?",
    a: "ESSI — индекс устойчивости рабочего состояния сотрудника и команды. Показатели отражают текущую рабочую ситуацию; система анализирует данные в динамике, а не выставляет оценку личности.",
  },
  {
    q: "Зачем нужны повторные замеры?",
    a: "Повторные замеры позволяют сравнивать периоды, увидеть эффект управленческих решений и вовремя заметить новые риски. Выводы всегда опираются на совокупность факторов, а не на один момент.",
  },
  {
    q: "Что происходит после опроса?",
    a: "Ответы обобщаются в индексах и аналитике: система выявляет закономерности по команде. Рекомендации направлены на улучшение условий работы, нагрузки и коммуникации.",
  },
  {
    q: "Кто видит результаты?",
    a: "Руководитель и HR видят агрегированную картину по командам и подразделениям. Доступ ограничен ролями; это управленческая аналитика, а не разбор отдельных ответов.",
  },
  {
    q: "Почему это не личная оценка?",
    a: "Диагностика нужна для условий работы и устойчивости команды. Результаты не являются оценкой личности и не используются как персональное наказание или аттестация по одному ответу.",
  },
];

export default function EmployeeTrustFAQ({ compact = false }: EmployeeTrustFAQProps) {
  if (compact) {
    return (
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <p>
          Результаты не являются оценкой личности: это диагностика условий и процессов. Система анализирует данные в
          обобщённом виде.{" "}
          <Link to="/#employee-faq" className="font-medium underline">
            Подробнее о том, как работает ESSI
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <section id="employee-faq" className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">FAQ: как это работает и зачем</h2>
      <div className="space-y-3">
        {FAQ_ITEMS.map((item) => (
          <details key={item.q} className="rounded-xl border border-gray-200 px-4 py-3 group">
            <summary className="cursor-pointer text-sm font-medium text-gray-900 list-none">
              {item.q}
            </summary>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
