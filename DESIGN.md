# TrailCast design system

Every ride is a map sheet, printed the way the Survey of India prints a valley. The look is built in `client/src/index.css` (tokens and utilities) and `client/src/components/art/Sheet.jsx` (the drawings). See `PRODUCT.md` for who it's for, and `.impeccable/briefs/site.md` for the direction.

## Inks

Each colour has one job, by day and by night (the `dark` class on `<html>`; the site follows the device until the visitor picks).

| Token | Day | Night | Job |
|---|---|---|---|
| `paper` | #fbfcf9 | #12171b | The sheet: the page ground |
| `surface` / `surface-2` | #f1f4ec / #e4e9dc | #192025 / #232c32 | Quiet panels (editing tools), hover |
| `field` | #dbe8cd | #1b2a21 | Forest tint: whole bands (the legend, the footer), the valley on the sketch map |
| `ink` / `ink-soft` | #1b1d19 / #4a5047 | #edf0e8 / #aab3a6 | Text and lines; secondary text |
| `road` | #c8261c | #f0584a | The route, and the main action (buttons). Also deleting and errors |
| `contour` | #93491f | #e59c6c | Heights: contours, the cross-section, spot heights |
| `water` | #1d5c9c | #72adf0 | The rider's moment in the video, AI-found places, focus rings |
| `water-tint` | #d7e6f4 | #1a3046 | Notices, selections, the "Night" tag |
| `forest` | #2f6b3a | #8fd19e | Success (a GPS file read, a saved change) |

Services along a route keep their own colours and letters (`lib/services.js`): fuel F, mechanics M, medical +, ATMs ₹.

## Type

- **Khand** (Indian Type Foundry), 500 and 600: sheet titles and headings. Section headings and page titles are in capitals; a ride's own title is in sentence case.
- **Mukta** (Ek Type), 400 to 700: everything else.
- Both are served from the site (`@fontsource`), so the Content-Security-Policy stays `'self'`.
- Sizes: `text-small` 14 px, `text-body` 17 px, `text-lead` 21 px, `text-title` 28 to 42 px, `text-display` 40 to 74 px.
- `margin-text`: Khand capitals for a sheet's margin lettering (sheet name, scale, the labels under numbers). It never sits as a label above a heading.

## Parts

- **Buttons** (`btn-primary`, `btn-secondary`, `btn-ghost`, `btn-danger`, `btn-ai`, `btn-small`): square-cornered (3 px), one ink each. Red is the way on.
- **Neatline** (`neatline`): the double frame round a map, as on a printed sheet. Only maps get it.
- **Sheet** (`sheet`): a piece of the page with a fine edge and no shadow.
- **Section headings** (`SectionHeading`): capitals over a 2 px ink rule, with a figure on the right ("5 places").
- **Readouts** (`TripStats`, `Readout`): a big Khand figure over a margin label; the highest point and the longest stretch without fuel are buttons.
- **Gazetteer** (`KeyPointList`): numbered places in ink circles (red while the video is there), each with its moment in water blue.
- **Legend toggles** (`ServicesPanel`): each service's symbol, name and count; pressed ones are outlined in ink.
- **Tags** (`tag`): small Khand capitals on a tint: the activity, where the route came from.
- **Forms** (`input`, `field`, `field-label`, `hint`): square, a 1.5 px edge that turns water blue on focus.
- **Scale bar** (`scale-range`): a range input drawn as black and white segments with a water-blue handle. On the home page it's the sample video's timeline.

## Drawings

- `LogoMark`: a tiny sheet with contours, the road and the rider.
- `SheetMap`: the home page's sketch of the Manali to Rohtang road (made-up terrain shaped like the valley, generated into `sheetMap.js`). Pins drop as the rider passes; `progress` steers it, `useAutoRide` rides it.
- The Leaflet map: tiles softened with a CSS filter by day and inverted at night; the route is red edged in ink; places are `.map-point` circles; the rider is the water-blue dot.

## Rules

- No labels above headings, no 01/02/03 numbering, no rows of identical icon cards, no gradient text, no decorative glass or blur, no emoji or text symbols as icons (use `Icon`).
- Text on colour uses that colour's own ink (`text-paper` on `bg-ink`, never fixed white), so it reads at night too.
- Motion: one authored moment (the ride on the sheet); entrances use `animate-rise` once. All of it respects reduced motion.
- New outside sources (images, scripts, fonts) must be added to the Content-Security-Policy in `client/vercel.json`.
