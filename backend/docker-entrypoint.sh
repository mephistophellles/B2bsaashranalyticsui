#!/bin/sh
set -e
case "${RUN_MIGRATIONS_ON_START:-}" in
  1|true|TRUE|yes|YES)
    alembic upgrade head
    ;;
esac
exec "$@"
