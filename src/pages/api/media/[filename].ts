import type { APIRoute } from 'astro';
import fs from 'fs';
import path from 'path';

export const GET: APIRoute = async ({ params }) => {
  const filename = params.filename;
  if (!filename) {
    return new Response(JSON.stringify({ error: 'Missing filename' }), { status: 400 });
  }

  const projectRoot = path.resolve('.');
  const uploadDir = process.env.UPLOAD_DIR || path.join(projectRoot, 'uploads');
  const filePath = path.join(uploadDir, filename);

  if (!fs.existsSync(filePath)) {
    return new Response('Not found', { status: 404 });
  }

  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.pdf': 'application/pdf',
    '.csv': 'text/csv',
    '.txt': 'text/plain'
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  const fileBuffer = fs.readFileSync(filePath);
  
  return new Response(fileBuffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000'
    }
  });
};
