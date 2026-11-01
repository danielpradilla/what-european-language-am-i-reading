# Which European language am I reading?

An interactive snake game built on the "Which European language am I reading?" chart by Øystein H. Brekke and Max Fras: paste a text, type, or give a URL, and follow its letters through the metro map to one of 106 languages.

Play it at [danielpradilla.info/projects/what-european-language-am-i-reading](https://www.danielpradilla.info/projects/what-european-language-am-i-reading/).

## Modes

- **Steer**: walk the chart freely with the arrow keys, Y and N, or by tapping. The snake tells what each station tests and which languages each line leads to. Reaching a flag adds it to your collection.
- **Detect**: paste or type a text, or fetch one from a URL. The snake follows the chart's rules and the letters that decided each turn are highlighted in the text.
- **Arcade**: steer the snake through real text samples against the clock; a wrong turn shows the letter you missed, with lives, streaks and a local high-score table.

The chart sorts languages by the letters they use, not by family or geography. Short or unusual texts can take odd routes; the app follows the chart exactly and shows why.

## Credits

The chart is by Øystein H. Brekke ([@oysteib](https://x.com/oysteib)) and Max Fras ([@maxfras](https://x.com/maxfras)), [published in February 2021](https://x.com/maxfras/status/1363473000918626307). Sample texts, flags and fonts are credited in [CREDITS.md](CREDITS.md). The design and rules are documented in [SPEC.md](SPEC.md).

## Run locally

```sh
php -S 127.0.0.1:8791
```

Open `http://127.0.0.1:8791/`. PHP is only needed for fetching text from URLs (`api/fetch.php`); everything else is static.

## Tests

```sh
node --test
```

The tests check the chart structure, that every language is reachable, the matching rules and that every sample text routes to its own language. `tests/fetch_test.php` checks the URL endpoint against a running server:

```sh
php tests/fetch_test.php http://127.0.0.1:8791/api/fetch.php
```
