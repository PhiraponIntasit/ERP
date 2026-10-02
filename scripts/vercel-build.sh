#!/bin/sh
# Vercel build: migrate the database only on production deploys, so previews never change it.
set -e
npx prisma generate
if [ "$VERCEL_ENV" = "production" ]; then
  # Migrations need a direct (non-pooled) connection.
  DATABASE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" npx prisma migrate deploy
fi
npx next build
