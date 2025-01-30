import { Context } from 'telegraf';

// Telegram API Limits
const PRIVATE_CHAT_LIMIT = 1; // 1 message per second per private chat
const GROUP_CHAT_LIMIT = 20; // 20 messages per minute per group
const BROADCAST_LIMIT = 30; // 30 messages per second total (free tier)
const MINUTE = 60 * 1000;
const SECOND = 1000;

interface QueueTask {
  task: () => Promise<any>;
  chatId: number;
  chatType: 'private' | 'group' | 'channel' | 'supergroup';
  priority: number;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

class RateLimiter {
  private queue: QueueTask[] = [];
  private isProcessing = false;
  private chatCounters = new Map<number, { count: number; lastReset: number }>();
  private globalCounter = { count: 0, lastReset: Date.now() };
  private groupCounters = new Map<number, { count: number; lastReset: number }>();

  async enqueue(
    task: () => Promise<any>,
    chatId: number,
    chatType: 'private' | 'group' | 'channel' | 'supergroup',
    priority: number = 0
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, chatId, chatType, priority, resolve, reject });
      this.queue.sort((a, b) => b.priority - a.priority); // Higher priority first

      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const now = Date.now();

    // Reset global counter every second
    if (now - this.globalCounter.lastReset >= SECOND) {
      this.globalCounter = { count: 0, lastReset: now };
    }

    // Reset group counters every minute
    for (const [chatId, counter] of this.groupCounters) {
      if (now - counter.lastReset >= MINUTE) {
        this.groupCounters.delete(chatId);
      }
    }

    // Find the next task that can be executed within limits
    const taskIndex = this.queue.findIndex(task => {
      if (this.globalCounter.count >= BROADCAST_LIMIT) {
        return false;
      }

      if (task.chatType === 'private') {
        const chatCounter = this.chatCounters.get(task.chatId);
        if (chatCounter && now - chatCounter.lastReset < SECOND) {
          return false;
        }
      } else if (task.chatType === 'group' || task.chatType === 'supergroup') {
        const groupCounter = this.groupCounters.get(task.chatId) || { count: 0, lastReset: now };
        if (groupCounter.count >= GROUP_CHAT_LIMIT) {
          return false;
        }
      }

      return true;
    });

    if (taskIndex === -1) {
      // No task can be executed right now, wait and try again
      const waitTime = Math.max(SECOND / BROADCAST_LIMIT, 100);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.processQueue();
    }

    const task = this.queue.splice(taskIndex, 1)[0];

    try {
      // Update counters before executing
      this.globalCounter.count++;
      
      if (task.chatType === 'private') {
        this.chatCounters.set(task.chatId, { count: 1, lastReset: now });
      } else if (task.chatType === 'group' || task.chatType === 'supergroup') {
        const groupCounter = this.groupCounters.get(task.chatId) || { count: 0, lastReset: now };
        groupCounter.count++;
        this.groupCounters.set(task.chatId, groupCounter);
      }

      const result = await task.task();
      task.resolve(result);
    } catch (error: any) {
      if (error?.response?.error_code === 429) {
        // Rate limit hit, put task back in queue with increased priority
        this.queue.unshift({ ...task, priority: task.priority + 1 });
        // Wait for the time specified in the error response
        const retryAfter = error?.response?.parameters?.retry_after || 1;
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      } else {
        task.reject(error);
      }
    }

    // Schedule next task with appropriate delay
    const delay = Math.max(SECOND / BROADCAST_LIMIT, 50);
    setTimeout(() => this.processQueue(), delay);
  }

  clearChatCounters() {
    this.chatCounters.clear();
    this.groupCounters.clear();
  }
}

// Create a singleton instance
export const rateLimiter = new RateLimiter();

// Helper function to send messages safely
export async function sendSafeMessage(
  ctx: Context,
  chatId: number,
  message: any,
  options: any = {},
  chatType: 'private' | 'group' | 'channel' | 'supergroup' = 'private'
) {
  return rateLimiter.enqueue(
    async () => ctx.telegram.sendMessage(chatId, message, options),
    chatId,
    chatType
  );
}

// Helper function to copy messages safely
export async function copySafeMessage(
  ctx: Context,
  chatId: number,
  fromChatId: number,
  messageId: number,
  chatType: 'private' | 'group' | 'channel' | 'supergroup' = 'channel'
) {
  return rateLimiter.enqueue(
    async () => ctx.telegram.copyMessage(chatId, fromChatId, messageId),
    chatId,
    chatType
  );
}

// Helper function to edit messages safely
export async function editSafeMessage(
  ctx: Context,
  chatId: number,
  messageId: number,
  text: string,
  options: any = {},
  chatType: 'private' | 'group' | 'channel' | 'supergroup' = 'channel'
) {
  return rateLimiter.enqueue(
    async () => ctx.telegram.editMessageText(chatId, messageId, undefined, text, options),
    chatId,
    chatType
  );
}

// Helper function to delete messages safely
export async function deleteSafeMessage(
  ctx: Context,
  chatId: number,
  messageId: number,
  chatType: 'private' | 'group' | 'channel' | 'supergroup' = 'channel'
) {
  return rateLimiter.enqueue(
    async () => ctx.telegram.deleteMessage(chatId, messageId),
    chatId,
    chatType
  );
} 