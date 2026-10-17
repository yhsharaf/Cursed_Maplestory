# Cursed MapleStory

**Play it in your browser: https://yhsharaf.github.io/Cursed_Maplestory/**

A low-poly fan boss fight: a MapleStory beginner versus **Mano** the snail, in three phases — small Mano, big Mano,
and his haunted tombstone. Works on PC and on phones (touch controls, plays sideways).

## Controls

| PC | Phone | Action |
| --- | --- | --- |
| Arrows / WASD | Joystick (left side) | Move, aim, duck |
| Z / Space | JUMP | Jump (again in the air = parry) |
| X / J | SHOOT | Fire on / off |
| Shift / L | DASH | Dash |
| V / E | EX | Super shot (fills as you hit Mano) |
| C | | Lock in place to aim |
| M | ♪ | Mute |

You have 5 HP.

## Run it yourself

The game is plain HTML + JavaScript (three.js for the 3D, Web Audio for the synthesized sound). Serve the folder with any
static web server, for example:

```
python tools/serve.py
```

then open http://localhost:8765/. `PLAY.bat` does this on Windows; `PLAY_PHONE.bat` serves it to phones on your network.

## Credits

A non-commercial fan project, not affiliated with or endorsed by Nexon (MapleStory) or Studio MDHR (Cuphead). The fight's
patterns are modelled on Cuphead's "Ruse of an Ooze"; all models, graphics, music and sound effects here are original.
