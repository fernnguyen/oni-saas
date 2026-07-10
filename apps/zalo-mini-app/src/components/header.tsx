import { useNavigate, useLocation } from "react-router-dom";
import { useRouteHandle } from "@/hooks";
import { useTenantStore } from "@/stores/tenant-store";
import { Icon } from "zmp-ui";

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [handle] = useRouteHandle();
  const tenant = useTenantStore((s) => s.tenant);
  const shop = useTenantStore((s) => s.shop);

  const title = typeof handle?.title === "string" ? handle.title : "";
  const showBack = location.key !== "default" && !handle?.noBack;

  return (
    <div className="w-full flex flex-col px-4 bg-primary text-primaryForeground pt-st">
      <div className="w-full min-h-12 flex py-2 space-x-2 items-center">
        {handle?.logo ? (
          <>
            {tenant?.logo_url ? (
              <img
                src={tenant.logo_url}
                className="flex-none w-8 h-8 rounded-full object-cover"
                alt={tenant.name}
              />
            ) : (
              <div className="flex-none w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-sm font-bold">
                  {tenant?.name?.charAt(0) || "O"}
                </span>
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <h1 className="text-lg font-bold truncate">
                {shop?.name || tenant?.name || "ONI"}
              </h1>
              {shop?.address && (
                <p className="text-2xs opacity-80 truncate">{shop.address}</p>
              )}
            </div>
          </>
        ) : (
          <>
            {showBack && (
              <div
                className="py-1 px-2 cursor-pointer"
                onClick={() => navigate(-1)}
              >
                <Icon icon="zi-arrow-left" />
              </div>
            )}
            <div className="text-xl font-medium truncate">{title}</div>
          </>
        )}
      </div>
    </div>
  );
}
