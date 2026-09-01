import { Request, Response, NextFunction } from 'express';

export default async function handleMedia(req: any, res: Response, next: NextFunction) {
  try {
    const { method, path, params } = req;

    // POST /api/media/upload
    if (method === 'POST' && path === '/api/media/upload') {
      const file = (req as any).file;
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      // Store file in DB or S3 and return URL
      return res.json({ url: `/api/media/${file.originalname}`, filename: file.originalname });
    }

    // GET /api/media/:filename
    if (method === 'GET' && path.match(/^\/api\/media\/[\w.-]+$/)) {
      // Retrieve file from DB or S3 and send it
      return res.status(404).json({ error: 'File not found' });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('Media error:', err);
    res.status(500).json({ error: (err as any).message || 'Internal server error' });
  }
}
