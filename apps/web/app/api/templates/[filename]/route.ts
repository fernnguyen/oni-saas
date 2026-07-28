import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: Request,
  props: { params: Promise<{ filename: string }> }
) {
  try {
    const params = await props.params;
    const filename = params.filename;
    
    // Basic security check to prevent directory traversal
    if (!filename.endsWith('.docx') || filename.includes('..') || filename.includes('/')) {
      return NextResponse.json({ error: 'Invalid file' }, { status: 400 });
    }

    let filePath = path.join(process.cwd(), 'public', 'templates', filename);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(process.cwd(), 'apps', 'web', 'public', 'templates', filename);
    }

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Error serving template:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
