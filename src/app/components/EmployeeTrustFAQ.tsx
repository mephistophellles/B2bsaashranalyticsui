import { Link } from "react-router";

type EmployeeTrustFAQProps = {
  compact?: boolean;
};

const FAQ_ITEMS = [
  {
    q: "Что такое ESSI?",
    a: "ESSI — индекс устойчивости рабочего состояния сотрудника и команды. Он помогает увидеть общую динамику условий работы и вовлеченности, а не выставлять персональную оценку человеку.",
  },
  {
    q: "Зачем нужны повторные замеры?",
    a: "Повторные замеры позволяют сравнивать периоды, понимать, что изменилось после управленческих действий, и своевременно замечать новые риски.",
  },
  {
    q: "Что происходит после опроса?",
    a: "Ответы агрегируются в индексах и аналитике, после чего система формирует рекомендации для улучшения процессов, нагрузки и коммуникации в команде.",
  },
  {
    q: "Кто видит результаты?",
    a: "Руководитель и HR видят агрегированную управленческую картину по командам и подразделениям. Доступ к данным ограничен ролевой моделью платформы.",
  },
  {
    q: "Почему это не личная оценка?",
    a: "Опрос нужен для диагностики условий работы и устойчивости команды. Он не является инструментом персонального наказания или формальной аттестации по одному ответу.",
  },
];

export default function EmployeeTrustFAQ({ compact = false }: EmployeeTrustFAQProps) {
  if (compact) {
    return (
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <p>
          Это диагностика условий и процессов, а не личная оценка сотрудника.{" "}
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
