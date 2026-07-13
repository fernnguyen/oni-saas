import { defineConfig } from "vite";
import zaloMiniApp from "zmp-vite-plugin";
import react from "@vitejs/plugin-react";
import path from "path";
import pkg from "./package.json";

// https://vitejs.dev/config/
export default () => {
  return defineConfig({
    root: "./src",
    base: "",
    plugins: [zaloMiniApp(), react()],
    define: {
      "process.env.NEXT_PUBLIC_APP_VERSION": JSON.stringify(process.env.NEXT_PUBLIC_APP_VERSION || pkg.version),
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(process.env.NEXT_PUBLIC_APP_VERSION || pkg.version),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@oni/core": path.resolve(__dirname, "../../packages/core/src"),
      },
    },
    server: {
      port: 3001,
    },
  });
};
