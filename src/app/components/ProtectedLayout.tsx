import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { apiFetch } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";

export default function ProtectedLayout() {
  const { token, user, loading } = useAuth();
  const location = useLocation();
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);

  useEffect(() => {
    if (!token || !user) {
      setConsentChecked(true);
      return;
    }
    if (user.role !== "employee") {
      setConsentChecked(true);
      setConsentAccepted(true);
      return;
    }
    void (async () => {
      const res = await apiFetch("/consent/status");
      if (!res.ok) {
        setConsentChecked(true);
        setConsentAccepted(false);
        return;
      }
      const status = (await res.json()) as { accepted: boolean };
      setConsentAccepted(Boolean(status.accepted));
      setConsentChecked(true);
    })();
  }, [token, user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] text-gray-600">
        Идёт обработка данных…
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  if (!consentChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] text-gray-600">
        Идёт обработка данных…
      </div>
    );
  }
  if (user?.role === "employee" && !consentAccepted && location.pathname !== "/consent") {
    return <Navigate to={`/consent?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <Outlet />;
}
