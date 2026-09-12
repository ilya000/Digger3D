/* Reference instrumentation appended to bags.c. */
#include "refstate.h"
void ref_get_bags(struct ref_state *s)
{
  int i;
  s->pushcount = pushcount; s->goldtime = goldtime;
  for (i = 0; i < BAGS; i++) {
    struct ref_bag *r = &s->bag[i];
    r->exist = bagdat[i].exist;
    r->x = bagdat[i].x; r->y = bagdat[i].y; r->dir = bagdat[i].dir;
    r->wobbling = bagdat[i].wobbling; r->wt = bagdat[i].wt; r->gt = bagdat[i].gt;
    r->fallh = bagdat[i].fallh; r->unfallen = bagdat[i].unfallen;
  }
  for (i = 0; i < MSIZE; i++) s->field[i] = (uint16_t)field[i];
}
