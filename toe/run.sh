#!/bin/sh
set -eu
mkdir -p /data/toe
chown -R node:node /data/toe
chmod 700 /data/toe
exec su-exec node node /app/server.mjs
