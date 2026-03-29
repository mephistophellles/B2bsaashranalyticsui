import { createBrowserRouter } from "react-router";
import Layout from "./components/Layout";
import Dashboard from "./components/Dashboard";
import Employees from "./components/Employees";
import Recommendations from "./components/Recommendations";
import Departments from "./components/Departments";
import Reports from "./components/Reports";
import Settings from "./components/Settings";
import Login from "./components/Login";
import ProtectedLayout from "./components/ProtectedLayout";
import RequireManager from "./components/RequireManager";
import Survey from "./components/Survey";
import RoleHome from "./components/RoleHome";
import MyRecommendations from "./components/MyRecommendations";

export const router = createBrowserRouter([
  { path: "/login", Component: Login },
  {
    path: "/",
    Component: ProtectedLayout,
    children: [
      {
        Component: Layout,
        children: [
          { index: true, Component: RoleHome },
          { path: "survey", Component: Survey },
          { path: "my-recommendations", Component: MyRecommendations },
          {
            Component: RequireManager,
            children: [
              { path: "dashboard", Component: Dashboard },
              { path: "employees", Component: Employees },
              { path: "departments", Component: Departments },
              { path: "reports", Component: Reports },
              { path: "recommendations", Component: Recommendations },
            ],
          },
          { path: "settings", Component: Settings },
        ],
      },
    ],
  },
]);
