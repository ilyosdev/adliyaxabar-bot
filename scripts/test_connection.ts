import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testConnection() {
  try {
    console.log('🔍 Testing database connection...\n');

    // Test basic connection
    await prisma.$connect();
    console.log('✅ Database connection successful!\n');

    // Count records
    const [
      regionCount,
      districtCount,
      mahallahCount,
      channelCount,
      activityCount
    ] = await Promise.all([
      prisma.region.count(),
      prisma.district.count(),
      prisma.mahallah.count(),
      prisma.channel.count(),
      prisma.activity.count()
    ]);

    console.log('📊 Database Statistics:');
    console.log(`   - Regions: ${regionCount}`);
    console.log(`   - Districts: ${districtCount}`);
    console.log(`   - Mahallahs: ${mahallahCount}`);
    console.log(`   - Channels: ${channelCount}`);
    console.log(`   - Activities: ${activityCount}`);
    console.log('');

    // Show sample regions
    if (regionCount > 0) {
      console.log('📍 Sample Regions:');
      const regions = await prisma.region.findMany({
        take: 5,
        include: {
          _count: {
            select: { districts: true }
          }
        }
      });

      for (const region of regions) {
        console.log(`   - ${region.name} (${region._count.districts} districts)`);
      }
      console.log('');
    }

    // Show sample channels
    if (channelCount > 0) {
      console.log('📢 Sample Channels:');
      const channels = await prisma.channel.findMany({
        take: 5,
        include: {
          mahallah: {
            include: {
              district: {
                include: { region: true }
              }
            }
          }
        }
      });

      for (const channel of channels) {
        console.log(`   - ${channel.title}`);
        if (channel.mahallah) {
          console.log(`     Location: ${channel.mahallah.district.region.name} > ${channel.mahallah.district.name} > ${channel.mahallah.name}`);
        } else {
          console.log(`     Status: Not registered yet`);
        }
      }
      console.log('');
    }

    console.log('✅ All tests passed!');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
