const path = require('path');

// =============================================================================
// ecosystem.config.js — CHỈ dùng cho LOCAL DEVELOPMENT
//
// Trên production server, file này được deploy.sh TỰ GENERATE với absolute
// paths cụ thể cho từng release. File này KHÔNG được đưa vào artifact.
//
// Để chạy local (không phải standalone):
//   pm2 start ecosystem.config.js
// =============================================================================

module.exports = {
  apps: [
    {
      name: "oni-web",
      script: "./node_modules/next/dist/bin/next",
      args: "start",
      cwd: path.resolve(__dirname, "apps/web"),
      instances: 1,           // Local: 1 instance là đủ
      exec_mode: "fork",      // Local: fork mode (không cần cluster)
      env: {
        PORT: 3000,
        NODE_ENV: "development",
      },
    },
  ],
};
