import { Outlet } from "react-router-dom";
import Header from "./header";
import Footer from "./footer";
import { Suspense } from "react";
import { useNotificationListener } from "@/stores/notification-store";

function PageSkeleton() {
  return (
    <div className="p-4 space-y-3">
      <div className="skeleton" style={{ height: 20, width: '60%' }} />
      <div className="skeleton" style={{ height: 80 }} />
      <div className="skeleton" style={{ height: 80 }} />
      <div className="skeleton" style={{ height: 80 }} />
    </div>
  );
}
import { ScrollRestoration } from "./scroll-restoration";
import BrandThemeProvider from "./brand-theme-provider";

function LayoutContent() {
  useNotificationListener();
  
  return (
    <BrandThemeProvider>
      <div className="w-screen h-screen flex flex-col bg-section text-foreground">
        <Header />
        <div className="flex-1 overflow-y-auto bg-background">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </div>
        <Footer />
        <ScrollRestoration />
      </div>
    </BrandThemeProvider>
  );
}

export default function Layout() {
  return (
    <LayoutContent />
  );
}
