import { Link } from "react-router";
import { ShieldCheck } from "lucide-react";

export default function PublicConsent() {
  return (
    <div className="min-h-screen bg-[#FAFAFA] p-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold text-gray-900">Условия обработки персональных данных</h1>
          <div className="hidden sm:flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2">
            <ShieldCheck className="text-[#0052FF]" size={16} />
            <span className="text-xs font-medium text-blue-900">Публичные правовые условия</span>
          </div>
        </div>
        <p className="text-sm text-gray-700 leading-relaxed">
          ПОТЕНКОР применяет данные опросов и профильные данные сотрудников для расчета индекса ESSI, оценки динамики
          устойчивости, выявления рисков и подготовки рекомендаций для улучшения управленческих решений.
        </p>
        <p className="text-sm text-gray-700 leading-relaxed">
          Платформа ориентирована на поддержку сотрудников и команд. Результаты используются для развития процессов,
          а не для автоматических карательных действий. Полный юридический текст будет обновляться по мере правовых
          требований.
        </p>
        <Link to="/login" className="inline-flex px-4 py-2 rounded-xl bg-[#0052FF] text-white text-sm font-medium">
          Вернуться ко входу
        </Link>
      </div>
    </div>
  );
}
