import { Outlet, Link, useLocation, useNavigate } from "react-router";
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
  ClipboardList,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";

const managerMenu = [
  { path: "/", label: "Главная", icon: LayoutDashboard },
  { path: "/employees", label: "Сотрудники", icon: Users },
  { path: "/departments", label: "Отделы", icon: Building2 },
  { path: "/reports", label: "Отчеты", icon: FileText },
  { path: "/recommendations", label: "Рекомендации", icon: Lightbulb },
  { path: "/settings", label: "Настройки", icon: Settings },
];

const employeeMenu = [
  { path: "/", label: "Главная", icon: LayoutDashboard },
  { path: "/survey", label: "Опрос", icon: ClipboardList },
  { path: "/my-recommendations", label: "Рекомендации", icon: Lightbulb },
  { path: "/settings", label: "Настройки", icon: Settings },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isEmployee = user?.role === "employee";
  const menuItems = isEmployee ? employeeMenu : managerMenu;

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const initials =
    (user?.username?.slice(0, 2) ?? "U").toUpperCase();
  const subtitle =
    user?.role === "manager"
      ? "Руководитель"
      : user?.role === "admin"
        ? "Администратор"
        : "Сотрудник";

  return (
    <div className="flex h-screen bg-[#FAFAFA]">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] bg-clip-text text-transparent">
            ПОТЕНЦИАЛ
          </h1>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
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

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          {!isEmployee && (
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
          )}
          {isEmployee && <div className="flex-1" />}

          <div className="flex items-center gap-4">
            <button
              type="button"
              className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Уведомления"
            >
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#0052FF] rounded-full" />
            </button>

            <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
              <div className="w-9 h-9 rounded-full bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] flex items-center justify-center text-white font-semibold text-sm">
                {initials}
              </div>
              <div className="flex items-center gap-2">
                <div>
                  <div className="text-sm font-medium">{user?.username ?? "—"}</div>
                  <div className="text-xs text-gray-500">{subtitle}</div>
                </div>
                <ChevronDown size={16} className="text-gray-400" />
              </div>
              <button
                type="button"
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                title="Выход"
                onClick={() => {
                  logout();
                  navigate("/login", { replace: true });
                }}
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
