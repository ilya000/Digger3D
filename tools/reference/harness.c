/* Trace harness for the instrumented reference.
 *
 *   digger-ref --script S --out TRACE [--title title_cga.bin] [--drf FILE]
 *              [--fb t1,t2,...]
 *
 * Every call of gethrt() (the reference's only way of letting time pass) is a
 * "time point" t = 0, 1, 2, ... At each time point one line is written with the
 * state *before* the wait: palette, framebuffer hash, sound commands issued
 * since the previous time point and, while a game is running, the game state.
 * Then the input events scripted for t are applied. Our core produces the same
 * lines (tests/core/trace.ts) from the same script.
 *
 * Script lines:  "<t> down|up|tap <KeyboardEvent.code>"  and  "<t> end".
 */
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "def.h"
#include "game.h"
#include "sound_int.h"
#include "refstate.h"

int digger_main(int argc, char *argv[]);
void ref_key_down(int sc, int sym);
void ref_key_up(int sc);
void ref_key_tap(int sc, int sym);
extern uint8_t ref_fb[200][320];
extern int ref_pal, ref_inten;
extern uint8_t ref_title[64000];

struct keymap { const char *code; int sc; int sym; };
static const struct keymap keymap[] = {
  {"ArrowRight", 79, 0x4000004F}, {"ArrowLeft", 80, 0x40000050},
  {"ArrowDown", 81, 0x40000051}, {"ArrowUp", 82, 0x40000052},
  {"F1", 58, 0x4000003A}, {"F7", 64, 0x40000040}, {"F8", 65, 0x40000041},
  {"F9", 66, 0x40000042}, {"F10", 67, 0x40000043}, {"Space", 44, 32},
  {"Enter", 40, 13}, {"Escape", 41, 27}, {"Backspace", 42, 8}, {"Tab", 43, 9},
  {"Delete", 76, 127}, {"NumpadAdd", 87, 0x40000057},
  {"NumpadSubtract", 86, 0x40000056}, {NULL, 0, 0}};

static int lookup_key(const char *code, int *sym)
{
  const struct keymap *k;
  if (strncmp(code, "Key", 3) == 0 && code[3] >= 'A' && code[3] <= 'Z' && code[4] == 0) {
    *sym = 'a' + (code[3] - 'A');
    return 4 + (code[3] - 'A');
  }
  if (strncmp(code, "Digit", 5) == 0 && code[5] >= '0' && code[5] <= '9' && code[6] == 0) {
    *sym = code[5];
    return code[5] == '0' ? 39 : 30 + (code[5] - '1');
  }
  for (k = keymap; k->code != NULL; k++)
    if (strcmp(k->code, code) == 0) {
      *sym = k->sym;
      return k->sc;
    }
  fprintf(stderr, "unknown key code %s\n", code);
  exit(2);
}

struct event { uint32_t t; int op; int sc; int sym; };
static struct event *events;
static size_t nevents, evpos;
static uint32_t end_t = UINT32_MAX;
static uint32_t tp = 0;
static FILE *out;
static uint32_t *fbpoints;
static size_t nfbpoints;
static char sndbuf[4096];
static size_t sndlen;

static void load_script(const char *path)
{
  FILE *f = fopen(path, "r");
  char line[256], op[32], code[64];
  unsigned long t;
  size_t cap = 0;
  if (f == NULL) { perror(path); exit(2); }
  while (fgets(line, sizeof(line), f) != NULL) {
    int n;
    if (line[0] == '#' || line[0] == '\n')
      continue;
    if (strncmp(line, "fb ", 3) == 0) {
      char *p = line + 3;
      while (*p >= '0' && *p <= '9') {
        fbpoints = realloc(fbpoints, (nfbpoints + 1) * sizeof(*fbpoints));
        fbpoints[nfbpoints++] = (uint32_t)strtoul(p, &p, 10);
        if (*p == ',') p++;
      }
      continue;
    }
    n = sscanf(line, "%lu %31s %63s", &t, op, code);
    if (n >= 2 && strcmp(op, "end") == 0) { end_t = (uint32_t)t; continue; }
    if (n != 3) { fprintf(stderr, "bad script line: %s", line); exit(2); }
    if (nevents == cap) { cap = cap ? cap * 2 : 256; events = realloc(events, cap * sizeof(*events)); }
    events[nevents].t = (uint32_t)t;
    events[nevents].op = strcmp(op, "down") == 0 ? 0 : strcmp(op, "up") == 0 ? 1 :
                         strcmp(op, "tap") == 0 ? 2 : -1;
    if (events[nevents].op < 0) { fprintf(stderr, "bad op %s\n", op); exit(2); }
    events[nevents].sc = lookup_key(code, &events[nevents].sym);
    nevents++;
  }
  fclose(f);
}

static uint32_t fnv(uint32_t h, const uint8_t *p, size_t n)
{
  size_t i;
  for (i = 0; i < n; i++) { h ^= p[i]; h *= 0x01000193u; }
  return h;
}

void harness_log_token(const char *tok)
{
  size_t l = strlen(tok);
  if (sndlen + l + 2 >= sizeof(sndbuf)) return;
  if (sndlen > 0) sndbuf[sndlen++] = ',';
  memcpy(sndbuf + sndlen, tok, l);
  sndlen += l;
  sndbuf[sndlen] = 0;
}

void ref_log_sound(int type, int argi, unsigned ack)
{
  char tok[16];
  switch (type) {
    case SOUND_CMD_STOP: strcpy(tok, "st"); break;
    case SOUND_CMD_WAKEUP: return;
    case SOUND_CMD_LEVDONE_START: strcpy(tok, "ls"); break;
    case SOUND_CMD_LEVDONE_OFF: strcpy(tok, "lo"); break;
    case SOUND_CMD_FALL_ON: strcpy(tok, "f1"); break;
    case SOUND_CMD_FALL_OFF: strcpy(tok, "f0"); break;
    case SOUND_CMD_BREAK: strcpy(tok, "br"); break;
    case SOUND_CMD_WOBBLE_ON: strcpy(tok, "w1"); break;
    case SOUND_CMD_WOBBLE_OFF: strcpy(tok, "w0"); break;
    case SOUND_CMD_FIRE_ON: sprintf(tok, "fi%d", argi); break;
    case SOUND_CMD_FIRE_OFF: sprintf(tok, "fo%d", argi); break;
    case SOUND_CMD_EXPLODE: sprintf(tok, "ex%d", argi); break;
    case SOUND_CMD_BONUS_ON: strcpy(tok, "b1"); break;
    case SOUND_CMD_BONUS_OFF: strcpy(tok, "b0"); break;
    case SOUND_CMD_EM: strcpy(tok, "em"); break;
    case SOUND_CMD_EMERALD: sprintf(tok, "e%d", argi); break;
    case SOUND_CMD_GOLD: strcpy(tok, "go"); break;
    case SOUND_CMD_EATM: strcpy(tok, "ea"); break;
    case SOUND_CMD_DDIE: strcpy(tok, "dd"); break;
    case SOUND_CMD_1UP: strcpy(tok, "up"); break;
    /* tune 3 ("battle", a Remastered addition) is the main tune with one life */
    case SOUND_CMD_MUSIC: sprintf(tok, "m%d%s", argi == 3 ? 1 : argi, ack ? "a" : ""); break;
    case SOUND_CMD_MUSIC_OFF: strcpy(tok, "mo"); break;
    case SOUND_CMD_SOUND_TOGGLE: strcpy(tok, "ts"); break;
    case SOUND_CMD_MUSIC_TOGGLE: strcpy(tok, "tm"); break;
    case SOUND_CMD_PAUSE_ON: strcpy(tok, "p1"); break;
    case SOUND_CMD_PAUSE_OFF: strcpy(tok, "p0"); break;
    default: sprintf(tok, "?%d", type); break;
  }
  harness_log_token(tok);
}

static void write_line(int mult)
{
  struct ref_state s;
  uint32_t fbh = fnv(0x811c9dc5u, &ref_fb[0][0], sizeof(ref_fb));
  int i;
  memset(&s, 0, sizeof(s));
  fprintf(out, "%u %d %d%d %08x %s", tp, mult, ref_pal, ref_inten, fbh, sndlen ? sndbuf : "-");
  if (ref_ingame) {
    uint8_t fb16[300];
    ref_get_main(&s);
    ref_get_digger(&s);
    ref_get_monsters(&s);
    ref_get_bags(&s);
    ref_get_scores(&s);
    fprintf(out, " | c%d L%d,%d S%d,%d V%d,%d R%08x", s.curplayer, s.level[0], s.level[1],
            s.score[0], s.score[1], s.lives[0], s.lives[1], s.randv);
    fprintf(out, " D%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d", s.dig.x, s.dig.y, s.dig.dir,
            s.dig.mdir, s.dig.alive, s.dig.deathstage, s.dig.deathtime, s.dig.deathani,
            s.dig.bagtime, s.dig.rechargetime, s.dig.notfiring, s.dig.emn, s.dig.emocttime,
            s.dig.msc, s.dig.canfire);
    if (!s.dig.notfiring)
      fprintf(out, " F%d,%d,%d,%d", s.dig.fx, s.dig.fy, s.dig.fdir, s.dig.fexp);
    else
      fprintf(out, " F-");
    fprintf(out, " X%d,%d,%d,%d", s.bonusvisible, s.bonusmode, s.bonustimeleft, s.startbonustimeleft);
    fprintf(out, " M%d,%d,%d,%d m", s.nextmonster, s.totalmonsters, s.nextmontime, s.unbonusflag);
    for (i = 0; i < 6; i++) {
      struct ref_monster *m = &s.mon[i];
      if (i) fputc(';', out);
      if (!m->flag) { fputc('-', out); continue; }
      fprintf(out, "%d,%d,%d,%d,%d,%d,%d,%d,%d,%d", m->x, m->y, m->dir, m->pdir, m->nob,
              m->alive, m->hnt, m->t, m->stime, m->death);
    }
    fprintf(out, " G%d,%d b", s.pushcount, s.goldtime);
    for (i = 0; i < 7; i++) {
      struct ref_bag *b = &s.bag[i];
      if (i) fputc(';', out);
      if (!b->exist) { fputc('-', out); continue; }
      fprintf(out, "%d,%d,%d,%d,%d,%d,%d,%d", b->x, b->y, b->dir, b->wobbling, b->wt, b->gt,
              b->fallh, b->unfallen);
    }
    for (i = 0; i < 150; i++) { fb16[2 * i] = s.field[i] & 0xff; fb16[2 * i + 1] = s.field[i] >> 8; }
    fprintf(out, " H%08x E%08x", fnv(0x811c9dc5u, fb16, 300), fnv(0x811c9dc5u, s.em, 150));
  }
  fputc('\n', out);
}

static void dump_fb(void)
{
  int i;
  fprintf(out, "#fb %u ", tp);
  for (i = 0; i < 64000; i += 4) {
    const uint8_t *p = &ref_fb[0][0] + i;
    fprintf(out, "%02x", (p[0] << 6) | (p[1] << 4) | (p[2] << 2) | p[3]);
  }
  fputc('\n', out);
}

static void finish_trace(void)
{
  if (out != NULL) { fflush(out); fclose(out); out = NULL; }
}

void harness_timepoint(int mult)
{
  size_t i;
  if (tp >= end_t) {
    finish_trace();
    _exit(0);
  }
  write_line(mult);
  for (i = 0; i < nfbpoints; i++)
    if (fbpoints[i] == tp) dump_fb();
  sndlen = 0;
  sndbuf[0] = 0;
  while (evpos < nevents && events[evpos].t <= tp) {
    struct event *e = &events[evpos++];
    if (e->op == 0) ref_key_down(e->sc, e->sym);
    else if (e->op == 1) ref_key_up(e->sc);
    else ref_key_tap(e->sc, e->sym);
  }
  tp++;
}

int main(int argc, char **argv)
{
  const char *script = NULL, *outpath = NULL, *title = NULL, *drf = NULL;
  char tmpl[512], earg[600];
  char *dargv[3];
  int i, dargc = 1;
  for (i = 1; i < argc; i++) {
    if (strcmp(argv[i], "--script") == 0) script = argv[++i];
    else if (strcmp(argv[i], "--out") == 0) outpath = argv[++i];
    else if (strcmp(argv[i], "--title") == 0) title = argv[++i];
    else if (strcmp(argv[i], "--drf") == 0) drf = argv[++i];
    else if (strcmp(argv[i], "--fb") == 0) {
      char *p = argv[++i];
      while (*p) {
        fbpoints = realloc(fbpoints, (nfbpoints + 1) * sizeof(*fbpoints));
        fbpoints[nfbpoints++] = (uint32_t)strtoul(p, &p, 10);
        if (*p == ',') p++;
      }
    } else { fprintf(stderr, "unknown argument %s\n", argv[i]); return 2; }
  }
  if (script == NULL || outpath == NULL) {
    fprintf(stderr, "usage: digger-ref --script S --out TRACE [--title F] [--drf F] [--fb t,...]\n");
    return 2;
  }
  load_script(script);
  if (title != NULL) {
    FILE *f = fopen(title, "rb");
    if (f == NULL || fread(ref_title, 1, sizeof(ref_title), f) != sizeof(ref_title)) { perror(title); return 2; }
    fclose(f);
  }
  out = fopen(outpath, "w");
  if (out == NULL) { perror(outpath); return 2; }
  atexit(finish_trace);
  /* Keep the reference away from the user's real score / ini files. */
  snprintf(tmpl, sizeof(tmpl), "%s/digger-ref-XXXXXX", getenv("TMPDIR") ? getenv("TMPDIR") : "/tmp");
  if (mkdtemp(tmpl) == NULL) { perror("mkdtemp"); return 2; }
  setenv("HOME", tmpl, 1);
  dargv[0] = "digger";
  if (drf != NULL) {
    snprintf(earg, sizeof(earg), "/E:%s", drf);
    dargv[dargc++] = earg;
  }
  dargv[dargc] = NULL;
  return digger_main(dargc, dargv);
}
