import * as XLSX from 'xlsx';
import * as path from 'path';

async function checkExcel() {
  try {
    console.log('📖 Reading Excel file...\n');

    const filePath = path.join(__dirname, '..', 'Mahalla-nomi.xls');
    const workbook = XLSX.readFile(filePath);

    const sheetName = workbook.SheetNames[0];
    console.log(`📄 Sheet name: ${sheetName}\n`);

    const worksheet = workbook.Sheets[sheetName];
    const data: any[] = XLSX.utils.sheet_to_json(worksheet);

    console.log(`📊 Total rows: ${data.length}\n`);

    if (data.length > 0) {
      console.log('📋 Column names (headers):');
      const headers = Object.keys(data[0]);
      headers.forEach((header, index) => {
        console.log(`   ${index + 1}. "${header}"`);
      });

      console.log('\n📝 First 3 rows sample:\n');
      data.slice(0, 3).forEach((row, index) => {
        console.log(`Row ${index + 1}:`);
        for (const [key, value] of Object.entries(row)) {
          console.log(`   ${key}: ${value}`);
        }
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkExcel();
