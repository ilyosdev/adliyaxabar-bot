import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

interface MahallahData {
  region: string;
  district: string;
  mahallah: string;
  population?: number;
}

function escapeSql(text: string): string {
  return text.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

async function generateSQL() {
  try {
    console.log('📖 Reading Excel file...');

    const filePath = path.join(__dirname, '..', 'Mahalla-nomi.xls');
    const workbook = XLSX.readFile(filePath);

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const data: any[] = XLSX.utils.sheet_to_json(worksheet);

    console.log(`📊 Found ${data.length} rows in Excel file`);

    // Process the data
    const mahallahsData: MahallahData[] = [];

    for (const row of data) {
      const region = row['Viloyat'] || row['Region'] || row['region'];
      const district = row['Tuman'] || row['District'] || row['district'];
      const mahallah = row['Mahalla nomi'] || row['Mahalla'] || row['mahalla'] || row['name'];
      const population = row['Aholi soni'] || row['Population'] || row['population'];

      if (region && district && mahallah) {
        mahallahsData.push({
          region: String(region).trim(),
          district: String(district).trim(),
          mahallah: String(mahallah).trim(),
          population: population ? parseInt(String(population)) : undefined
        });
      }
    }

    console.log(`✅ Processed ${mahallahsData.length} valid mahallah entries`);

    // Group by region
    const regionMap = new Map<string, Map<string, MahallahData[]>>();

    for (const item of mahallahsData) {
      if (!regionMap.has(item.region)) {
        regionMap.set(item.region, new Map());
      }

      const districtMap = regionMap.get(item.region)!;
      if (!districtMap.has(item.district)) {
        districtMap.set(item.district, []);
      }

      districtMap.get(item.district)!.push(item);
    }

    console.log(`📍 Found ${regionMap.size} regions`);

    // Generate SQL
    const sqlLines: string[] = [];

    sqlLines.push('-- Mahallah ma\'lumotlari (Excel\'dan yaratilgan)');
    sqlLines.push('-- Auto-generated SQL script');
    sqlLines.push('-- Generated: ' + new Date().toISOString());
    sqlLines.push('-- Encoding: UTF-8');
    sqlLines.push('');
    sqlLines.push('SET NAMES utf8mb4;');
    sqlLines.push('SET CHARACTER SET utf8mb4;');
    sqlLines.push('');
    sqlLines.push('USE adliya;');
    sqlLines.push('');
    sqlLines.push('-- Ma\'lumotlarni kiritish');
    sqlLines.push('');

    for (const [regionName, districtMap] of regionMap) {
      const regionSlug = slugify(regionName);

      sqlLines.push(`-- ${regionName}`);
      sqlLines.push(`INSERT INTO Region (name) VALUES ('${escapeSql(regionName)}') ON DUPLICATE KEY UPDATE name=name;`);
      sqlLines.push(`SET @region_${regionSlug} = LAST_INSERT_ID();`);
      sqlLines.push('');

      // Insert districts
      for (const districtName of districtMap.keys()) {
        sqlLines.push(`INSERT INTO District (name, regionId) VALUES ('${escapeSql(districtName)}', @region_${regionSlug}) ON DUPLICATE KEY UPDATE name=name;`);
      }
      sqlLines.push('');

      // Insert mahallahs
      for (const [districtName, mahallahs] of districtMap) {
        const districtSlug = slugify(districtName);

        sqlLines.push(`-- ${districtName} mahallalari`);
        sqlLines.push(`SET @district_${districtSlug} = (SELECT id FROM District WHERE name = '${escapeSql(districtName)}' AND regionId = @region_${regionSlug});`);

        for (const mahallah of mahallahs) {
          if (mahallah.population) {
            sqlLines.push(`INSERT INTO Mahallah (name, districtId, population) VALUES ('${escapeSql(mahallah.mahallah)}', @district_${districtSlug}, ${mahallah.population}) ON DUPLICATE KEY UPDATE name=name;`);
          } else {
            sqlLines.push(`INSERT INTO Mahallah (name, districtId) VALUES ('${escapeSql(mahallah.mahallah)}', @district_${districtSlug}) ON DUPLICATE KEY UPDATE name=name;`);
          }
        }

        sqlLines.push('');
      }
    }

    // Add statistics query
    sqlLines.push('-- Statistika');
    sqlLines.push('SELECT');
    sqlLines.push("    'Regions' as TableName,");
    sqlLines.push('    COUNT(*) as Count');
    sqlLines.push('FROM Region');
    sqlLines.push('UNION ALL');
    sqlLines.push("SELECT 'Districts', COUNT(*) FROM District");
    sqlLines.push('UNION ALL');
    sqlLines.push("SELECT 'Mahallahs', COUNT(*) FROM Mahallah;");
    sqlLines.push('');

    // Save to file with UTF-8 BOM to ensure proper encoding
    const outputPath = path.join(__dirname, 'mahallah_data.sql');
    const sqlContent = '\uFEFF' + sqlLines.join('\n'); // Add UTF-8 BOM
    fs.writeFileSync(outputPath, sqlContent, 'utf-8');

    console.log('');
    console.log('✅ SQL script successfully generated!');
    console.log(`📁 File: ${outputPath}`);
    console.log('');
    console.log('📊 Statistics:');
    console.log(`   - Regions: ${regionMap.size}`);
    const totalDistricts = Array.from(regionMap.values()).reduce((sum, dm) => sum + dm.size, 0);
    console.log(`   - Districts: ${totalDistricts}`);
    const totalMahallahs = mahallahsData.length;
    console.log(`   - Mahallahs: ${totalMahallahs}`);
    console.log('');
    console.log('💡 SQL scriptni ishga tushirish:');
    console.log('   mysql -u root -p1234 < scripts/mahallah_data.sql');
    console.log('   yoki');
    console.log('   docker exec -i <container> mysql -u root -p1234 < scripts/mahallah_data.sql');

  } catch (error) {
    console.error('❌ Error generating SQL:', error);
    throw error;
  }
}

// Run the script
generateSQL()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Failed:', error);
    process.exit(1);
  });
