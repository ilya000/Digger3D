/* Reference instrumentation appended to monster.c. */
#include "refstate.h"
void ref_get_monsters(struct ref_state *s)
{
  int i;
  struct obj_position pos;
  s->nextmonster = nextmonster; s->totalmonsters = totalmonsters;
  s->nextmontime = nextmontime; s->unbonusflag = unbonusflag;
  for (i = 0; i < MONSTERS; i++) {
    struct ref_monster *r = &s->mon[i];
    r->flag = mondat[i].flag;
    if (!r->flag || mondat[i].mop == NULL)
      continue;
    CALL_METHOD(mondat[i].mop, getpos, &pos);
    r->x = pos.x; r->y = pos.y; r->pdir = pos.dir; r->dir = mondat[i].dir;
    r->nob = CALL_METHOD(mondat[i].mop, isnobbin);
    r->alive = CALL_METHOD(mondat[i].mop, isalive);
    r->hnt = mondat[i].hnt; r->t = mondat[i].t; r->stime = mondat[i].stime;
    r->death = mondat[i].death;
  }
}
