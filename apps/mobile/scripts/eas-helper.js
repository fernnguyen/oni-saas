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
  console.log(` 5. Nhập Package Name chính xác từ app.json: ${COLORS.bold}${COLORS.green}vn.oni.pos${COLORS.reset}`);
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

function runBuild(platform, profile, options = {}) {
  printHeader();
  
  const isLocalArg = process.argv.includes('local') || process.argv.includes('--local') || options.local === true;
  const isSubmitArg = process.argv.includes('submit') || process.argv.includes('--submit') || options.autoSubmit === true;
  
  console.log(`${COLORS.bold}${COLORS.yellow}🚀 Bắt đầu chạy EAS Build [Platform: ${platform.toUpperCase()}] [Profile: ${profile.toUpperCase()}]${isLocalArg ? ' [Local Build]' : ''}${isSubmitArg ? ' [Auto-Submit]' : ''}${COLORS.reset}\n`);

  if (!checkEasLogin()) {
    rl.question('\nNhấn Enter để quay lại...', () => {
      mainMenu();
    });
    return;
  }

  const proceedWithBuild = (buildLocal, buildSubmit) => {
    rl.question('Bạn có muốn xóa cache (clear cache) khi build không? Lựa chọn này giúp tránh lỗi cache cũ (y/N): ', (answer) => {
      const clearCache = answer.trim().toLowerCase() === 'y';
      const args = ['eas', 'build', '--platform', platform, '--profile', profile];
      if (buildLocal) {
        args.push('--local');
      }
      if (buildSubmit) {
        args.push('--auto-submit');
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

  proceedWithBuild(isLocalArg, isSubmitArg);
}

function runSubmit(platform) {
  printHeader();
  console.log(`${COLORS.bold}${COLORS.yellow}🚀 Bắt đầu gửi ứng dụng [Platform: ${platform.toUpperCase()}] lên Store${COLORS.reset}\n`);

  if (!checkEasLogin()) {
    rl.question('\nNhấn Enter để quay lại...', () => {
      mainMenu();
    });
    return;
  }

  const args = ['eas', 'submit', '--platform', platform];
  console.log(`\n${COLORS.cyan}Lệnh sẽ chạy: npx ${args.join(' ')}${COLORS.reset}\n`);
  
  const submitProcess = spawnSync('npx', args, {
    stdio: 'inherit',
    cwd: MOBILE_DIR
  });

  if (submitProcess.status === 0) {
    console.log(`\n${COLORS.green}✅ Submit hoàn thành thành công!${COLORS.reset}`);
  } else {
    console.log(`\n${COLORS.red}❌ Submit thất bại hoặc bị hủy bởi người dùng.${COLORS.reset}`);
  }

  rl.question('\nNhấn Enter để quay lại...', () => {
    mainMenu();
  });
}

function showGooglePlayGuide() {
  printHeader();
  console.log(`${COLORS.bold}${COLORS.yellow}👉 Hướng dẫn cấu hình Google Play Console & API Access để tự động Submit:${COLORS.reset}\n`);
  console.log(` 1. Truy cập ${COLORS.bold}${COLORS.blue}Google Play Console${COLORS.reset} & đăng ký tài khoản Developer ($25).`);
  console.log(` 2. Tạo một Google Cloud Project hoặc dùng project Firebase hiện tại.`);
  console.log(` 3. Kích hoạt API Google Play Android Developer API:`);
  console.log(`    - Vào APIs & Services -> Enabled APIs & services -> Tìm "Google Play Android Developer API" -> Enable.`);
  console.log(` 4. Tạo Service Account (Tài khoản dịch vụ):`);
  console.log(`    - Vào IAM & Admin -> Service Accounts -> Chọn "Create Service Account".`);
  console.log(`    - Đặt tên (ví dụ: "eas-submit-play-store").`);
  console.log(`    - Cấp quyền (Role): Chọn "Service Account User" và "Browser" (hoặc phân quyền trực tiếp ở Play Console).`);
  console.log(` 5. Tạo JSON Key cho Service Account:`);
  console.log(`    - Nhấp vào Service Account mới tạo -> Tab "Keys" -> Add Key -> Create new key -> Chọn định dạng JSON.`);
  console.log(`    - File JSON chứa private key sẽ được tải về máy của bạn.`);
  console.log(` 6. Liên kết Service Account với Google Play Console:`);
  console.log(`    - Trong Play Console, chọn "Users and permissions" -> "Invite new users".`);
  console.log(`    - Điền email của Service Account vừa tạo.`);
  console.log(`    - Ở tab "App permissions", cấp quyền "Release manager" hoặc "Admin" cho app Oni POS.`);
  console.log(` 7. Cấu hình credentials trong EAS:`);
  console.log(`    - Chạy lệnh: ${COLORS.bold}${COLORS.cyan}npx eas credentials${COLORS.reset}`);
  console.log(`    - Chọn platform: ${COLORS.bold}android${COLORS.reset} -> profile: ${COLORS.bold}production${COLORS.reset}.`);
  console.log(`    - Chọn "Google Service Account Key" -> Upload file JSON key vừa tải ở bước 5.`);
  console.log(`    - EAS sẽ lưu trữ bảo mật key này để dùng cho lệnh 'eas submit' tự động.\n`);
  console.log(`${COLORS.yellow}⚠️  Lưu ý quan trọng: Đối với app mới tinh, bạn bắt buộc phải upload bản AAB đầu tiên`);
  console.log(`   thủ công lên Google Play Console (tạo Draft Release) để Play Console nhận dạng Package Name`);
  console.log(`   trước khi EAS Submit có thể chạy tự động ở các lần sau.${COLORS.reset}\n`);

  rl.question('Nhấn Enter để quay lại menu chính...', () => {
    mainMenu();
  });
}

function runCleanNative() {
  printHeader();
  console.log(`${COLORS.bold}${COLORS.yellow}🧹 DỌN DẸP & TẠO LẠI THƯ MỤC NATIVE (PREBUILD CLEAN)${COLORS.reset}\n`);
  console.log(`${COLORS.red}⚠️  CẢNH BÁO: Lựa chọn này sẽ:`);
  console.log(` 1. Xóa hoàn toàn thư mục 'ios/' và 'android/' hiện có.`);
  console.log(` 2. Chạy 'pnpm install' để đồng bộ hóa dependencies.`);
  console.log(` 3. Chạy 'npx expo prebuild --clean' để tự động tạo lại các thư mục native sạch sẽ.`);
  console.log(` (Phù hợp nhất khi mới cài thêm thư viện native mới hoặc app bị crash lúc khởi động)${COLORS.reset}\n`);

  rl.question('Bạn có chắc chắn muốn dọn dẹp và cài đặt lại không? (y/N): ', (answer) => {
    if (answer.trim().toLowerCase() !== 'y') {
      console.log(`\n❌ Đã hủy thao tác.`);
      rl.question('\nNhấn Enter để quay lại...', () => {
        mainMenu();
      });
      return;
    }

    try {
      console.log(`\n🗑️  Đang xóa các thư mục native...`);
      const iosPath = path.join(MOBILE_DIR, 'ios');
      const androidPath = path.join(MOBILE_DIR, 'android');
      
      if (fs.existsSync(iosPath)) {
        fs.rmSync(iosPath, { recursive: true, force: true });
        console.log(`   - Đã xóa thư mục ios/`);
      }
      if (fs.existsSync(androidPath)) {
        fs.rmSync(androidPath, { recursive: true, force: true });
        console.log(`   - Đã xóa thư mục android/`);
      }

      console.log(`\n📦 Đang chạy pnpm install để đồng bộ thư viện...`);
      execSync('pnpm install', { stdio: 'inherit', cwd: path.resolve(MOBILE_DIR, '../..') });

      console.log(`\n⚙️  Đang chạy npx expo prebuild --clean...`);
      execSync('npx expo prebuild --clean', { stdio: 'inherit', cwd: MOBILE_DIR });

      console.log(`\n${COLORS.green}✨ Hoàn thành dọn dẹp và prebuild native thành công!${COLORS.reset}`);
    } catch (err) {
      console.log(`\n${COLORS.red}❌ Lỗi trong quá trình dọn dẹp:${COLORS.reset}`);
      console.error(err.message);
    }

    rl.question('\nNhấn Enter để quay lại...', () => {
      mainMenu();
    });
  });
}

function mainMenu() {
  printHeader();
  console.log(`Chọn một tùy chọn dưới đây:\n`);
  console.log(` ${COLORS.bold}1.${COLORS.reset} Hướng dẫn lấy file ${COLORS.bold}google-services.json${COLORS.reset} từ Firebase`);
  console.log(` ${COLORS.bold}2.${COLORS.reset} ${COLORS.green}Mã hóa & Cài đặt EAS Secret (${SECRET_NAME})${COLORS.reset}`);
  console.log(` ${COLORS.bold}3.${COLORS.reset} Xem danh sách EAS Secrets hiện có`);
  console.log('----------------------------------------------------');
  console.log(` ${COLORS.bold}4.${COLORS.reset} ${COLORS.cyan}Build Android Development Client (APK) - Cloud${COLORS.reset}`);
  console.log(` ${COLORS.bold}5.${COLORS.reset} Build Android Production (AAB) - Cloud`);
  console.log(` ${COLORS.bold}6.${COLORS.reset} Build Android Preview (APK) - Cloud`);
  console.log('----------------------------------------------------');
  console.log(` ${COLORS.bold}7.${COLORS.reset} ${COLORS.green}Build Android Production (AAB) - Local Only${COLORS.reset}`);
  console.log(` ${COLORS.bold}8.${COLORS.reset} ${COLORS.blue}Build iOS Production (IPA) - Local Only${COLORS.reset}`);
  console.log('----------------------------------------------------');
  console.log(` ${COLORS.bold}9.${COLORS.reset} ${COLORS.magenta}Submit Android (AAB) lên Google Play${COLORS.reset}`);
  console.log(` ${COLORS.bold}10.${COLORS.reset} ${COLORS.magenta}Submit iOS (IPA) lên TestFlight${COLORS.reset}`);
  console.log(` ${COLORS.bold}11.${COLORS.reset} ${COLORS.yellow}Hướng dẫn cấu hình Google Play Store API & Service Account${COLORS.reset}`);
  console.log(` ${COLORS.bold}12.${COLORS.reset} ${COLORS.red}Dọn dẹp hoàn toàn & Tạo lại thư mục native (Prebuild Clean)${COLORS.reset}`);
  console.log(` ${COLORS.bold}13.${COLORS.reset} Thoát`);
  console.log(`\n----------------------------------------------------`);

  rl.question('\nNhập lựa chọn của bạn (1-13): ', (choice) => {
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
        runBuild('android', 'development', { local: false });
        break;
      case '5':
        runBuild('android', 'production', { local: false });
        break;
      case '6':
        runBuild('android', 'preview', { local: false });
        break;
      case '7':
        runBuild('android', 'production', { local: true });
        break;
      case '8':
        runBuild('ios', 'production', { local: true, autoSubmit: false });
        break;
      case '9':
        runSubmit('android');
        break;
      case '10':
        runSubmit('ios');
        break;
      case '11':
        showGooglePlayGuide();
        break;
      case '12':
        runCleanNative();
        break;
      case '13':
        console.log(`\nTạm biệt! Chúc bạn một ngày tốt lành!`);
        rl.close();
        process.exit(0);
        break;
      default:
        console.log(`${COLORS.red}\nLựa chọn không hợp lệ! Vui lòng chọn từ 1 đến 13.${COLORS.reset}`);
        setTimeout(mainMenu, 1500);
        break;
    }
  });
}

// Bắt đầu ứng dụng
mainMenu();
