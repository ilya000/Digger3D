/* Shim replacing vendor netsim_friends.h (which pulls in the SIP stack). */
#ifndef NETSIM_FRIENDS_H
#define NETSIM_FRIENDS_H
#include <stdbool.h>
#include <stddef.h>
void netsim_friends_save(void);
size_t netsim_friend_count(void);
size_t netsim_friend_selected(void);
bool netsim_friend_get(size_t index, char *namebuf, size_t namebuf_len,
  unsigned int *games_playedp);
void netsim_friend_move(int delta);
#endif
