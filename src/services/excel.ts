import * as XLSX from 'xlsx';
import { isValidPhone, normalizePhone, isValidEmail } from '@lib/validation';
import type { ContactInput } from './contacts';

export interface ParsedRow {
  rowIndex: number;
  raw: Record<string, any>;
}

export interface ColumnMap {
  phone: string;
  name?: string;
  company?: string;
  city?: string;
  email?: string;
  [customKey: string]: string | undefined;
}

export interface ImportPreview {
  columns: string[];
  rows: ParsedRow[];
  totalRows: number;
  suggestedMap: ColumnMap;
}

export function parseExcelBuffer(buffer: Buffer): ImportPreview {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: false, cellHTML: false });
    
    if (!workbook.SheetNames || !workbook.SheetNames.length) {
      return { columns: [], rows: [], totalRows: 0, suggestedMap: { phone: '' } };
    }
    
    const firstSheet = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheet];
    
    if (!worksheet) {
      return { columns: [], rows: [], totalRows: 0, suggestedMap: { phone: '' } };
    }
    
    // Get all rows as arrays first (more reliable for CSV)
    let rows = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1, defval: '' }) as any[];
    
    console.log('Raw rows from XLSX:', rows.length, 'rows');
    
    if (!rows || rows.length === 0) {
      console.log('No rows found in worksheet');
      return { columns: [], rows: [], totalRows: 0, suggestedMap: { phone: '' } };
    }
    
    // Filter out completely empty rows and keep only rows with content
    const nonEmptyRows = rows.filter(row => {
      if (!Array.isArray(row)) return false;
      return row.some((cell: any) => {
        const val = String(cell || '').trim();
        return val.length > 0;
      });
    });
    
    if (nonEmptyRows.length === 0) {
      return { columns: [], rows: [], totalRows: 0, suggestedMap: { phone: '' } };
    }
    
    // Extract headers from first row - force all to strings
    const headerRow = nonEmptyRows[0];
    const headers = headerRow
      .map((h: any, idx: number) => {
        // Convert to string, handle numbers and null
        let headerStr = '';
        if (h === null || h === undefined) {
          headerStr = `Column${idx}`;
        } else {
          headerStr = String(h).trim();
        }
        // If empty after trim, use fallback
        return headerStr || `Column${idx}`;
      })
      // Don't filter - keep all headers including fallbacks
      // This ensures we always have column names for data
      .slice(0); // Keep all columns
    
    if (headers.length === 0) {
      return { columns: [], rows: [], totalRows: 0, suggestedMap: { phone: '' } };
    }
    
    // Detect phone columns for special handling
    const phoneColIndices = headers
      .map((h: string, idx: number) => ({ header: h, idx }))
      .filter(({ header }: { header: string; idx: number }) => {
        const low = header.toLowerCase();
        return low.includes('phone') || low.includes('mobile') || low.includes('contact') || low.includes('whatsapp') || low.includes('number');
      })
      .map(({ idx }: { header: string; idx: number }) => idx);
    
    // Convert to object format with headers
    const json = nonEmptyRows.slice(1)
      .map((row: any) => {
        const obj: Record<string, any> = {};
        headers.forEach((header: string, idx: number) => {
          let val = row[idx];
          
          // Special handling for phone numbers
          if (phoneColIndices.includes(idx) && val) {
            let strVal = String(val).trim();
            
            // Handle scientific notation (e.g., 9.18446E+11 -> 918446225859)
            if (strVal.includes('E') || strVal.includes('e')) {
              try {
                // Convert scientific notation to full number
                const numVal = parseFloat(strVal);
                if (!isNaN(numVal)) {
                  strVal = Math.floor(numVal).toString();
                }
              } catch (e) {
                // If conversion fails, keep original
              }
            }
            
            // Ensure phone number has + prefix
            if (strVal && /^\d+$/.test(strVal) && strVal.length >= 10) {
              // Remove any leading zeros and add +
              const cleaned = strVal.replace(/^0+/, '');
              val = '+' + (cleaned || strVal);
            } else if (strVal && !strVal.startsWith('+')) {
              // If already partially formatted, just add +
              val = '+' + strVal;
            } else {
              val = strVal;
            }
          }
          
          obj[header] = (val !== undefined && val !== null) ? String(val).trim() : '';
        });
        return obj;
      })
      .filter((obj: Record<string, any>) => {
        // Keep rows with at least one non-empty value
        return Object.values(obj).some(v => v !== '');
      });
    
    if (json.length === 0) {
      console.log('No JSON data rows found after filtering');
      return { columns: [], rows: [], totalRows: 0, suggestedMap: { phone: '' } };
    }

    const columns = headers;
    console.log('parseExcelBuffer columns found:', columns);
    
    const previewRows = json.slice(0, 10).map((r, i) => ({
      rowIndex: i + 2,
      raw: r
    }));

    const phoneCandidates = [
      'phone', 'phone number', 'phonenumber', 'phone_number',
      'mobile', 'mobile number', 'mobilenumber', 'mobile_number',
      'contact', 'contact number', 'contact_number', 'contact_no', 'contact no',
      'whatsapp', 'whatsapp number', 'whatsapp_number', 'cell', 'cellphone', 'tel', 'telephone', 'number'
    ];
    const nameCandidates = ['name', 'full name', 'fullname', 'full_name', 'contact name', 'customer', 'customer name', 'client', 'firstname', 'lastname', 'first name', 'last name'];
    const companyCandidates = ['company', 'company name', 'company_name', 'organization', 'business', 'org', 'firm'];
    const cityCandidates = ['city', 'town', 'location', 'state', 'country', 'address'];
    const emailCandidates = ['email', 'e-mail', 'email address', 'email_address', 'mail'];

    function findMatch(cols: string[], candidates: string[]): string | undefined {
      for (const c of cols) {
        const low = c.toLowerCase().trim();
        if (candidates.includes(low)) return c;
      }
      for (const c of cols) {
        const low = c.toLowerCase().trim();
        for (const cand of candidates) {
          if (low.includes(cand) || cand.includes(low)) return c;
        }
      }
      return undefined;
    }

    const suggestedMap: ColumnMap = {
      phone: findMatch(columns, phoneCandidates) || (columns.length > 0 ? columns[0] : ''),
      name: findMatch(columns, nameCandidates),
      company: findMatch(columns, companyCandidates),
      city: findMatch(columns, cityCandidates),
      email: findMatch(columns, emailCandidates)
    };

    return {
      columns,
      rows: previewRows,
      totalRows: json.length,
      suggestedMap
    };
  } catch (e) {
    console.error('Error parsing buffer:', e);
    return { columns: [], rows: [], totalRows: 0, suggestedMap: { phone: '' } };
  }
}

export function mapAndValidateRows(
  json: Record<string, any>[],
  columnMap: ColumnMap
): { valid: ContactInput[]; duplicates: Set<string>; errors: { row: number; phone: string; error: string }[]; totalPhones: number } {
  const valid: ContactInput[] = [];
  const errors: { row: number; phone: string; error: string }[] = [];
  const seenPhones = new Set<string>();
  const duplicates = new Set<string>();

  const customKeys = Object.keys(columnMap).filter(k => !['phone', 'name', 'company', 'city', 'email'].includes(k));

  for (let i = 0; i < json.length; i++) {
    const raw = json[i];
    const rowNum = i + 2;
    const phoneRaw = raw[columnMap.phone];

    if (!phoneRaw || String(phoneRaw).trim() === '') {
      errors.push({ row: rowNum, phone: '', error: 'Missing phone number' });
      continue;
    }

    const phoneStr = String(phoneRaw).trim();
    if (!isValidPhone(phoneStr)) {
      errors.push({ row: rowNum, phone: phoneStr, error: 'Invalid phone format' });
      continue;
    }

    const normalized = normalizePhone(phoneStr);
    if (seenPhones.has(normalized)) {
      duplicates.add(normalized);
      errors.push({ row: rowNum, phone: phoneStr, error: 'Duplicate phone in file' });
      continue;
    }
    seenPhones.add(normalized);

    const email = columnMap.email ? String(raw[columnMap.email] || '').trim() : '';
    if (email && !isValidEmail(email)) {
      errors.push({ row: rowNum, phone: phoneStr, error: 'Invalid email' });
      continue;
    }

    const customFields: Record<string, string> = {};
    for (const k of customKeys) {
      const src = columnMap[k];
      if (src && raw[src] !== undefined && raw[src] !== '') {
        customFields[k] = String(raw[src]);
      }
    }

    valid.push({
      phone: phoneStr,
      name: columnMap.name ? String(raw[columnMap.name] || '').trim() : undefined,
      company: columnMap.company ? String(raw[columnMap.company] || '').trim() : undefined,
      city: columnMap.city ? String(raw[columnMap.city] || '').trim() : undefined,
      email: email || undefined,
      customFields: Object.keys(customFields).length ? customFields : undefined
    });
  }

  return { valid, duplicates, errors, totalPhones: seenPhones.size };
}

export function parseFullWorkbook(buffer: Buffer): Record<string, any>[] {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: false, cellHTML: false });
    
    if (!workbook.SheetNames || !workbook.SheetNames.length) {
      return [];
    }
    
    const firstSheet = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheet];
    
    if (!worksheet) {
      return [];
    }
    
    // Get all rows as arrays
    let rows = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1, defval: '' }) as any[];
    
    if (!rows || rows.length === 0) {
      return [];
    }
    
    // Filter out completely empty rows
    const nonEmptyRows = rows.filter(row => {
      if (!Array.isArray(row)) return false;
      return row.some((cell: any) => {
        const val = String(cell || '').trim();
        return val.length > 0;
      });
    });
    
    if (nonEmptyRows.length === 0) {
      return [];
    }
    
    // Extract headers from first row - force all to strings
    const headerRow = nonEmptyRows[0];
    const headers = headerRow
      .map((h: any, idx: number) => {
        // Convert to string, handle numbers and null
        let headerStr = '';
        if (h === null || h === undefined) {
          headerStr = `Column${idx}`;
        } else {
          headerStr = String(h).trim();
        }
        // If empty after trim, use fallback
        return headerStr || `Column${idx}`;
      })
      // Don't filter - keep all headers including fallbacks
      .slice(0); // Keep all columns
    
    if (headers.length === 0) {
      return [];
    }
    
    // Detect phone columns for special handling
    const phoneColIndices = headers
      .map((h: string, idx: number) => ({ header: h, idx }))
      .filter(({ header }: { header: string; idx: number }) => {
        const low = header.toLowerCase();
        return low.includes('phone') || low.includes('mobile') || low.includes('contact') || low.includes('whatsapp') || low.includes('number');
      })
      .map(({ idx }: { header: string; idx: number }) => idx);
    
    // Convert to object format
    const json = nonEmptyRows.slice(1)
      .map((row: any) => {
        const obj: Record<string, any> = {};
        headers.forEach((header: string, idx: number) => {
          let val = row[idx];
          
          // Special handling for phone numbers
          if (phoneColIndices.includes(idx) && val) {
            let strVal = String(val).trim();
            
            // Handle scientific notation (e.g., 9.18446E+11 -> 918446225859)
            if (strVal.includes('E') || strVal.includes('e')) {
              try {
                // Convert scientific notation to full number
                const numVal = parseFloat(strVal);
                if (!isNaN(numVal)) {
                  strVal = Math.floor(numVal).toString();
                }
              } catch (e) {
                // If conversion fails, keep original
              }
            }
            
            // Ensure phone number has + prefix
            if (strVal && /^\d+$/.test(strVal) && strVal.length >= 10) {
              // Remove any leading zeros and add +
              const cleaned = strVal.replace(/^0+/, '');
              val = '+' + (cleaned || strVal);
            } else if (strVal && !strVal.startsWith('+')) {
              // If already partially formatted, just add +
              val = '+' + strVal;
            } else {
              val = strVal;
            }
          }
          
          obj[header] = (val !== undefined && val !== null) ? String(val).trim() : '';
        });
        return obj;
      })
      .filter((obj: Record<string, any>) => {
        return Object.values(obj).some(v => v !== '');
      });
    
    return json;
  } catch (e) {
    console.error('Error parsing workbook:', e);
    return [];
  }
}
