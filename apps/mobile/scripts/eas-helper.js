#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const readline = require('readline');

// ANSI Colors for premium styling
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const MOBILE_DIR = path.resolve(__dirname, '..');
const GOOGLE_SERVICES_PATH = path.join(MOBILE_DIR, 'google-services.json');
const SECRET_NAME = 'GOOGLE_SERVICES_JSON_BASE64';

function printHeader() {
  console.clear();
  console.log(`${COLORS.bold}${COLORS.magenta}====================================================${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}             ONI MOBILE - EAS BUILD HELPER          ${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.magenta}====================================================${COLORS.reset}`);
}

function showGuide() {
  printHeader();
  console.log(`${COLORS.bold}${COLORS.yellow}👉 Hướng dẫn lấy file google-services.json từ Firebase:${COLORS.reset}\n`);
  console.log(` 1. Truy cập ${COLORS.bold}${COLORS.blue}Firebase Console${COLORS.reset}: https://console.firebase.google.com/`);
  console.log(` 2. Chọn project của bạn (hoặc tạo mới nếu chưa có).`);
  console.log(` 3. Nhấp vào ${COLORS.bold}Add App${COLORS.reset} (hoặc biểu tượng bánh răng cài đặt -> Project Settings -> Add App).`);
  console.log(` 4. Chọn nền tảng ${COLORS.bold}Android${COLORS.reset}.`);
  console.log(` 5. Nhập Package Name chính xác từ app.json: ${COLORS.bold}${COLORS.green}vn.oni.mobile${COLORS.reset}`);
  console.log(` 6. Nhấp ${COLORS.bold}Register app${COLORS.reset}, sau đó tải xuống file ${COLORS.bold}google-services.json${COLORS.reset}.`);
  console.log(` 7. Copy file vừa tải vào thư mục sau:`);
  console.log(`    ${COLORS.cyan}${GOOGLE_SERVICES_PATH}${COLORS.reset}\n`);
  console.log(`${COLORS.yellow}⚠️  Lưu ý: File này đã được thêm vào .gitignore và sẽ không bị commit lên GitHub.${COLORS.reset}`);
  console.log(`${COLORS.yellow}   Mã hóa thành EAS Secret sẽ giúp EAS Build tự động tạo lại file khi build Cloud.${COLORS.reset}\n`);
  
  rl.question('Nhấn Enter để quay lại menu chính...', () => {
    mainMenu();
  });
}

function getSecretIdByName(name) {
  try {
    const output = execSync('npx eas secret:list', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes(name)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length > 0 && parts[0].match(/^[0-9a-fA-F-]{36}$/)) {
          return parts[0];
        }
      }
    }
  } catch (e) {
    // Command failed or not logged in
  }
  return null;
}

function checkEasLogin() {
  try {
    console.log(`\n🔍 Đang kiểm tra đăng nhập EAS CLI...`);
    const output = execSync('npx eas whoami', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    console.log(`✅ Đã đăng nhập tài khoản EAS: ${COLORS.green}${output.trim()}${COLORS.reset}`);
    return true;
  } catch (e) {
    console.log(`${COLORS.red}❌ Bạn chưa đăng nhập EAS. Vui lòng chạy 'npx eas login' trước khi tiếp tục.${COLORS.reset}`);
    return false;
  }
}

function handleEASSecret() {
  printHeader();
  console.log(`${COLORS.bold}${COLORS.yellow}🔒 Khởi tạo/Cập nhật EAS Secret cho google-services.json${COLORS.reset}\n`);

  if (!fs.existsSync(GOOGLE_SERVICES_PATH)) {
    console.log(`${COLORS.red}❌ Không tìm thấy file google-services.json tại: ${COLORS.reset}`);
    console.log(`   ${GOOGLE_SERVICES_PATH}`);
    console.log(`\nVui lòng xem hướng dẫn lấy file này ở Option 1.`);
    rl.question('\nNhấn Enter để quay lại...', () => {
      mainMenu();
    });
    return;
  }

  if (!checkEasLogin()) {
    rl.question('\nNhấn Enter để quay lại...', () => {
      mainMenu();
    });
    return;
  }

  try {
    console.log(`\n⚙️ Đang đọc file google-services.json...`);
    const fileContent = fs.readFileSync(GOOGLE_SERVICES_PATH);
    const base64Data = fileContent.toString('base64');
    console.log(`✅ Đã mã hóa file thành Base64 (độ dài: ${base64Data.length} ký tự).`);

    console.log(`🔍 Đang tìm kiếm Secret cũ...`);
    const existingId = getSecretIdByName(SECRET_NAME);

    if (existingId) {
      console.log(`${COLORS.yellow}⚠️ Phát hiện EAS Secret '${SECRET_NAME}' cũ với ID: ${existingId}${COLORS.reset}`);
      console.log(`Đang tiến hành xóa secret cũ...`);
      execSync(`npx eas secret:delete --id ${existingId} --non-interactive`, { stdio: 'inherit' });
      console.log(`✅ Đã xóa secret cũ.`);
    }

    console.log(`\n🚀 Đang đẩy Secret mới lên EAS...`);
    // Chạy lệnh create secret
    const createCommand = `npx eas secret:create --scope project --name ${SECRET_NAME} --value "${base64Data}" --type string --non-interactive`;
    execSync(createCommand, { stdio: 'inherit' });
    console.log(`\n${COLORS.green}✨ Cấu hình EAS Secret thành công!${COLORS.reset}`);
    console.log(`Biến môi trường '${COLORS.bold}${SECRET_NAME}${COLORS.reset}' đã sẵn sàng cho EAS Build.`);

  } catch (err) {
    console.log(`\n${COLORS.red}❌ Lỗi trong quá trình tạo EAS Secret:${COLORS.reset}`);
    console.error(err.message);
  }

  rl.question('\nNhấn Enter để quay lại...', () => {
    mainMenu();
  });
}

function listSecrets() {
  printHeader();
  console.log(`${COLORS.bold}${COLORS.yellow}📋 Danh sách EAS Secrets hiện tại:${COLORS.reset}\n`);
  
  if (!checkEasLogin()) {
    rl.question('\nNhấn Enter để quay lại...', () => {
      mainMenu();
    });
    return;
  }

  try {
    execSync('npx eas secret:list', { stdio: 'inherit' });
  } catch (err) {
    console.log(`${COLORS.red}❌ Không thể lấy danh sách secret. Vui lòng đăng nhập lại.${COLORS.reset}`);
  }

  rl.question('\nNhấn Enter để quay lại...', () => {
    mainMenu();
  });
}

function runBuild(profile) {
  printHeader();
  const isLocalArg = process.argv.includes('local') || process.argv.includes('--local');
  console.log(`${COLORS.bold}${COLORS.yellow}🚀 Bắt đầu chạy EAS Build [Profile: ${profile.toUpperCase()}]${isLocalArg ? ' [Local Build]' : ''}${COLORS.reset}\n`);

  if (!checkEasLogin()) {
    rl.question('\nNhấn Enter để quay lại...', () => {
      mainMenu();
    });
    return;
  }

  const proceedWithLocal = (buildLocal) => {
    rl.question('Bạn có muốn xóa cache (clear cache) khi build không? Lựa chọn này giúp tránh lỗi cache cũ (y/N): ', (answer) => {
      const clearCache = answer.trim().toLowerCase() === 'y';
      const args = ['eas', 'build', '--platform', 'android', '--profile', profile];
      if (buildLocal) {
        args.push('--local');
      }
      if (clearCache) {
        args.push('--clear-cache');
      }

      console.log(`\n${COLORS.cyan}Lệnh sẽ chạy: npx ${args.join(' ')}${COLORS.reset}\n`);
      
      const buildProcess = spawnSync('npx', args, {
        stdio: 'inherit',
        cwd: MOBILE_DIR
      });

      if (buildProcess.status === 0) {
        console.log(`\n${COLORS.green}✅ Build hoàn thành thành công!${COLORS.reset}`);
      } else {
        console.log(`\n${COLORS.red}❌ Build thất bại hoặc bị hủy bởi người dùng.${COLORS.reset}`);
      }

      rl.question('\nNhấn Enter để quay lại...', () => {
        mainMenu();
      });
    });
  };

  if (isLocalArg) {
    proceedWithLocal(true);
  } else {
    rl.question('Bạn có muốn build cục bộ (local build) thay vì build trên Cloud không? (y/N): ', (localAnswer) => {
      const buildLocal = localAnswer.trim().toLowerCase() === 'y';
      proceedWithLocal(buildLocal);
    });
  }
}

function mainMenu() {
  printHeader();
  console.log(`Chọn một tùy chọn dưới đây:\n`);
  console.log(` ${COLORS.bold}1.${COLORS.reset} Hướng dẫn lấy file ${COLORS.bold}google-services.json${COLORS.reset} từ Firebase`);
  console.log(` ${COLORS.bold}2.${COLORS.reset} ${COLORS.green}Mã hóa & Cài đặt EAS Secret (${SECRET_NAME})${COLORS.reset}`);
  console.log(` ${COLORS.bold}3.${COLORS.reset} Xem danh sách EAS Secrets hiện có`);
  console.log(` ${COLORS.bold}4.${COLORS.reset} ${COLORS.cyan}Build Android Development Client (APK)${COLORS.reset}`);
  console.log(` ${COLORS.bold}5.${COLORS.reset} ${COLORS.blue}Build Android Production (AAB)${COLORS.reset}`);
  console.log(` ${COLORS.bold}6.${COLORS.reset} Build Android Preview (APK)`);
  console.log(` ${COLORS.bold}7.${COLORS.reset} Thoát`);
  console.log(`\n----------------------------------------------------`);

  rl.question('\nNhập lựa chọn của bạn (1-7): ', (choice) => {
    switch (choice.trim()) {
      case '1':
        showGuide();
        break;
      case '2':
        handleEASSecret();
        break;
      case '3':
        listSecrets();
        break;
      case '4':
        runBuild('development');
        break;
      case '5':
        runBuild('production');
        break;
      case '6':
        runBuild('preview');
        break;
      case '7':
        console.log(`\nTạm biệt! Chúc bạn một ngày tốt lành!`);
        rl.close();
        process.exit(0);
        break;
      default:
        console.log(`${COLORS.red}\nLựa chọn không hợp lệ! Vui lòng chọn từ 1 đến 7.${COLORS.reset}`);
        setTimeout(mainMenu, 1500);
        break;
    }
  });
}

// Bắt đầu ứng dụng
mainMenu();
