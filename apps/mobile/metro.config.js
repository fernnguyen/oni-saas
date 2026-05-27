const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");
const { createRequire } = require("module");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Cấu hình để Metro theo dõi sự thay đổi file trong toàn bộ Monorepo
config.watchFolders = [workspaceRoot];

// 2. Định hướng cho Metro tìm kiếm các thư viện dùng chung từ node_modules của root và của mobile
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 3. Kích hoạt tính năng đọc Symlink cho pnpm và hỗ trợ file WebAssembly (.wasm) cho expo-sqlite trên Web
config.resolver.unstable_enableSymlinks = true;
config.resolver.assetExts.push("wasm");

// 4. Force Metro deduplicate React & react-navigation về 1 instance duy nhất
// FIX: pnpm monorepo tạo ra 2 React instances (18.2.0 và 19.1.0) → lỗi "Couldn't find a navigation context"
const mobileRequire = createRequire(path.resolve(projectRoot, "package.json"));

let expoRouterRequire;
try {
  expoRouterRequire = createRequire(mobileRequire.resolve("expo-router/package.json"));
} catch (e) {}

// Resolve thư mục package từ node_modules của mobile app
function resolvePackageDir(pkgName) {
  // Xử lý sub-paths như react/jsx-runtime (không có package.json riêng)
  const rootPkg = pkgName.startsWith("@")
    ? pkgName.split("/").slice(0, 2).join("/")
    : pkgName.split("/")[0];
  try {
    return path.dirname(mobileRequire.resolve(`${rootPkg}/package.json`));
  } catch (e) {
    if (expoRouterRequire) {
      try {
        return path.dirname(expoRouterRequire.resolve(`${rootPkg}/package.json`));
      } catch (e2) {}
    }
    return null;
  }
}

// Danh sách packages cần deduplicate - phải dùng 1 instance duy nhất từ mobile/node_modules
const SINGLETON_PACKAGES = [
  "react",
  "react-native",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "@react-navigation/core",
  "@react-navigation/native",
  "@react-navigation/bottom-tabs",
  "@react-navigation/routers",
  "@react-navigation/elements",
  "react-native-safe-area-context",
  "react-native-screens",
  "react-native-reanimated",
];

const extraNodeModules = {};
for (const pkg of SINGLETON_PACKAGES) {
  const dir = resolvePackageDir(pkg);
  if (dir) {
    extraNodeModules[pkg] = dir;
  }
}

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  ...extraNodeModules,
};

// 5. Bọc với cấu hình NativeWind để biên dịch Tailwind CSS
module.exports = withNativeWind(config, { input: "./global.css" });
