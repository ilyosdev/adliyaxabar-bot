import { Context, Telegram } from 'telegraf';

// Telegram API Limits
const PRIVATE_CHAT_LIMIT = 1; // 1 message per second per private chat
const GROUP_CHAT_LIMIT = 20; // 20 messages per minute per group
const BROADCAST_LIMIT = 30; // 30 messages per second total (free tier)
const MINUTE = 60 * 1000;
const SECOND = 1000;

// Delay between operations (ms)
const DELAY_MS = 35; // ~29 messages per second max

interface QueueItem {
  task: Function;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

export class RateLimiter {
  private queue: QueueItem[] = [];
  private isProcessing = false;
  
  /**
   * Add a task to the queue and return a promise that resolves when it's done
   */
  public async enqueue<T>(task: Function): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }
  
  /**
   * Process the queue with rate limiting
   */
  private async processQueue(): Promise<void> {
    this.isProcessing = true;
    
    while (this.queue.length > 0) {
      const { task, resolve, reject } = this.queue.shift()!;
      
      try {
        const result = await task();
        resolve(result);
      } catch (error) {
        reject(error);
      }
      
      if (this.queue.length > 0) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }
    
    this.isProcessing = false;
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
    async () => ctx.telegram.sendMessage(chatId, message, options)
  );
}

/**
 * Safely copy a message to a channel, handling errors with proper rate limiting
 */
export async function copySafeMessage(
  telegram: Telegram, 
  chatId: number,
  fromChatId: number, 
  messageId: number
): Promise<{ message_id: number }> {
  try {
    // Try to copy the message
    return await telegram.copyMessage(chatId, fromChatId, messageId);
  } catch (error: any) {
    // Handle migrated chats
    if (error.response?.error_code === 400 && 
        error.response?.description === 'Bad Request: group chat was upgraded to a supergroup chat' &&
        error.response?.parameters?.migrate_to_chat_id) {
      
      // Retry with the new chat ID
      const newChatId = error.response.parameters.migrate_to_chat_id;
      console.log(`Chat ${chatId} migrated to ${newChatId}, retrying...`);
      return await telegram.copyMessage(newChatId, fromChatId, messageId);
    }
    
    // For other errors, throw them for handling by the caller
    throw error;
  }
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
    async () => ctx.telegram.editMessageText(chatId, messageId, undefined, text, options)
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
    async () => ctx.telegram.deleteMessage(chatId, messageId)
  );
} 