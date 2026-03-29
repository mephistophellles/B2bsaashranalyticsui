import { createElement } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import Layout from "./components/Layout";
import Dashboard from "./components/Dashboard";
import Employees from "./components/Employees";
import EmployeeDetail from "./components/EmployeeDetail";
import Recommendations from "./components/Recommendations";
import Departments from "./components/Departments";
import DepartmentDetail from "./components/DepartmentDetail";
import Reports from "./components/Reports";
import Settings from "./components/Settings";
import Login from "./components/Login";
import ProtectedLayout from "./components/ProtectedLayout";
import RequireManager from "./components/RequireManager";
import Survey from "./components/Survey";
import RoleHome from "./components/RoleHome";
import MyRecommendations from "./components/MyRecommendations";
import MySurveyDetail from "./components/MySurveyDetail";
import SurveyCampaigns from "./components/SurveyCampaigns";

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
          { path: "my-surveys/:id", Component: MySurveyDetail },
          { path: "my-recommendations", Component: MyRecommendations },
          { path: "my-recommendations/:id", Component: MyRecommendations },
          {
            Component: RequireManager,
            children: [
              {
                path: "dashboard",
                Component: () => createElement(Navigate, { to: "/", replace: true }),
              },
              { path: "employees", Component: Employees },
              { path: "employees/:id", Component: EmployeeDetail },
              { path: "departments", Component: Departments },
              { path: "departments/:id", Component: DepartmentDetail },
              { path: "reports", Component: Reports },
              { path: "survey-campaigns", Component: SurveyCampaigns },
              { path: "recommendations", Component: Recommendations },
              { path: "recommendations/:id", Component: Recommendations },
            ],
          },
          { path: "settings", Component: Settings },
        ],
      },
    ],
  },
]);
