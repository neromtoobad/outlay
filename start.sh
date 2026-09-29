#!/usr/bin/env bash
# Railway entrypoint: the API on :8790 (reached only through Next's /api rewrite) and Next on $PORT.
# If either process exits, the container exits and Railway restarts it.
trap 'kill $(jobs -p) 2>/dev/null; exit 0' TERM INT
(cd /app/server && PORT=8790 exec node src/api.ts) &
(cd /app/web && exec node_modules/.bin/next start -p "${PORT:-3000}") &
wait -n
exit 1
