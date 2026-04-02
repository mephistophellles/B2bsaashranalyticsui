import { Link } from "react-router";

const packs = [
  { name: "Start", price: "от 79 000 ₽/мес", note: "до 100 сотрудников, базовая аналитика и отчеты" },
  { name: "Growth", price: "от 159 000 ₽/мес", note: "до 500 сотрудников, риски, рекомендации, экономика" },
  { name: "Enterprise", price: "индивидуально", note: "масштабирование, кастомные интеграции, расширенный ML-контур" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        <header className="rounded-3xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-8">
          <h1 className="text-4xl font-bold text-gray-900">ПОТЕНКОР</h1>
          <p className="mt-3 text-gray-700 max-w-3xl">
            Интеллектуальная HR-аналитическая платформа: измеряет устойчивость команд через ESSI, объясняет причины
            изменений, заранее показывает риски и формирует обоснованные рекомендации для управленческих решений.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/login" className="px-4 py-2 rounded-xl bg-[#0052FF] text-white font-medium">
              Войти в систему
            </Link>
          </div>
        </header>

        <section className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Для кого платформа</h2>
            <p className="text-sm text-gray-700">
              Для собственников, руководителей, HR и команд, которым нужно принимать решения на данных, а не
              интуитивно.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Что такое ESSI</h2>
            <p className="text-sm text-gray-700">
              ESSI — индекс устойчивости сотрудника и команды. Он показывает, где система работы держится стабильно, а
              где формируются риски выгорания, текучести и потери эффективности.
            </p>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Почему это дает преимущество</h2>
          <ul className="text-sm text-gray-700 space-y-2">
            <li>Показываем не только цифры, но и причины динамики по блокам.</li>
            <li>Выявляем риски раньше, чем они превращаются в текучесть и потери.</li>
            <li>Даем рекомендации с ожидаемым эффектом и отслеживанием результата.</li>
            <li>Связываем ESSI с экономикой: потери производительности, стоимость замены, управленческие риски.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">Тарифы и пакеты</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {packs.map((pack) => (
              <div key={pack.name} className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="text-lg font-semibold text-gray-900">{pack.name}</div>
                <div className="text-[#0052FF] font-bold mt-2">{pack.price}</div>
                <p className="text-sm text-gray-600 mt-2">{pack.note}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
