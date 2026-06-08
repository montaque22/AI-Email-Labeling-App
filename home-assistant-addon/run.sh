#!/usr/bin/env sh
set -eu

CONFIG_PATH="/data/options.json"

read_option() {
  node -e "const fs=require('fs'); const config=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); const value=config[process.argv[2]]; if (value !== undefined && value !== null && value !== '') process.stdout.write(String(value));" "$CONFIG_PATH" "$1"
}

export APP_URL="$(read_option app_url || true)"
export BETTER_AUTH_URL="$(read_option better_auth_url || true)"
export BETTER_AUTH_SECRET="$(read_option better_auth_secret || true)"
export DATABASE_URL="$(read_option database_url || true)"
export GOOGLE_CLIENT_ID="$(read_option google_client_id || true)"
export GOOGLE_CLIENT_SECRET="$(read_option google_client_secret || true)"
export GOOGLE_EMAIL_CLIENT_ID="$(read_option google_email_client_id || true)"
export GOOGLE_EMAIL_CLIENT_SECRET="$(read_option google_email_client_secret || true)"
export YAHOO_CLIENT_ID="$(read_option yahoo_client_id || true)"
export YAHOO_CLIENT_SECRET="$(read_option yahoo_client_secret || true)"
export EMAIL_ACCOUNT_TOKEN_SECRET="$(read_option email_account_token_secret || true)"
export NODE_ENV="$(read_option node_env || true)"
export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-3000}"

exec npm run start
