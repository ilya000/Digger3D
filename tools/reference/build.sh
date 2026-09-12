#!/bin/sh
# Builds the instrumented, headless Digger Remastered reference (the test oracle).
#
#   tools/reference/build.sh          -> tools/reference/build/digger-ref
#
# 1. copies the needed game sources from vendor/digger into tools/reference/src
#    (vendor/digger itself is never modified),
# 2. applies the minimal instrumentation described below,
# 3. compiles them together with our headless platform layer (platform.c: CGA
#    framebuffer, scripted keyboard, deterministic sound clock) and the state
#    dumper (harness.c). No SDL is needed.
#
# Instrumentation applied to the copies:
#   main.c    main() -> digger_main(); game() -> game_inner() (wrapped to flag
#             "in game"); tail include with state accessors
#   sprite.c  the draw API points at the CGA driver instead of VGA
#   digger.c, monster.c, bags.c, scores.c: tail include with state accessors
#   sdl_kbd.h replaced by a shim without SDL
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
VENDOR="$HERE/../../vendor/digger"
SRC="$HERE/src"
OUT="$HERE/build"

rm -rf "$SRC"
mkdir -p "$SRC" "$OUT"

CFILES="main.c digger.c drawing.c sprite.c scores.c record.c sound.c sound_backend.c
newsnd.c soundgen.c input.c monster.c bags.c alpha.c cgagrafx.c game.c digger_obj.c
monster_obj.c bullet_obj.c title_anim.c keyboard.c spinlock.c digger_log.c fbsd_sup.c
netsim_stubs.c netsim_debug.c"

for f in $CFILES; do cp "$VENDOR/$f" "$SRC/$f"; done
cp "$VENDOR"/*.h "$SRC/"
cp "$HERE/shim/sdl_kbd.h" "$HERE/shim/netsim_friends.h" "$SRC/"

# --- instrumentation -------------------------------------------------------
perl -0pi -e 's/^int main\(int argc,char \*argv\[\]\)$/int digger_main(int argc,char *argv[])/m or die "main"' "$SRC/main.c"
perl -0pi -e 's/^void game\(void\)$/void game_inner(void)/m or die "game"' "$SRC/main.c"
perl -0pi -e 's/= &vga/= &cga/g; s/static const struct digger_draw_api dda_static/static struct digger_draw_api dda_static/' "$SRC/sprite.c"
# log every sound command the game issues (sound.c)
perl -0pi -e 's/(#include "spinlock.h"\n)/$1void ref_log_sound(int type, int argi, unsigned ack);\n/ or die "snd1"' "$SRC/sound.c"
perl -0pi -e 's/(  uint16_t done_ack_id\)\n\{\n  struct sound_cmd_queue \*qp;\n)/$1\n  ref_log_sound(type, argi, done_ack_id);\n/ or die "snd2"' "$SRC/sound.c"
for m in main digger monster bags scores; do
  printf '\n#include "../tails/%s.inc"\n' "$m" >> "$SRC/$m.c"
done

# --- compile ---------------------------------------------------------------
# NDEBUG: when a recording is replayed, the dirge's sound acknowledgement is
# never collected, and sound.c's assert on the ack queue would fire at the next
# level-done jingle (upstream CI never notices: its dummy audio has no acks).
# Without the assert the queue simply pops its head, which the core models.
CC=${CC:-clang}
CFLAGS="-O2 -g -std=gnu11 -w -DNDEBUG -D_SDL -D_SDL_SOUND -DDIGGER_DISABLE_SDL_X11_WINDOW -I$SRC -I$HERE"
# shellcheck disable=SC2086
$CC $CFLAGS -o "$OUT/digger-ref" $(for f in $CFILES; do printf '%s ' "$SRC/$f"; done) \
  "$HERE/platform.c" "$HERE/harness.c" -lm
echo "built $OUT/digger-ref"
