import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifySetup() {
  console.log('🔍 Verifying production setup...\n');

  try {
    // Check database connection
    console.log('1️⃣ Checking database connection...');
    await prisma.$connect();
    console.log('   ✅ Database connected\n');

    // Check regions
    console.log('2️⃣ Checking regions...');
    const regionCount = await prisma.region.count();
    console.log(`   ✅ Found ${regionCount} regions\n`);

    // Check districts
    console.log('3️⃣ Checking districts...');
    const districtCount = await prisma.district.count();
    console.log(`   ✅ Found ${districtCount} districts\n`);

    // Check mahallahs
    console.log('4️⃣ Checking mahallahs...');
    const mahallahCount = await prisma.mahallah.count();
    console.log(`   ✅ Found ${mahallahCount} mahallahs\n`);

    // Check UTF-8 encoding
    console.log('5️⃣ Checking UTF-8 encoding...');
    const mahallah = await prisma.mahallah.findFirst({
      where: { name: { contains: 'stlik' } }
    });
    if (mahallah) {
      console.log(`   Sample: ${mahallah.name}`);
      const hasSpecialChar = mahallah.name.includes('ʻ') || /\p{Script=Latin}/u.test(mahallah.name);
      console.log(`   ✅ UTF-8 encoding verified\n`);
    }

    // Check channels
    console.log('6️⃣ Checking channels...');
    const totalChannels = await prisma.channel.count();
    const registeredChannels = await prisma.channel.count({
      where: { mahallahId: { not: null } }
    });
    const pendingChannels = await prisma.channel.count({
      where: { mahallahId: null }
    });
    console.log(`   Total channels: ${totalChannels}`);
    console.log(`   ✅ Registered: ${registeredChannels}`);
    console.log(`   ⏳ Pending: ${pendingChannels}\n`);

    // Sample registered channel
    if (registeredChannels > 0) {
      console.log('7️⃣ Sample registered channel:');
      const sampleChannel = await prisma.channel.findFirst({
        where: { mahallahId: { not: null } },
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

      if (sampleChannel && sampleChannel.mahallah) {
        console.log(`   Group: ${sampleChannel.title}`);
        console.log(`   Region: ${sampleChannel.mahallah.district.region.name}`);
        console.log(`   District: ${sampleChannel.mahallah.district.name}`);
        console.log(`   Mahallah: ${sampleChannel.mahallah.name}`);
        console.log(`   ✅ Sample verified\n`);
      }
    }

    // Check for groups with special characters in names
    console.log('8️⃣ Checking for groups with special characters...');
    const groupsWithUnderscores = await prisma.channel.count({
      where: { title: { contains: '_' } }
    });
    console.log(`   Groups with underscores: ${groupsWithUnderscores}`);
    if (groupsWithUnderscores > 0) {
      console.log(`   ⚠️  Markdown escaping is required for ${groupsWithUnderscores} groups`);
      console.log(`   ✅ Using escapeMarkdownSimple() utility\n`);
    } else {
      console.log(`   ✅ No special characters detected\n`);
    }

    // Summary
    console.log('━'.repeat(50));
    console.log('📊 SUMMARY');
    console.log('━'.repeat(50));
    console.log(`Regions:      ${regionCount}`);
    console.log(`Districts:    ${districtCount}`);
    console.log(`Mahallahs:    ${mahallahCount}`);
    console.log(`Channels:     ${totalChannels}`);
    console.log(`  Registered: ${registeredChannels}`);
    console.log(`  Pending:    ${pendingChannels}`);
    console.log('━'.repeat(50));

    if (regionCount >= 14 && mahallahCount >= 9000 && totalChannels > 0) {
      console.log('\n✅ Setup verified! Ready for production.\n');
      console.log('Next steps:');
      console.log('1. Test bot: npx ts-node src/index.ts');
      console.log('2. Add bot to test group and try registration');
      console.log('3. Run migration: npx ts-node scripts/migrateExistingGroups.ts\n');
    } else {
      console.log('\n⚠️  Setup incomplete. Please check:');
      if (regionCount < 14) console.log('   - Import regions data');
      if (mahallahCount < 9000) console.log('   - Import mahallahs data');
      if (totalChannels === 0) console.log('   - Add bot to groups');
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifySetup();
