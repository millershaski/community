#!/bin/sh
# Mounted volumes are owned by root, so fix ownership, then drop privileges.
set -e
data_dir="$(dirname "$DB_PATH")"
mkdir -p "$data_dir"
chown -R node:node "$data_dir"
exec setpriv --reuid=node --regid=node --init-groups "$@"
