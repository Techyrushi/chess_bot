import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400 });
    }

    const maxSize = parseInt(process.env.MAX_UPLOAD_SIZE || '25000000', 10);
    if (file.size > maxSize) {
      return new Response(JSON.stringify({ error: 'File size exceeds limit' }), { status: 400 });
    }

    const projectRoot = path.resolve('.');
    const uploadDir = process.env.UPLOAD_DIR || path.join(projectRoot, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const ext = path.extname(file.name);
    const filename = `${nanoid()}${ext}`;
    const filePath = path.join(uploadDir, filename);

    const arrayBuffer = await file.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));

    const url = `${new URL(request.url).origin}/api/media/${filename}`;
    
    return new Response(JSON.stringify({
      success: true,
      url,
      filename: file.name,
      contentType: file.type
    }));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Upload failed' }), { status: 500 });
  }
};
