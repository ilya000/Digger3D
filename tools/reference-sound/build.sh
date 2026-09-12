#!/bin/sh
# Builds the reference sound harness from vendor/digger + our stubs, runs every
# scenario in scenarios/ and regenerates the vitest fixtures in tests/sound/fixtures.
#
#   tools/reference-sound/build.sh            build + run + fixtures
#   tools/reference-sound/build.sh --no-fix   build + run only (PCM in build/out)
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
VD="$ROOT/vendor/digger"
B="$HERE/build"
mkdir -p "$B/out"

SDLINC=/opt/homebrew/include/SDL2
CFLAGS="-std=gnu11 -O1 -g -Wall -Wno-unused-function -D_SDL -D_SDL_SOUND -I$VD -I$SDLINC"

clang $CFLAGS -o "$B/harness" \
  "$HERE/harness.c" "$HERE/stubs.c" \
  "$VD/sound.c" "$VD/sound_backend.c" "$VD/newsnd.c" "$VD/soundgen.c" \
  "$VD/digger_math.c" -lm

for s in "$HERE"/scenarios/*.txt; do
  n=$(basename "$s" .txt)
  "$B/harness" "$s" "$B/out/$n"
done
echo "reference PCM written to $B/out"

if [ "${1:-}" != "--no-fix" ]; then
  node "$HERE/make-fixtures.mjs" "$HERE/scenarios" "$B/out" "$ROOT/tests/sound/fixtures"
fi
