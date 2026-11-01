# Which European language am I reading? Interactive chart: specification

Status: draft 5, 2026-10-31. Nothing is built yet. Draft 1 used the older January 2021 flowchart. Draft 2 moved to the metro-map version. Draft 3 added credits, hosting and the sample texts. Draft 4 moved the app under `/projects/` and added it to the projects catalog. Draft 5 adopts the danielpradilla game style.

## 1. Source chart

The app is built on "Which European language am I reading?" by Øystein H. Brekke ([@oysteib](https://x.com/oysteib)) and Max Fras ([@maxfras](https://x.com/maxfras)), the metro-map version [published on 21 February 2021](https://x.com/maxfras/status/1363473000918626307) and later reposted to r/coolguides. Brekke made the original flowchart and extended it to other alphabets; Fras then had a designer redraw it as this metro map (the designer is not named in the posts). The transcription uses the 4096×2896 original attached to [Max Fras's post](https://pbs.twimg.com/media/EuwG96KXUAM7JRq.jpg?name=orig).

Each circle (a "station" in this spec) asks whether the text contains certain letters. A light-blue line marked Y leaves for yes and a salmon line marked N leaves for no. Every route ends at a square flag with the language's own name under it. The start station `F G R` sends texts with any of those Latin letters left into the Latin network and everything else right into the Greek, Armenian, Georgian, Hebrew and Cyrillic network.

Related versions, used only for comparison:

| Version | Link | Relation to this spec |
|---|---|---|
| Latin-only flowchart by @oysteib, 2019 | [ebookfriendly.com](https://ebookfriendly.com/which-european-language-reading-flowchart/) | First version. Same Latin logic as the January 2021 chart. |
| Full flowchart by @oysteib, January 2021 | [imgur](https://imgur.com/what-european-language-am-i-reading-flow-chart-Dw0yg6S) | Draft 1 of this spec used it. Pink boxes, 94 languages. |
| Adaptation by u/mel_afefon, February 2021 | [r/languagelearning](https://www.reddit.com/r/languagelearning/comments/lmwsw7/what_european_language_am_i_reading_european/) | Reddit blocked automated access, so I could not open it. |
| Language phenotype tree by Eamonn O'Brien-Strain | [eamonn.org](https://eamonn.org/identifying-a-written-language) | Latin-only redraw of mel_afefon's version. It has the same Latin additions as the metro map (Romani, Occitan, North Frisian, Esperanto, Corsican) and agrees on the ä, ü, üü, õ branch. |

Compared with the January 2021 flowchart, the metro map adds 11 languages (two Romani spellings, Occitan, North Frisian, Esperanto, Corsican, Laz, Kabardian, Aghul, Tsakhur and Rutul) and splits Erzya and Moksha into two terminals, for 106 terminals in place of 94. It replaces "Europa?" and the script diamond with `F G R`, swaps the two Sorbian terminals (an error, see section 3.6), and changes several stations (`IJ` and `ij` became `ieuw` and `iuw`, `á é í`/`nh` became `j`, `τθ` became `τσχ`).

Transcription result: 106 stations and 106 terminals, all checked by script. Every station except `F G R` has exactly one parent. One terminal has two parents: both `ćh` and `chh` lead to the same Romani flag. Appendix A lists every station, Appendix B every terminal, and section 13 lists the readings that needed a judgment call.

The chart groups languages by the letters they use, not by family, and the flags mark countries, regions or peoples, not languages.

### 1.1 Credit in the app

Every screen has a footer line, and the About panel and `CREDITS.md` repeat it with the links:

> Based on "Which European language am I reading?" by Øystein H. Brekke (@oysteib) and Max Fras (@maxfras), 2021. Interactive version by Daniel Pradilla.

The About panel also credits the earlier versions in the table above, and `CREDITS.md` credits the flag sources, the font and the source of every sample text.

## 2. Goals and non-goals

Goals:

1. A game (Arcade). Built-in text snippets, a snake you steer through the chart, score, lives and a high-score table.
2. An explorable chart (Steer). You move the snake head through the whole chart with the arrow keys, swipes or taps and read what each station tests.
3. A detection tool. You paste text, type, or give a URL. The app follows the chart's rules exactly, draws the route and highlights the letters in the text that decided each turn.
4. Arcade is also the self-test: you steer the snake through a sample text and a wrong turn shows an error and highlights the character you missed.
5. A snake game drawn in the danielpradilla game style (1930s rubber-hose animation and comic print), on the chart's own metro layout with its square flags.
6. Works with a keyboard on desktop and with touch on a phone.

Non-goals:

- Statistical language identification. The app reports where the chart leads, even when that is wrong.
- Corrections to the chart. Known quirks stay (section 3.6).
- Languages that are not on the chart.
- Accounts, server-side storage, multiplayer, analytics beyond the Google Analytics page tag that every page under `/projects/` carries (section 12.3).
- A translated interface. The UI is in English; the chart labels stay in their own languages.
- The danielpradilla app style. This is a game, so it uses the danielpradilla game style instead (section 5.2), including for the compact site bar required by the projects catalog (section 12.3).

## 3. Rule engine

The engine is a pure module with no DOM access. Every mode uses it.

### 3.1 Chart data

`src/data/chart.json` holds the logic from Appendix A and B plus the drawing from the original image:

```json
{
  "root": "fgr",
  "stations": {
    "r_caron": { "test": ["ř"], "yes": "u_ring", "no": "L:hsb", "at": [5, 3] }
  },
  "edges": [
    { "from": "r_caron", "answer": true, "to": "u_ring", "path": [[5, 3], [5, 4]] }
  ],
  "leaves": {
    "hsb": { "label": "hornjoserbšćina", "english": "Upper Sorbian", "flag": "sorbian", "at": [6, 3] }
  }
}
```

A target starting with `L:` is a terminal. `test` lists sequences of one or more code points (`č`, `øy`, `ieuw`, `къа`, `з́`). `at` is the station's cell on the chart's grid. The metro map places stations on a regular grid of about 27 columns by 14 rows. `path` lists the corner cells of each orthogonal line, so long lines keep their original route (for example `å` Y running down the right side of the Latin network to `ŋ`). Recording `at` and `path` for every station and edge from the image is part of milestone 1.

### 3.2 Answer to a station

A station answers yes when the text contains at least one occurrence of at least one of its sequences. Otherwise it answers no. The engine records every occurrence as `{ start, end, seq }`, with UTF-16 offsets into the original string. The text is never rewritten, so offsets map straight onto the displayed text.

### 3.3 Matching rules

Matching is strict. Only these equivalences apply:

1. Case: case-insensitive everywhere (JavaScript `iu` regex flags). The metro map has no case-sensitive station.
2. Unicode normalisation: each sequence matches both its NFC and NFD forms, so a pasted `a` + U+0308 counts as `ä`.
3. Whole letters only: a match must not be followed by a combining mark (`(?!\p{M})`). Without this rule, `r` at the start station would match the base letter of a decomposed `ř`.
4. Variant table, the only folding in the app:

   | Chart sequence | Also matches |
   |---|---|
   | `c'h` | `c’h` (U+2019), `cʼh` (U+02BC) |
   | `l·l` | `l‧l` (U+2027), `ŀl` (U+0140) |
   | `ӏ` (U+04CF) inside any sequence (`ӏ`, `гӏ`, `лӏ`, `щӏ`, `шӏ`, `пӏ`, `аӏ`, `оӏ`) | `Ӏ` (U+04C0) in the same position |

Nothing else is folded. Turkish `ş` (cedilla) and Romanian `ș` (comma below) are different letters. Latin `ə` (U+0259) is not Cyrillic `ә` (U+04D9). Latin `i`, `j` are not Cyrillic `і`, `ј`. Latin `r` is not `ř`. Many Caucasian texts type the palochka as Latin `I`, `l` or digit `1`; those do not match. The station panel shows code points so players can see these differences.

### 3.4 Start station and empty text

`F G R` is an ordinary station: yes if the text contains `f`, `g` or `r`. All 106 stations use the same rule, so the engine has no special cases.

Text with no letters at all (empty, digits, punctuation) produces no route and the board stays idle. Text with no letter in the Latin, Greek, Cyrillic, Armenian, Georgian or Hebrew script (for example Japanese) still gets a route, which ends at Bulgarian, plus a notice: "This chart only covers European alphabets."

### 3.5 API

```ts
route(text): { steps: Step[], leaf: string | null }
  Step = { station: string, answer: boolean, hits: { start, end, seq }[] }
pathsTo(leaf): { station: string, answer: boolean }[][]  // one route per parent; two for rmy
diverge(steps, leaf): number                              // first step where the text and the leaf's route disagree
minimalText(leaf): string                                 // Y sequences on the route, plus "б" when the route starts with N
```

The longest route has 24 steps (`F G R` yes, then N down the whole Latin spine and bottom row to Sardinian). Each step is one regex scan, so `route` on 200 000 characters must finish in under 50 ms on a 2022 laptop.

### 3.6 Known quirks of the chart

The chart assumes a long, representative sample that contains every letter of the language and no loanwords. Short or unusual texts take odd routes, and the app shows them as they are. Routes computed with a Python prototype of the engine:

| Text | Ends at | Reason |
|---|---|---|
| Czech pangram "Příliš žluťoučký kůň úpěl ďábelské ódy." | Bulgarian | No `f`, `g` or `r` (`ř` is a different letter), so it starts down the non-Latin side and answers N to every station. |
| Czech sentence with `r`, `č`, `ě`, `ř` but no `ů` | Lower Sorbian | `ů` N. |
| Lower Sorbian text | Upper Sorbian | The metro map swapped the two Sorbian flags: `ř` N leads to Upper Sorbian and `ů` N to Lower Sorbian. Upper Sorbian uses `ř` and Lower Sorbian does not, so real Lower Sorbian text (`č`, `ě`, no `ř`) ends at Upper Sorbian, and Upper Sorbian text ends at Lower Sorbian unless it also has `ů`. The January 2021 flowchart had them the right way round. The app keeps the metro map's routing and says so on both language cards. |
| Portuguese sentence without `é` | Friulian | `ç` Y, `ş` N, `é` N, `ë` N. |
| Catalan sentence without `ç` | Sardinian | N at every Latin station after `F G R`. |
| Dutch sentence without `ieuw` | Sardinian | Same. |
| English "The façade of the theatre…" | Friulian | `ç` Y. |
| Russian sentence with "Google" in it | Sardinian | `g` sends it to the Latin side. |
| Russian pangram without `къа`, `ый` or `ър` | Erzya | `ы` Y, then N three times. |

Detect mode includes a "Why not…?" panel (section 6.2) that shows the letter that would have changed the route, so these cases can be explored.

## 4. Text sources

Detect and Arcade take text from one input panel (read-only in Arcade). Steer has no text.

### 4.1 Paste and typing

The panel is a `contenteditable="plaintext-only"` element with `white-space: pre-wrap`. Highlights use the CSS Custom Highlight API (`CSS.highlights`, `Range`), so the text DOM is never rewritten and the caret is not disturbed while typing. Engine offsets are mapped to DOM ranges with a `TreeWalker` over the panel's text nodes.

Input longer than 200 000 characters is truncated with a visible notice.

### 4.2 URL

If the trimmed panel content is a single `http:` or `https:` URL with no whitespace, the panel shows a "Fetch text from this URL" button (Enter also triggers it). Browsers block cross-origin fetches from a static page, so a small same-origin endpoint does the request:

`GET api/fetch.php?url=<encoded>` returns `{ html, finalUrl, contentType }` or `{ error }`.

The endpoint must:

- accept only `http` and `https` on ports 80 and 443;
- resolve the host and reject loopback, private, link-local, CGNAT, multicast and reserved IPv4 and IPv6 addresses, re-checking after each of at most 3 redirects;
- time out after 10 s and stop reading after 3 MB;
- accept only `text/html` and `text/plain`;
- send no cookies and no credentials;
- allow requests from the app's own origin only (`https://www.danielpradilla.info` and `https://danielpradilla.info`).

The browser extracts text from the returned HTML with `DOMParser`. It removes `script`, `style`, `noscript`, `template`, `nav`, `header`, `footer`, `aside` and `form`, uses `article` or `main` when present and the whole `body` otherwise, and joins block elements with line breaks. The page's `<html lang>` value is shown next to the result ("page declares `pt`"), so the player can compare the chart's answer with the page's own claim.

Fetch errors are shown in the panel and the previous text is kept.

### 4.3 Built-in samples

`data/samples.json` holds one snippet per language for Arcade and for the "Try a sample" button:

```json
[{ "lang": "ces", "text": "…", "source": "https://cs.wikipedia.org/w/index.php?oldid=…", "title": "…", "license": "CC BY-SA 4.0" }]
```

Each snippet is a verbatim run of whole sentences from a published page, normally 150 to 400 characters, and `route(text).leaf` must equal `lang`; a test enforces this. The app shows each snippet's source link under the text. A language with no snippet is left out of Arcade and stays in every other mode.

`data/samples.json` and `CREDITS.md` hold 97 snippets, one for each of 97 languages, each checked against the engine. Every snippet comes from a source whose reuse is allowed:

- 96 come from Wikipedia or Wikimedia Incubator (CC BY-SA 4.0, linked to the exact revision or page).
- Swiss Standard German comes from the Swiss Federal Constitution on fedlex.admin.ch, which is not protected by copyright (Swiss Copyright Act, art. 5).
- No snippet for nine languages: Ume Sami, Tsakonian, Svan, Montenegrin Cyrillic, Tabasaran, Abaza, Aghul, Tsakhur and Rutul. No openly licensed text was found that the chart routes to them: the required letters (`å` + `ŋ` + `ö đ ŧ`, `τσχ`, `ჷ` + `ჴ`, `з́`/`с́`, `уь`, `шӏ`, a real palochka) do not occur in the open texts available. Earlier drafts used quotations from pages without an open licence (Bible translations, a dictionary preface, church and agency pages); these were removed. The nine languages stay on the board and in every mode that does not need a sample.
- The Lower Sorbian snippet reaches Lower Sorbian only because it quotes a Czech place name with `ř` (section 3.6).

## 5. Board

### 5.1 Layout

The board reproduces the metro map's own layout from `at` and `path` in `chart.json`: the Latin network on the left, `F G R` at the top centre, the other alphabets on the right. Players who know the poster recognise it, and the arrow keys move the snake in the direction the lines actually go.

The snake moves on a finer grid of 4 sub-cells per station spacing, so a move between neighbouring stations takes 4 ticks and long lines take proportionally longer.

### 5.2 Rendering

The app follows the danielpradilla game style, published at [github.com/danielpradilla/danielpradilla-game-style](https://github.com/danielpradilla/danielpradilla-game-style): `GUIDE.md` for the rules, `index.html` for the rendered reference, `styles.css` for tokens and components. The app copies that `styles.css` unchanged into this repository as `game-style.css`, with the source commit in a comment on the first line (currently `daca20e`), so the deployed app does not depend on GitHub at runtime. The app's own rules live in `styles.css`. The app pastes the guide's `<svg class="ink-defs">` block once at the top of `<body>` and uses the guide's component classes as they appear in its `index.html`. Components the guide does not have yet (metro station, metro line, snake, text highlight, flag terminal) are added to the game-style repository's `index.html` first, as its implementation workflow requires, then the copy is refreshed and the comment updated to the new commit.

The board is SVG, one `<g>` per station and terminal and one `<path>` per edge, so stations can take keyboard focus and carry `aria-label`s.

- Board: a `.panel` with a `--line-heavy` ink frame on the warm `--paper` background, with the guide's paper grain and vignette. No dark background.
- Lines: the poster's two line colours stay, so players recognise it. Y lines use `--sky` (#9fd6e6, close to the poster's blue); N lines use one domain token, `--line-no: #ecc4b0`, the poster's salmon, used for nothing else. Both are drawn thick with an ink outline (`--line`), round joins and the printed Y and N labels, so colour is not the only signal. Lines not yet travelled are drawn at 40% opacity.
- Stations: `--card` circles with a `--line` ink outline through the `#ink-wobble` filter, with the test sequences in ink. The station the snake is on gets a `--line-heavy` outline.
- Terminals: the flag in its own colours inside a square ink frame (`--line-heavy`, hard `4px 4px 0` shadow), with the chart label underneath in Sansita 700.
- Snake: the player character, so it uses `--pink`, the colour the guide reserves for characters. Rounded segments with an ink outline and a halftone shade on the lower right (light from the top left). The rubber-hose head has eyes that face the direction of travel and squashes and stretches by up to 10% on turns.
- Growth, the same in every mode, like the classic snake game: the tail stays where it is while the head moves, so the snake keeps growing by exactly the distance it travels, and eating letters at a Y station adds two more segments. The body covers the whole way back to `F G R` (cap: 400 segments). Steer: going back along a line retracts the body over that line. Detect: when live typing reruns the route from a later step, the body is restored along the earlier steps. Arcade keeps the length between rounds and still loses 3 segments per wrong turn.
- Route highlighting: each colour keeps the one meaning the guide gives it.
  - Letters that answered Y get the marigold highlighter (`.swipe`) in the text panel, and their station gets a marigold ring.
  - The board, the route list and the text show the same step-number badge (Recursive 900), which links them.
  - The hovered or focused step is marked in `--cobalt` (selected).
  - Errors use `--red` with text (`.note-error`).
  - Reaching a terminal plays a `--teal` "Found!" burst.
- Decorative boil (`.boil`) only on bursts and on the reward icon in toasts. Stations, lines, the text panel and the HUD do not boil.

### 5.3 Movement and camera

The snake moves one sub-cell per tick (25 ms by default, faster at higher Arcade levels). At a station it stops and waits for a choice (Steer, Arcade) or continues on its own (Detect playback).

The camera follows the head with easing. `O` or the overview button fits the whole chart on screen. Zoom with pinch, Ctrl + wheel, the scroll wheel once the board has focus (click or tab into it; the page scrolls normally otherwise), or `+` and `-`. A minimap in the corner shows the head's position on the whole chart.

### 5.4 Flags

Flags are local SVG files in `assets/flags/`, mostly from Wikimedia Commons, with sources and licences in `CREDITS.md`. Two terminals use composites, drawn the way the chart draws them: the Bosnian/Croatian/Serbian/Montenegrin terminal is a 2×2 tile, and Nogai is three regional flags. Yiddish shows the chai symbol (חי) instead of a flag, as on the chart. Appendix B lists the flag for each terminal.

### 5.5 Fonts

The game style's three families, all SIL OFL from Google Fonts:

- Sansita Swashed 900: title cards (game over, round results).
- Sansita: headings, menus, language names.
- Recursive: body text, buttons, labels and every number (scores, timers, counters, code points).

These cover Latin only. Google Fonts serves Recursive with a `cyrillic-ext` subset but not basic Cyrillic. Station letters, chart labels and the text panel need Greek, Cyrillic, Armenian, Georgian and Hebrew, so they use Noto Sans with Noto Sans Armenian, Noto Sans Georgian and Noto Sans Hebrew (all SIL OFL), loaded from Google Fonts with `unicode-range` so a browser downloads only the scripts on screen.

Station letters use Noto Sans Bold in every script, including Latin, so that all 106 stations look alike. Before shipping, check that Noto renders every glyph on the chart, including Georgian `ჴ`, `ჷ`, `ჶ`, the palochka `ӏ`, and the combining acute in `з́` and `с́`.

## 6. Modes

A tab bar switches modes (keys `1` to `3`): Steer, Detect and Arcade. Every mode uses the same board.

### 6.1 Steer

Free exploration with no text box. The player moves the snake through the whole chart and the snake's `.dialogue` bubble tells what each station tests.

- The snake starts at `F G R` and stops at every station. An arrow key moves along the line that leaves the current station in that direction. Arrow keys follow the chart's geometry, so the player has to read the Y and N labels, as on the poster. The arrow pointing back along the line the snake came in on, or Backspace, goes back one station, and the snake shrinks.
- `Y` and `N` keys take the yes or no line whatever its direction. A swipe moves like an arrow key. Tapping a station connected to the head's station moves there.
- The on-screen pad sits over the board on every screen size. It has Y and N buttons that show an arrow for the direction each line leaves the current station, a question card ("Has č?") above them, and a Back button. Back is disabled at `F G R`. At a flag the Y and N buttons are hidden and Back stays.
- The bubble shows the station's sequences in large type with their code points, then the languages reachable on each line: "Y (left) leads to 3 languages: Czech, Lower Sorbian, Upper Sorbian." A list of more than 8 languages is cut to 8 and ends "and N more".
- Reaching a flag adds it to the collection (section 7.2), reveals it on the board and opens its language card (section 7.1). The bubble shows the language name, "New flag!" when the flag is new, and an "Open language card" button (also Enter). Going back from a flag keeps it in the collection.
- There is no hint, no score and no "next round".

### 6.2 Detect (paste, type or URL)

- When the text changes (paste, URL fetch, or typing with a 120 ms debounce), the engine routes it. The snake runs the route at 4× speed. Each line lights up in marigold, with its station's halo and step number, as the snake leaves the station, and stays lit, so the trail from `F G R` remains visible; lines off the route are dimmed. The snake grows as it goes (section 5.2). On arrival the destination flag keeps growing and shrinking (to 130%, 12 drawings a second) so it stands out on the full poster. With reduced motion the route appears at once and the flag does not pulse.
- The text panel puts the marigold highlighter on every hit of every Y step, with the step number on the first hit. Hovering or focusing a step in the route list, or its station on the board, scrolls to that step's first hit and outlines its hits in `--cobalt`.
- The route list shows one line per step: `ä  Y  ×14  first at line 3, col 12` or `ő ű  N`.
- Live typing: when an edit changes the route, the snake reruns from the first changed step, and the character that caused the change is outlined for 1.5 s with a note such as "You typed ř: the route moved to the Czech branch."
- While the player types, the route is provisional. The title reads "Heading to Bulgarian · keep typing" with a Finish button, and there is no "Found!" burst, fanfare or new flag. The route is confirmed when the player pauses for 2 s with at least 30 letters, presses Finish, or presses Enter on the board. With fewer than 30 letters a pause shows "Keep typing" and the letter count instead. Pasted, fetched and sample texts are confirmed as soon as the snake arrives. A confirmed route stays confirmed while further typing does not change it.
- "Why not…?": the player picks any language from a searchable list. The app runs `diverge` and reports the first step where the text and that language's route disagree: "Czech needs ů at step 7. Your text has none." or "Your text contains ä (line 2), and Czech's route needs N there."

### 6.3 Arcade

The text-based steering game, with samples, a clock and a score. The screens use the game style's game UI components.

- The player finds the route for a sample text by moving the snake. At each station the snake stops, and the player picks a line with the arrow keys, the `Y`/`N` keys, a swipe, a tap on the next station, or the on-screen Y and N buttons (no Back button).
- A correct choice moves the snake on and lengthens it (section 5.2). On a Y, the matching letters get the marigold highlighter and fly into the snake's head before it grows.
- A wrong choice: the head bumps into a wall (screen shake if enabled, red flash, buzz) and the error count goes up. The snake explains the mistake in its bubble, and the text panel (read-only in Arcade) shows the evidence:
  - The answer was Y and the player chose N: all occurrences are highlighted in red, the panel scrolls to the first one, and a callout points at it: "ä, character 87 (line 3, column 12)."
  - The answer was N and the player chose Y: the text has no character to highlight. The station's letters are struck through on the board and a banner says "None of ő ű appear in the text."
- After a wrong choice that line is blocked, and the player has to take the correct one before the snake moves on.
- `H` (hint) answers the current station for the player: it highlights the occurrences in the text, or shows "none found". It costs points.
- At the terminal: the language card, the error count, time taken, and a replay that shows the correct route next to the player's moves.

- A run is a series of rounds. Each round loads a random sample from `data/samples.json` that has not appeared in the current run.
- HUD (`.hud` with `.hud-chip`s, wrapping on narrow screens):
  - hearts for lives, with empty hearts keeping their outline;
  - score (Recursive 900, tabular figures);
  - streak multiplier;
  - level;
  - languages found this run as `n/106`;
  - a `.meter` for the station countdown, with the seconds printed beside it and a red fill below 25% (`.is-low`).
- Each station has a countdown: 8 s at level 1, minus 0.5 s per level, minimum 3 s. Running out counts as a wrong choice.
- Scoring: +10 for each correct choice, multiplied by `1 + floor(streak / 5)`; +50 for reaching the terminal; +2 per whole second left on the clock at each station; a hint costs 5.
- Lives: 3. A wrong choice costs one life and shows the same explanation as Steer. Every 5 rounds without an error gives back a life, to a maximum of 3.
- The snake keeps its length across rounds and loses 3 segments on each error, as a visible record of the run.
- The level goes up every 3 rounds, announced with a `.burst`; the snake moves faster and the countdown gets shorter.
- Game over at 0 lives. A Sansita Swashed title card shows score, rounds, accuracy and the languages found in the run, followed by a local top-10 leaderboard (ranked table in `.table-shell`, the player's row highlighted). Players enter 3-letter initials, arcade style, and the table is stored in `localStorage`.
- Space or Esc opens the pause menu (`.game-menu`): Resume, Options, Quit. Switching browser tabs pauses automatically.

## 7. Learning features

All of these are derived from the chart data, so there is no hand-written content to check beyond the English names in Appendix B.

### 7.1 Language card

Shown when the snake reaches a terminal, and from the collection:

- flag, chart label, English name, code (ISO 639-3, or BCP 47 for Swiss Standard German);
- route length;
- "Must contain": the Y sequences on its route (Appendix B, last column);
- "Must not contain": the N sequences on its route;
- the shortest text that reaches it (`minimalText`), with a button that loads it into Detect;
- the sample snippet with its source, when one exists.

### 7.2 Collection

A grid of all 106 flags as the game style's stage cards. A language not yet reached is `.is-locked` (hatched, labelled "Not found yet"). A language the snake has reached in any mode (Steer, Detect or Arcade) is `.is-cleared`, with the flag in colour and the date it was first reached. The language just found is `.is-current`. Each new flag also raises an achievement toast. Stored in `localStorage` with a reset button.

### 7.3 About panel

Shows the credit from section 1.1 with links to both authors and to the earlier versions, explains the strict rules in section 3.3, explains that the chart groups languages by letters rather than by family, notes that flags mark places and peoples rather than languages, and lists the quirks in section 3.6.

## 8. Controls

| Input | Steer | Detect | Arcade |
|---|---|---|---|
| Arrow keys, WASD, swipe | follow the line in that direction; back along the incoming line | (none) | choose the line in that direction |
| `Y`, `N` | take the Y or N line | (none) | answer Y or N |
| Backspace | back one station | (none) | (none) |
| Tap a connected station | move there | (none) | choose that line |
| Enter | open the language card at a flag | replay route | start run, next round |
| `H` | (none) | (none) | hint |
| Space | (none) | (none) | pause |
| `O` | overview | overview | overview |
| `M` | mute | mute | mute |
| `1` to `3` | switch mode | switch mode | switch mode |
| Esc | close panel | close panel | close panel, pause |

Board keys act only when the text panel does not have focus. On touch screens an on-screen pad with Y, N and Back buttons sits over the bottom corner of the board.

## 9. Screen layout

The first screen is Detect with an empty text box and the snake waiting at `F G R`. Nothing is routed until the player types, pastes, fetches a URL or presses "Try a sample". A sample that Arcade loaded on its own is not carried into Detect; text the player chose is. The old `#maze` address opens Steer.

- Desktop (≥ 900 px wide): the compact site bar (section 12.3). Below it, the project header with the h1 "Which European language am I reading?" (Sansita 900). Below that, the mode tabs as a `.segmented` control, with collection, options and about buttons. The board takes about 60% of the width on the left; the text panel and route list sit on the right.
- Phone: the compact site bar with its hamburger menu (drawn above the board and its tools), then a smaller project header, the mode tabs and smaller board tools. The board fills the space above the bottom sheet, and the on-screen pad sits over the board. The bottom sheet has three heights: collapsed to its handle (the board grows to fill the screen), peek (30% of the screen, the default) and open (88%). Tapping the handle cycles collapsed, peek, open; dragging it moves one step up or down. Touch targets on the board are at least 34 px and the pad stays at 60 px. There is no horizontal page scroll, and HUD chips wrap.

## 10. Sound and motion

- WebAudio square-wave tones, generated in code: a quiet tick per station passed, a rising three-note figure for a correct choice, a low buzz for an error, a short fanfare at a terminal. Audio starts only after the first user gesture. `M` mutes; the setting is saved.
- Decorative motion runs on twos, as the game style requires (`--frame: 83ms`, `steps()`): bursts, toast pop-in, hover lift, the menu pointer. Snake movement, the camera and input response run at the browser's frame rate.
- The options menu (in the pause menu, and from the header outside Arcade) has three toggles: sound, reduced motion, and screen shake. Reduced motion defaults to on when `prefers-reduced-motion: reduce` is set. With reduced motion, all decorative animation stops, the snake jumps from station to station, and letters do not fly. Screen shake can be turned off on its own.

## 11. Accessibility

- Every action has a keyboard path. Focus uses the game style's ring (3px dashed `--cobalt`, 4px offset) on the board, in panels and in menus.
- An `aria-live="polite"` region announces each step: "Station ä. Does the text contain ä? You chose Y. Correct." and "Wrong line. ä appears at line 3, column 12."
- Errors use a red flash, an optional shake, a crossed icon and an explanation in words, so colour is not the only signal. Route steps carry step numbers as well as the highlighter.
- Text uses the contrast pairs the game style lists as passing WCAG AA: ink on paper, card, marigold and teal; card on ink, cobalt and red.
- Stations have `aria-label`s with the letters and their code points, for example "č, U+010D", and say which directions the Y and N lines leave in.

## 12. Architecture

Static site, vanilla JavaScript ES modules, no framework, no build step, no JavaScript dependencies. Styles come from the danielpradilla game style's `styles.css`, and fonts load from Google Fonts (section 5.5). One PHP file for URL fetching.

```
index.html             includes the GA4 tag and the compact site bar (section 12.3)
game-style.css         unchanged copy of danielpradilla-game-style/styles.css
styles.css
src/
  main.js                entry point loaded by index.html; mode tabs, wiring
  data/chart.json        logic (Appendix A and B) plus station cells and line paths
  engine.js              route, pathsTo, diverge, minimalText
  board.js               SVG render, snake, camera, minimap
  text-panel.js          contenteditable, Highlight API, offset mapping
  url-text.js            calls api/fetch.php, HTML to text
  modes/steer.js         free exploration (Steer)
  modes/detect.js
  modes/rounds.js        text round engine used by Arcade
  modes/arcade.js
  audio.js
  storage.js             collection, settings, high scores
api/fetch.php
assets/flags/*.svg
data/samples.json
tests/engine.test.js
tests/chart.test.js
tests/samples.test.js
CREDITS.md
README.md              its opening sentence is reused on the projects catalog card
```

Browser baseline: current Chrome, Edge, Safari and Firefox. The CSS Custom Highlight API and `contenteditable="plaintext-only"` are required; there is no fallback.

Privacy: pasted and typed text stays in the browser. The only network request with user input is the URL sent to `api/fetch.php`, which logs nothing beyond the web server's default access log. The Google Analytics tag records page views and never receives the text or the fetched URL.

### 12.1 Tests

Run with `node --test`.

- Chart logic: one root, every station except the root has exactly one parent, no missing targets, 106 terminals, only `rmy` has two parents.
- Chart drawing: every edge's `path` starts at its station's `at` and ends at its target's `at`; no station has two edges leaving or arriving on the same side, so each arrow key has at most one meaning.
- Reachability: `route(minimalText(leaf)).leaf === leaf` for all 106 terminals and both routes to `rmy`. The Python prototype passes this against Appendix A.
- Matching: NFD input matches; `r` does not match a decomposed `ř`; `ş` does not match `ș`; Latin `i` does not match Cyrillic `і`; each variant in 3.3 matches, including `гӀ` written with U+04C0.
- Offsets: hits after astral characters (emoji) still point at the right UTF-16 range.
- Samples: every entry in `data/samples.json` routes to its `lang`.
- `fetch.php`: rejects `file:`, `ftp:`, `http://127.0.0.1`, `http://[::1]`, `http://169.254.169.254`, and a redirect to a private address.

### 12.2 Hosting

The app is published at `https://www.danielpradilla.info/projects/what-european-language-am-i-reading/`, inside the projects catalog next to the other projects (for example `projects/european-monarchies-timeline/`). The folder name matches the repository name.

- Remote directory: `~/danielpradilla.info/projects/what-european-language-am-i-reading/` on the DreamHost shared host. Writes stay inside that directory; the rest of `projects/` holds other applications and must not be touched.
- PHP 8.2 is available there, so `api/fetch.php` runs on the same origin and no extra service is needed.
- All asset and API paths in the app are relative, so it works under `/projects/what-european-language-am-i-reading/`. The two site-bar links (`/projects/` and `/blog/`) are root-relative.
- When a file under `src/`, `styles.css`, `game-style.css` or `data/` changes, bump the `?v=` query parameter where `index.html` loads it (`src/main.js` imports the other modules with the same parameter); earlier projects on this host served cached old assets after a deploy.
- Cloudflare sits in front of the site and caches static files for 31 days, including 404s and half-uploaded files. Never request the site while rsync is still running. If a file under the current `?v=` was fetched too early, bump the token in both HTML pages and redeploy them; the API token available here cannot purge the cache. This happened twice on the first deploy.
- Deploy with the DreamHost rsync script, without `--delete`. Only `index.html`, `europe.html`, `game-style.css`, `styles.css`, `src/`, `api/`, `assets/`, `data/` and `CREDITS.md` are uploaded; `tests/` and `SPEC.md` stay local. Directories are mode `755` and files `644`.
- After each deploy, check the page, a URL fetch, and `~/logs/danielpradilla.info/https/error.log`.

### 12.3 Projects catalog

The app is published as a project of the catalog at `https://www.danielpradilla.info/projects/`, whose source is `~/dev/danielpradilla-projects/projects/`. That catalog's `AGENTS.md` sets four conditions for listing a project, and the app meets each one.

1. Public repository. Publish this repository as `danielpradilla/what-european-language-am-i-reading` on GitHub (it does not exist yet) with a `README.md` whose first paragraph describes the app in one sentence, for example: "An interactive, snake-style version of the 'Which European language am I reading?' chart by Øystein H. Brekke and Max Fras: paste text, type, or give a URL and follow the letters to the language."
2. Compact site bar. The first row of `index.html` is the `.dp-navbar` described in `danielpradilla-app-style/GUIDE.md` ("Compact site-bar implementation requirements"), drawn in the game style as the game style's "Shell" rule requires. It has the `DANIEL PRADILLA` wordmark linking to `/projects/`, then `Blog` (`/blog/`) and `GitHub` (this repository), with the native `<details>` hamburger below 600 px and a fixed 53 px height. The mode tabs stay in the app header, so the site bar has no intra-project links.
3. Google Analytics. `<head>` contains the GA4 tag for measurement ID `G-XYG5QF5DZL`, once.
4. Card on the catalog page. In `danielpradilla-projects/projects/index.html`, add an `<article class="project-card">` with the same markup as the existing cards:
   - image `images/what-european-language-am-i-reading.jpg`, a screenshot of Detect mode with a route drawn, resized to 1000 px wide at JPEG quality 80, with `width`, `height`, descriptive `alt` text and a `?v=` parameter; the important content must survive the card's 16:9 crop;
   - category label `Language game`;
   - title "Which European language am I reading?";
   - the README's first sentence;
   - links "GitHub repo" and "Explore project →" to `/projects/what-european-language-am-i-reading/`.

   The Swiss Railway Clock card stays first. The other cards run newest to oldest by repository creation date, so this card goes second, directly after the clock.

Also in the catalog repository: add `what-european-language-am-i-reading` to the list in the README's "Project URLs" section and update its project count, and add a row to the inventory table in `AGENTS.md`.

Publishing order:

1. Push the app repository to GitHub.
2. Deploy the app (section 12.2) and check it live.
3. Take the screenshot from the live app.
4. Deploy the catalog: only `index.html`, `styles.css`, `images/` and `.htaccess` to `~/danielpradilla.info/projects/`, with rsync and without `--delete`.
5. Verify the catalog page at desktop and 375 px widths: the new card's image loads, both links work, the clock is still first, the grid is one column on mobile with no horizontal scroll, and the app page shows the site bar and loads the GA4 tag.

## 13. Transcription notes

The metro image is sharp at full size, so the station letters are clear. Three kinds of reading needed a decision:

| Item | Reading | Basis |
|---|---|---|
| Georgian stations | `ჷ` U+10F7, `ჴ` U+10F4, `ჶ` U+10F6 | Compared with SF Georgian and Arial Unicode renderings. Linguistically consistent: Svan uses `ჴ`, Laz uses `ჶ`. |
| Palochka | `ӏ` U+04CF in `ӏ`, `гӏ`, `лӏ`, `щӏ`, `шӏ`, `пӏ`, `аӏ`, `оӏ` | Drawn like `I` or `l`. The stations that read "ol" and "al" are Cyrillic `оӏ` and `аӏ`. |
| Y and N labels halfway between two stations (`üü`–`ü`, `th`–`ŝ ĉ ĝ`, `гӏ`–`лӏ`, `пӏ`–`аӏ`) | Assigned so that each station has one Y and one N line out | The direction the line is travelled is fixed by the station it comes from. |

The station `ǧ õ å` (Skolt Sami) has no `ŋ` on this version. The January 2021 flowchart had `ŋ ǧ õ å`.

## 14. Open questions

1. Palochka look-alikes. Most Caucasian texts online type the palochka (`ӏ`) as Latin `I`, digit `1` or Ukrainian `І`. Under the strict rule in section 3.3 these texts take other routes, and Aghul and Rutul have no sample. Accepting those three characters as a palochka when they follow a Cyrillic letter would make the app work on most real Caucasian text, at the cost of one more variant rule.

## 15. Milestones

1. Engine, `chart.json` logic, station cells and line paths, tests (section 12.1).
2. Board rendering and Steer mode.
3. Text panel, Detect mode with live typing and "Why not…?".
4. `fetch.php` and URL input.
5. Round engine with error highlighting.
6. Arcade, collection, sound.
7. Flags, Noto glyph check, game-style components added to the guide's `index.html`, options menu, accessibility pass, phone layout, compact site bar and GA4 tag.
8. Publish: GitHub repository, deploy to `/projects/what-european-language-am-i-reading/`, catalog card (sections 12.2 and 12.3).
9. Europe line map (section 16): data, layout, page, publish.

## 16. Second page: Europe line map

The poster sorts languages by letters. This page draws the same 106 languages as a metro map shaped roughly like Europe, with one line per language family or branch, so players can see where each language is spoken and how the letter chart's groups compare with real relationships. It is built after the poster version is published.

### 16.1 What the map shows

- Each of the 106 languages is a station drawn with its flag (the same files as the poster) and its native name. There are no letter stations on this page.
- Lines are coloured by language root: the branch for Indo-European languages, the family for the others. A family-level line for Indo-European would cover 70 of the 106 stations and say little.

| Line | Stations |
|---|---|
| Romance | por, glg, spa, cat, oci, fra, ita, cos, srd, fur, lld, roh, ron, rup |
| Germanic | eng, fry, nld, frr, deu, de-CH, ltz, dan, nor, swe, isl, fao, yid |
| Celtic | gle, gla, cym, bre |
| Slavic (branches: West, South, East) | pol, csb, ces, slk, hsb, dsb, slv, hbs, srp, cnr, mkd, bul, rus, ukr, bel |
| Baltic | lit, lav |
| Hellenic | ell, tsd |
| Indo-Iranian | rom, rmy, oss |
| Uralic (branches: Finnic, Sami, Ugric, Permic, Mari, Mordvinic, Samoyedic) | fin, est, krl, vep, sme, smj, sju, sma, smn, sms, sjd, hun, kpv, udm, mhr, mrj, myv, mdf, yrk |
| Turkic | tur, aze, gag, crh, tat, bak, chv, krc, kum, nog |
| Kartvelian | kat, xmf, lzz, sva |
| Northwest Caucasian | abk, abq, ady, kbd |
| Northeast Caucasian | che, inh, ava, dar, lbe, lez, tab, agx, tkr, rut |
| Single stations | sqi (Albanian), hye (Armenian), mlt (Maltese, Semitic), xal (Kalmyk, Mongolic), eus (Basque, isolate), epo (Esperanto, constructed) |

- Branches of a family are forks of one line in one colour, labelled with the branch name, the way metro lines fork.
- Transfers: dashed walkways join neighbouring stations of different lines where the languages are spoken side by side (for example Basque with Spanish and French, Breton with French, Maltese with Italian). They help navigation and show language contact; they say nothing about relatedness.
- Esperanto has no homeland. It is drawn as a separate station inside a dashed ring near the middle of the map, labelled "spoken everywhere".
- Romani is spoken across Europe. Its two stations sit in central Europe (Czech/Slovak spelling) and the Balkans, on the Indo-Iranian line, which continues to Ossetian in the Caucasus.

### 16.2 Layout

- Positions start from each language's coordinates in Glottolog (CC BY 4.0), projected to a plane, and are then schematised by hand into a metro layout: lines run horizontally, vertically or at 45°, stations sit on a grid, and spacing is even.
- Geography is approximate but must stay recognisable: Iberia south-west, the British Isles north-west, Scandinavia north, Italy and the Balkans south, Russia east, the Caucasus south-east. A faint coastline outline of Europe (Natural Earth, public domain, heavily simplified) sits behind the lines as scenery.
- Crowded areas get more room than their real size. The Caucasus holds 22 stations and Sápmi 7, so they are drawn enlarged, like a city centre on a metro map.
- Stored in `src/data/europe.json`: station positions, line definitions as ordered station lists with optional bend points, branch names, transfers and line colours.

### 16.3 Interaction

- Explore: tap or focus a station to open the same language card as on the poster (section 7.1), with its line and branch added, and a link that opens the poster page at that language. Arrow keys move between neighbouring stations along the lines.
- Detect: the same text panel as the poster page. When a text is routed, the map replays the chart's route step by step: at each letter station of the poster, the languages it rules out fade on the Europe map, with a counter ("Has č? No. 72 languages left"). The destination station lights up at the end. This shows that the letter chart cuts across families and geography.
- Guess the station (game): the app shows a sample text, and the player taps the station where it is spoken. An exact answer scores 100 points; a station on the same line or branch scores 40 and shows "Right family"; anything else scores 0. Each answer then shows the chart's route for that text and the correct station. Ten rounds per game, with round counter, score, streak of exact answers and a local top-10 table (its own storage key, separate from Arcade), using the same game UI components as Arcade. There are no hearts: every round is played.

### 16.4 Style and page

- `europe.html` in the same app, sharing `game-style.css`, `styles.css`, the engine, the language card and the text panel.
- Line colours are domain tokens for this page only (12 colours chosen to be distinct from each other and to work with the game style's paper and ink). They are scenery: they do not reuse the game style's state meanings, and every line also has its name printed at both ends and in a legend.
- The site bar gets two project links on both pages, "Poster" and "Europe map", because the project now has two views.
- A "Map" switch beside Overview/+/− (and in Options, saved in the browser, on by default) hides the coast scenery (land, sea, lakes, sea names, coast line) so only the lines, stations, labels, transfers, Esperanto ring and line tags stay on plain paper.
- The camera is a CSS transform on an HTML layer around the world-sized SVG (and, on the poster, the snake in its own overlay SVG), and the frame loop runs only while the camera or snake moves, so idle pages do no layout or paint work.
- Same GA4 tag, credits, hosting and cache-busting rules as the poster page. Glottolog and Natural Earth are credited in `CREDITS.md`.

## Appendix A. Stations

Listed depth-first, Y before N. Bold targets are terminals (Appendix B).

| # | Station id | Text contains any of | Y → | N → |
|---:|---|---|---|---|
| 1 | `fgr` | `f` U+0066<br>`g` U+0067<br>`r` U+0072 | `c_caron` | `xi_mu_lambda` |
| 2 | `c_caron` | `č` U+010D | `a_uml_1` | `c_apos_h` |
| 3 | `a_uml_1` | `ä` U+00E4 | `o_uml_1` | `c_caron_h` |
| 4 | `o_uml_1` | `ö` U+00F6 | `u_uml_1` | `d_stroke` |
| 5 | `u_uml_1` | `ü` U+00FC | **vep** | **krl** |
| 6 | `d_stroke` | `đ` U+0111 | `skolt` | **slk** |
| 7 | `skolt` | `ǧ` U+01E7<br>`õ` U+00F5<br>`å` U+00E5 | **sms** | **smn** |
| 8 | `c_caron_h` | `čh` U+010D U+0068 | **rom** | `e_caron` |
| 9 | `e_caron` | `ě` U+011B | `r_caron` | `u_macron` |
| 10 | `r_caron` | `ř` U+0159 | `u_ring` | **hsb** |
| 11 | `u_ring` | `ů` U+016F | **ces** | **dsb** |
| 12 | `u_macron` | `ū` U+016B | `e_ogonek_dot` | `eng_t_stroke` |
| 13 | `e_ogonek_dot` | `ę` U+0119<br>`ė` U+0117 | **lit** | **lav** |
| 14 | `eng_t_stroke` | `ŋ` U+014B<br>`ŧ` U+0167 | **sme** | `c_acute` |
| 15 | `c_acute` | `ć` U+0107 | **hbs** | **slv** |
| 16 | `c_apos_h` | `c'h` U+0063 U+0027 U+0068 | **bre** | `ieuw` |
| 17 | `ieuw` | `ieuw` U+0069 U+0065 U+0075 U+0077 | **nld** | `c_cedilla` |
| 18 | `c_cedilla` | `ç` U+00E7 | `s_cedilla` | `a_ring` |
| 19 | `s_cedilla` | `ş` U+015F | `g_breve` | `e_acute` |
| 20 | `g_breve` | `ğ` U+011F | `n_tilde_1` | **gag** |
| 21 | `n_tilde_1` | `ñ` U+00F1 | **crh** | `schwa_latin` |
| 22 | `schwa_latin` | `ə` U+0259 | **aze** | **tur** |
| 23 | `e_acute` | `é` U+00E9 | `a_tilde_1` | `e_uml_1` |
| 24 | `a_tilde_1` | `ã` U+00E3 | **por** | `l_middot_l` |
| 25 | `l_middot_l` | `l·l` U+006C U+00B7 U+006C | **cat** | `eau` |
| 26 | `eau` | `eau` U+0065 U+0061 U+0075 | **fra** | **oci** |
| 27 | `e_uml_1` | `ë` U+00EB | **sqi** | **fur** |
| 28 | `a_ring` | `å` U+00E5 | `eng` | `a_uml_2` |
| 29 | `eng` | `ŋ` U+014B | `o_d_t` | `i_uml` |
| 30 | `o_d_t` | `ö` U+00F6<br>`đ` U+0111<br>`ŧ` U+0167 | **sju** | **smj** |
| 31 | `i_uml` | `ï` U+00EF | **sma** | `ae_o_slash` |
| 32 | `ae_o_slash` | `æ` U+00E6<br>`ø` U+00F8 | `oy` | **swe** |
| 33 | `oy` | `øy` U+00F8 U+0079 | **nor** | **dan** |
| 34 | `a_uml_2` | `ä` U+00E4 | `o_tilde` | `ae_eth` |
| 35 | `o_tilde` | `õ` U+00F5 | **est** | `eszett` |
| 36 | `eszett` | `ß` U+00DF | **deu** | `e_uml_2` |
| 37 | `e_uml_2` | `ë` U+00EB | **ltz** | `u_uml_2` |
| 38 | `u_uml_2` | `ü` U+00FC | `uu` | **fin** |
| 39 | `uu` | `üü` U+00FC U+00FC | **frr** | **de-CH** |
| 40 | `ae_eth` | `æ` U+00E6<br>`ð` U+00F0 | `o_slash` | `tx` |
| 41 | `o_slash` | `ø` U+00F8 | **fao** | **isl** |
| 42 | `tx` | `tx` U+0074 U+0078 | **eus** | `o_u_dacute` |
| 43 | `o_u_dacute` | `ő` U+0151<br>`ű` U+0171 | **hun** | `w_circ` |
| 44 | `w_circ` | `ŵ` U+0175 | **cym** | `n_tilde_2` |
| 45 | `n_tilde_2` | `ñ` U+00F1 | `j` | `z_dot` |
| 46 | `j` | `j` U+006A | **spa** | **glg** |
| 47 | `z_dot` | `ż` U+017C | `c_g_h_maltese` | `c_acute_h` |
| 48 | `c_g_h_maltese` | `ċ` U+010B<br>`ġ` U+0121<br>`ħ` U+0127 | **mlt** | `e_c_s_z` |
| 49 | `e_c_s_z` | `ę` U+0119<br>`ć` U+0107<br>`ś` U+015B<br>`ź` U+017A | **pol** | **csb** |
| 50 | `c_acute_h` | `ćh` U+0107 U+0068 | **rmy** | `chh` |
| 51 | `chh` | `chh` U+0063 U+0068 U+0068 | **rmy** | `a_s_t` |
| 52 | `a_s_t` | `ă` U+0103<br>`ș` U+0219<br>`ț` U+021B | **ron** | `a_tilde_2` |
| 53 | `a_tilde_2` | `ã` U+00E3 | **rup** | `iuw` |
| 54 | `iuw` | `iuw` U+0069 U+0075 U+0077 | **fry** | `s_c_g_circ` |
| 55 | `s_c_g_circ` | `ŝ` U+015D<br>`ĉ` U+0109<br>`ĝ` U+011D | **epo** | `th` |
| 56 | `th` | `th` U+0074 U+0068 | `k` | `tg` |
| 57 | `k` | `k` U+006B | **eng** | `a_e_i_grave` |
| 58 | `a_e_i_grave` | `à` U+00E0<br>`è` U+00E8<br>`ì` U+00EC | **gla** | **gle** |
| 59 | `tg` | `tg` U+0074 U+0067 | **roh** | `ghj` |
| 60 | `ghj` | `ghj` U+0067 U+0068 U+006A | **cos** | `e_uml_3` |
| 61 | `e_uml_3` | `ë` U+00EB | **lld** | `q` |
| 62 | `q` | `q` U+0071 | **ita** | **srd** |
| 63 | `xi_mu_lambda` | `ξ` U+03BE<br>`μ` U+03BC<br>`λ` U+03BB | `tau_sigma_chi` | `arm` |
| 64 | `tau_sigma_chi` | `τσχ` U+03C4 U+03C3 U+03C7 | **tsd** | **ell** |
| 65 | `arm` | `բ` U+0562<br>`գ` U+0563<br>`ի` U+056B | **hye** | `geo` |
| 66 | `geo` | `ი` U+10D8<br>`თ` U+10D7<br>`ლ` U+10DA | `geo_fi` | `heb` |
| 67 | `geo_fi` | `ჷ` U+10F7 | `geo_har` | `geo_fe` |
| 68 | `geo_har` | `ჴ` U+10F4 | **sva** | **xmf** |
| 69 | `geo_fe` | `ჶ` U+10F6 | **lzz** | **kat** |
| 70 | `heb` | `א` U+05D0<br>`ה` U+05D4<br>`ש` U+05E9 | **yid** | `cyr_i` |
| 71 | `cyr_i` | `і` U+0456 | `cyr_ye_yi` | `cyr_j` |
| 72 | `cyr_ye_yi` | `є` U+0454<br>`ї` U+0457 | **ukr** | `cyr_short_u` |
| 73 | `cyr_short_u` | `ў` U+045E | **bel** | **kpv** |
| 74 | `cyr_j` | `ј` U+0458 | `cyr_lj_nj_dzhe` | `cyr_schwa` |
| 75 | `cyr_lj_nj_dzhe` | `љ` U+0459<br>`њ` U+045A<br>`џ` U+045F | `cyr_gje_dze` | **sjd** |
| 76 | `cyr_gje_dze` | `ѓ` U+0453<br>`ѕ` U+0455 | **mkd** | `cyr_z_s_acute` |
| 77 | `cyr_z_s_acute` | `з́` U+0437 U+0301<br>`с́` U+0441 U+0301 | **cnr** | **srp** |
| 78 | `cyr_schwa` | `ә` U+04D9 | `abkhaz` | `cyr_o_uml` |
| 79 | `abkhaz` | `ҩ` U+04A9<br>`ҵ` U+04B5<br>`ҿ` U+04BF | **abk** | `cyr_s_z_desc` |
| 80 | `cyr_s_z_desc` | `ҫ` U+04AB<br>`ҙ` U+0499 | **bak** | `cyr_k_hard` |
| 81 | `cyr_k_hard` | `къ` U+043A U+044A | **tat** | **xal** |
| 82 | `cyr_o_uml` | `ӧ` U+04E7 | `udmurt` | `palochka` |
| 83 | `udmurt` | `ӟ` U+04DF<br>`ӝ` U+04DD<br>`ӵ` U+04F5 | **udm** | `cyr_ng` |
| 84 | `cyr_ng` | `ҥ` U+04A5 | **mhr** | **mrj** |
| 85 | `palochka` | `ӏ` U+04CF | `gh_pal` | `cyr_en_hook` |
| 86 | `gh_pal` | `гӏ` U+0433 U+04CF | `ya_soft` | `l_pal` |
| 87 | `ya_soft` | `яь` U+044F U+044C | `o_soft_1` | `sh_pal` |
| 88 | `o_soft_1` | `оь` U+043E U+044C | **che** | **inh** |
| 89 | `sh_pal` | `шӏ` U+0448 U+04CF | **abq** | `p_pal` |
| 90 | `p_pal` | `пӏ` U+043F U+04CF | `a_pal` | **ava** |
| 91 | `a_pal` | `аӏ` U+0430 U+04CF | `chch` | **dar** |
| 92 | `chch` | `чч` U+0447 U+0447 | **agx** | `o_pal` |
| 93 | `o_pal` | `оӏ` U+043E U+04CF | **tkr** | **rut** |
| 94 | `l_pal` | `лӏ` U+043B U+04CF | `shch_pal` | `u_soft` |
| 95 | `shch_pal` | `щӏ` U+0449 U+04CF | **kbd** | **ady** |
| 96 | `u_soft` | `уь` U+0443 U+044C | `a_soft_1` | **lbe** |
| 97 | `a_soft_1` | `аь` U+0430 U+044C | **tab** | **lez** |
| 98 | `cyr_en_hook` | `ӈ` U+04C8 | **yrk** | `chuvash` |
| 99 | `chuvash` | `ӑ` U+04D1<br>`ӗ` U+04D7<br>`ҫ` U+04AB | **chv** | `cyr_ae` |
| 100 | `cyr_ae` | `ӕ` U+04D5 | **oss** | `o_soft_2` |
| 101 | `o_soft_2` | `оь` U+043E U+044C | `a_soft_2` | `cyr_yery` |
| 102 | `a_soft_2` | `аь` U+0430 U+044C | **nog** | **kum** |
| 103 | `cyr_yery` | `ы` U+044B | `k_hard_a` | **bul** |
| 104 | `k_hard_a` | `къа` U+043A U+044A U+0430 | **krc** | `yy` |
| 105 | `yy` | `ый` U+044B U+0439 | **rus** | `hard_r` |
| 106 | `hard_r` | `ър` U+044A U+0440 | **mdf** | **myv** |

## Appendix B. Terminals

The last column is the "Must contain" list on the language card: the Y sequences on the route, in order. Slashes separate alternatives within one station.

| Code | Chart label | English name | Flag on chart | Must contain (Y stations on the route) |
|---|---|---|---|---|
| `rom` | romani čhib | Romani (Czech/Slovak spelling) | Romani flag | f/g/r č čh |
| `rmy` | rromani ćhib / romani chhib | Romani (other spellings) | Romani flag | f/g/r ćh <br>or f/g/r chh |
| `hsb` | hornjoserbšćina | Upper Sorbian | Sorbian | f/g/r č ě |
| `dsb` | dolnoserbšćina | Lower Sorbian | Sorbian | f/g/r č ě ř |
| `ces` | čeština | Czech | Czechia | f/g/r č ě ř ů |
| `lit` | lietuvių | Lithuanian | Lithuania | f/g/r č ū ę/ė |
| `lav` | latviešu | Latvian | Latvia | f/g/r č ū |
| `sme` | davvisámegiella | Northern Sami | Sami | f/g/r č ŋ/ŧ |
| `hbs` | bosanski/hrvatski/srpski/crnogorski | Bosnian/Croatian/Serbian/Montenegrin (Latin) | Bosnia and Herzegovina + Croatia + Serbia + Montenegro (2×2) | f/g/r č ć |
| `slv` | slovenščina | Slovene | Slovenia | f/g/r č |
| `vep` | vepsän kelʼ | Veps | Veps people | f/g/r č ä ö ü |
| `krl` | karjalan kieli | Karelian | Karelian people | f/g/r č ä ö |
| `slk` | slovenčina | Slovak | Slovakia | f/g/r č ä |
| `sms` | nuõrttsääʹmǩiõll | Skolt Sami | Sami | f/g/r č ä đ ǧ/õ/å |
| `smn` | anarâškielâ | Inari Sami | Sami | f/g/r č ä đ |
| `bre` | brezhoneg | Breton | Gwenn-ha-du (Brittany) | f/g/r c'h |
| `nld` | nederlands | Dutch | Netherlands | f/g/r ieuw |
| `gag` | gagauzça | Gagauz | Gagauzia | f/g/r ç ş |
| `crh` | qırımtatar tili | Crimean Tatar | Crimean Tatar people | f/g/r ç ş ğ ñ |
| `aze` | azərbaycanca | Azerbaijani | Azerbaijan | f/g/r ç ş ğ ə |
| `tur` | türkçe | Turkish | Turkey | f/g/r ç ş ğ |
| `por` | português | Portuguese | Portugal | f/g/r ç é ã |
| `cat` | català | Catalan | Senyera (Catalonia) | f/g/r ç é l·l |
| `fra` | français | French | France | f/g/r ç é eau |
| `oci` | occitan | Occitan | Occitan cross | f/g/r ç é |
| `sqi` | shqip | Albanian | Albania | f/g/r ç ë |
| `fur` | furlan | Friulian | Friuli | f/g/r ç |
| `sju` | ubmejesámiengiälla (the poster prints "ubmejensámien giella") | Ume Sami | Sami | f/g/r å ŋ ö/đ/ŧ |
| `smj` | julevsámegiella | Lule Sami | Sami | f/g/r å ŋ |
| `sma` | åarjelsaemien gïele | Southern Sami | Sami | f/g/r å ï |
| `nor` | norsk | Norwegian | Norway | f/g/r å æ/ø øy |
| `dan` | dansk | Danish | Denmark | f/g/r å æ/ø |
| `swe` | svenska | Swedish | Sweden | f/g/r å |
| `est` | eesti keel | Estonian | Estonia | f/g/r ä õ |
| `deu` | deutsch | German | Germany | f/g/r ä ß |
| `ltz` | lëtzebuergesch | Luxembourgish | Luxembourg | f/g/r ä ë |
| `fin` | suomi | Finnish | Finland | f/g/r ä |
| `frr` | nordfriisk | North Frisian | North Frisian flag | f/g/r ä ü üü |
| `de-CH` | schweizer hochdeutsch | Swiss Standard German | Switzerland | f/g/r ä ü |
| `fao` | føroyskt | Faroese | Faroe Islands | f/g/r æ/ð ø |
| `isl` | íslenska | Icelandic | Iceland | f/g/r æ/ð |
| `eus` | euskara | Basque | Ikurriña (Basque Country) | f/g/r tx |
| `hun` | magyar | Hungarian | Hungary | f/g/r ő/ű |
| `cym` | cymraeg | Welsh | Wales | f/g/r ŵ |
| `spa` | español | Spanish | Spain | f/g/r ñ j |
| `glg` | galego | Galician | Galicia | f/g/r ñ |
| `mlt` | malti | Maltese | Malta | f/g/r ż ċ/ġ/ħ |
| `pol` | polski | Polish | Poland | f/g/r ż ę/ć/ś/ź |
| `csb` | kaszëbsczi | Kashubian | Kashubia | f/g/r ż |
| `ron` | română | Romanian | Romania | f/g/r ă/ș/ț |
| `rup` | armãneascã | Aromanian | Aromanian flag | f/g/r ã |
| `fry` | frysk | West Frisian | Friesland | f/g/r iuw |
| `epo` | esperanto | Esperanto | Esperanto flag | f/g/r ŝ/ĉ/ĝ |
| `eng` | english | English | England (St George’s cross) | f/g/r th k |
| `gla` | gàidhlig | Scottish Gaelic | Scotland | f/g/r th à/è/ì |
| `gle` | gaeilge | Irish | Ireland | f/g/r th |
| `roh` | rumantsch grischun | Romansh | Graubünden | f/g/r tg |
| `cos` | corsu | Corsican | Corsica | f/g/r ghj |
| `lld` | ladin | Ladin | Ladin flag | f/g/r ë |
| `ita` | italiano | Italian | Italy | f/g/r q |
| `srd` | sardu | Sardinian | Sardinia | f/g/r |
| `tsd` | tsakónika / τσακώνικα | Tsakonian | Greece | ξ/μ/λ τσχ |
| `ell` | elliniká / ελληνικά | Greek | Greece | ξ/μ/λ |
| `hye` | hayeren / հայերեն | Armenian | Armenia | բ/գ/ի |
| `sva` | lushnu nin / ლუშნუ ნინ | Svan | Georgia | ი/თ/ლ ჷ ჴ |
| `xmf` | margaluri nina / მარგალური ნინა | Mingrelian | Georgia | ი/თ/ლ ჷ |
| `lzz` | lazuri nena / ლაზური ნენა | Laz | Georgia | ი/თ/ლ ჶ |
| `kat` | kartuli ena / ქართული ენა | Georgian | Georgia | ი/თ/ლ |
| `yid` | yidish / ייִדיש | Yiddish | chai symbol (חי), no flag | א/ה/ש |
| `ukr` | ukrayinska / українська | Ukrainian | Ukraine | і є/ї |
| `bel` | belaruskaya / беларуская | Belarusian | white-red-white flag | і ў |
| `kpv` | komi kyv / коми кыв | Komi | Komi Republic | і |
| `mkd` | makedonski / македонски | Macedonian | North Macedonia | ј љ/њ/џ ѓ/ѕ |
| `cnr` | crnogorski / црногорски | Montenegrin (Cyrillic) | Montenegro | ј љ/њ/џ з́/с́ |
| `srp` | srpski / српски | Serbian (Cyrillic) | Serbia | ј љ/њ/џ |
| `sjd` | kiillt saam kiill / кӣллт са̄мь кӣлл | Kildin Sami | Sami | ј |
| `abk` | apsua / аҧсуа | Abkhaz | Abkhazia | ә ҩ/ҵ/ҿ |
| `bak` | bashqortsa / башҡортса | Bashkir | Bashkortostan | ә ҫ/ҙ |
| `tat` | tatarça / татарча | Tatar | Tatarstan | ә къ |
| `xal` | khalmg keln / хальмг келн | Kalmyk | Kalmykia | ә |
| `udm` | udmurt kyl / удмурт кыл | Udmurt | Udmurtia | ӧ ӟ/ӝ/ӵ |
| `mhr` | olykmariy / олыкмарий | Meadow Mari | Mari El | ӧ ҥ |
| `mrj` | kyryk mary / кырык мары | Hill Mari | Mari El | ӧ |
| `kbd` | adygebze / адыгэбзэ (къэбэрдейбзэ) | Kabardian | Adygea | ӏ лӏ щӏ |
| `ady` | adygabze / адыгабзэ (кӏахыбзэ) | Adyghe | Adygea | ӏ лӏ |
| `tab` | tabasaran / табасаран | Tabasaran | Dagestan | ӏ уь аь |
| `lez` | lezgi / лезги | Lezgian | Dagestan | ӏ уь |
| `lbe` | lakku / лакку | Lak | Dagestan | ӏ |
| `che` | nokhchiyn / нохчийн | Chechen | Chechnya | ӏ гӏ яь оь |
| `inh` | ghalghay / гӏалгӏай | Ingush | Ingushetia | ӏ гӏ яь |
| `abq` | abaza / абаза | Abaza | Abaza people | ӏ гӏ шӏ |
| `ava` | awar / авар | Avar | Dagestan | ӏ гӏ |
| `dar` | dargan / дарган | Dargwa | Dagestan | ӏ гӏ пӏ |
| `agx` | aghul / агъул | Aghul | Dagestan | ӏ гӏ пӏ аӏ чч |
| `tkr` | tsakhna / цӏаӏхна | Tsakhur | Dagestan | ӏ гӏ пӏ аӏ оӏ |
| `rut` | mykhabishdy / мыхӏабишды | Rutul | Dagestan | ӏ гӏ пӏ аӏ |
| `yrk` | nenetsya / ненэцяʼ | Nenets | Nenets Autonomous Okrug | ӈ |
| `chv` | chăvashla / чӑвашла | Chuvash | Chuvashia | ӑ/ӗ/ҫ |
| `oss` | iron / ирон | Ossetian (Iron) | North Ossetia | ӕ |
| `nog` | nogaysha / ногайша | Nogai | Dagestan + Karachay-Cherkessia + Stavropol (3-up) | оь аь |
| `kum` | qumuq / къумукъ | Kumyk | Dagestan | оь |
| `bul` | bălgarski / български | Bulgarian | Bulgaria | (nothing: every answer is N) |
| `krc` | qarachay-malqar / къарачай-малкъар | Karachay-Balkar | Karachay-Cherkessia | ы къа |
| `rus` | russkiy / русский | Russian | Russia | ы ый |
| `mdf` | mokshen käl / мокшень кяль | Moksha | Mordovia | ы ър |
| `myv` | erzän kel / эрзянь кель | Erzya | Mordovia | ы |
