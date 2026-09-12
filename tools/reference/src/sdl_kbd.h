/* Shim replacing vendor sdl_kbd.h: the headless reference has no SDL. */
#ifndef __SDL_KBD_H
#define __SDL_KBD_H
#include <stdbool.h>
bool kbd_async_key_state(int);
#endif
