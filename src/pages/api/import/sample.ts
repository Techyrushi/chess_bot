import type { APIRoute } from 'astro';
import * as XLSX from 'xlsx';

export const GET: APIRoute = async ({ url }) => {
  const format = url.searchParams.get('format') || 'csv';

  const sampleData = [
    { 'Phone Number': '+918446225859' },
    { 'Phone Number': '+919876543210' },
    { 'Phone Number': '+919123456789' },
    { 'Phone Number': '+919370962001' },
    { 'Phone Number': '+919988776655' }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  
  // Force phone number column to be formatted as text to prevent scientific notation
  const colWidth = [{ wch: 20 }];
  worksheet['!cols'] = colWidth;
  
  // Set cell format for phone numbers (column A, rows 2-6)
  for (let row = 2; row <= sampleData.length + 1; row++) {
    const cellRef = `A${row}`;
    if (worksheet[cellRef]) {
      worksheet[cellRef].t = 's'; // 's' = string/text format
      worksheet[cellRef].z = '@'; // @ = text format code
    }
  }
  
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Contacts');

  if (format === 'xlsx') {
    const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename=sample_contacts.xlsx'
      }
    });
  } else {
    const csvContent = 'Phone Number\n' +
      '+918446225859\n' +
      '+919876543210\n' +
      '+919123456789\n' +
      '+919370962001\n' +
      '+919988776655\n';

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename=sample_contacts.csv'
      }
    });
  }
};
