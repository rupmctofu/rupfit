# Telegram notification for the Rupfit link

The owner runs this himself: the agent is blocked from reading `Bot-telegram/.env`
by the harness safety policy, and no script may route around that guard.

## Prerequisite (once)

`C:\Users\rober\Bot-telegram` with `telegram_notify` installed editable and its
`.env` holding `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. The package entry point
for a one-way notification is `telegram_notify.send(message)`, which reads the
credentials itself.

## Send the link when the app is published

Run from the bot folder so the `.env` is found:

```bash
cd C:/Users/rober/Bot-telegram
python -c "from telegram_notify import send; send('Rupfit listo: https://rupmctofu.github.io/rupfit/ — añádela a la pantalla de inicio en Safari')"
```

## Why not automated

There is no process of the agent alive between turns, and the credentials are
guarded. The owner runs the one line above, or asks for the Telegram integration as
a separate, explicitly authorised task.
