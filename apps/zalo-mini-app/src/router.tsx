import { createBrowserRouter } from "react-router-dom";
import Layout from "@/components/layout";
import AuthGuard from "@/components/auth-guard";
import LoginPage from "@/pages/auth/login";
import RegisterPage from "@/pages/auth/register";
import SelectBranchPage from "@/pages/auth/select-branch";
import DashboardPage from "@/pages/dashboard";
import OrdersPage from "@/pages/orders";
import OrderDetailPage from "@/pages/orders/detail";
import PosPage from "@/pages/pos";
import CashbookPage from "@/pages/cashbook";
import CustomersPage from "@/pages/customers";
import CustomerDetailPage from "@/pages/customers/detail";
import ProductsPage from "@/pages/products";
import QrOrdersPage from "@/pages/qr-orders";
import SettingsPage from "@/pages/settings";
import DebtPage from "@/pages/debt";
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
          path: "/orders/:orderId",
          element: <OrderDetailPage />,
          handle: { title: "Chi tiết đơn hàng" },
        },
        {
          path: "/pos",
          element: <PosPage />,
          handle: { title: "Bán hàng" },
        },
        {
          path: "/cashbook",
          element: <CashbookPage />,
          handle: { title: "Sổ quỹ" },
        },
        {
          path: "/customers",
          element: <CustomersPage />,
          handle: { title: "Khách hàng" },
        },
        {
          path: "/customers/:customerId",
          element: <CustomerDetailPage />,
          handle: { title: "Chi tiết khách hàng" },
        },
        {
          path: "/products",
          element: <ProductsPage />,
          handle: { title: "Sản phẩm" },
        },
        {
          path: "/qr-orders",
          element: <QrOrdersPage />,
          handle: { title: "Đơn QR" },
        },
        {
          path: "/debt",
          element: <DebtPage />,
          handle: { title: "Công nợ" },
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
