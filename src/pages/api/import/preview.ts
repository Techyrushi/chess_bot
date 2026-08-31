import type { APIRoute } from 'astro';
import { requireAuth } from '@lib/sessions';
import * as excel from '@services/excel';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(__filename, '../../../../..');

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file || !file.size) {
      return new Response(JSON.stringify({ error: 'No file uploaded' }), { status: 400 });
    }

    const uploadDir = process.env.UPLOAD_DIR || path.join(projectRoot, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const maxSize = parseInt(process.env.MAX_UPLOAD_SIZE || '25000000', 10);
    if (file.size > maxSize) {
      return new Response(JSON.stringify({ error: 'File too large' }), { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const preview = excel.parseExcelBuffer(buf);
    
    console.log('Preview generated:', {
      fileName: file.name,
      size: file.size,
      columnsCount: preview.columns?.length || 0,
      rowsCount: preview.rows?.length || 0,
      totalRows: preview.totalRows,
      suggestedMap: preview.suggestedMap
    });

    if (!preview.columns || preview.columns.length === 0) {
      console.error('No columns found in preview');
      return new Response(JSON.stringify({ 
        error: 'No valid columns found in file. Ensure the file has headers in the first row.' 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const responseData = {
      fileName: file.name,
      size: file.size,
      preview
    };
    
    console.log('Sending preview response:', {
      hasPreview: !!responseData.preview,
      columnsCount: responseData.preview?.columns?.length
    });

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e: any) {
    console.error('Preview error:', e);
    return new Response(JSON.stringify({ 
      error: e.message || 'Parse error. Please check your file format.' 
    }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
