#!/usr/bin/env bash
# Снимок схемы в каноническом виде — для db/schema.sql и для проверки дрейфа.
#
# Канонический значит: без версии pg_dump, без \restrict-обёрток и без
# журнала миграций. Всё это меняется от запуска к запуску и делает diff
# бесполезным.
#
# pg_dump берётся из PATH. Если его на машине нет (обычная ситуация на
# ноутбуке без установленного postgresql-client), переопределите команду:
#
#   PGDUMP="docker compose exec -T db pg_dump" scripts/schema-dump.sh
#
# Использование:
#   DATABASE_URL=... scripts/schema-dump.sh > db/schema.sql
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL не задан}"
PGDUMP="${PGDUMP:-pg_dump}"

# shellcheck disable=SC2086
$PGDUMP --schema-only --no-owner --no-privileges --no-comments \
        --exclude-table=pgmigrations \
        "$DATABASE_URL" \
  | grep -v -e '^\\restrict' \
            -e '^\\unrestrict' \
            -e '^-- Dumped from' \
            -e '^-- Dumped by' \
  | cat -s
