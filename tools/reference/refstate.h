/* State snapshot taken from the instrumented reference at every time point. */
#ifndef REFSTATE_H
#define REFSTATE_H
#include <stdint.h>

struct ref_digger {
  int x, y, dir, mdir, alive, deathstage, deathtime, deathani, bagtime,
      rechargetime, notfiring, emn, emocttime, msc, canfire;
  int fx, fy, fdir, fexp;
};

struct ref_monster {
  int flag, x, y, dir, pdir, nob, alive, hnt, t, stime, death;
};

struct ref_bag {
  int exist, x, y, dir, wobbling, wt, gt, fallh, unfallen;
};

struct ref_state {
  int ingame, curplayer, nplayers, level[2], lives[2];
  int32_t score[2];
  uint32_t randv;
  struct ref_digger dig;
  int bonusvisible, bonusmode, bonustimeleft, startbonustimeleft;
  int nextmonster, totalmonsters, nextmontime, unbonusflag;
  struct ref_monster mon[6];
  int pushcount, goldtime;
  struct ref_bag bag[7];
  uint16_t field[150];
  uint8_t em[150];
};

void ref_get_main(struct ref_state *s);
void ref_get_digger(struct ref_state *s);
void ref_get_monsters(struct ref_state *s);
void ref_get_bags(struct ref_state *s);
void ref_get_scores(struct ref_state *s);

extern int ref_ingame;
#endif
