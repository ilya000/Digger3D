#!/bin/sh
# Regenerates the test fixtures: runs every input script in tests/core/scenarios
# through the instrumented reference and stores its per-time-point trace in
# tests/core/fixtures/<name>.trace.gz.
#
#   tools/reference/gen-fixtures.sh [name ...]
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT="$HERE/../.."
BIN="$HERE/build/digger-ref"
TITLE="$HERE/data/title_cga.bin"
SCEN="$ROOT/tests/core/scenarios"
FIX="$ROOT/tests/core/fixtures"

[ -x "$BIN" ] || "$HERE/build.sh"
[ -f "$TITLE" ] || (cd "$ROOT" && node src/assets/gen-standin.mjs)
mkdir -p "$FIX"

if [ $# -gt 0 ]; then
  LIST=""
  for n in "$@"; do LIST="$LIST $SCEN/$n.txt"; done
else
  LIST=$(ls "$SCEN"/*.txt)
fi

for s in $LIST; do
  name=$(basename "$s" .txt)
  drf=$(sed -n 's/^# *drf *//p' "$s")
  if [ -n "$drf" ]; then
    set -- --drf "$ROOT/$drf"
  else
    set --
  fi
  "$BIN" --script "$s" --out "$FIX/$name.trace" --title "$TITLE" "$@" || true # a recording that runs out makes the reference exit 1
  gzip -9 -f "$FIX/$name.trace"
  echo "$name: $(gzip -dc "$FIX/$name.trace.gz" | wc -l) lines"
done
