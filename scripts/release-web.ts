import { execSync } from 'child_process';
import * as readline from 'readline';

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

const question = (query: string): Promise<string> => {
  return new Promise(resolve => {
    rl.question(query, resolve);
  });
};

function printHeader() {
  console.log(`${COLORS.bold}${COLORS.magenta}====================================================${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}             ONI SAAS - WEB RELEASE CLI             ${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.magenta}====================================================${COLORS.reset}\n`);
}

function getLatestTag(): { major: number; minor: number; patch: number; raw: string } | null {
  try {
    console.log(`${COLORS.cyan}Đang lấy danh sách phiên bản từ remote...${COLORS.reset}`);
    try {
      execSync('git fetch --tags', { stdio: 'ignore' });
    } catch (e) {
      console.log(`${COLORS.yellow}⚠️ Không thể lấy danh sách phiên bản từ remote, sử dụng phiên bản local hiện tại.${COLORS.reset}`);
    }

    const tagsRaw = execSync('git tag', { encoding: 'utf8' });
    const tags = tagsRaw
      .split('\n')
      .map(t => t.trim())
      .filter(t => /^v?\d+\.\d+\.\d+$/.test(t));

    if (tags.length === 0) {
      return null;
    }

    const parsedTags = tags.map(tag => {
      const match = tag.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
      if (!match) throw new Error('Unparseable tag');
      return {
        major: parseInt(match[1], 10),
        minor: parseInt(match[2], 10),
        patch: parseInt(match[3], 10),
        raw: tag
      };
    });

    // Sort descending
    parsedTags.sort((a, b) => {
      if (a.major !== b.major) return b.major - a.major;
      if (a.minor !== b.minor) return b.minor - a.minor;
      return b.patch - a.patch;
    });

    return parsedTags[0];
  } catch (err) {
    console.error(`${COLORS.red}❌ Lỗi khi đọc git tag: ${(err as Error).message}${COLORS.reset}`);
    return null;
  }
}

async function main() {
  printHeader();

  let tagCreatedLocally = false;
  const latest = getLatestTag();
  let nextTag = '';
  
  if (latest) {
    console.log(`📌 Phiên bản hiện tại: ${COLORS.bold}${COLORS.cyan}${latest.raw}${COLORS.reset}`);
    
    let nextMajor = latest.major;
    let nextMinor = latest.minor;
    let nextPatch = latest.patch + 1;
    
    // Max patch is 100. Over 100 will reset patch to 0 and increment minor.
    if (nextPatch > 100) {
      nextPatch = 0;
      nextMinor += 1;
    }
    
    nextTag = `v${nextMajor}.${nextMinor}.${nextPatch}`;
  } else {
    console.log(`${COLORS.yellow}⚠️ Không tìm thấy tag nào hợp lệ trong git.${COLORS.reset}`);
    const defaultTagInput = await question(`Nhập tag bắt đầu (mặc định: v1.0.0): `);
    nextTag = defaultTagInput.trim() || 'v1.0.0';
    if (!nextTag.startsWith('v')) {
      nextTag = 'v' + nextTag;
    }
  }

  console.log(`🚀 Phiên bản sẽ phát hành: ${COLORS.bold}${COLORS.green}${nextTag}${COLORS.reset}\n`);

  // 1. Check working directory status (uncommitted changes)
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (status) {
      console.log(`${COLORS.yellow}⚠️ Cảnh báo: Thư mục làm việc hiện tại đang có thay đổi (chưa commit):${COLORS.reset}`);
      console.log(status);
      const proceed = await question(`\nBạn có chắc muốn tiếp tục phát hành phiên bản mới này? (y/N): `);
      if (proceed.trim().toLowerCase() !== 'y') {
        console.log(`${COLORS.red}❌ Đã hủy phát hành.${COLORS.reset}`);
        process.exit(0);
      }
    }
  } catch (e) {
    console.log(`${COLORS.yellow}⚠️ Không thể kiểm tra trạng thái git status.${COLORS.reset}`);
  }

  // 2. Check sync status (ahead / behind / no upstream)
  try {
    const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    const statusSb = execSync('git status -sb', { encoding: 'utf8' }).trim();
    const firstLine = statusSb.split('\n')[0];
    const hasUpstream = firstLine.includes('...');
    
    let ahead = 0;
    let behind = 0;
    
    const aheadMatch = firstLine.match(/ahead (\d+)/);
    if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
    
    const behindMatch = firstLine.match(/behind (\d+)/);
    if (behindMatch) behind = parseInt(behindMatch[1], 10);

    if (!hasUpstream) {
      console.log(`${COLORS.yellow}⚠️ Cảnh báo: Nhánh '${currentBranch}' hiện tại chưa được thiết lập remote tracking (upstream).${COLORS.reset}`);
      const setupUpstream = await question(`Bạn có muốn push thiết lập remote tracking và upstream không? (Y/n): `);
      if (setupUpstream.trim().toLowerCase() !== 'n') {
        console.log(`\n🚀 Đang chạy: git push -u origin ${currentBranch}...`);
        execSync(`git push -u origin ${currentBranch}`, { stdio: 'inherit' });
        console.log(`${COLORS.green}✅ Thiết lập upstream thành công!${COLORS.reset}\n`);
      }
    } else {
      if (behind > 0) {
        console.log(`${COLORS.yellow}⚠️ Cảnh báo: Nhánh local đang bị chậm hơn remote ${behind} commit(s).${COLORS.reset}`);
        const pullChanges = await question(`Bạn có muốn chạy 'git pull' để cập nhật mã nguồn mới nhất không? (Y/n): `);
        if (pullChanges.trim().toLowerCase() !== 'n') {
          console.log(`\n🚀 Đang chạy: git pull...`);
          execSync('git pull', { stdio: 'inherit' });
          console.log(`${COLORS.green}✅ Đồng bộ code mới thành công!${COLORS.reset}\n`);
        }
      }

      if (ahead > 0) {
        console.log(`${COLORS.yellow}⚠️ Cảnh báo: Bạn đang có ${ahead} commit(s) ở local chưa được push lên remote.${COLORS.reset}`);
        const pushChanges = await question(`Bạn có muốn chạy 'git push' để đưa các commit này lên remote trước không? (Y/n): `);
        if (pushChanges.trim().toLowerCase() !== 'n') {
          console.log(`\n🚀 Đang chạy: git push...`);
          execSync('git push', { stdio: 'inherit' });
          console.log(`${COLORS.green}✅ Push commit thành công!${COLORS.reset}\n`);
        }
      }
    }
  } catch (e: any) {
    console.log(`${COLORS.yellow}⚠️ Không thể kiểm tra hoặc đồng bộ trạng thái git: ${e.message}${COLORS.reset}`);
  }

  const confirm = await question(`Bạn có chắc chắn muốn phát hành phiên bản ${COLORS.bold}${nextTag}${COLORS.reset}? (Y/n): `);
  if (confirm.trim().toLowerCase() === 'n') {
    console.log(`${COLORS.red}❌ Đã hủy phát hành.${COLORS.reset}`);
    process.exit(0);
  }

  try {
    // Step 1: pnpm run build
    console.log(`\n📦 ${COLORS.bold}${COLORS.yellow}[Step 1/3] Đang chạy build ứng dụng (pnpm run build)...${COLORS.reset}`);
    execSync('pnpm run build', { stdio: 'inherit' });
    console.log(`${COLORS.green}✅ Build thành công!${COLORS.reset}`);

    // Step 2: git tag
    console.log(`\n🏷️ ${COLORS.bold}${COLORS.yellow}[Step 2/3] Đang tạo git tag ${nextTag}...${COLORS.reset}`);
    execSync(`git tag ${nextTag}`, { stdio: 'inherit' });
    tagCreatedLocally = true;
    console.log(`${COLORS.green}✅ Đã tạo tag ${nextTag} thành công!${COLORS.reset}`);

    // Step 3: git push origin
    console.log(`\n🚀 ${COLORS.bold}${COLORS.yellow}[Step 3/3] Đang push tag ${nextTag} lên origin...${COLORS.reset}`);
    execSync(`git push origin ${nextTag}`, { stdio: 'inherit' });
    console.log(`${COLORS.green}✅ Đã push tag lên origin thành công!${COLORS.reset}`);

    console.log(`\n${COLORS.bold}${COLORS.green}✨ Đã phát hành phiên bản ${nextTag} thành công!${COLORS.reset}\n`);

  } catch (error) {
    console.log(`\n${COLORS.bold}${COLORS.red}❌ Có lỗi xảy ra trong quá trình phát hành phiên bản web:${COLORS.reset}`);
    console.error((error as Error).message);
    
    // Automatically delete local tag if it was created in this run but process failed (e.g. push failed)
    if (tagCreatedLocally) {
      try {
        const checkTagLocal = execSync(`git tag -l "${nextTag}"`, { encoding: 'utf8' }).trim();
        if (checkTagLocal) {
          console.log(`\n${COLORS.yellow}🧹 Đang tự động dọn dẹp tag local ${nextTag}...${COLORS.reset}`);
          execSync(`git tag -d ${nextTag}`, { stdio: 'inherit' });
          console.log(`${COLORS.green}✅ Đã xóa tag local ${nextTag}${COLORS.reset}`);
        }
      } catch (cleanupError) {
        console.error(`${COLORS.red}⚠️ Không thể tự động xóa tag local ${nextTag}: ${(cleanupError as Error).message}${COLORS.reset}`);
      }
    }
    
    process.exit(1);
  } finally {
    rl.close();
  }
}

main().catch(err => {
  console.error(err);
  rl.close();
  process.exit(1);
});
