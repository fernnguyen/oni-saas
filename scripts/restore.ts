#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawnSync } from 'child_process';
import * as readline from 'readline';

// --- Configuration & Constants ---
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

const PROJECT_ROOT = path.resolve(__dirname, '..');
const BACKUPS_DIR = path.join(PROJECT_ROOT, 'backups');
const TEMP_DIR = '/tmp/oni_restore';

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
  console.clear();
  console.log(`${COLORS.bold}${COLORS.magenta}====================================================${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}             ONI SAAS - TENANT RESTORE CLI          ${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.magenta}====================================================${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.yellow}⚠️  CÔNG CỤ NÀY SẼ GHI ĐÈ DỮ LIỆU. HÃY CẨN THẬN!${COLORS.reset}\n`);
}

// --- Utilities ---
function getDbUrl(): string {
  // Load .env variables manually to find DB URL
  const envPaths = [
    path.join(PROJECT_ROOT, 'apps/web/.env.local'),
    path.join(PROJECT_ROOT, 'apps/web/.env'),
    path.join(PROJECT_ROOT, '.env.local'),
    path.join(PROJECT_ROOT, '.env')
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.startsWith('DATABASE_URL=')) {
          let url = line.split('=')[1].trim();
          url = url.replace(/^['"](.*)['"]$/, '$1'); // Remove quotes
          return url;
        }
        if (line.startsWith('LOCAL_PG_URI=')) {
          let url = line.split('=')[1].trim();
          url = url.replace(/^['"](.*)['"]$/, '$1'); // Remove quotes
          return url;
        }
      }
    }
  }
  
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.LOCAL_PG_URI) return process.env.LOCAL_PG_URI;

  console.log(`${COLORS.red}❌ Không tìm thấy DATABASE_URL hoặc LOCAL_PG_URI trong .env${COLORS.reset}`);
  process.exit(1);
}

function runSql(dbUrl: string, query: string, quiet = false): string {
  try {
    const output = execSync(`psql "${dbUrl}" -t -c "${query}"`, { encoding: 'utf8', stdio: quiet ? ['ignore', 'pipe', 'ignore'] : ['ignore', 'pipe', 'inherit'] });
    return output.trim();
  } catch (err: any) {
    if (!quiet) console.error(`${COLORS.red}❌ Lỗi SQL: ${err.message}${COLORS.reset}`);
    throw err;
  }
}

let tempDbName = `temp_restore_${Date.now()}`;
let mainDbUrlGlobal = '';

function cleanup() {
  if (mainDbUrlGlobal && tempDbName) {
    try {
      console.log(`\n${COLORS.cyan}🧹 Đang dọn dẹp database tạm...${COLORS.reset}`);
      execSync(`psql "${mainDbUrlGlobal}" -c "DROP DATABASE IF EXISTS ${tempDbName}"`, { stdio: 'ignore' });
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    } catch (e) {}
  }
}

process.on('SIGINT', () => {
  console.log(`\n${COLORS.yellow}Thao tác bị hủy. Đang dọn dẹp...${COLORS.reset}`);
  cleanup();
  process.exit(1);
});

// --- Main Flow ---
async function main() {
  printHeader();

  const mainDbUrl = getDbUrl();
  mainDbUrlGlobal = mainDbUrl;

  // 1. Prompt backup
  const doBackup = await question(`Bạn có muốn chạy script backup toàn bộ dữ liệu hiện tại trước khi làm gì khác không? (Y/n): `);
  if (doBackup.trim().toLowerCase() !== 'n') {
    console.log(`\n${COLORS.cyan}🔄 Đang chạy script backup...${COLORS.reset}`);
    try {
      execSync('bash scripts/backup.sh', { stdio: 'inherit', cwd: PROJECT_ROOT });
      console.log(`\n${COLORS.green}✅ Backup hoàn tất.${COLORS.reset}\n`);
    } catch (e) {
      console.log(`\n${COLORS.red}❌ Backup lỗi. Khuyên bạn nên dừng lại.${COLORS.reset}`);
      const proceed = await question(`Vẫn tiếp tục? (y/N): `);
      if (proceed.trim().toLowerCase() !== 'y') {
        process.exit(1);
      }
    }
  }

  printHeader();

  // 2. Select file
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
  const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.zip') || f.endsWith('.sql') || f.endsWith('.dump'));
  
  if (files.length === 0) {
    console.log(`${COLORS.yellow}Thư mục ${BACKUPS_DIR} hiện không có file backup nào.${COLORS.reset}`);
    console.log(`Vui lòng copy file .zip hoặc .dump vào thư mục trên rồi chạy lại lệnh.`);
    process.exit(0);
  }

  console.log(`${COLORS.bold}📂 Chọn file backup:${COLORS.reset}`);
  files.forEach((f, i) => {
    const fullPath = path.join(BACKUPS_DIR, f);
    let backupTime = '';
    // Try to parse HH-mm-DD-MM-YYYY
    const match = f.match(/(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{4})/);
    if (match) {
      const [_, hr, min, day, mon, yr] = match;
      backupTime = `${hr}:${min} ngày ${day}/${mon}/${yr}`;
    } else {
      const stats = fs.statSync(fullPath);
      // Use mtime because downloaded files might lose original birthtime
      const date = stats.mtime;
      const hr = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const mon = String(date.getMonth() + 1).padStart(2, '0');
      const yr = date.getFullYear();
      backupTime = `${hr}:${min} ngày ${day}/${mon}/${yr} (Theo file hệ thống)`;
    }
    
    console.log(` ${i + 1}. ${COLORS.green}${f}${COLORS.reset}`);
    console.log(`    ↳ Thời gian backup: ${COLORS.yellow}${backupTime}${COLORS.reset}`);
  });
  
  const fileIdxStr = await question(`\nNhập số thứ tự file: `);
  const fileIdx = parseInt(fileIdxStr.trim()) - 1;
  if (isNaN(fileIdx) || fileIdx < 0 || fileIdx >= files.length) {
    console.log(`${COLORS.red}Lựa chọn không hợp lệ.${COLORS.reset}`);
    process.exit(1);
  }

  const selectedFile = path.join(BACKUPS_DIR, files[fileIdx]);
  let dumpFile = selectedFile;

  // 3. Extract if zip
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  if (selectedFile.endsWith('.zip')) {
    console.log(`\n${COLORS.cyan}📦 Đang giải nén ${files[fileIdx]}...${COLORS.reset}`);
    try {
      execSync(`unzip -o -q "${selectedFile}" -d "${TEMP_DIR}"`);
      const extractedFiles = fs.readdirSync(TEMP_DIR).filter(f => f.endsWith('.dump') || f.endsWith('.sql'));
      if (extractedFiles.length === 0) {
        console.log(`${COLORS.red}❌ Không tìm thấy file .dump hoặc .sql trong file zip.${COLORS.reset}`);
        process.exit(1);
      }
      dumpFile = path.join(TEMP_DIR, extractedFiles[0]);
    } catch (e) {
      console.log(`${COLORS.red}❌ Lỗi giải nén.${COLORS.reset}`);
      process.exit(1);
    }
  }

  // 4. Create temp DB
  console.log(`\n${COLORS.cyan}🛠 Tạo database tạm (${tempDbName})...${COLORS.reset}`);
  runSql(mainDbUrl, `CREATE DATABASE ${tempDbName}`);

  // Construct temp DB URL properly by parsing main URL
  const urlObj = new URL(mainDbUrl);
  urlObj.pathname = `/${tempDbName}`;
  const tempDbUrl = urlObj.toString();

  // 5. Restore to temp DB
  console.log(`${COLORS.cyan}⏳ Đang restore dữ liệu vào database tạm. Vui lòng chờ...${COLORS.reset}`);
  try {
    // -O ignores ownership, -x ignores privileges
    execSync(`pg_restore -O -x -d "${tempDbUrl}" "${dumpFile}"`, { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e: any) {
    // pg_restore frequently exits with warnings (status 1) but still restores the data.
    // We can check if it mostly succeeded by ignoring non-fatal errors.
    console.log(`${COLORS.yellow}⚠️ Có một số warning/lỗi trong quá trình restore (thường gặp).${COLORS.reset}`);
  }

  console.log(`\n${COLORS.green}✅ Restore vào database tạm hoàn tất.${COLORS.reset}`);

  // Helper to fetch Supabase data
  let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    const envPaths = [
      path.join(PROJECT_ROOT, 'apps/web/.env.local'),
      path.join(PROJECT_ROOT, 'apps/web/.env'),
      path.join(PROJECT_ROOT, '.env.local'),
      path.join(PROJECT_ROOT, '.env')
    ];
    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
          if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
          if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) supabaseKey = line.split('=')[1].trim();
        });
      }
    }
  }

  // 6. Find valid tenants/branches
  console.log(`\n${COLORS.cyan}🔍 Đang phân tích các Tenant và Shop trong bản backup...${COLORS.reset}`);
  
  const branchesOutput = runSql(tempDbUrl, `SELECT DISTINCT tenant_id, branch_id FROM orders LIMIT 20;`, true);
  
  if (!branchesOutput) {
    console.log(`${COLORS.red}❌ Không tìm thấy giao dịch nào trong bảng orders của bản backup.${COLORS.reset}`);
    cleanup();
    process.exit(1);
  }

  const branches = branchesOutput.split('\n').map(line => line.trim()).filter(line => line.includes('|'));
  console.log(`\n${COLORS.cyan}🌐 Đang lấy thông tin tên tổ chức từ Supabase...${COLORS.reset}`);
  
  let tenantsData: any[] = [];
  let shopsData: any[] = [];
  try {
    if (supabaseUrl && supabaseKey) {
      const fetchHeaders = { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` };
      const [tRes, sRes] = await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/tenants?select=id,name`, { headers: fetchHeaders }),
        fetch(`${supabaseUrl}/rest/v1/shops?select=id,name`, { headers: fetchHeaders })
      ]);
      if (tRes.ok) tenantsData = await tRes.json();
      if (sRes.ok) shopsData = await sRes.json();
    }
  } catch (e) {
    console.log(`${COLORS.yellow}⚠️ Không thể lấy thông tin tên từ Supabase. Sẽ hiển thị id gốc.${COLORS.reset}`);
  }

  console.log(`\n${COLORS.bold}🏢 Danh sách Tenant & Shop phát hiện được (Tối đa 20):${COLORS.reset}`);
  
  const parsedBranches = branches.map(b => {
    const [tenant, branch] = b.split('|').map(s => s.trim());
    const tenantName = tenantsData.find(t => t.id === tenant)?.name || 'Unknown Tenant';
    const branchName = shopsData.find(s => s.id === branch)?.name || 'Unknown Shop';
    return { tenant, tenantName, branch, branchName };
  });

  parsedBranches.forEach((b, i) => {
    console.log(` ${i + 1}. Tổ chức: ${COLORS.blue}${b.tenantName} (${b.tenant})${COLORS.reset}`);
    console.log(`    Shop/Branch: ${COLORS.green}${b.branchName} (${b.branch})${COLORS.reset}\n`);
  });

  const branchIdxStr = await question(`\nChọn Shop (Branch) cần phục hồi (1-${parsedBranches.length}): `);
  const branchIdx = parseInt(branchIdxStr.trim()) - 1;
  if (isNaN(branchIdx) || branchIdx < 0 || branchIdx >= parsedBranches.length) {
    console.log(`${COLORS.red}Lựa chọn không hợp lệ.${COLORS.reset}`);
    cleanup();
    process.exit(1);
  }

  const selectedTarget = parsedBranches[branchIdx];

  // 7. Preview
  console.log(`\n${COLORS.cyan}📊 PREVIEW THÔNG TIN BACKUP CỦA SHOP [${selectedTarget.branch}]${COLORS.reset}`);
  
  try {
    const ordersCount = runSql(tempDbUrl, `SELECT count(*) FROM orders WHERE tenant_id = '${selectedTarget.tenant}' AND branch_id = '${selectedTarget.branch}'`, true);
    const lastOrder = runSql(tempDbUrl, `SELECT max(created_at) FROM orders WHERE tenant_id = '${selectedTarget.tenant}' AND branch_id = '${selectedTarget.branch}'`, true);
    const cashbookCount = runSql(tempDbUrl, `SELECT count(*) FROM cashbook WHERE tenant_id = '${selectedTarget.tenant}' AND branch_id = '${selectedTarget.branch}'`, true);

    console.log(` - Số lượng đơn hàng: ${COLORS.bold}${ordersCount}${COLORS.reset}`);
    console.log(` - Giao dịch đơn hàng mới nhất: ${COLORS.bold}${lastOrder || 'Không có'}${COLORS.reset}`);
    console.log(` - Số lượng sổ quỹ: ${COLORS.bold}${cashbookCount}${COLORS.reset}`);
  } catch (e) {
    console.log(`${COLORS.yellow}⚠️ Không thể lấy preview chi tiết.${COLORS.reset}`);
  }

  // 8. Find target tables automatically
  console.log(`\n${COLORS.cyan}🔍 Đang tìm các bảng phụ thuộc vào Shop...${COLORS.reset}`);
  const targetTablesQuery = `
    SELECT table_name 
    FROM information_schema.columns 
    WHERE column_name IN ('tenant_id', 'branch_id') 
    AND table_schema = 'public' 
    GROUP BY table_name 
    HAVING COUNT(DISTINCT column_name) = 2;
  `;
  const tablesOutput = runSql(tempDbUrl, targetTablesQuery, true);
  const tables = tablesOutput.split('\n').map(l => l.trim()).filter(l => l);
  
  console.log(`Tìm thấy ${COLORS.bold}${tables.length}${COLORS.reset} bảng có chứa tenant_id và branch_id.`);

  // 9. Confirm Wipe & Restore
  console.log(`\n${COLORS.bold}${COLORS.red}====================================================${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.red}                    CẢNH BÁO NGUY HIỂM              ${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.red}====================================================${COLORS.reset}`);
  console.log(`Bạn đang yêu cầu ${COLORS.bold}XÓA SẠCH${COLORS.reset} dữ liệu hiện tại của shop ${COLORS.bold}${selectedTarget.branchName} (${selectedTarget.branch})${COLORS.reset}`);
  console.log(`thuộc tổ chức ${COLORS.bold}${selectedTarget.tenantName}${COLORS.reset} trong database chính và ${COLORS.bold}GHI ĐÈ${COLORS.reset} bằng dữ liệu từ bản backup này.`);
  console.log(`Các bảng sẽ bị ảnh hưởng: ${tables.join(', ')}`);
  
  const confirmStr = await question(`\nGõ chính xác chữ "${COLORS.bold}RESTORE${COLORS.reset}" để thực thi (hoặc nhấn Enter để thoát Dry-run): `);

  if (confirmStr !== 'RESTORE') {
    console.log(`\n${COLORS.yellow}Đã hủy thao tác. Database chính an toàn.${COLORS.reset}`);
    cleanup();
    process.exit(0);
  }

  // 10. Execute
  console.log(`\n${COLORS.cyan}🚀 ĐANG THỰC THI WIPE VÀ IMPORT...${COLORS.reset}`);
  
  for (const table of tables) {
    console.log(`\n${COLORS.yellow}>>> Đang xử lý bảng: ${table}...${COLORS.reset}`);
    try {
      // Validate columns: Find intersection of columns between Main DB and Temp DB
      // This prevents crashes if the backup has older schema (missing new columns) or newer schema
      const mainColsOutput = runSql(mainDbUrl, `SELECT column_name FROM information_schema.columns WHERE table_name = '${table}' AND table_schema = 'public' ORDER BY ordinal_position`, true);
      const mainCols = mainColsOutput.split('\n').map(c => c.trim()).filter(c => c);

      const tempColsOutput = runSql(tempDbUrl, `SELECT column_name FROM information_schema.columns WHERE table_name = '${table}' AND table_schema = 'public'`, true);
      const tempCols = new Set(tempColsOutput.split('\n').map(c => c.trim()).filter(c => c));

      // Only copy columns that exist in both databases (preserving the order of the main database)
      const validColumns = mainCols.filter(col => tempCols.has(col));
      const columnsString = validColumns.join(', ');
      
      if (!columnsString) {
         console.log(`${COLORS.yellow}⚠️ Bỏ qua bảng ${table} vì không tìm thấy cột chung nào giữa Backup và Main DB.${COLORS.reset}`);
         continue;
      }

      if (validColumns.length < mainCols.length) {
         console.log(`   ${COLORS.yellow}⚠️ Bảng này có ${mainCols.length - validColumns.length} cột mới trên Main DB chưa có trong Backup. Các cột này sẽ nhận giá trị NULL/Default.${COLORS.reset}`);
      }

      // Wipe main db
      console.log(`   - Wiping cũ...`);
      runSql(mainDbUrl, `DELETE FROM ${table} WHERE tenant_id = '${selectedTarget.tenant}' AND branch_id = '${selectedTarget.branch}'`);

      // Find Primary Key to handle ON CONFLICT
      let pkCol = 'id'; // default fallback
      try {
        const pkQuery = `SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = '${table}'::regclass AND i.indisprimary;`;
        const pkOutput = runSql(mainDbUrl, pkQuery, true);
        if (pkOutput) pkCol = pkOutput.split('\n')[0].trim();
      } catch (e) {}

      // Use a real table so it persists across multiple psql invocations
      const tmpTableName = `rest_tmp_${table}`;
      
      console.log(`   - Importing từ backup...`);
      runSql(mainDbUrl, `SET client_min_messages = warning; DROP TABLE IF EXISTS ${tmpTableName}; CREATE TABLE ${tmpTableName} (LIKE ${table} INCLUDING DEFAULTS);`);
      
      const copyCmd = `psql "${tempDbUrl}" -c "\\copy (SELECT ${columnsString} FROM ${table} WHERE tenant_id = '${selectedTarget.tenant}' AND branch_id = '${selectedTarget.branch}') TO STDOUT" | psql "${mainDbUrl}" -c "\\copy ${tmpTableName} (${columnsString}) FROM STDIN"`;
      execSync(copyCmd, { stdio: 'inherit' });
      
      // Upsert from tmp table into real table
      const upsertSql = `
        INSERT INTO ${table} (${columnsString})
        SELECT ${columnsString} FROM ${tmpTableName}
        ON CONFLICT (${pkCol}) DO UPDATE SET 
        ${validColumns.map(c => `${c} = EXCLUDED.${c}`).join(', ')};
        DROP TABLE ${tmpTableName};
      `;
      runSql(mainDbUrl, upsertSql);
      
    } catch (e: any) {
      console.log(`${COLORS.red}❌ Lỗi khi xử lý bảng ${table}: ${e.message}${COLORS.reset}`);
      // Drop temp table if exists
      try { runSql(mainDbUrl, `DROP TABLE IF EXISTS rest_tmp_${table};`); } catch(e2) {}
      // Break out? Or continue? Usually we want to stop if an error occurs to avoid partial data
      console.log(`${COLORS.red}⚠️ DỪNG KHẨN CẤP. Vui lòng kiểm tra lại data.${COLORS.reset}`);
      cleanup();
      process.exit(1);
    }
  }

  // 11. Cleanup
  cleanup();

  console.log(`\n${COLORS.bold}${COLORS.green}✨ PHỤC HỒI THÀNH CÔNG CHO SHOP ${selectedTarget.branch}!${COLORS.reset}\n`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
