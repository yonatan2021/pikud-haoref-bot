import { Bot } from 'grammy';
import type { Context } from 'grammy';
import { SUPER_REGIONS } from '../config/zones.js';
import { escapeHtml } from '../telegramBot.js';

export function buildLegendMessage(): string {
  const lines: string[] = ['🗺 <b>מקרא אזורים</b>', ''];
  for (const sr of SUPER_REGIONS) {
    lines.push(`<b>${sr.name}</b>`);
    lines.push(sr.zones.map((z) => `  ▸ ${escapeHtml(z)}`).join('\n'));
    lines.push('');
  }
  return lines.join('\n').trim();
}

export function registerLegendHandler(bot: Bot): void {
  bot.command('legend', async (ctx: Context) => {
    if (ctx.chat?.type !== 'private') return;
    await ctx.reply(buildLegendMessage(), { parse_mode: 'HTML' });
  });
}
