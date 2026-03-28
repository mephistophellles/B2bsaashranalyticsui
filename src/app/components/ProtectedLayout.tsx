import { Navigate, Outlet } from "react-router";
import { useAuth } from "@/auth/AuthContext";

export default function ProtectedLayout() {
  const { token, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] text-gray-600">
        Загрузка…
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}
