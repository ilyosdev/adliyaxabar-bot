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
}

export interface BotContext extends Context {
  session: SessionData;
} 