/* Headless platform layer for the instrumented Digger Remastered reference.
 *
 * Replaces sdl_vid.c / sdl_kbd.c / sdl_timer.c / sdl_snd.c / ini.c:
 *   - a CGA 320x200x2bpp framebuffer driver (the SDL build only has VGA),
 *   - a scripted keyboard (held keys + buffered key-down events),
 *   - gethrt(): no real waiting; each call is a "time point" (see harness.c)
 *     and advances a deterministic sound clock (44100 Hz sample counter,
 *     soundint() every 606 samples, like newsnd.c's getsample()), so the
 *     sound acks the game waits for (level-done jingle, dirge) arrive after a
 *     fixed number of frames,
 *   - INI access returns defaults, no files are touched.
 */
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdatomic.h>

#include "def.h"
#include "hardware.h"
#include "input.h"
#include "sound.h"
#include "alpha.h"
#include "game.h"

void harness_timepoint(int mult);
void harness_log_token(const char *tok);

/* ------------------------------------------------------------------ CGA */

extern const uint8_t *cgatable[];
extern const uint8_t * const ascii2cga[];

uint8_t ref_fb[200][320];
int ref_pal = 0, ref_inten = 0;
uint8_t ref_title[64000];

void cgainit(void) { memset(ref_fb, 0, sizeof(ref_fb)); }
void cgaclear(void) { memset(ref_fb, 0, sizeof(ref_fb)); }
void cgapal(int16_t pal) { ref_pal = pal; }
void cgainten(int16_t inten) { ref_inten = inten; }

static int inside(int x, int y) { return x >= 0 && x < 320 && y >= 0 && y < 200; }

void cgaputi(int16_t x, int16_t y, uint8_t *p, int16_t w, int16_t h)
{
  int r, c, pw = w * 4;
  for (r = 0; r < h; r++)
    for (c = 0; c < pw; c++)
      if (inside(x + c, y + r))
        ref_fb[y + r][x + c] = p[r * pw + c];
}

void cgageti(int16_t x, int16_t y, uint8_t *p, int16_t w, int16_t h)
{
  int r, c, pw = w * 4;
  for (r = 0; r < h; r++)
    for (c = 0; c < pw; c++)
      p[r * pw + c] = inside(x + c, y + r) ? ref_fb[y + r][x + c] : 0;
}

void cgaputim(int16_t x, int16_t y, int16_t ch, int16_t w, int16_t h)
{
  const uint8_t *data = cgatable[ch * 2], *mask = cgatable[ch * 2 + 1];
  int r, b, k;
  for (r = 0; r < h; r++)
    for (b = 0; b < w; b++) {
      uint8_t d = data[r * w + b], m = mask[r * w + b];
      for (k = 0; k < 4; k++) {
        int sh = 6 - 2 * k, px = x + b * 4 + k, py = y + r;
        if (inside(px, py))
          ref_fb[py][px] = (ref_fb[py][px] & ((m >> sh) & 3)) | ((d >> sh) & 3);
      }
    }
}

int16_t cgagetpix(int16_t x, int16_t y)
{
  int xb;
  if (x < 0 || y < 0 || x > 319 || y > 199)
    return 0xff;
  xb = x & ~3;
  return (ref_fb[y][xb] << 6) | (ref_fb[y][xb + 1] << 4) | (ref_fb[y][xb + 2] << 2) |
    ref_fb[y][xb + 3];
}

void cgawrite(int16_t x, int16_t y, int16_t ch, int16_t c)
{
  const uint8_t *g;
  int r, b, k;
  uint8_t cm = (uint8_t)((c & 3) * 0x55);
  if (!isvalchar(ch))
    return;
  g = ascii2cga[ch - 32];
  for (r = 0; r < 12; r++)
    for (b = 0; b < 3; b++) {
      uint8_t v = g[r * 3 + b] & cm;
      for (k = 0; k < 4; k++)
        if (inside(x + b * 4 + k, y + r))
          ref_fb[y + r][x + b * 4 + k] = (v >> (6 - 2 * k)) & 3;
    }
}

void cgatitle(void) { memcpy(ref_fb, ref_title, sizeof(ref_fb)); }

void graphicsoff(void) {}
void gretrace(void) {}
void doscreenupdate(bool wait_for_present) { (void)wait_for_present; }
void switchmode(void) {}
void sdl_enable_fullscreen(void) {}

/* VGA entry points are still referenced by main.c's option parsing. */
void vgainit(void) {}
void vgaclear(void) {}
void vgapal(int16_t pal) { (void)pal; }
void vgainten(int16_t inten) { (void)inten; }
void vgaputi(int16_t x, int16_t y, uint8_t *p, int16_t w, int16_t h) {}
void vgageti(int16_t x, int16_t y, uint8_t *p, int16_t w, int16_t h) {}
void vgaputim(int16_t x, int16_t y, int16_t ch, int16_t w, int16_t h) {}
int16_t vgagetpix(int16_t x, int16_t y) { return 0; }
void vgawrite(int16_t x, int16_t y, int16_t ch, int16_t c) {}
void vgatitle(void) {}

/* ------------------------------------------------------------------ keyboard */

/* SDL scancodes, as in sdl_kbd.c. */
int keycodes[NKEYS][5] = {
  {79, -2, -2, -2, -2}, {82, -2, -2, -2, -2}, {80, -2, -2, -2, -2},
  {81, -2, -2, -2, -2}, {58, -2, -2, -2, -2},
  {22, -2, -2, -2, -2}, {26, -2, -2, -2, -2}, {4, -2, -2, -2, -2},
  {29, -2, -2, -2, -2}, {43, -2, -2, -2, -2},
  {23, -2, -2, -2, -2}, {87, -2, -2, -2, -2}, {86, -2, -2, -2, -2},
  {64, -2, -2, -2, -2}, {66, -2, -2, -2, -2}, {67, -2, -2, -2, -2},
  {44, -2, -2, -2, -2}, {17, -2, -2, -2, -2}, {65, -2, -2, -2, -2}};

static bool held[512];
static int16_t kb_sc[64], kb_sym[64];
static int kb_len = 0;

void ref_key_down(int sc, int sym)
{
  held[sc] = true;
  if (kb_len < 64) {
    kb_sc[kb_len] = (int16_t)sc;
    kb_sym[kb_len] = (int16_t)sym;
    kb_len++;
  }
}

void ref_key_up(int sc) { held[sc] = false; }

void ref_key_tap(int sc, int sym)
{
  if (kb_len < 64) {
    kb_sc[kb_len] = (int16_t)sc;
    kb_sym[kb_len] = (int16_t)sym;
    kb_len++;
  }
}

bool kbd_async_key_state(int key) { return key >= 0 && key < 512 && held[key]; }
void initkeyb(void) {}
void restorekeyb(void) {}
bool kbhit(void) { return kb_len > 0; }

int16_t getkey(bool scancode)
{
  int16_t r;
  while (!kbhit())
    gethrt(true, 1);
  r = scancode ? kb_sc[0] : kb_sym[0];
  kb_len--;
  memmove(kb_sc, kb_sc + 1, kb_len * sizeof(kb_sc[0]));
  memmove(kb_sym, kb_sym + 1, kb_len * sizeof(kb_sym[0]));
  return r;
}

/* ------------------------------------------------------------------ timer + sound clock */

_Atomic bool wave_device_available = true;
static uint64_t snd_step = 0;
static bool snd_device_running = false;
#define SND_INTMOD 606 /* round(44100 / 72.8), newsnd.c */

void inittimer(void) {}
int32_t getkips(void) { return 1; }
void olddelay(int16_t t) { (void)t; }

void gethrt(bool minsleep, int mult)
{
  uint32_t n, i;
  (void)minsleep;
  harness_timepoint(mult);
  if (snd_device_running) {
    n = (uint32_t)((uint64_t)dgstate.ftime * 441 / 10000 / (uint32_t)mult);
    for (i = 0; i < n; i++) {
      if ((snd_step + 1) % SND_INTMOD == 0)
        soundint();
      snd_step++;
    }
  }
}

bool setsounddevice(uint16_t samprate, uint16_t bufsize) { (void)samprate; (void)bufsize; return true; }
bool initsounddevice(void) { snd_device_running = true; harness_log_token("ki"); return true; }
void pausesounddevice(bool p)
{
  snd_device_running = !p;
  harness_log_token(p ? "ko" : "ki");
}
void wakesounddevice(void) {}

void s0soundoff(void) {}
void s0setspkrt2(void) {}
void s0settimer0(uint16_t t0v) { (void)t0v; }
void s0timer0(uint16_t t0v) { (void)t0v; }
void s0settimer2(uint16_t t2v, bool mode) { (void)t2v; (void)mode; }
void s0timer2(uint16_t t2v, bool mode) { (void)t2v; (void)mode; }
void s0soundkillglob(void) {}
void s0soundinitglob(void) {}

/* ------------------------------------------------------------------ INI: defaults only */

void WriteINIString(const char *section, const char *key, const char *value, const char *filename) {}
void GetINIString(const char *section, const char *key, const char *def, char *dest, int destsize,
                  char *filename)
{
  strncpy(dest, def, destsize - 1);
  dest[destsize - 1] = 0;
}
int32_t GetINIInt(const char *section, const char *key, int32_t def, const char *filename) { return def; }
void WriteINIInt(const char *section, const char *key, int32_t value, const char *filename) {}
bool GetINIBool(const char *section, const char *key, bool def, const char *filename) { return def; }
void WriteINIBool(char *section, const char *key, bool value, const char *filename) {}

/* ------------------------------------------------------------------ netsim friends (unused) */

size_t netsim_friend_count(void) { return 0; }
size_t netsim_friend_selected(void) { return 0; }
bool netsim_friend_get(size_t index, char *namebuf, size_t namebuf_len, unsigned int *gp) { return false; }
void netsim_friend_move(int delta) {}
void netsim_friends_save(void) {}
