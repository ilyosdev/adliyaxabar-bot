import * as XLSX from 'xlsx';
import * as path from 'path';

async function checkEncoding() {
  try {
    const filePath = path.join(__dirname, '..', 'Mahalla-nomi.xls');
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data: any[] = XLSX.utils.sheet_to_json(worksheet);

    // Find rows with special characters
    const testRows = data.filter(row => {
      const name = row['Mahalla nomi'] || '';
      return name.includes('altak') || name.includes('stlik') || name.includes('bog');
    }).slice(0, 5);

    console.log('🔍 Testing character encoding:\n');

    for (const row of testRows) {
      const name = row['Mahalla nomi'];
      console.log(`Name: ${name}`);
      console.log(`Length: ${name.length}`);
      const chars = Array.from(name).map((c) => {
        const char = String(c);
        const code = char.charCodeAt(0);
        return `${char}(U+${code.toString(16).toUpperCase().padStart(4, '0')})`;
      });
      console.log('Char codes:', chars.join(' '));
      console.log('Hex:', Buffer.from(name, 'utf-8').toString('hex'));
      console.log('');
    }

    // Test escapeSql function
    console.log('Testing SQL escape:');
    const testName = "G'altak";
    console.log(`Original: ${testName}`);
    console.log(`Escaped: ${testName.replace(/'/g, "\\'")}`);
    console.log('');

  } catch (error) {
    console.error('Error:', error);
  }
}

checkEncoding();
