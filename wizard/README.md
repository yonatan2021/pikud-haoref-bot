# pikud-haoref-bot — Setup Wizard

Interactive CLI wizard for setting up [IDF Home Front Command Alert Bot](https://github.com/yonatan2021/pikud-haoref-bot).

## Quick Start

```bash
npx @haoref-boti/pikud-haoref-bot
```

No installation required. The wizard guides you through creating a `.env` file and optionally cloning the bot repository.

## Requirements

- Node.js >= 22
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- A Telegram chat ID (channel or group)
- A [Mapbox](https://mapbox.com) access token (free tier available)

## Modes

| Mode | Command |
|------|---------|
| Setup (first run) | `npx @haoref-boti/pikud-haoref-bot` |
| Update existing `.env` | `npx @haoref-boti/pikud-haoref-bot --update` |
| Verify tokens | `npx @haoref-boti/pikud-haoref-bot --verify` |

## Flags

| Flag | Description |
|------|-------------|
| `--token <val>` | Telegram bot token |
| `--chat-id <val>` | Telegram chat ID |
| `--mapbox <val>` | Mapbox access token |
| `--whatsapp` | Enable WhatsApp support |
| `--profile <name>` | Config profile: `minimal` / `recommended` / `full` |
| `--full` | Shorthand for `--profile=full` |
| `--output <path>` | Output path for `.env` (default: `./.env`) |
| `--install-dir <path>` | Clone directory (default: `~/pikud-haoref-bot`) |
| `--dashboard <val>` | Enable dashboard with this secret |
| `--proxy <val>` | Proxy URL (required outside Israel) |
| `--invite-link <val>` | Telegram invite link |
| `--update` | Update existing `.env` |
| `--verify` | Check token validity |
| `--help` | Show help |

## Examples

```bash
# Telegram only, minimal prompts
npx @haoref-boti/pikud-haoref-bot --token=xxx --chat-id=-123456 --mapbox=pk.yyy

# Full config with WhatsApp
npx @haoref-boti/pikud-haoref-bot --whatsapp --profile=full

# Verify tokens in existing .env
npx @haoref-boti/pikud-haoref-bot --verify

# Update existing configuration
npx @haoref-boti/pikud-haoref-bot --update
```

## License

Apache 2.0 — see [LICENSE](https://github.com/yonatan2021/pikud-haoref-bot/blob/main/LICENSE) in the main repository.
