#!/usr/bin/env node
'use strict';

const readline = require('readline');
const fs = require('fs');
const path = require('path');

// ─── Arg parsing ─────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') { flags.help = true; continue; }
    if (arg === '--full') { flags.full = true; continue; }
    const match = arg.match(/^--([a-z-]+)(?:=(.+))?$/);
    if (match) {
      const key = match[1];
      const val = match[2] !== undefined ? match[2] : args[++i];
      flags[key] = val;
    }
  }
  return flags;
}

// ─── I/O helpers ─────────────────────────────────────────────────────────────

function createRL() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function promptRequired(rl, envKey, flagValue, label, hint) {
  if (flagValue) return flagValue;
  let value = '';
  while (!value.trim()) {
    process.stdout.write(hint ? `\n  ${label}\n  ${hint}\n` : `\n  ${label}\n`);
    value = await ask(rl, '  > ');
    if (!value.trim()) console.log('  ⚠️  נדרש — לא ניתן להמשיך ללא ערך זה.');
  }
  return value.trim();
}

async function promptOptional(rl, envKey, flagValue, label, hint) {
  if (flagValue !== undefined) return flagValue || null;
  process.stdout.write(hint ? `\n  ${label}\n  ${hint}\n` : `\n  ${label}\n`);
  const value = await ask(rl, '  > (Enter לדילוג) ');
  return value.trim() || null;
}

// ─── .env writer ─────────────────────────────────────────────────────────────

function writeEnvFile(vars, outputPath) {
  const lines = [
    '# נוצר על ידי npx pikud-haoref-bot',
    `# ${new Date().toISOString()}`,
    '',
  ];
  for (const [key, value] of Object.entries(vars)) {
    if (value !== null && value !== undefined && value !== '') {
      // Quote values that contain spaces
      const safe = String(value).includes(' ') ? `"${value}"` : String(value);
      lines.push(`${key}=${safe}`);
    }
  }
  lines.push('');
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
}

// ─── Run instructions ─────────────────────────────────────────────────────────

function printDockerCommand(envPath) {
  const rel = path.relative(process.cwd(), envPath);
  console.log(`
  ┌─────────────────────────────────────────────────────────────┐
  │  הפקודה להרצה עם Docker:                                    │
  └─────────────────────────────────────────────────────────────┘

  docker run -d \\
    --name pikud-haoref-bot \\
    --restart unless-stopped \\
    --env-file ${rel} \\
    -v ./data:/app/data \\
    ghcr.io/yonatan2021/pikud-haoref-bot:latest

  💡 הוסף -d להרצה ברקע, או הסר אותו לצפייה בלוגים.
  `);
}

function printNodeInstructions() {
  console.log(`
  ┌─────────────────────────────────────────────────────────────┐
  │  הוראות הרצה עם Node.js:                                    │
  └─────────────────────────────────────────────────────────────┘

  git clone https://github.com/yonatan2021/pikud-haoref-bot.git
  cd pikud-haoref-bot
  npm install
  # העבר את קובץ ה-.env שנוצר לתיקיית הפרויקט
  npm start
  `);
}

// ─── Help ─────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
  npx pikud-haoref-bot [options]

  אפשרויות:
    --token <value>        TELEGRAM_BOT_TOKEN  (חובה)
    --chat-id <value>      TELEGRAM_CHAT_ID    (חובה)
    --mapbox <value>       MAPBOX_ACCESS_TOKEN (חובה)
    --dashboard <value>    DASHBOARD_SECRET    (מפעיל לוח בקרה)
    --proxy <value>        PROXY_URL           (נדרש מחוץ לישראל)
    --invite-link <value>  TELEGRAM_INVITE_LINK
    --full                 הצג את כל ההגדרות האופציונליות
    --output <path>        נתיב לקובץ .env (ברירת מחדל: ./.env)
    --help                 הצג הודעה זו

  דוגמאות:
    npx pikud-haoref-bot
    npx pikud-haoref-bot --token=xxx --chat-id=-123456 --mapbox=yyy
    npx pikud-haoref-bot --full --output=/home/user/bot/.env
  `);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const flags = parseArgs();

  if (flags.help) {
    printHelp();
    process.exit(0);
  }

  const outputPath = path.resolve(flags.output || '.env');

  console.log(`
  ╔═══════════════════════════════════════════════════╗
  ║   🚨  בוט התראות פיקוד העורף — הגדרה מהירה      ║
  ╚═══════════════════════════════════════════════════╝

  יצרנו קובץ .env עם ההגדרות שלך.
  הבוט ישלח התראות IDF Home Front Command לערוץ Telegram שלך.

  ℹ️  ניתן לשנות הגדרות מתקדמות לאחר ההתקנה דרך לוח הבקרה.
  `);

  const rl = createRL();

  // ── Required vars ────────────────────────────────────────────────────────

  console.log('  ── הגדרות חובה ────────────────────────────────────────────');

  const token = await promptRequired(
    rl,
    'TELEGRAM_BOT_TOKEN',
    flags.token,
    'טוקן הבוט מ-@BotFather:',
    'צור בוט חדש ב-https://t.me/BotFather וקבל את הטוקן'
  );

  const chatId = await promptRequired(
    rl,
    'TELEGRAM_CHAT_ID',
    flags['chat-id'],
    'מזהה הערוץ/קבוצה (TELEGRAM_CHAT_ID):',
    'מספר שלילי לערוץ (למשל -1001234567890), חיובי ל-DM'
  );

  const mapbox = await promptRequired(
    rl,
    'MAPBOX_ACCESS_TOKEN',
    flags.mapbox,
    'טוקן Mapbox (ליצירת מפות):',
    'צור חשבון חינמי ב-https://account.mapbox.com/access-tokens'
  );

  // ── Optional vars ────────────────────────────────────────────────────────

  const vars = {
    TELEGRAM_BOT_TOKEN: token,
    TELEGRAM_CHAT_ID: chatId,
    MAPBOX_ACCESS_TOKEN: mapbox,
  };

  const doFull = flags.full || (
    !flags.token && !flags['chat-id'] && !flags.mapbox &&
    await (async () => {
      console.log('\n  ── הגדרות אופציונליות ─────────────────────────────────────');
      const ans = await ask(rl, '\n  רוצה להגדיר הגדרות אופציונליות? (y/N) ');
      return ans.trim().toLowerCase() === 'y';
    })()
  );

  if (flags.full) {
    console.log('\n  ── הגדרות אופציונליות ─────────────────────────────────────');
  }

  if (doFull || flags.dashboard !== undefined) {
    const dashboard = await promptOptional(
      rl,
      'DASHBOARD_SECRET',
      flags.dashboard,
      'סיסמת לוח הבקרה (DASHBOARD_SECRET):',
      'מפעיל את לוח הבקרה על פורט 4000 — דלג אם אינך צריך'
    );
    if (dashboard) vars.DASHBOARD_SECRET = dashboard;
  }

  if (doFull || flags.proxy !== undefined) {
    const proxy = await promptOptional(
      rl,
      'PROXY_URL',
      flags.proxy,
      'כתובת Proxy (PROXY_URL):',
      'נדרש אם הבוט רץ מחוץ לישראל. פורמט: http://user:pass@host:port'
    );
    if (proxy) vars.PROXY_URL = proxy;
  }

  if (doFull || flags['invite-link'] !== undefined) {
    const inviteLink = await promptOptional(
      rl,
      'TELEGRAM_INVITE_LINK',
      flags['invite-link'],
      'קישור הזמנה לערוץ (TELEGRAM_INVITE_LINK):',
      'מוצג בתפריט DM בכפתור "הצטרף לערוץ"'
    );
    if (inviteLink) vars.TELEGRAM_INVITE_LINK = inviteLink;
  }

  if (doFull) {
    console.log('\n  -- ניתוב נושאים (לקבוצות פורום בלבד) --');
    const topicKeys = [
      ['TELEGRAM_TOPIC_ID_SECURITY',     '🔴 Thread ID לביטחוני (טילים, כלי טיס, מחבלים):'],
      ['TELEGRAM_TOPIC_ID_NATURE',       '🌍 Thread ID לאסונות טבע:'],
      ['TELEGRAM_TOPIC_ID_ENVIRONMENTAL','☢️ Thread ID לסביבתי:'],
      ['TELEGRAM_TOPIC_ID_DRILLS',       '🔵 Thread ID לתרגילים:'],
      ['TELEGRAM_TOPIC_ID_GENERAL',      '📢 Thread ID להודעות כלליות:'],
    ];
    for (const [key, label] of topicKeys) {
      const val = await promptOptional(rl, key, undefined, label, 'דלג אם אינך משתמש בקבוצת פורום');
      if (val) vars[key] = val;
    }
  }

  rl.close();

  // ── Write .env ───────────────────────────────────────────────────────────

  writeEnvFile(vars, outputPath);
  console.log(`\n  ✅  קובץ .env נוצר: ${outputPath}\n`);

  // ── Run mode ─────────────────────────────────────────────────────────────

  const rl2 = createRL();
  console.log('  ── איך תרצה להריץ את הבוט? ────────────────────────────────\n');
  console.log('  1) Docker  (מומלץ — תמונה מוכנה, ללא התקנה נוספת)');
  console.log('  2) Node.js (מקור — דורש git clone + npm install)');
  const choice = await ask(rl2, '\n  בחר (1/2): ');
  rl2.close();

  if (choice.trim() === '2') {
    printNodeInstructions();
  } else {
    printDockerCommand(outputPath);
  }

  console.log('  🚀  בהצלחה!\n');
}

main().catch(err => {
  console.error('\n  ❌ שגיאה:', err.message);
  process.exit(1);
});
