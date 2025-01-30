import { Context } from 'telegraf';

interface SessionData {
  pendingPost?: {
    type: 'forward' | 'direct';
    content: any; // Message content
    targetChannels: number[];
  };
  editingActivity?: string;
}

export interface BotContext extends Context {
  session: SessionData;
} 