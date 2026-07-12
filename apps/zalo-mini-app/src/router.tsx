import { createBrowserRouter, useSearchParams, Navigate } from "react-router-dom";
import Layout from "@/components/layout";
import AuthGuard from "@/components/auth-guard";
import LoginPage from "@/pages/auth/login";
import RegisterPage from "@/pages/auth/register";
import OnboardingPage from "@/pages/auth/onboarding";
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
import QRClientPage from "@/pages/qr-client";
import { getBasePath } from "@/utils/zma";

function RootRedirector() {
  const [searchParams] = useSearchParams();
  const shopSlug = searchParams.get("shop_slug");
  const tableId = searchParams.get("table_id") || searchParams.get("tableId");

  if (shopSlug && tableId) {
    return <Navigate to={`/qr-client?shop_slug=${shopSlug}&table_id=${tableId}`} replace />;
  }

  return (
    <AuthGuard>
      <Layout />
    </AuthGuard>
  );
}

const router = createBrowserRouter(
  [
    // Public routes
    { path: "/login", element: <LoginPage /> },
    { path: "/register", element: <RegisterPage /> },
    { path: "/qr-client", element: <QRClientPage /> },
    // Semi-protected (needs auth but not shop)
    { path: "/onboarding", element: <OnboardingPage /> },
    { path: "/select-branch", element: <SelectBranchPage /> },
    // Protected routes (needs auth + shop)
    {
      path: "/",
      element: <RootRedirector />,
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
