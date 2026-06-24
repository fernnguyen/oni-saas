#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');
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
const APP_JSON_PATH = path.join(MOBILE_DIR, 'app.json');

function printHeader() {
  console.clear();
  console.log(`${COLORS.bold}${COLORS.magenta}====================================================${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}           ONI MOBILE - AUTOMATED RELEASE MANAGER   ${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.magenta}====================================================${COLORS.reset}`);
}

function loadAppJson() {
  if (!fs.existsSync(APP_JSON_PATH)) {
    console.error(`${COLORS.red}❌ Không tìm thấy file app.json tại: ${APP_JSON_PATH}${COLORS.reset}`);
    process.exit(1);
  }
  const fileContent = fs.readFileSync(APP_JSON_PATH, 'utf8');
  return JSON.parse(fileContent);
}

function saveAppJson(data) {
  fs.writeFileSync(APP_JSON_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`${COLORS.green}✅ Đã cập nhật thành công file app.json!${COLORS.reset}`);
}

function incrementVersion(version, type) {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    return version; // Trả về nguyên bản nếu định dạng lạ
  }
  let [major, minor, patch] = parts;
  if (type === 'patch') patch += 1;
  else if (type === 'minor') {
    minor += 1;
    patch = 0;
  } else if (type === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  }
  return `${major}.${minor}.${patch}`;
}

function checkEasLogin() {
  try {
    const output = execSync('npx eas whoami', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    console.log(`✅ Đã đăng nhập EAS: ${COLORS.green}${output.trim()}${COLORS.reset}`);
    return true;
  } catch (e) {
    console.log(`${COLORS.red}❌ Bạn chưa đăng nhập EAS. Vui lòng chạy 'npx eas login' trước.${COLORS.reset}`);
    return false;
  }
}

function main() {
  printHeader();
  const appConfig = loadAppJson();
  const expo = appConfig.expo;

  const currentVersion = expo.version || '1.0.0';
  const currentIosBuild = (expo.ios && expo.ios.buildNumber) || '1';
  const currentAndroidCode = (expo.android && expo.android.versionCode) || 1;

  console.log(`${COLORS.bold}🔍 Phiên bản hiện tại:${COLORS.reset}`);
  console.log(`   - Version:       ${COLORS.green}${currentVersion}${COLORS.reset}`);
  console.log(`   - iOS Build:     ${COLORS.green}${currentIosBuild}${COLORS.reset}`);
  console.log(`   - Android Code:  ${COLORS.green}${currentAndroidCode}${COLORS.reset}\n`);

  console.log(`${COLORS.bold}Chọn cách tăng phiên bản:${COLORS.reset}`);
  
  // Tự động tính toán các phương án
  const nextIosBuild = String(parseInt(currentIosBuild, 10) + 1);
  const nextAndroidCode = currentAndroidCode + 1;
  const patchVersion = incrementVersion(currentVersion, 'patch');
  const minorVersion = incrementVersion(currentVersion, 'minor');

  console.log(` ${COLORS.bold}1.${COLORS.reset} Chỉ tăng Build Number (Giữ nguyên Version: ${COLORS.cyan}${currentVersion}${COLORS.reset})`);
  console.log(`    -> iOS Build: ${COLORS.yellow}${nextIosBuild}${COLORS.reset}, Android Code: ${COLORS.yellow}${nextAndroidCode}${COLORS.reset}`);
  console.log(` ${COLORS.bold}2.${COLORS.reset} Tăng Patch Version (Lên Version: ${COLORS.cyan}${patchVersion}${COLORS.reset})`);
  console.log(`    -> iOS Build: ${COLORS.yellow}${nextIosBuild}${COLORS.reset}, Android Code: ${COLORS.yellow}${nextAndroidCode}${COLORS.reset}`);
  console.log(` ${COLORS.bold}3.${COLORS.reset} Tăng Minor Version (Lên Version: ${COLORS.cyan}${minorVersion}${COLORS.reset})`);
  console.log(`    -> iOS Build: ${COLORS.yellow}${nextIosBuild}${COLORS.reset}, Android Code: ${COLORS.yellow}${nextAndroidCode}${COLORS.reset}`);
  console.log(` ${COLORS.bold}4.${COLORS.reset} Nhập phiên bản thủ công`);
  console.log(` ${COLORS.bold}5.${COLORS.reset} Hủy bỏ`);

  rl.question('\nNhập lựa chọn của bạn (1-5): ', (choice) => {
    let finalVersion = currentVersion;
    let finalIosBuild = currentIosBuild;
    let finalAndroidCode = currentAndroidCode;

    if (choice.trim() === '5') {
      console.log(`\n❌ Đã hủy bỏ.`);
      rl.close();
      process.exit(0);
    }

    if (choice.trim() === '1') {
      finalIosBuild = nextIosBuild;
      finalAndroidCode = nextAndroidCode;
      saveAndProceed(appConfig, finalVersion, finalIosBuild, finalAndroidCode);
    } else if (choice.trim() === '2') {
      finalVersion = patchVersion;
      finalIosBuild = nextIosBuild;
      finalAndroidCode = nextAndroidCode;
      saveAndProceed(appConfig, finalVersion, finalIosBuild, finalAndroidCode);
    } else if (choice.trim() === '3') {
      finalVersion = minorVersion;
      finalIosBuild = nextIosBuild;
      finalAndroidCode = nextAndroidCode;
      saveAndProceed(appConfig, finalVersion, finalIosBuild, finalAndroidCode);
    } else if (choice.trim() === '4') {
      rl.question('Nhập số Version mới (ví dụ: 1.0.2): ', (newV) => {
        finalVersion = newV.trim() || currentVersion;
        rl.question('Nhập số iOS Build mới (ví dụ: 3): ', (newIos) => {
          finalIosBuild = newIos.trim() || nextIosBuild;
          rl.question('Nhập số Android Code mới (ví dụ: 3): ', (newAnd) => {
            finalAndroidCode = parseInt(newAnd.trim(), 10) || nextAndroidCode;
            saveAndProceed(appConfig, finalVersion, finalIosBuild, finalAndroidCode);
          });
        });
      });
    } else {
      console.log(`${COLORS.red}Lựa chọn không hợp lệ!${COLORS.reset}`);
      setTimeout(main, 1000);
    }
  });
}

function saveAndProceed(appConfig, version, iosBuild, androidCode) {
  // Cập nhật cấu hình
  appConfig.expo.version = version;
  if (!appConfig.expo.ios) appConfig.expo.ios = {};
  appConfig.expo.ios.buildNumber = iosBuild;

  if (!appConfig.expo.android) appConfig.expo.android = {};
  appConfig.expo.android.versionCode = androidCode;

  console.log(`\n⚙️  Đang lưu cấu hình mới...`);
  saveAppJson(appConfig);

  console.log(`\n${COLORS.bold}Phiên bản mới sẽ lưu:${COLORS.reset}`);
  console.log(`   - Version:       ${COLORS.cyan}${version}${COLORS.reset}`);
  console.log(`   - iOS Build:     ${COLORS.cyan}${iosBuild}${COLORS.reset}`);
  console.log(`   - Android Code:  ${COLORS.cyan}${androidCode}${COLORS.reset}\n`);

  rl.question('Bạn có muốn chạy EAS Build & Submit tự động không? (y/N): ', (ans) => {
    if (ans.trim().toLowerCase() !== 'y') {
      console.log(`\n🎉 Đã cập nhật version trong app.json. Bạn có thể tự build thủ công sau.`);
      rl.close();
      process.exit(0);
    }

    if (!checkEasLogin()) {
      rl.close();
      process.exit(1);
    }

    printBuildOptions();
  });
}

function printBuildOptions() {
  console.log(`\n${COLORS.bold}Chọn loại build và submit:${COLORS.reset}`);
  console.log(` ${COLORS.bold}1.${COLORS.reset} Build & Auto-Submit ${COLORS.blue}iOS (IPA) lên TestFlight${COLORS.reset}`);
  console.log(` ${COLORS.bold}2.${COLORS.reset} Build & Auto-Submit ${COLORS.green}Android (AAB) lên Google Play${COLORS.reset}`);
  console.log(` ${COLORS.bold}3.${COLORS.reset} Build & Auto-Submit ${COLORS.magenta}CẢ HAI (iOS + Android)${COLORS.reset}`);
  console.log(` ${COLORS.bold}4.${COLORS.reset} Hủy bỏ`);

  rl.question('\nNhập lựa chọn của bạn (1-4): ', (choice) => {
    let args = ['eas', 'build', '--profile', 'production', '--auto-submit'];

    if (choice.trim() === '1') {
      args.push('--platform', 'ios');
      triggerBuild(args);
    } else if (choice.trim() === '2') {
      args.push('--platform', 'android');
      triggerBuild(args);
    } else if (choice.trim() === '3') {
      args.push('--platform', 'all');
      triggerBuild(args);
    } else {
      console.log(`\n❌ Đã hủy bỏ.`);
      rl.close();
      process.exit(0);
    }
  });
}

function triggerBuild(args) {
  console.log(`\n🚀 Đang chạy lệnh: ${COLORS.bold}${COLORS.cyan}npx ${args.join(' ')}${COLORS.reset}`);
  console.log(`${COLORS.yellow}Quá trình build trên Cloud bắt đầu, vui lòng theo dõi tiến trình...${COLORS.reset}\n`);

  rl.close();

  const buildProcess = spawnSync('npx', args, {
    stdio: 'inherit',
    cwd: MOBILE_DIR
  });

  if (buildProcess.status === 0) {
    console.log(`\n✅ ${COLORS.green}${COLORS.bold}Hoàn thành xuất sắc! Ứng dụng đã được build và gửi lên Store thành công.${COLORS.reset}`);
  } else {
    console.log(`\n❌ ${COLORS.red}${COLORS.bold}Build hoặc Submit thất bại. Vui lòng kiểm tra log ở trên.${COLORS.reset}`);
  }
}

main();
