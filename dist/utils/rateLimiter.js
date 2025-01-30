"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimiter = void 0;
exports.sendSafeMessage = sendSafeMessage;
exports.copySafeMessage = copySafeMessage;
exports.editSafeMessage = editSafeMessage;
exports.deleteSafeMessage = deleteSafeMessage;
// Telegram API Limits
const PRIVATE_CHAT_LIMIT = 1; // 1 message per second per private chat
const GROUP_CHAT_LIMIT = 20; // 20 messages per minute per group
const BROADCAST_LIMIT = 30; // 30 messages per second total (free tier)
const MINUTE = 60 * 1000;
const SECOND = 1000;
class RateLimiter {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.chatCounters = new Map();
        this.globalCounter = { count: 0, lastReset: Date.now() };
        this.groupCounters = new Map();
    }
    async enqueue(task, chatId, chatType, priority = 0) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, chatId, chatType, priority, resolve, reject });
            this.queue.sort((a, b) => b.priority - a.priority); // Higher priority first
            if (!this.isProcessing) {
                this.processQueue();
            }
        });
    }
    async processQueue() {
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
            }
            else if (task.chatType === 'group' || task.chatType === 'supergroup') {
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
            }
            else if (task.chatType === 'group' || task.chatType === 'supergroup') {
                const groupCounter = this.groupCounters.get(task.chatId) || { count: 0, lastReset: now };
                groupCounter.count++;
                this.groupCounters.set(task.chatId, groupCounter);
            }
            const result = await task.task();
            task.resolve(result);
        }
        catch (error) {
            if (error?.response?.error_code === 429) {
                // Rate limit hit, put task back in queue with increased priority
                this.queue.unshift({ ...task, priority: task.priority + 1 });
                // Wait for the time specified in the error response
                const retryAfter = error?.response?.parameters?.retry_after || 1;
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            }
            else {
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
exports.rateLimiter = new RateLimiter();
// Helper function to send messages safely
async function sendSafeMessage(ctx, chatId, message, options = {}, chatType = 'private') {
    return exports.rateLimiter.enqueue(async () => ctx.telegram.sendMessage(chatId, message, options), chatId, chatType);
}
// Helper function to copy messages safely
async function copySafeMessage(ctx, chatId, fromChatId, messageId, chatType = 'channel') {
    return exports.rateLimiter.enqueue(async () => ctx.telegram.copyMessage(chatId, fromChatId, messageId), chatId, chatType);
}
// Helper function to edit messages safely
async function editSafeMessage(ctx, chatId, messageId, text, options = {}, chatType = 'channel') {
    return exports.rateLimiter.enqueue(async () => ctx.telegram.editMessageText(chatId, messageId, undefined, text, options), chatId, chatType);
}
// Helper function to delete messages safely
async function deleteSafeMessage(ctx, chatId, messageId, chatType = 'channel') {
    return exports.rateLimiter.enqueue(async () => ctx.telegram.deleteMessage(chatId, messageId), chatId, chatType);
}
