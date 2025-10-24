/**
 * Escape special characters for Telegram Markdown
 */
export function escapeMarkdown(text: string): string {
  // Escape special Markdown characters
  return text
    .replace(/\_/g, '\\_')  // Underscore
    .replace(/\*/g, '\\*')  // Asterisk
    .replace(/\[/g, '\\[')  // Left bracket
    .replace(/\]/g, '\\]')  // Right bracket
    .replace(/\(/g, '\\(')  // Left parenthesis
    .replace(/\)/g, '\\)')  // Right parenthesis
    .replace(/\~/g, '\\~')  // Tilde
    .replace(/\`/g, '\\`')  // Backtick
    .replace(/\>/g, '\\>')  // Greater than
    .replace(/\#/g, '\\#')  // Hash
    .replace(/\+/g, '\\+')  // Plus
    .replace(/\-/g, '\\-')  // Minus
    .replace(/\=/g, '\\=')  // Equals
    .replace(/\|/g, '\\|')  // Pipe
    .replace(/\{/g, '\\{')  // Left brace
    .replace(/\}/g, '\\}')  // Right brace
    .replace(/\./g, '\\.')  // Period
    .replace(/\!/g, '\\!'); // Exclamation
}

/**
 * Escape only essential characters (for simpler use cases)
 */
export function escapeMarkdownSimple(text: string): string {
  return text
    .replace(/\_/g, '\\_')  // Underscore - most common issue
    .replace(/\*/g, '\\*')  // Asterisk
    .replace(/\[/g, '\\[')  // Left bracket
    .replace(/\`/g, '\\`'); // Backtick
}
