import fs from 'fs';
import path from 'path';

function getAssetPath(relativePath: string): string | null {
  const paths = [
    path.join(process.cwd(), relativePath),
    path.join(process.cwd(), 'apps/web', relativePath),
  ];
  console.log('Checking paths for', relativePath, ':');
  for (const p of paths) {
    const exists = fs.existsSync(p);
    console.log(' -', p, '->', exists ? 'EXISTS' : 'NOT FOUND');
    if (exists) {
      return p;
    }
  }
  return null;
}

const bgPath = getAssetPath('public/tenant_bg.png');
console.log('Resolved bgPath:', bgPath);
