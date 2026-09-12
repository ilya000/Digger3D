/*
 * Stubs that let the reference sound code of vendor/digger (sound.c,
 * sound_backend.c, newsnd.c, soundgen.c, digger_math.c) link on its own,
 * without the game, SDL video/audio or threads.  Single-threaded: the harness
 * pulls samples itself, exactly like the SDL audio callback would.
 */
#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

#include "def.h"
#include "game.h"

/* --- game state the sound code peeks at ------------------------------- */
struct gamestate dgstate;
bool escape = false;
bool firepflag, fire2pflag;

/* MUSIC_MAIN maps to the Remastered-only "battle" tune when lives == 1;
   report plenty of lives so MUSIC_MAIN is always the original main tune. */
int getlives(int pl) { (void)pl; return 3; }
int netsim_local_player(void) { return 0; }
void checkkeyb(void) {}
bool freezeframe(bool local_freeze, bool *remote_freeze)
{
  (void)local_freeze;
  if (remote_freeze != NULL)
    *remote_freeze = false;
  return true;
}

/* --- timer / device --------------------------------------------------- */
void inittimer(void) {}
void gethrt(bool minsleep, int mult) { (void)minsleep; (void)mult; }
int32_t getkips(void) { return 1; }

_Atomic bool wave_device_available = true;
bool setsounddevice(uint16_t samprate, uint16_t bufsize)
{
  (void)samprate; (void)bufsize;
  return true;
}
bool initsounddevice(void) { return true; }
void pausesounddevice(bool p) { (void)p; }
void wakesounddevice(void) {}

/* default (s0 = no hardware) backend, replaced by the s1 emulator */
void s0soundoff(void) {}
void s0setspkrt2(void) {}
void s0settimer0(uint16_t t0v) { (void)t0v; }
void s0timer0(uint16_t t0v) { (void)t0v; }
void s0settimer2(uint16_t t2v, bool mode) { (void)t2v; (void)mode; }
void s0timer2(uint16_t t2v, bool mode) { (void)t2v; (void)mode; }
void s0soundinitglob(void) {}
void s0soundkillglob(void) {}

/* --- logging ------------------------------------------------------------ */
FILE *digger_log;
void digger_log_printf(const char *fmt, ...)
{
  va_list ap;
  va_start(ap, fmt);
  vfprintf(stderr, fmt, ap);
  va_end(ap);
}
void digger_log_vprintf(const char *fmt, va_list ap) { vfprintf(stderr, fmt, ap); }

/* --- spinlock: single threaded, so a dummy object is enough ------------ */
struct spinlock { int dummy; };
struct spinlock *spinlock_ctor(void) { return calloc(1, sizeof(struct spinlock)); }
void spinlock_dtor(struct spinlock *sp) { free(sp); }
void spinlock_lock(struct spinlock *sp) { (void)sp; }
void spinlock_unlock(struct spinlock *sp) { (void)sp; }
