import { useEffect, useRef, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard,
  Users,
  Building2,
  FileText,
  Lightbulb,
  Settings,
  ChevronDown,
  ClipboardList,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import GlobalSearch from "./GlobalSearch";
import NotificationsBell from "./NotificationsBell";

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
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!profileRef.current?.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

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
            ПОТЕНКОР
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
          {!isEmployee && <GlobalSearch />}
          {isEmployee && <div className="flex-1" />}

          <div className="flex items-center gap-4">
            <NotificationsBell />

            <div
              ref={profileRef}
              className="flex items-center gap-2 pl-4 border-l border-gray-200 relative"
            >
              <button
                type="button"
                className="flex items-center gap-3 rounded-lg hover:bg-gray-50 px-1 py-1 -my-1"
                onClick={() => setProfileOpen((o) => !o)}
                aria-expanded={profileOpen}
                aria-haspopup="menu"
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] flex items-center justify-center text-white font-semibold text-sm">
                  {initials}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="text-sm font-medium">{user?.username ?? "—"}</div>
                  <div className="text-xs text-gray-500">{subtitle}</div>
                </div>
                <ChevronDown size={16} className="text-gray-400" />
              </button>
              {profileOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50"
                  role="menu"
                >
                  <Link
                    to="/settings"
                    className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setProfileOpen(false)}
                  >
                    Настройки
                  </Link>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => {
                      setProfileOpen(false);
                      logout();
                      navigate("/login", { replace: true });
                    }}
                  >
                    Выход
                  </button>
                </div>
              )}
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
