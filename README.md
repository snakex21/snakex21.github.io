# snakex21 · Pulpit

Osobista strona w formie pulpitu systemu operacyjnego: okna, pasek zadań, menu Start, ikony i gadżety.
Czysty HTML, CSS i JavaScript (moduły ES). Bez Node, npm, bundlera i kroku budowania – każdy statyczny
serwer (np. GitHub Pages) poda ją tak, jak leży w folderze.

Gry, narzędzia i stare ustawienia **nie są kopiowane** – otwierają się w oknach
z ramką (iframe) wskazującą na poprzednią stronę `https://snakex21.github.io/snakex21/`. Muzyka ma własny
odtwarzacz (`js/apps/music.js`), ale pliki MP3 nadal leżą na starej stronie. LinkHub ma własne okno
(`js/apps/linkhub.js`), ale linki czyta na bieżąco z pliku `LinkHub/data.js` starej strony. Filmy mają własny katalog
(`js/apps/filmy.js` + `data/films.json`) – same metadane, bez odtwarzaczy starej strony.

## Podgląd lokalny

```
cd pulpit
python -m http.server 8000
```

Potem otwórz `http://localhost:8000/`. Strona musi być podana przez serwer (nie `file://`), bo moduły ES
i pliki `data/*.json` są ładowane przez `fetch`.

Stara strona lokalnie (np. do sprawdzenia zmian w grach przed wysłaniem do repo `snakex21/snakex21`):
uruchom drugi serwer w jej folderze (`python -m http.server 8002 --bind 127.0.0.1`) i w konsoli przeglądarki
na pulpicie wpisz `localStorage.setItem('pulpit:oldSite', JSON.stringify('http://127.0.0.1:8002/'))`, potem odśwież.
Okna gier, narzędzi, LinkHub i muzyka będą wtedy brać pliki z tego adresu. `localStorage.removeItem('pulpit:oldSite')`
przywraca adres domyślny (stała `OLD_SITE_DEFAULT` w `js/util.js`).

Pamięć podręczna: `index.html` dokleja do CSS i modułów JS wersję `?v=N` (mapa importów `<script type="importmap">`
w `<head>`, wersję motywu i `themes.json` bierze z niej `js/themes.js`). Po zmianach w plikach podbij numer
we wszystkich `?v=` w `index.html` – przeglądarki nie zmieszają wtedy starego CSS z nowym JS.
Nowy moduł JS dopisz też do mapy importów.

## Struktura

```
index.html            szkielet pulpitu (pulpit, pasek zadań, menu Start) + wczesne ustawienie motywu
css/base.css          wspólny układ i komponenty, zmienne CSS z wartościami domyślnymi, widok mobilny
css/contextmenu.css   menu kontekstowe: szkielet + wygląd według rodzin motywów (1.0–3.1, 95/2000, XP, Vista/7, 8/8.1, 11)
css/filmy.css         okno Filmy (siatka plakatów, lista, szczegóły)
themes/themes.json    lista motywów (id, nazwa, plik, opis, kolory podglądu, warianty)
themes/win1.css       „Windows 1.0”   – okna obok siebie, launcher u góry, bez paska zadań
themes/win2.css       „Windows 2.0”   – nakładające się okna, pasek menu u góry, ikony na dole
themes/win31.css      „Windows 3.1”   – Menedżer programów, bez paska zadań
themes/win95.css      „Windows 95”
themes/win2000.css    „Windows 2000”
themes/winxp.css      „Windows XP”
themes/winvista.css   „Windows Vista” – ciemne szkło, kula Start
themes/win7.css       „Windows 7”     – jasne szkło, superpasek, kula Start
themes/win8.css       „Windows 8”     – pełnoekranowy ekran Start, aktywny róg
themes/win81.css      „Windows 8.1”   – ekran Start z 4 rozmiarami kafelków i „Wszystkie aplikacje”
themes/win11.css      „Windows 11” (jasny / ciemny / systemowy)
icons/icons.svg       własne ikony SVG (symbole <symbol id="i-…">), kolory sterowane zmiennymi CSS
icons/favicon.svg     ikona karty
icons/<zestaw>/       logo systemu danej epoki: logo-16.png, logo-32.png, logo-48.png (zestawy: win1, win3, win9x,
                      winxp, winvista, win7, win8, win81, win11; motyw wybiera zestaw polem "icons" w themes.json)
js/main.js            start: ikony, motyw, menedżer okien, pulpit, pasek zadań, menu Start, gadżety
js/store.js           localStorage / sessionStorage z obsługą błędów + szyna zdarzeń
js/util.js            pomocniki DOM (h, icon, glyph, tile), fetch z limitem czasu, formatowanie
js/wm.js              menedżer okien: przeciąganie, rozmiar, z-order, minimalizacja, maksymalizacja, pozycje,
                      układ kafelkowy (cecha tiling), okna „persistent” (zamknięcie = minimalizacja)
js/desktop.js         ikony pulpitu (klik = zaznacz, dwuklik / Enter = otwórz, strzałki)
js/taskbar.js         przyciski okien, zegar, „Pokaż pulpit”; ikony zminimalizowanych okien na pulpicie (bez paska)
js/startmenu.js       menu Start (kategorie, wyszukiwarka, obsługa klawiatury) i ekran Start z kafelkami
js/launcher.js        launcher u góry ekranu (Windows 1.0 / 2.0)
js/menubar.js         pasek menu z rozwijanymi listami (launcher, Menedżer programów)
js/contextmenu.js     ogólne menu kontekstowe (prawy przycisk, Shift+F10 / klawisz Menu, długie przytrzymanie na dotyku)
js/menus.js           menu pulpitu, ikon, paska tytułu (menu systemowe), paska zadań + itemMenu() / showProperties() dla programów
js/themes.js          przełączanie motywu, wariantu i koloru tapety, cechy układu motywu (data-* na <html>)
js/apps/registry.js   rejestr programów pulpitu
js/apps/*.js          programy: programs (folder + okno szczegółów), catalog (Gry / Narzędzia), music (odtwarzacz),
                      linkhub (Ulubione z linkami starej strony), filmy (katalog filmów), webview, notepad, gadgets, control,
                      progman (Menedżer programów dla motywów z cechą programManager)
data/programs.json    moje programy z GitHub Releases (pole "icon": ikona programu)
data/music.json       lista utworów odtwarzacza (tytuł, wykonawca, plik na starej stronie, kolor akcentu)
icons/programs/<repo>/ ikony programów: 16/32/48/64.png z ikony projektu w jego repo albo własny icon.svg
icons/games/<slug>.svg, icons/tools/<slug>.svg  własne ikony gier i narzędzi (SVG 48×48, slug z data/*.json)
data/games.json       gry ze starej strony (tytuł, opis, ścieżka)
data/films.json       katalog filmów (tytuł, oryginalny tytuł, rok, typ, gatunki, kolekcja, strony Wikipedii)
data/tools.json       narzędzia ze starej strony (tytuł, opis, ścieżka)
```

Ustawienia (motyw, wariant, cechy układu motywu, kolor tapety, pozycje okien, notatki, miasto pogody) są zapisywane
w `localStorage` z przedrostkiem `pulpit:`. Odpowiedzi API GitHuba są trzymane w `sessionStorage` przez 30 minut.

## Jak dodać motyw

1. Skopiuj jeden z plików `themes/*.css` pod nową nazwą, np. `themes/win7.css`.
2. Zmień zmienne w `:root` (kolory, `--taskbar-h`, `--title-h`, `--win-radius`, `--wallpaper`, kolory ikon `--ic-*`)
   i reguły układu: kształt i położenie paska zadań (`.taskbar`, `.start-btn`, `.task-btn`), wygląd okien
   (`.win`, `.win-titlebar`, `.win-btn`), menu Start (`.startmenu`, `.sm-*`).
   - `--sm-flyout: 1` w `.startmenu` = podmenu wysuwane z boku po najechaniu (jak w 95/XP),
     `--sm-flyout: 0` = podmenu rozwijane w miejscu (jak w 11).
   - Elementy menu, których motyw nie potrzebuje (`.sm-banner`, `.sm-head`, `.sm-search`, `.sm-pinned`, `.sm-foot`),
     wystarczy ukryć przez `display: none`.
3. Dopisz wpis do `themes/themes.json`:
   ```json
   { "id": "win7", "name": "Windows 7", "year": 2009, "file": "win7.css",
     "description": "…", "preview": { "desk": "#1e5a8a", "bar": "#1b2a3a", "title": "#6ea0d0", "win": "#e8eef5", "radius": "6px" } }
   ```
   Opcjonalnie `"variants": [{ "id": "light", "name": "Jasny" }, …]` – motyw dostaje wtedy atrybut
   `data-variant` na `<html>`. W `preview` można dodać `"accent"` (kolor przycisku Start / kuli w miniaturze).
4. Jeśli motyw zmienia **układ** (a nie tylko wygląd), zadeklaruj to w `"layout"` (opis niżej).

5. Opcjonalnie `"icons": "win9x"` – zestaw ikon z `icons/<zestaw>/` (opis zestawu w `"iconSets"` na początku
   `themes.json`: `"large"` = 32 albo 48 px dla dużych ikon, `"pixelated": true` = ostre piksele). Logo z zestawu
   pokazuje się na przycisku Start, przy Menedżerze programów, w launcherze 1.0 / 2.0 i na karcie motywu w Panelu
   sterowania (w kodzie: `icon('os')` albo klasa `.os-logo`). Bez zestawu albo przy braku pliku widać własny znak SVG `#i-start`.

Motyw pojawi się w Panelu sterowania (karty są sortowane po `year`, od najstarszego). Miniatura rysuje się
sama z kolorów `preview` i cech `layout` (launcher u góry, okna obok siebie, grupy Menedżera programów,
ikony zamiast paska, kafelki, kula Start). Grafiki rysuj samodzielnie w CSS/SVG (bez cudzych tapet i fontów). Wyjątek: logotypy systemów w `icons/<zestaw>/`
(wyciągnięte z plików .ico zestawu z Wikimedia Commons / Wikipedii / Worldvectorlogo) – są znakami towarowymi Microsoft
i nie podlegają licencji kodu strony.

### Cechy układu (`"layout"` w themes.json)

Każda cecha jest opcjonalna; brak = wartość domyślna (klasyczny pasek na dole i menu Start).
`js/themes.js` zamienia je na atrybuty `<html>` (i zapamiętuje w `localStorage`, żeby skrypt w `<head>`
ustawił je przed pierwszym malowaniem). Szkielet każdej cechy jest w `css/base.css`, wygląd dokłada plik motywu.

| klucz            | wartości (domyślna pierwsza)               | atrybut na `<html>` | co robi |
|------------------|--------------------------------------------|---------------------|---------|
| `taskbar`        | `"bottom"`, `"none"`                       | `data-taskbar`      | `none`: bez paska zadań; zminimalizowane okna stają się ikonami w `#icon-area` na dole pulpitu (1.0 / 2.0 / 3.1) |
| `launcher`       | `"none"`, `"executive"`, `"menubar"`       | `data-launcher`     | pasek u góry ekranu (`#launcher`, `js/launcher.js`): `menubar` = pasek menu z kategoriami i zegarem (2.0), `executive` = dodatkowo tytuł i lista programów jak nazwy plików (1.0) |
| `programManager` | `false`, `true`                            | `data-progman`      | po włączeniu motywu otwiera się okno „Menedżer programów” z grupami (Moje programy, Gry, Narzędzia, Media); ikony pulpitu znikają; zamknięcie okna je minimalizuje, a zmiana motywu zamyka (3.1) |
| `tiling`         | `false`, `true`                            | `data-tiling`       | okna układane w siatce bez nakładania (bez przeciągania i zmiany rozmiaru); swobodne pozycje wracają po zmianie motywu (1.0) |
| `start`          | `"menu"`, `"screen"`                       | `data-start`        | `screen`: pełnoekranowy ekran Start z grupami kafelków (`.ss`, rozmiary `s-small`, `s-medium`, `s-wide`, `s-large`, żywe kafelki: zegar, licznik gier, przewijane nazwy programów) (8 / 8.1) |
| `startButton`    | `"button"`, `"orb"`, `"corner"`            | `data-start-btn`    | informacja dla CSS motywu: zwykły przycisk, okrągła kula (Vista / 7) albo aktywny róg (8). Sam kształt rysuje plik motywu |
| `allApps`        | `false`, `true`                            | `data-all-apps`     | na ekranie Start pokazuje przełącznik „Wszystkie aplikacje” (lista według kategorii) (8.1) |

Przykład (Windows 3.1):

```json
{ "id": "win31", "name": "Windows 3.1", "year": 1992, "file": "win31.css",
  "layout": { "taskbar": "none", "programManager": true },
  "preview": { "desk": "#a8a8a8", "bar": "#c0c0c0", "title": "#000080", "win": "#c0c0c0", "radius": "0" } }
```

Elementy potrzebne tylko niektórym motywom (`#launcher`, `#icon-area`) mają w HTML atrybut `hidden` i są odkrywane
przez JS, gdy motyw deklaruje daną cechę – nawet przy nieaktualnym CSS nie pojawią się w innych motywach.
Moduły reagują na zmianę motywu przez zdarzenie `theme:change` (`on('theme:change', …)` z `js/store.js`)
i czytają cechy funkcją `layout()` z `js/themes.js` albo z `document.documentElement.dataset`.

## Jak dodać program pulpitu

1. Utwórz `js/apps/mojprogram.js` eksportujący `open(args)`, który woła `openWindow({...})` z `js/wm.js`:
   ```js
   import { openWindow } from '../wm.js';
   export function open() {
     return openWindow({ id: 'app:mojprogram', title: 'Mój program', icon: 'app', width: 500, height: 400,
       render(body, win) { body.textContent = 'Cześć!'; } });
   }
   ```
2. Dopisz go w `js/apps/registry.js`: `mojprogram: { title: 'Mój program', icon: 'app', module: './mojprogram.js' }`.
   Strona ze starej witryny w oknie: `{ title: '…', icon: 'web', web: 'ścieżka/strona.html' }`.
   Zewnętrzny link: `{ title: '…', href: 'https://…' }`.
3. Ikona na pulpicie: dopisz id do `DESKTOP_ICONS` w `js/desktop.js`. Wpis w menu Start: odpowiednia kategoria
   w `buildCategories()` w `js/startmenu.js` (albo `PINNED`).

Każdy program można też otworzyć linkiem `…/#id`, np. `#programs`, `#games`, `#notepad`.

## Jak dodać „mój program” (z GitHub Releases)

Dopisz obiekt w `data/programs.json`:

```json
{ "repo": "NazwaRepo", "name": "Nazwa", "kind": "Narzędzie", "platforms": ["Windows"],
  "language": "Go", "description": "Krótki opis z repozytorium." }
```

Opcjonalne `"icon"`: `"icons/programs/<repo>/{s}.png"` (zestaw 16/32/48/64 px, `{s}` = rozmiar – strona bierze plik
najbliższy rozmiarowi na ekranie) albo jeden plik, np. `"icons/programs/<repo>/icon.svg"`. Bez ikony widać zwykłą ikonę SVG.
Ikona pojawia się w folderze „Moje programy” (widoki „Duże ikony” / „Szczegóły”), w menu Start, na ekranie Start,
w Menedżerze programów i w pasku tytułu okna szczegółów.

Okno szczegółów programu pyta `https://api.github.com/repos/snakex21/<repo>/releases/latest` dopiero przy otwarciu okna,
pokazuje wersję i datę, przycisk „Pobierz dla Windows” (najlepszy plik dla Windows), „Inne pliki” i sumy kontrolne.
Dla repo, które ma tylko wydania testowe, dodaj `"prerelease": true` – wtedy brane jest najnowsze wydanie z listy.
Gdy GitHub ograniczy liczbę zapytań (60 na godzinę bez logowania), okno pokazuje komunikat i link do strony wydań.

## Muzyka

`data/music.json` wygenerowano z listy `trackLibrary` w `muzyka/player.js` starej strony (tytuł, wykonawca, kolor)
i z listy plików `muzyka/utwory/muzyka/` w repo (nazwy plików z poprawionym kodowaniem; utwory spoza listy dostały
tytuł z nazwy pliku). Adres pliku = `https://snakex21.github.io/snakex21/` + `base` + zakodowana nazwa. Nowy utwór = nowy
wpis `{ "title": "…", "artist": "…", "file": "nazwa.mp3", "accent": "#rrggbb" }`. Odtwarzacz pamięta ostatni utwór,
pozycję, głośność, losowanie i powtarzanie (`pulpit:music:state`), gra dalej po zminimalizowaniu, obsługuje klawisze
multimedialne (Media Session) oraz Spację, strzałki (przewijanie ±5 s, głośność) i PageUp / PageDown (poprzedni / następny).

## Gry i narzędzia

`data/games.json` i `data/tools.json` wygenerowano z katalogów starej strony (`assets/js/games-data.js`,
`assets/workshop/tools-data.js` oraz folderów `gry/` i `Programy/`). Nowa gra/narzędzie = nowy wpis
`{ "slug": "…", "title": "…", "description": "…", "path": "gry/folder/plik.html" }` (ścieżka względem starej strony).

Ikona = `icons/games/<slug>.svg` albo `icons/tools/<slug>.svg` (własny rysunek SVG, `viewBox="0 0 48 48"`, ciemny kontur
`#1f2430` i jasne wypełnienia, żeby był czytelny na jasnym i ciemnym tle, także w 16 px). Pokazuje się w oknach Gry /
Narzędzia (widoki „Duże ikony” / „Szczegóły”), w menu Start, na ekranie Start (8 / 8.1), w Menedżerze programów (3.1),
w launcherze (2.0), w pasku tytułu i na pasku zadań okna gry. Bez sluga albo pliku widać kafelek z inicjałami
(`tile()` w `js/util.js`). Trzy wersje Ponga są połączone w grę „Ping-pong” (slug `pong`, ikona z rakietką i piłką),
a dwa kółka i krzyżyki w `tic-tac-toe`; dawne adresy na starej stronie przekierowują do połączonych gier.

## LinkHub

`js/apps/linkhub.js` – okno jak Ulubione / Eksplorator: drzewo kategorii (foldery) po lewej, lista linków po prawej
w widoku „Szczegóły” (ikona, nazwa, domena, data dodania, tagi; klik w nagłówek kolumny sortuje) albo „Ikony”,
wyszukiwarka filtrująca przy każdym znaku, sortowanie, „Otwórz” (nowa karta), „Kopiuj link”, link do starego LinkHub.
Lista jest wirtualna: w DOM są tylko widoczne wiersze (kilka tysięcy linków przewija się płynnie). Wysokość wiersza
i rozmiar kafelka motyw może zmienić zmiennymi `--lh-row`, `--lh-tile-w`, `--lh-tile-h` na `.lh-scroll`.

Dane nie są kopiowane: okno pobiera `LinkHub/data.js` ze starej strony i wyciąga z niego literały JSON stałych
`LINKHUB_CATEGORIES` i `LINKHUB_LINKS` (skrypt nie jest wykonywany). Ten plik dopisuje klasyfikator z GitHub Actions
starej strony (`.github/workflows/classify-link.yml` → `.github/scripts/classify_link.py`, zapis `json.dumps`),
więc nowe linki pojawiają się tu bez zmian w pulpicie. Pole `tags` (tablica napisów) w linku jest opcjonalne – jeśli
klasyfikator zacznie je zapisywać, pokażą się obok kategorii. Ikony stron (przełącznik „Ikony stron”, domyślnie wyłączony)
pochodzą z usługi DuckDuckGo – po włączeniu domeny linków trafiają do zewnętrznego serwera, a strony bez ikony
zostawiają w konsoli błąd 404 (w ich miejscu widać zwykłą ikonę).

## Filmy

`js/apps/filmy.js` + `css/filmy.css` – katalog filmów: siatka plakatów albo lista, wyszukiwarka, filtry (gatunek,
dekada, typ, status), sortowanie, panel szczegółów (opis kolekcji, wstęp z Wikipedii, przyciski „Zwiastun” – wyszukiwanie
w YouTube, „Gdzie obejrzeć” – `https://www.justwatch.com/pl/search?q=…`, „Wikipedia”). Na wąskim oknie szczegóły
zasłaniają listę (przycisk „‹ Lista”, Esc).

`data/films.json` wygenerowano z `assets/js/movies-data.js` starej strony: tylko metadane (tytuł, oryginalny tytuł, rok,
gatunki, typ film/serial, kolekcja z opisem, nastrojem i tagami, kolejność w kolekcji). Linki do odtwarzaczy i plakaty
z filman.cc / fwcdn **nie** zostały przeniesione. Pole `wiki` (`{ "pl": "…", "en": "…" }`) to tytuły stron Wikipedii
sprawdzone przy generowaniu (rok w opisie strony, bez ujednoznacznień). Plakat okno bierze z miniatury strony en
(`/api/rest_v1/page/summary/…`; artykuły o filmach mają tam plakat), opis – z pl; bez miniatury widać własny plakat
(gradient, tytuł, rok). Odpowiedzi Wikipedii są w `localStorage` (`pulpit:filmy:posters`, 30 dni, brak wyniku – 7 dni),
plakaty ładują się dopiero, gdy są widoczne. Nowy film w katalogu = nowy wpis w `films` (unikalne `id`, `year` jako liczba).

Dane użytkownika (`pulpit:filmy:user`): obejrzane (data), ocena 1–10, notatki, „Do obejrzenia”, ulubione oraz filmy
dodane przyciskiem „Dodaj film” (tylko w tej przeglądarce; stronę Wikipedii okno szuka po tytule i roku).
„Eksport” zapisuje je do pliku JSON (`{ "app": "pulpit-filmy", "version": 1, "items": {…}, "custom": […] }`),
„Import” dołącza dane z takiego pliku (wpisy o tym samym `id` są nadpisywane).

## Motyw w oknach gier i narzędzi

`js/apps/webview.js` dokleja do adresu ramki `?theme=<id>&variant=light|dark` i po wczytaniu oraz przy każdej zmianie
motywu wysyła do ramki `postMessage({ type: 'pulpit:theme', theme, variant })` (tylko do pochodzenia starej strony).
Strona w ramce może poprosić o motyw wiadomością `{ type: 'pulpit:theme-request' }`. Ciemny wariant dostają tylko
motywy z wariantami w themes.json (Windows 11). Odbiorca po stronie starej witryny: `assets/pulpit-theme/pulpit-theme.js`
(+ `.css`), dołączany jedną linią `<script>` w stronach gier i narzędzi.

## Menu kontekstowe

`js/contextmenu.js` to jeden komponent dla wszystkich motywów (wygląd w `css/contextmenu.css`). Program podpina własne menu
przez `bindMenu(element, provider)` – provider dostaje `{ target, el, event, keyboard }` i zwraca listę pozycji,
`null` (szukaj wyżej w drzewie) albo `false` (zostaw menu przeglądarki). Pozycja: `{ label, run, icon?, glyph?, shortcut?,
disabled?, type: 'check' | 'radio', checked?, default? (pogrubiona), submenu? (lista, funkcja albo Promise) }` lub `'sep'`.
Gotowe zestawy w `js/menus.js`: `itemMenu(it)` (Otwórz / Otwórz w nowej karcie / Właściwości), `programMenu(prog)`,
`showProperties({ name, icon, type, url, description, extra })`. Przykłady: `catalog.js`, `programs.js`, `linkhub.js`, `music.js`, `progman.js`.

Menu przeglądarki zostaje w polach tekstowych, w ramkach gier / narzędzi (iframe) i w zwykłej treści okien; Shift + prawy przycisk
zawsze otwiera menu przeglądarki. Menu systemowe okna: prawy przycisk na pasku tytułu, klik w ikonę okna (dwuklik zamyka),
Alt+Spacja; w 2.0 / 3.1 także pole po lewej stronie paska tytułu. „Przenieś” / „Rozmiar”: strzałki (z Ctrl co 1 px), Enter zatwierdza, Esc cofa.

## Dostępność

- Tab przechodzi między ikonami pulpitu (jedna w kolejce, strzałki zmieniają zaznaczenie), paskiem zadań i oknami.
- Enter otwiera zaznaczoną ikonę, Esc zamyka menu Start (lub otwarte podmenu), strzałki poruszają się po menu.
- Okna zamyka się przyciskiem w pasku tytułu (skróty przeglądarki nie są przechwytywane).
- `prefers-reduced-motion` wyłącza animacje (także żywe kafelki i przesuwanie okien w układzie kafelkowym).
  Na wąskich ekranach pulpit działa jak prosty launcher, a okna zajmują cały ekran; w motywach bez paska zadań
  okna kończą się nad rzędem ikon zminimalizowanych okien, a ekran Start układa kafelki w 4 kolumnach.
- Bardzo stare przeglądarki (bez modułów ES) i wyłączony JavaScript dostają krótki komunikat.
