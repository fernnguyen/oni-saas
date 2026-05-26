const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

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

// 3. Kích hoạt tính năng đọc Symlink cho pnpm
config.resolver.unstable_enableSymlinks = true;

// 4. Bọc với cấu hình NativeWind để biên dịch Tailwind CSS
module.exports = withNativeWind(config, { input: "./global.css" });
