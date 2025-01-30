# Telegram Channel Manager Bot

A Telegram bot that helps manage content across multiple channels and groups. The bot can forward messages, post new content, and maintain an activity log with edit and delete capabilities.

## Features

- Manage multiple channels and groups
- Forward messages across channels
- Post new content to multiple channels
- Activity log with message tracking
- Edit and delete capabilities
- Admin-only access

## Prerequisites

- Node.js (v14 or higher)
- MySQL database
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd adliya-forwarder-bot
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
# Bot Configuration
BOT_TOKEN=your_bot_token_here
ADMIN_IDS=123456789,987654321 # Comma-separated list of admin Telegram IDs

# Database Configuration
DATABASE_URL="mysql://user:password@localhost:3306/your_database_name"
```

4. Set up the database:
```bash
# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate
```

5. Build and start the bot:
```bash
# Build TypeScript
npm run build

# Start the bot
npm start
```

For development:
```bash
npm run dev
```

## Usage

1. Start the bot by sending `/start`
2. Add the bot as an admin to your channels/groups
3. Use the following commands:
   - `/channels` - List managed channels
   - `/activities` - View activity log

To post content:
1. Forward a message or send new content to the bot
2. Select target channels from the provided list
3. Confirm posting

To manage activities:
1. Use `/activities` to view the activity log
2. Click on any activity to view details
3. Use the provided buttons to edit or delete posts

## Development

- `npm run dev` - Start the bot in development mode
- `npm run build` - Build TypeScript files
- `npm run prisma:studio` - Open Prisma Studio to manage database

## License

ISC 