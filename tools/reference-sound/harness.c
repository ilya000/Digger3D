/*
 * Reference sound harness: runs a scripted sequence of sound commands
 * through the Digger Remastered sound code (vendor/digger, SDL backend with
 * the s1 PC-speaker emulator, as the game configures it by default) and
 * dumps the PCM that the SDL audio callback would produce.
 *
 *   harness <script.txt> <outprefix>
 *
 * Script lines (blank lines and '#' comments ignored):
 *   rate <hz>                     sample rate (default 44100)
 *   seconds <s>                   length to render (default 10)
 *   <tick> start <name> [arg]     SoundEvent {kind:"start"}
 *   <tick> stop <name> [arg]      SoundEvent {kind:"stop"}
 *   <tick> music main|bonus|dirge|off
 *   <tick> enable sound|music 0|1
 * <tick> is the index of the sound interrupt (72.8 Hz) before which the
 * command is posted; names are the SoundName values of src/sound/names.ts.
 *
 * Output:
 *   <outprefix>.raw.s16   int16 LE, getsample() (NO_SND_FILTER build)
 *   <outprefix>.flt.s16   int16 LE, after the SDL backend's HP/LP filter
 *   <outprefix>.acks.txt  "<what> <tick>" when levelDone / dirge completed
 */
#include <assert.h>
#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "def.h"
#include "sound.h"
#include "sound_int.h"
#include "newsnd.h"
#include "digger_math.h"

struct cmd {
  long tick;
  char kind[16];
  char name[32];
  int arg;
};

static struct cmd *cmds;
static int ncmds, capcmds;

/* outstanding acknowledgements, in allocation order */
struct pending { uint16_t id; char what[16]; };
static struct pending pend[16];
static int npend;

static void
add_pending(uint16_t id, const char *what)
{
  if (id == 0)
    return;
  assert(npend < 16);
  pend[npend].id = id;
  snprintf(pend[npend].what, sizeof(pend[npend].what), "%s", what);
  npend++;
}

static void
post(const struct cmd *c)
{
  const char *n = c->name;
  bool start = strcmp(c->kind, "start") == 0;

  if (strcmp(c->kind, "music") == 0) {
    if (strcmp(n, "main") == 0)
      music(MUSIC_MAIN, 1.0);
    else if (strcmp(n, "bonus") == 0)
      music(MUSIC_BONUS, 1.0);
    else if (strcmp(n, "dirge") == 0)
      add_pending(musicwithack(MUSIC_DIRGE, 1.0), "dirge");
    else if (strcmp(n, "off") == 0)
      musicoff();
    else
      goto bad;
    return;
  }
  if (strcmp(c->kind, "enable") == 0) {
    if (strcmp(n, "sound") == 0) {
      if (soundflag != (c->arg != 0))
        togglesound();
    } else if (strcmp(n, "music") == 0) {
      if (musicflag != (c->arg != 0))
        togglemusic();
    } else
      goto bad;
    return;
  }
  if (!start && strcmp(c->kind, "stop") != 0)
    goto bad;

  if (strcmp(n, "all") == 0 && !start)
    soundstop();
  else if (strcmp(n, "emerald") == 0 && start)
    soundem();
  else if (strcmp(n, "emeraldStreak") == 0 && start)
    soundemerald(c->arg);
  else if (strcmp(n, "eatMonster") == 0 && start)
    soundeatm();
  else if (strcmp(n, "fire") == 0)
    start ? soundfire(c->arg) : soundfireoff(c->arg);
  else if (strcmp(n, "explode") == 0 && start)
    soundexplode(c->arg);
  else if (strcmp(n, "gold") == 0 && start)
    soundgold();
  else if (strcmp(n, "bagWobble") == 0)
    start ? soundwobble() : soundwobbleoff();
  else if (strcmp(n, "bagFall") == 0)
    start ? soundfall() : soundfalloff();
  else if (strcmp(n, "bagBreak") == 0 && start)
    soundbreak();
  else if (strcmp(n, "diggerDeath") == 0 && start)
    soundddie();
  else if (strcmp(n, "oneUp") == 0 && start)
    sound1up();
  else if (strcmp(n, "bonus") == 0)
    start ? soundbonus() : soundbonusoff();
  else if (strcmp(n, "pause") == 0)
    start ? soundpause() : soundpauseoff();
  else if (strcmp(n, "levelDone") == 0) {
    if (start) {
      /* soundlevdone() without its blocking wait loop */
      soundstop();
      if (sound_backend_local_sound_available()) {
        uint16_t id = sound_ack_alloc();
        sound_queue_push_done(SOUND_CMD_LEVDONE_START, 0, 0.0, id);
        add_pending(id, "levelDone");
      }
    } else
      sound_queue_post(SOUND_CMD_LEVDONE_OFF, 0, 0.0);
  } else
    goto bad;
  return;
bad:
  fprintf(stderr, "bad command: %ld %s %s %d\n", c->tick, c->kind, c->name, c->arg);
  exit(2);
}

static void
poll_acks(FILE *af, long tick)
{
  while (npend > 0 && sound_ack_poll(pend[0].id)) {
    fprintf(af, "%s %ld\n", pend[0].what, tick);
    if (strcmp(pend[0].what, "levelDone") == 0)
      sound_queue_push_done(SOUND_CMD_LEVDONE_OFF, 0, 0.0, 0);
    memmove(&pend[0], &pend[1], (size_t)(npend - 1) * sizeof(pend[0]));
    npend--;
  }
}

static FILE *
xopen(const char *prefix, const char *suffix, const char *mode)
{
  char path[1024];
  FILE *f;

  snprintf(path, sizeof(path), "%s%s", prefix, suffix);
  f = fopen(path, mode);
  if (f == NULL) {
    perror(path);
    exit(1);
  }
  return f;
}

static void
put16(FILE *f, int v)
{
  uint8_t b[2] = { (uint8_t)(v & 0xff), (uint8_t)((v >> 8) & 0xff) };
  fwrite(b, 1, 2, f);
}

int
main(int argc, char **argv)
{
  FILE *sf, *rf, *ff, *af;
  char line[256];
  double seconds = 10.0;
  int rate = 44100, ci = 0;
  long nsamples, i, intmod;
  struct bqd_filter *lp, *hp;

  if (argc != 3) {
    fprintf(stderr, "usage: %s script.txt outprefix\n", argv[0]);
    return 2;
  }
  sf = fopen(argv[1], "r");
  if (sf == NULL) {
    perror(argv[1]);
    return 1;
  }
  while (fgets(line, sizeof(line), sf) != NULL) {
    char *p = strchr(line, '#');
    struct cmd c;
    int n;

    if (p != NULL)
      *p = '\0';
    memset(&c, 0, sizeof(c));
    if (sscanf(line, " rate %d", &rate) == 1 || sscanf(line, " seconds %lf", &seconds) == 1)
      continue;
    n = sscanf(line, " %ld %15s %31s %d", &c.tick, c.kind, c.name, &c.arg);
    if (n < 3)
      continue;
    if (ncmds == capcmds) {
      capcmds = capcmds ? capcmds * 2 : 64;
      cmds = realloc(cmds, (size_t)capcmds * sizeof(*cmds));
    }
    cmds[ncmds++] = c;
  }
  fclose(sf);

  /* what main.c does for the default SDL build */
  soundflag = true;
  musicflag = true;
  soundpreinit();
  volume = 1;
  setupsound = s1setupsound;
  killsound = s1killsound;
  soundoff = s1soundoff;
  setspkrt2 = s1setspkrt2;
  timer0 = s1timer0;
  timer2 = s1timer2;
  soundinitglob(DEFAULT_BUFFER, (uint16_t)rate);
  initsound();

  lp = bqd_lp_init(rate, 4000);
  hp = bqd_hp_init(rate, 1000);
  intmod = lround(rate / 72.8);

  rf = xopen(argv[2], ".raw.s16", "wb");
  ff = xopen(argv[2], ".flt.s16", "wb");
  af = xopen(argv[2], ".acks.txt", "w");
  nsamples = (long)llround(seconds * rate);
  for (i = 0; i < nsamples; i++) {
    bool is_tick = (i + 1) % intmod == 0;
    long tick = (i + 1) / intmod - 1;
    int16_t s;
    double x, out;

    if (is_tick)
      while (ci < ncmds && cmds[ci].tick <= tick)
        post(&cmds[ci++]);
    s = getsample();          /* runs soundint() first when is_tick */
    if (is_tick)
      poll_acks(af, tick);
    put16(rf, s);
    /* sdl_snd.c fill_audio() without NO_SND_FILTER */
    x = bqd_apply(hp, ((double)s - 127.0) * 128.0);
    out = round(bqd_apply(lp, x));
    if (out > INT16_MAX)
      out = INT16_MAX;
    else if (out < INT16_MIN)
      out = INT16_MIN;
    put16(ff, (int)out);
  }
  fclose(rf);
  fclose(ff);
  fclose(af);
  return 0;
}
