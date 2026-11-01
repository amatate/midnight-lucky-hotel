# Hotel UI atlas · production prompts

Built-in image generation was used, not the API/CLI fallback. The existing installed-parts sheet was supplied as a style reference. The second pass only extracts the background; neither pass contains live labels, prices, unlock state or reward counts.

## Initial generation

```text
Use case: stylized-concept.
Asset type: production-ready 2D transparent UI icon atlas for Midnight Lucky Hotel, a mobile-first Art Deco slot-machine game. This is NOT a UI mockup or poster.

Image 1 is a STYLE REFERENCE ONLY: existing game equipment icons, brass / deep forest-green enamel / ivory, tactile painterly objects. Generate a NEW sheet with different subjects below. Do not copy its original objects or arrangement.

CANVAS / ATLAS CONTRACT:
Landscape 1536 x 1024, EXACTLY 6 equal columns and 4 equal rows, each cell 256 x 256. Exactly 24 separate icons, ONE in each cell, row-major order. Each object centered inside its own cell, filling roughly 70–78% of the cell, with at least 24px completely transparent gutter on all sides. No object crosses its cell. Uniform visual scale, softly lit upper-left, front-facing or very slight three-quarter view. Actual alpha transparency around every object and between cells. No sheet background, grid lines, square tiles, scenery around objects, captions, letters, numerals, logos, watermarks, or interface text.

ART DIRECTION:
Elegant restrained 1930s retro-futurist hotel souvenirs and mechanical tools. Pale brushed brass highlights (not orange gold), deep jade enamel, cream paper, occasional muted burgundy. Tactile engraved edges and painterly volume, simple strong silhouettes readable at 32–64px. Coordinate with the reference; less glossy, fewer tiny ornamental details. Not flat vector glyphs, not emoji, not cartoony neon, not jewel-covered fantasy loot. For routes, use small brass/enamel medallions. For keepsakes, make the actual tangible object (ticket, key, postcard, stamp).

EXACT GRID CONTENT, left to right:
Row 1:
1 small wooden citrus crate holding two yellow lemons;
2 compact brass cherry pitter with one burgundy cherry;
3 ivory enamel reel-token with a seven-shaped brass lucky motif (single symbol only, no other lettering);
4 small deep-green brass offering box with coin slot and one coin;
5 small dark enamel machine plate with a single visible jagged crack;
6 vintage brass pruning shears, handles and blades clearly recognizable.
Row 2:
1 two slightly offset sheets of cream carbon-copy paper held by a brass clip, no writing;
2 small vintage brass mechanical calculator with a few clear keys, no lettering;
3 closed forest-green hotel ledger with brass spine and cream page edges;
4 compact retro desk terminal with green glass screen, dark housing and brass details, no screen text;
5 FRUIT route medallion: cherries and a lemon inside a slim round brass rim;
6 CHAPEL route medallion: one ivory candle with a small flame inside a slim round brass rim.
Row 3:
1 WORKSHOP route medallion: crossed small wrench and screwdriver inside a slim brass rim;
2 FAULT route medallion: a dark gear with a lightning-shaped crack inside a slim brass rim;
3 ACCOUNTING route medallion: an abacus inside a slim brass rim;
4 FIRST NIGHT keepsake: a crescent-moon brass-and-jade seal medallion;
5 LEDGER TAB keepsake: elongated brass book tab with an engraved receipt-line motif, no writing;
6 TWO CABINETS keepsake: two overlapping ivory admission-ticket stubs with miniature embossed reel silhouettes, no writing.
Row 4:
1 WORKSHOP keepsake: a square red-wax stamp with a brass wrench seal;
2 REEL CLUB keepsake: a cream commemorative card containing four tiny embossed cabinet silhouettes in a row, no writing;
3 COLLECTION keepsake: an antique brass hotel room key with a deep-green diamond fob, no writing;
4 GARDEN keepsake: an ivory postcard with a miniature framed moonlit green garden illustration, no writing;
5 PENTHOUSE keepsake: an ivory postcard with a miniature framed nocturnal Art Deco skyline illustration, no writing;
6 ALL ROOMS keepsake: a pale brass sunburst hotel medallion with a jade center and a small crescent emblem.

Keep all 24 cells occupied, all objects isolated and centered, no missing cells. Rendering quality must support small real game UI, not just a pretty contact sheet.
```

## Transparent cutout refinement

```text
Use case: background-extraction.
Image 1 is the EDIT TARGET, a 1536 x 1024 game icon atlas arranged in EXACTLY 6 columns by 4 rows.
Change ONLY the background: remove ALL brown, beige, yellow-green, red and other blurred backdrop colors and the shadows spilling into the background. Make the entire surrounding background and every gap between the 24 icons truly transparent (alpha = 0), not a painted checkerboard, not white, not black, not colored.
Keep all 24 icons exactly in place, same size, same grid, same artwork, colors, details, edge antialiasing, and canvas dimensions. Preserve the cream paper inside the ticket/card objects, green enamel inside medallions, and glass of the terminal; those are parts of the objects, not background. Only remove the out-of-object backdrop.
Do not redesign or reposition anything. No new labels, frames, drop shadows, or objects. This is a precision cutout asset for use over different solid game UI colors, so no backdrop or color halo can remain around the icons. Preserve internal holes as transparent. Transparent PNG output.
```
