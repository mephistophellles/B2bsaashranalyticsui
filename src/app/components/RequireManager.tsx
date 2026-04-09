import { Navigate, Outlet } from "react-router";
import { useAuth } from "@/auth/AuthContext";

/** Сотрудник не может открыть дочерние маршруты по прямой ссылке. */
export default function RequireManager() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="p-6 text-gray-500 flex justify-center min-h-[30vh] items-center">
        Идёт обработка данных…
      </div>
    );
  }
  if (user?.role === "employee") {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
