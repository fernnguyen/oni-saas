const path = require('path');

module.exports = {
  apps: [
    {
      name: "oni-web", // Giữ nguyên tên oni-web khớp với cấu hình PM2 cũ của hệ thống
      script: "./node_modules/next/dist/bin/next",
      args: "start",
      cwd: path.resolve(__dirname, "apps/web"), // Trỏ thư mục làm việc vào apps/web của monorepo
      instances: "3", // Spawn 3 instances để tối ưu 6 nhân CPU AMD EPYC (NUMA Node 0)
      exec_mode: "cluster", // Bật Cluster Mode chia sẻ cổng 3000
      listen_timeout: 5000, // Đợi tối đa 5s cho instance khởi động trước khi đánh dấu là online
      kill_timeout: 3000, // Đợi tối đa 3s cho connections đóng trước khi kill instance cũ khi reload
      env: {
        PORT: 3000,
        NODE_ENV: "production",
      },
    },
  ],
};
