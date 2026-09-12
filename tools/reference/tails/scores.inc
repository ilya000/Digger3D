/* Reference instrumentation appended to scores.c. */
#include "refstate.h"
void ref_get_scores(struct ref_state *s)
{
  s->score[0] = scdat[0].score;
  s->score[1] = scdat[1].score;
}
