import { Context } from 'telegraf';

interface PendingPost {
  type: 'forward' | 'direct' | 'media_group';
  content: any;
  targetChannels: number[];
  page?: number;
}

interface SessionData {
  pendingPost?: PendingPost;
  editingActivity?: string;
  registrationData?: {
    chatId: number;
    adminId: number;
    adminName: string;
    step: 'region' | 'district' | 'mahallah';
    regionId?: number;
    districtId?: number;
  };
}

export interface BotContext extends Context {
  session: SessionData;
} 