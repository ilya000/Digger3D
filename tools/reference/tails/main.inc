/* Reference instrumentation appended to main.c (has access to its statics). */
#include "refstate.h"
int ref_ingame = 0;
void game(void)
{
  ref_ingame = 1;
  game_inner();
  ref_ingame = 0;
}
void ref_get_main(struct ref_state *s)
{
  s->ingame = ref_ingame;
  s->curplayer = dgstate.curplayer;
  s->nplayers = dgstate.nplayers;
  s->level[0] = gamedat[0].level;
  s->level[1] = dgstate.nplayers == 2 ? gamedat[1].level : -1;
  s->randv = (uint32_t)dgstate.randv;
}
