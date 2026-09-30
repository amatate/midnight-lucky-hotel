# Audio v1 — After Hours

16 original procedural effects plus a 48-second / 16-bar / 80 BPM music loop.
The music uses a restrained electric-piano-style voice, bass, brushed noise percussion
and a sparse bell melody. This is synthesized audio, not a live recording or a Suno
track. No third-party recordings or external generation services are used.

## Playing and mixing

- Front desk → Guide & settings, or in-game Menu → Audio settings.
- Separate music (default 28%) and effects (72%) sliders, plus master mute.
- Existing mute preference is honored. Values are local, separate from game saves.
- 16-effect audition selector for comparing sounds without spending game resources.
- First pointer/keyboard interaction unlocks Web Audio. Backgrounding stops voices
  and suspends the context; returning resumes the music at its previous position
  when the browser permits it. If blocked, touch again. iOS silent mode and device
  output still apply; real-device/headphone listening is a separate acceptance step.
- Maximum 8 simultaneous effect voices; recurring coin/part events are rate-limited.
  Music ducks during the big-win and room-clear cues. A compressor guards the mix.
- A failed/blocked audio API or music download does not prevent playing.

## Cue map

| Cue | Trigger |
| --- | --- |
| ui | Menu/button selection |
| lever | Pull-lever detent |
| spin | Accepted spin command |
| stop | Each actual visual reel reveal |
| reroll / hold / kick | Accepted corresponding intervention |
| prayer / meal | Accepted service action |
| part | Presented part activation / symbol conversion |
| coin / win | Presented payout / winning line |
| big-win | Final payout of the existing runaway feedback tier (not a new jackpot rule) |
| upgrade | Confirmed part/upgrade purchase |
| room-clear / run-end | Fresh room/run result, not loading an old result |

Engine events and RNG are unchanged. The presentation layer observes successful
commands and the existing settlement timeline; fast-forward does not replay a
backlog of noises. Routine bookkeeping remains silent.

## Assets and reproduction

`node scripts/render-audio.ts` writes `public/audio/*.wav` from the original score
in `src/presentation/audio-synthesis.ts`. Mono PCM, 22,050 Hz / 16 bit. Music tails
and reflections wrap around the loop boundary rather than fading to silence.
Effects use the same PCM synthesis lazily in the browser, avoiding first-hit
download latency; exported WAVs are editable/auditionable source assets.
Only the music asset needs PWA precaching. Total music size is about 2.1 MB.

Check `tests/app/audio.test.tsx` for signal bounds, seam, mappings, preference
validation and bilingual controls. Automated signal checks do not certify that
the mix feels right on every phone speaker; tune by listening at a modest level.
