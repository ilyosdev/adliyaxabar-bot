import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';

const prisma = new PrismaClient();

interface MahallahData {
  region: string;
  district: string;
  mahallah: string;
  population?: number;
}

async function importMahallahs() {
  try {
    console.log('📖 Reading Excel file...');

    // Read the Excel file
    const filePath = path.join(__dirname, '..', 'Mahalla-nomi.xls');
    const workbook = XLSX.readFile(filePath);

    // Get the first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const data: any[] = XLSX.utils.sheet_to_json(worksheet);

    console.log(`📊 Found ${data.length} rows in Excel file`);

    // Process the data
    const mahallahsData: MahallahData[] = [];

    for (const row of data) {
      // Adjust these column names based on your Excel file structure
      // Common column names: Viloyat, Tuman, Mahalla
      const region = row['Viloyat'] || row['Region'] || row['region'];
      const district = row['Tuman'] || row['District'] || row['district'];
      const mahallah = row['Mahalla'] || row['mahalla'] || row['name'];
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

    // Import into database
    let regionCount = 0;
    let districtCount = 0;
    let mahallahCount = 0;

    for (const [regionName, districtMap] of regionMap) {
      console.log(`\n🏙️  Processing region: ${regionName}`);

      // Create or get region
      const region = await prisma.region.upsert({
        where: { name: regionName },
        update: {},
        create: { name: regionName }
      });
      regionCount++;

      for (const [districtName, mahallahs] of districtMap) {
        console.log(`  📍 Processing district: ${districtName} (${mahallahs.length} mahallahs)`);

        // Create or get district
        const district = await prisma.district.upsert({
          where: {
            regionId_name: {
              regionId: region.id,
              name: districtName
            }
          },
          update: {},
          create: {
            name: districtName,
            regionId: region.id
          }
        });
        districtCount++;

        // Create mahallahs
        for (const mahallahData of mahallahs) {
          await prisma.mahallah.upsert({
            where: {
              districtId_name: {
                districtId: district.id,
                name: mahallahData.mahallah
              }
            },
            update: {
              population: mahallahData.population
            },
            create: {
              name: mahallahData.mahallah,
              districtId: district.id,
              population: mahallahData.population
            }
          });
          mahallahCount++;
        }
      }
    }

    console.log('\n✅ Import completed successfully!');
    console.log(`📊 Statistics:`);
    console.log(`   - Regions: ${regionCount}`);
    console.log(`   - Districts: ${districtCount}`);
    console.log(`   - Mahallahs: ${mahallahCount}`);

  } catch (error) {
    console.error('❌ Error importing mahallahs:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the import
importMahallahs()
  .then(() => {
    console.log('\n🎉 Import script completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Import script failed:', error);
    process.exit(1);
  });
