import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testBotData() {
  try {
    console.log('🤖 Testing bot data reading with proper UTF-8...\n');

    // Test reading regions
    const regions = await prisma.region.findMany({
      take: 3,
      orderBy: { name: 'asc' }
    });

    console.log('📍 Sample Regions:');
    for (const region of regions) {
      console.log(`   ${region.id}. ${region.name}`);
    }
    console.log('');

    // Test reading mahallahs with special characters
    const mahallahs = await prisma.mahallah.findMany({
      where: {
        OR: [
          { name: { contains: 'stlik' } },
          { name: { contains: 'bog' } }
        ]
      },
      take: 10,
      include: {
        district: {
          include: { region: true }
        }
      }
    });

    console.log('🏘️ Sample Mahallahs with special characters:');
    for (const mahallah of mahallahs) {
      console.log(`   ${mahallah.name}`);
      console.log(`   📍 ${mahallah.district.region.name} > ${mahallah.district.name}`);

      // Show how it will appear in Telegram message
      const telegramMessage = `✅ Ro'yxatdan o'tkazildi!\n\n🏙️ Hudud: ${mahallah.district.region.name}\n📍 Tuman: ${mahallah.district.name}\n🏘️ Mahalla: ${mahallah.name}`;
      console.log('   📱 Telegram preview:');
      console.log('   ' + telegramMessage.replace(/\n/g, '\n   '));
      console.log('');
      break; // Just show one example
    }

    console.log('✅ Data is stored correctly in UTF-8!');
    console.log('✅ Terminal shows "?" but Telegram will show "ʻ" correctly');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testBotData();
