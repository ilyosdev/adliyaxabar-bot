import { BotContext } from '../types/context';
import { PrismaClient } from '@prisma/client';
import { Markup } from 'telegraf';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

/**
 * Show admin panel menu
 */
export async function showAdminPanel(ctx: BotContext) {
  try {
    if (ctx.chat?.type !== 'private') return;

    const keyboard = Markup.keyboard([
      ['📊 Statistika', '🗺️ Mahallalar holati'],
      ['📥 Excel Hisobot', '📋 Kontent statistikasi'],
      ['🔙 Orqaga']
    ])
    .resize()
    .persistent();

    await ctx.reply(
      '*👨‍💼 Admin Panel*\n\n' +
      'Kerakli bo\'limni tanlang:',
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );
  } catch (error) {
    console.error('Error in showAdminPanel:', error);
    await ctx.reply('Xatolik yuz berdi');
  }
}

/**
 * Show general statistics
 */
export async function showStatistics(ctx: BotContext) {
  try {
    const [
      totalRegions,
      totalDistricts,
      totalMahallahs,
      connectedChannels,
      pendingChannels,
      totalPosts
    ] = await Promise.all([
      prisma.region.count(),
      prisma.district.count(),
      prisma.mahallah.count(),
      prisma.channel.count({ where: { isActive: true, registrationStatus: 'registered' } }),
      prisma.channel.count({ where: { isActive: true, registrationStatus: 'pending' } }),
      prisma.activity.count({ where: { isDeleted: false } })
    ]);

    const connectedMahallahs = await prisma.mahallah.count({
      where: {
        channels: {
          some: {
            isActive: true,
            registrationStatus: 'registered'
          }
        }
      }
    });

    const unconnectedMahallahs = totalMahallahs - connectedMahallahs;
    const connectionPercentage = totalMahallahs > 0
      ? ((connectedMahallahs / totalMahallahs) * 100).toFixed(1)
      : '0';

    let message = '*📊 Umumiy Statistika*\n\n';
    message += '*🗺️ Geografiya:*\n';
    message += `  • Hududlar: ${totalRegions}\n`;
    message += `  • Tumanlar: ${totalDistricts}\n`;
    message += `  • Jami mahallalar: ${totalMahallahs}\n\n`;

    message += '*🔗 Ulanishlar:*\n';
    message += `  • Ulangan mahallalar: ${connectedMahallahs}\n`;
    message += `  • Ulanmagan mahallalar: ${unconnectedMahallahs}\n`;
    message += `  • Ulanish foizi: ${connectionPercentage}%\n\n`;

    message += '*📢 Kanallar:*\n';
    message += `  • Ro'yxatdan o'tgan: ${connectedChannels}\n`;
    message += `  • Kutilmoqda: ${pendingChannels}\n\n`;

    message += '*📋 Kontent:*\n';
    message += `  • Jami postlar: ${totalPosts}\n`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error in showStatistics:', error);
    await ctx.reply('Statistikani yuklashda xatolik yuz berdi');
  }
}

/**
 * Show mahallah connection status by region
 */
export async function showMahallahStatus(ctx: BotContext) {
  try {
    const regions = await prisma.region.findMany({
      include: {
        districts: {
          include: {
            mahallahs: {
              include: {
                channels: {
                  where: {
                    isActive: true,
                    registrationStatus: 'registered'
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    let message = '*🗺️ Mahallalar holati*\n\n';

    for (const region of regions) {
      const totalMahallahs = region.districts.reduce((sum, d) => sum + d.mahallahs.length, 0);
      const connectedMahallahs = region.districts.reduce(
        (sum, d) => sum + d.mahallahs.filter(m => m.channels.length > 0).length,
        0
      );
      const percentage = totalMahallahs > 0
        ? ((connectedMahallahs / totalMahallahs) * 100).toFixed(0)
        : '0';

      message += `📍 *${region.name}*\n`;
      message += `   Ulangan: ${connectedMahallahs}/${totalMahallahs} (${percentage}%)\n\n`;
    }

    message += '\n📥 Batafsil hisobot uchun "Excel Hisobot" tugmasini bosing.';

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error in showMahallahStatus:', error);
    await ctx.reply('Xatolik yuz berdi');
  }
}

/**
 * Generate and send Excel report
 */
export async function generateExcelReport(ctx: BotContext) {
  try {
    const statusMessage = await ctx.reply('⏳ Excel hisobot tayyorlanmoqda...');

    // Fetch all data
    const regions = await prisma.region.findMany({
      include: {
        districts: {
          include: {
            mahallahs: {
              include: {
                channels: {
                  where: {
                    isActive: true,
                    registrationStatus: 'registered'
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    // Prepare data for Excel
    const data: any[] = [];

    for (const region of regions) {
      for (const district of region.districts) {
        for (const mahallah of district.mahallahs) {
          const isConnected = mahallah.channels.length > 0;
          const channel = mahallah.channels[0];

          data.push({
            'Hudud': region.name,
            'Tuman': district.name,
            'Mahalla': mahallah.name,
            'Aholi soni': mahallah.population || '',
            'Holat': isConnected ? 'Ulangan' : 'Ulanmagan',
            'Kanal/Guruh nomi': channel?.title || '',
            'Kanal ID': channel ? String(channel.chatId) : '',
            'Qo\'shilgan sana': channel ? channel.addedAt.toLocaleDateString('uz-UZ') : '',
            'Admin': channel?.addedByAdminName || ''
          });
        }
      }
    }

    // Create workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);

    // Set column widths
    worksheet['!cols'] = [
      { wch: 20 }, // Hudud
      { wch: 20 }, // Tuman
      { wch: 30 }, // Mahalla
      { wch: 12 }, // Aholi soni
      { wch: 12 }, // Holat
      { wch: 30 }, // Kanal nomi
      { wch: 15 }, // Kanal ID
      { wch: 15 }, // Sana
      { wch: 25 }  // Admin
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Mahallalar');

    // Create summary sheet
    const summaryData = regions.map(region => {
      const totalMahallahs = region.districts.reduce((sum, d) => sum + d.mahallahs.length, 0);
      const connectedMahallahs = region.districts.reduce(
        (sum, d) => sum + d.mahallahs.filter(m => m.channels.length > 0).length,
        0
      );
      const percentage = totalMahallahs > 0
        ? ((connectedMahallahs / totalMahallahs) * 100).toFixed(1)
        : '0';

      return {
        'Hudud': region.name,
        'Jami mahallalar': totalMahallahs,
        'Ulangan': connectedMahallahs,
        'Ulanmagan': totalMahallahs - connectedMahallahs,
        'Foiz': percentage + '%'
      };
    });

    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    summarySheet['!cols'] = [
      { wch: 20 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 10 }
    ];

    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Xulosa');

    // Save file
    const fileName = `mahallalar-hisobot-${new Date().toISOString().split('T')[0]}.xlsx`;
    const filePath = path.join('/tmp', fileName);
    XLSX.writeFile(workbook, filePath);

    // Send file to user
    await ctx.replyWithDocument(
      { source: filePath, filename: fileName },
      {
        caption: '📊 Mahallalar holati haqida hisobot\n\n' +
          '📋 Varaqlar:\n' +
          '• *Mahallalar* - Batafsil ro\'yxat\n' +
          '• *Xulosa* - Hududlar bo\'yicha umumiy ma\'lumot',
        parse_mode: 'Markdown'
      }
    );

    // Delete temp file
    fs.unlinkSync(filePath);

    // Delete status message
    await ctx.telegram.deleteMessage(ctx.chat!.id, statusMessage.message_id);

  } catch (error) {
    console.error('Error in generateExcelReport:', error);
    await ctx.reply('Excel hisobotni yaratishda xatolik yuz berdi');
  }
}

/**
 * Show content statistics
 */
export async function showContentStatistics(ctx: BotContext) {
  try {
    const statusMessage = await ctx.reply('⏳ Statistika yuklanmoqda...');

    // Get recent posts ordered by creation date
    const recentPosts = await prisma.activity.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        messages: {
          include: {
            channel: true
          }
        }
      }
    });

    // Get total statistics
    const [totalPosts, totalChannels, totalMessages] = await Promise.all([
      prisma.activity.count({ where: { isDeleted: false } }),
      prisma.channel.count({ where: { isActive: true, registrationStatus: 'registered' } }),
      prisma.message.count()
    ]);

    const avgChannelsPerPost = totalPosts > 0
      ? Math.round(totalMessages / totalPosts)
      : 0;

    let message = '*📋 Kontent Statistikasi*\n\n';
    message += '*📊 Umumiy:*\n';
    message += `  • Jami postlar: ${totalPosts}\n`;
    message += `  • Jami kanallar: ${totalChannels}\n`;
    message += `  • Jami yuborilgan xabarlar: ${totalMessages}\n`;
    message += `  • O'rtacha kanallar har bir post uchun: ${avgChannelsPerPost}\n\n`;

    if (recentPosts.length > 0) {
      message += '*📅 Oxirgi postlar:*\n';
      recentPosts.slice(0, 5).forEach((post, index) => {
        const preview = post.originalContent.substring(0, 50).replace(/\n/g, ' ');
        const channelsCount = new Set(post.messages.map(m => m.channelId)).size;
        const date = new Date(post.createdAt).toLocaleDateString('uz-UZ');
        message += `${index + 1}. ${preview}${post.originalContent.length > 50 ? '...' : ''}\n`;
        message += `   📢 ${channelsCount} kanal | 📅 ${date}\n\n`;
      });
    }

    await ctx.telegram.deleteMessage(ctx.chat!.id, statusMessage.message_id);
    await ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Error in showContentStatistics:', error);
    await ctx.reply('Xatolik yuz berdi');
  }
}

/**
 * Search for a specific mahallah
 */
export async function searchMahallah(ctx: BotContext, searchQuery: string) {
  try {
    const mahallahs = await prisma.mahallah.findMany({
      where: {
        OR: [
          { name: { contains: searchQuery } }
        ]
      },
      include: {
        district: {
          include: { region: true }
        },
        channels: {
          where: {
            isActive: true,
            registrationStatus: 'registered'
          }
        }
      },
      take: 10
    });

    if (mahallahs.length === 0) {
      await ctx.reply(`"${searchQuery}" uchun natija topilmadi.`);
      return;
    }

    let message = `*🔍 Qidiruv natijalari: "${searchQuery}"*\n\n`;

    for (const mahallah of mahallahs) {
      message += `📍 *${mahallah.district.region.name} > ${mahallah.district.name} > ${mahallah.name}*\n`;

      if (mahallah.channels.length > 0) {
        message += `✅ Ulangan\n`;
        message += `📢 ${mahallah.channels[0].title}\n`;
      } else {
        message += `❌ Ulanmagan\n`;
      }
      message += '\n';
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Error in searchMahallah:', error);
    await ctx.reply('Qidiruvda xatolik yuz berdi');
  }
}

/**
 * Show unconnected mahallahs for a specific district
 */
export async function showUnconnectedMahallahs(ctx: BotContext, districtId: number) {
  try {
    const district = await prisma.district.findUnique({
      where: { id: districtId },
      include: {
        region: true,
        mahallahs: {
          include: {
            channels: {
              where: {
                isActive: true,
                registrationStatus: 'registered'
              }
            }
          }
        }
      }
    });

    if (!district) {
      await ctx.reply('Tuman topilmadi');
      return;
    }

    const unconnected = district.mahallahs.filter(m => m.channels.length === 0);

    if (unconnected.length === 0) {
      await ctx.reply(
        `✅ *${district.region.name} > ${district.name}*\n\n` +
        `Barcha mahallalar ulangan! 🎉`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    let message = `*📍 ${district.region.name} > ${district.name}*\n\n`;
    message += `*❌ Ulanmagan mahallalar (${unconnected.length}):*\n\n`;

    unconnected.forEach((m, index) => {
      message += `${index + 1}. ${m.name}\n`;
    });

    await ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Error in showUnconnectedMahallahs:', error);
    await ctx.reply('Xatolik yuz berdi');
  }
}
