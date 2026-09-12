/* Reference instrumentation appended to digger.c. */
#include "refstate.h"
void ref_get_digger(struct ref_state *s)
{
  int n = dgstate.curplayer, i;
  struct digger *d = &digdat[n];
  s->lives[0] = digdat[0].lives;
  s->lives[1] = digdat[1].lives;
  s->dig.x = d->dob.x; s->dig.y = d->dob.y; s->dig.dir = d->dob.dir;
  s->dig.mdir = d->mdir; s->dig.alive = d->dob.alive;
  s->dig.deathstage = d->deathstage; s->dig.deathtime = d->deathtime;
  s->dig.deathani = d->deathani; s->dig.bagtime = d->bagtime;
  s->dig.rechargetime = d->rechargetime; s->dig.notfiring = d->notfiring;
  s->dig.emn = d->emn; s->dig.emocttime = d->emocttime; s->dig.msc = d->msc;
  s->dig.canfire = d->dob.can_fire;
  s->dig.fx = d->bob.x; s->dig.fy = d->bob.y; s->dig.fdir = d->bob.dir;
  s->dig.fexp = d->bob.expsn;
  s->bonusvisible = bonusvisible; s->bonusmode = bonusmode;
  s->bonustimeleft = bonustimeleft; s->startbonustimeleft = startbonustimeleft;
  for (i = 0; i < MSIZE; i++) s->em[i] = (emfield[i] & (1 << dgstate.curplayer)) ? 1 : 0;
}
