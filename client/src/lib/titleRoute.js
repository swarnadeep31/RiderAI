// Reads where a trip starts and ends from a video's title:
// "Kolkata to Ladakh | EP1 Kolkata to Dehri" ->
// [{ from: 'Kolkata', to: 'Ladakh' }, { from: 'Kolkata', to: 'Dehri' }].
// Only suggestions: the owner picks one and finds both places on the map.

// Between the parts of a title: | · • : ( ) [ ] , ! ? # quotes, and emoji.
const PART_BREAK = /[|·•:()[\]{},!?#"“”]|\p{Extended_Pictographic}/u;
// Between the places in a part: "to", Hindi "se", Bengali "theke", arrows, a spaced dash.
const WAY_BREAK = /\s+(?:to|se|theke|till)\s+|\s*(?:->|→|⟶|⇒|➡️?)\s*|\s+[-–—]\s+/iu;

// Words around the places that aren't part of their names.
const NOISE = new Set(
  `a an the my our your his her their i we me us first solo ride rides riding rider road roads trip trips roadtrip tour
  journey travel travelling traveling vlog vlogs bike bikes motorcycle motorbike scooter car cycle cycling bicycle on by
  via in from with and of for part ep episode day days night nights km kms full complete video highway expressway loop
  hindi bengali english series final last how why what when going go way back return epic best most dangerous beautiful
  amazing finally reached reaching start starting started tak ki ka ke se is are was live`.split(/\s+/),
);
const isNoise = (word) => NOISE.has(word.toLowerCase()) || /^(?:ep|day|part|vol)?\.?\d+[a-z]*$/i.test(word);

// "LADAKH" or "ladakh" -> "Ladakh"; "New Delhi" stays as it is.
const tidy = (word) => (word === word.toUpperCase() || word === word.toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word);

// Up to 3 words of a name: the last ones of `text` (atEnd) or the first ones.
// In a title with capitals, names start with one ("Goa coastal ride": Goa).
function nameIn(text, atEnd, capitalised) {
  const words = text
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);
  if (atEnd) words.reverse();
  const name = [];
  for (const word of words) {
    if (isNoise(word) || name.length === 3 || (capitalised && !/^\p{Lu}|^\d/u.test(word))) break;
    name.push(tidy(word));
  }
  if (atEnd) name.reverse();
  return name.join(' ');
}

export function routesInTitle(title) {
  const text = String(title ?? '');
  const capitalised = text !== text.toUpperCase() && text !== text.toLowerCase();
  const routes = [];
  for (const part of text.split(PART_BREAK)) {
    const pieces = part.split(WAY_BREAK);
    if (pieces.length < 2) continue;
    // The first piece that names a place, and the last one after it.
    let from = '';
    let first = 0;
    for (; first < pieces.length - 1 && !from; first++) from = nameIn(pieces[first], true, capitalised);
    let to = '';
    for (let last = pieces.length - 1; last >= first && !to; last--) to = nameIn(pieces[last], false, capitalised);
    if (from && to && !routes.some((r) => r.from.toLowerCase() === from.toLowerCase() && r.to.toLowerCase() === to.toLowerCase())) {
      routes.push({ from, to });
    }
  }
  return routes.slice(0, 4);
}
