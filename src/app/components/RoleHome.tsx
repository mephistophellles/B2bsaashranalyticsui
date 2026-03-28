import { useAuth } from "@/auth/AuthContext";
import Dashboard from "./Dashboard";
import EmployeeHome from "./EmployeeHome";

export default function RoleHome() {
  const { user } = useAuth();
  if (user?.role === "employee") return <EmployeeHome />;
  return <Dashboard />;
}
