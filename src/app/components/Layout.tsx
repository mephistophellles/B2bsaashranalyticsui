import { Outlet, Link, useLocation } from "react-router";
import {
  LayoutDashboard,
  Users,
  Building2,
  FileText,
  Lightbulb,
  Settings,
  Search,
  Bell,
  ChevronDown,
} from "lucide-react";

const menuItems = [
  { path: "/", label: "Главная", icon: LayoutDashboard },
  { path: "/employees", label: "Сотрудники", icon: Users },
  { path: "/departments", label: "Отделы", icon: Building2 },
  { path: "/reports", label: "Отчеты", icon: FileText },
  { path: "/recommendations", label: "Рекомендации", icon: Lightbulb },
  { path: "/settings", label: "Настройки", icon: Settings },
];

export default function Layout() {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-screen bg-[#FAFAFA]">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] bg-clip-text text-transparent">
            ПОТЕНЦИАЛ
          </h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                  active
                    ? "bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] text-white shadow-sm"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          {/* Search */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              <input
                type="text"
                placeholder="Поиск сотрудников, отделов..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0052FF] focus:border-transparent"
              />
            </div>
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#0052FF] rounded-full"></span>
            </button>

            <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
              <div className="w-9 h-9 rounded-full bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] flex items-center justify-center text-white font-semibold">
                JD
              </div>
              <div className="flex items-center gap-2">
                <div>
                  <div className="text-sm font-medium">Иван Иванов</div>
                  <div className="text-xs text-gray-500">HR-менеджер</div>
                </div>
                <ChevronDown size={16} className="text-gray-400" />
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
