import { getDb, mapDoc } from '@db/index';
import { ObjectId } from 'mongodb';

export async function createAuditLog(opts: {
  adminId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, any>;
  ip?: string;
  ua?: string;
}): Promise<string> {
  const db = getDb();
  const now = Date.now();
  const res = await db.collection('audit_logs').insertOne({
    admin_id: opts.adminId || null,
    action: opts.action,
    resource_type: opts.resourceType || null,
    resource_id: opts.resourceId || null,
    details: opts.details || null,
    ip_address: opts.ip || null,
    user_agent: opts.ua || null,
    created_at: now
  });
  return res.insertedId.toString();
}

export interface AuditLog {
  id: string;
  admin_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: number;
  admin_email?: string;
}

export async function getAuditLogs(opts: {
  limit?: number;
  offset?: number;
  action?: string;
  adminId?: string;
}): Promise<{ logs: AuditLog[]; total: number }> {
  const db = getDb();
  const limit = opts.limit || 50;
  const offset = opts.offset || 0;
  
  const filter: any = {};
  if (opts.action) {
    filter.action = opts.action;
  }
  if (opts.adminId) {
    filter.admin_id = opts.adminId;
  }

  const total = await db.collection('audit_logs').countDocuments(filter);
  
  const rawLogs = await db.collection('audit_logs')
    .find(filter)
    .sort({ created_at: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();
    
  const logs: AuditLog[] = [];
  for (const doc of rawLogs) {
    const log = mapDoc<AuditLog>(doc);
    if (log) {
      if (log.admin_id) {
        try {
          const admin = await db.collection('admins').findOne({ _id: new ObjectId(log.admin_id) });
          if (admin) {
            log.admin_email = admin.email;
          }
        } catch (e) {}
      }
      logs.push(log);
    }
  }

  return { logs, total };
}
