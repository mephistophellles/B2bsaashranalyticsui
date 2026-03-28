import { createBrowserRouter } from "react-router";
import Layout from "./components/Layout";
import Dashboard from "./components/Dashboard";
import Employees from "./components/Employees";
import Recommendations from "./components/Recommendations";
import Departments from "./components/Departments";
import Reports from "./components/Reports";
import Settings from "./components/Settings";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Dashboard },
      { path: "employees", Component: Employees },
      { path: "departments", Component: Departments },
      { path: "reports", Component: Reports },
      { path: "recommendations", Component: Recommendations },
      { path: "settings", Component: Settings },
    ],
  },
]);
