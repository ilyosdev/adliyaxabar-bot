"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdmin = isAdmin;
const dotenv = __importStar(require("dotenv"));
// Ensure environment variables are loaded
dotenv.config();
function getAdminIds() {
    const adminIdsStr = process.env.ADMIN_IDS;
    console.log('Raw ADMIN_IDS from env:', adminIdsStr);
    if (!adminIdsStr) {
        console.warn('No ADMIN_IDS found in environment variables');
        return [];
    }
    // Remove any comments and split by comma
    const cleanAdminIds = adminIdsStr.split('#')[0].trim();
    const adminIds = cleanAdminIds.split(',').map(id => Number(id.trim()));
    console.log('Parsed admin IDs:', adminIds);
    return adminIds;
}
const adminIds = getAdminIds();
function isAdmin(ctx, next) {
    const userId = ctx.from?.id;
    console.log('Auth check - User ID:', userId);
    console.log('Authorized admins:', adminIds);
    // Skip auth check for channel posts
    if (ctx.chat?.type === 'channel') {
        return next();
    }
    // Skip auth check for group messages that are not commands
    if ((ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') &&
        (!ctx.message || !('text' in ctx.message) || !ctx.message.text.startsWith('/'))) {
        return next();
    }
    if (!userId || !adminIds.includes(userId)) {
        console.log('Authorization failed for user:', userId);
        if (ctx.chat?.type === 'private') {
            ctx.reply('⛔️ You are not authorized to use this bot.');
        }
        return;
    }
    return next();
}
