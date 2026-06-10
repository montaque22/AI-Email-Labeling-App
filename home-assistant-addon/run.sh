#!/usr/bin/env sh
set -eu

CONFIG_PATH="/data/options.json"
BETTER_AUTH_SECRET_FILE="/data/better_auth_secret"
BUNDLED_PGDATA="/data/postgres"
BUNDLED_PG_PASSWORD_FILE="/data/postgres_password"
BUNDLED_PG_READY_FILE="/data/postgres_ready"
BUNDLED_PG_LOG="/data/postgres.log"
BUNDLED_PG_USER="emailable"
BUNDLED_PG_DB="emailable"
BUNDLED_PG_PORT="5432"
USING_BUNDLED_POSTGRES="false"

read_option() {
  node -e "const fs=require('fs'); const config=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); const value=config[process.argv[2]]; if (value !== undefined && value !== null && value !== '') process.stdout.write(String(value));" "$CONFIG_PATH" "$1"
}

export APP_URL="$(read_option app_url || true)"
export BETTER_AUTH_URL="$(read_option better_auth_url || true)"
export BETTER_AUTH_SECRET="$(read_option better_auth_secret || true)"
export DATABASE_URL="$(read_option database_url || true)"
export GOOGLE_CLIENT_ID="$(read_option google_client_id || true)"
export GOOGLE_CLIENT_SECRET="$(read_option google_client_secret || true)"
export YAHOO_CLIENT_ID="$(read_option yahoo_client_id || true)"
export YAHOO_CLIENT_SECRET="$(read_option yahoo_client_secret || true)"
export NODE_ENV="$(read_option node_env || true)"
export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-3000}"

find_pg_bin() {
  find /usr/lib/postgresql -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1 | sed 's|$|/bin|'
}

generate_secret() {
  node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))"
}

configure_app_secrets() {
  if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
    if [ ! -f "$BETTER_AUTH_SECRET_FILE" ]; then
      generate_secret > "$BETTER_AUTH_SECRET_FILE"
      chmod 600 "$BETTER_AUTH_SECRET_FILE"
    fi

    export BETTER_AUTH_SECRET="$(cat "$BETTER_AUTH_SECRET_FILE")"
  fi

  export EMAIL_ACCOUNT_TOKEN_SECRET="$BETTER_AUTH_SECRET"
}

start_bundled_postgres() {
  if [ -n "${DATABASE_URL:-}" ]; then
    echo "Using configured external DATABASE_URL."
    return
  fi

  USING_BUNDLED_POSTGRES="true"
  PG_BIN="$(find_pg_bin)"

  if [ ! -x "$PG_BIN/initdb" ] || [ ! -x "$PG_BIN/pg_ctl" ]; then
    echo "Bundled Postgres binaries were not found." >&2
    exit 1
  fi

  mkdir -p "$BUNDLED_PGDATA"

  if [ ! -f "$BUNDLED_PG_PASSWORD_FILE" ]; then
    generate_secret > "$BUNDLED_PG_PASSWORD_FILE"
    chmod 600 "$BUNDLED_PG_PASSWORD_FILE"
  fi

  chown -R postgres:postgres "$BUNDLED_PGDATA" "$BUNDLED_PG_PASSWORD_FILE"
  touch "$BUNDLED_PG_LOG"
  chown postgres:postgres "$BUNDLED_PG_LOG"

  if [ ! -s "$BUNDLED_PGDATA/PG_VERSION" ]; then
    echo "Initializing bundled Postgres database in $BUNDLED_PGDATA."
    PASSWORD_COPY="/tmp/emailable-postgres-password"
    cp "$BUNDLED_PG_PASSWORD_FILE" "$PASSWORD_COPY"
    chown postgres:postgres "$PASSWORD_COPY"
    chmod 600 "$PASSWORD_COPY"

    runuser -u postgres -- "$PG_BIN/initdb" \
      -D "$BUNDLED_PGDATA" \
      --username="$BUNDLED_PG_USER" \
      --pwfile="$PASSWORD_COPY" \
      --auth-local=trust \
      --auth-host=scram-sha-256

    rm -f "$PASSWORD_COPY"
    {
      echo "listen_addresses = '127.0.0.1'"
      echo "port = $BUNDLED_PG_PORT"
    } >> "$BUNDLED_PGDATA/postgresql.conf"
  fi

  echo "Starting bundled Postgres."
  runuser -u postgres -- "$PG_BIN/pg_ctl" \
    -D "$BUNDLED_PGDATA" \
    -l "$BUNDLED_PG_LOG" \
    -o "-c listen_addresses=127.0.0.1 -c port=$BUNDLED_PG_PORT" \
    -w start

  if [ ! -f "$BUNDLED_PG_READY_FILE" ]; then
    runuser -u postgres -- "$PG_BIN/createdb" -U "$BUNDLED_PG_USER" "$BUNDLED_PG_DB" 2>/dev/null || true
    touch "$BUNDLED_PG_READY_FILE"
  fi

  DB_PASSWORD="$(cat "$BUNDLED_PG_PASSWORD_FILE")"
  export DATABASE_URL="postgres://$BUNDLED_PG_USER:$DB_PASSWORD@127.0.0.1:$BUNDLED_PG_PORT/$BUNDLED_PG_DB"
}

stop_bundled_postgres() {
  if [ "$USING_BUNDLED_POSTGRES" = "true" ]; then
    PG_BIN="$(find_pg_bin)"
    if [ -x "$PG_BIN/pg_ctl" ] && [ -s "$BUNDLED_PGDATA/PG_VERSION" ]; then
      runuser -u postgres -- "$PG_BIN/pg_ctl" -D "$BUNDLED_PGDATA" -m fast -w stop || true
    fi
  fi
}

run_bundled_database_migrations() {
  if [ "$USING_BUNDLED_POSTGRES" = "true" ]; then
    echo "Running Better Auth migrations for bundled Postgres."
    auth migrate --config server/auth.js --yes
  fi
}

trap stop_bundled_postgres EXIT INT TERM

configure_app_secrets
start_bundled_postgres
run_bundled_database_migrations

npm run start &
APP_PID="$!"
wait "$APP_PID"
