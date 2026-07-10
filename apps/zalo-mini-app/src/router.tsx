import { createBrowserRouter } from "react-router-dom";
import Layout from "@/components/layout";
import AuthGuard from "@/components/auth-guard";
import LoginPage from "@/pages/auth/login";
import RegisterPage from "@/pages/auth/register";
import SelectBranchPage from "@/pages/auth/select-branch";
import DashboardPage from "@/pages/dashboard";
import OrdersPage from "@/pages/orders";
import CatalogPage from "@/pages/catalog/category-list";
import SettingsPage from "@/pages/settings";

import { getBasePath } from "@/utils/zma";

const router = createBrowserRouter(
  [
    // Public routes
    { path: "/login", element: <LoginPage /> },
    { path: "/register", element: <RegisterPage /> },
    // Semi-protected (needs auth but not shop)
    { path: "/select-branch", element: <SelectBranchPage /> },
    // Protected routes (needs auth + shop)
    {
      path: "/",
      element: (
        <AuthGuard>
          <Layout />
        </AuthGuard>
      ),
      children: [
        {
          path: "/",
          element: <DashboardPage />,
          handle: { title: "Tổng quan", logo: true },
        },
        {
          path: "/orders",
          element: <OrdersPage />,
          handle: { title: "Đơn hàng" },
        },
        {
          path: "/orders/:status?",
          element: <OrdersPage />,
          handle: { title: "Đơn hàng" },
        },
        {
          path: "/products",
          element: <CatalogPage />,
          handle: { title: "Sản phẩm" },
        },
        {
          path: "/settings",
          element: <SettingsPage />,
          handle: { title: "Cài đặt" },
        },
      ],
    },
  ],
  { basename: getBasePath() }
);

export default router;
