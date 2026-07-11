// React core
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";

// Router
import router from "@/router";
import { Toaster } from "react-hot-toast";

// ZaUI stylesheet
import "zmp-ui/zaui.css";
// Tailwind stylesheet
import "@/css/tailwind.scss";
// Your stylesheet
import "@/css/app.scss";

// Expose app configuration
import appConfig from "../app-config.json";

if (!window.APP_CONFIG) {
  window.APP_CONFIG = appConfig;
}

// Mount the app
const root = createRoot(document.getElementById("app")!);
root.render(
  createElement('div', null,
    createElement(RouterProvider, { router }),
    createElement(Toaster, {
      position: "top-center",
      containerStyle: {
        top: 60,
      },
      toastOptions: {
        duration: 3000,
        style: {
          background: "#ffffff",
          color: "var(--primary)",
          borderRadius: "12px",
          fontSize: "14px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          fontWeight: "600",
        },
      }
    })
  )
);
