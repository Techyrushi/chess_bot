import * as bcrypt from 'bcryptjs';
import { getDb, mapDoc } from '@db/index';
import { ObjectId } from 'mongodb';

export interface Admin {
  id: string;
  email: string;
  name: string | null;
  password_hash: string;
  created_at: number;
  updated_at: number;
}

export interface SafeAdmin {
  id: string;
  email: string;
  name: string | null;
  created_at: number;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export async function findAdminByEmail(email: string): Promise<Admin | null> {
  const db = getDb();
  const result = await db.collection('admins').findOne({ email: email.toLowerCase() });
  return mapDoc<Admin>(result);
}

export async function getAdminById(id: string): Promise<SafeAdmin | null> {
  const db = getDb();
  try {
    const result = await db.collection('admins').findOne({ _id: new ObjectId(id) });
    if (!result) return null;
    const mapped = mapDoc<Admin>(result);
    if (!mapped) return null;
    return {
      id: mapped.id,
      email: mapped.email,
      name: mapped.name,
      created_at: mapped.created_at
    };
  } catch (e) {
    return null;
  }
}

export async function updateAdminPassword(id: string, newPassword: string): Promise<boolean> {
  const db = getDb();
  const hash = hashPassword(newPassword);
  try {
    const result = await db.collection('admins').updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          password_hash: hash, 
          updated_at: Date.now() 
        } 
      }
    );
    return result.modifiedCount > 0;
  } catch (e) {
    return false;
  }
}

export async function createAdmin(email: string, password: string, name?: string): Promise<SafeAdmin> {
  const db = getDb();
  const hash = hashPassword(password);
  const now = Date.now();
  const res = await db.collection('admins').insertOne({
    email: email.toLowerCase(),
    password_hash: hash,
    name: name || null,
    created_at: now,
    updated_at: now
  });
  return (await getAdminById(res.insertedId.toString()))!;
}

export async function loginAdmin(email: string, password: string): Promise<{ admin: SafeAdmin | null; error?: string }> {
  const admin = await findAdminByEmail(email);
  if (!admin) {
    return { admin: null, error: 'Admin not found' };
  }
  
  const isValid = verifyPassword(password, admin.password_hash);
  if (!isValid) {
    return { admin: null, error: 'Invalid password' };
  }
  
  const safeAdmin = await getAdminById(admin.id);
  return { admin: safeAdmin };
}
