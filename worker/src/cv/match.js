// Compares small grayscale crops of the gear indicator.
//
// The score is normalised cross-correlation: 1 means the same picture, 0
// means unrelated. It ignores overall brightness and contrast, so a display
// in shade still matches a template captured in sunlight.

function correlationAt(a, b, w, h, dx, dy) {
  // Compare a(x, y) with b(x - dx, y - dy) over the area where they overlap.
  const x0 = Math.max(0, dx);
  const x1 = Math.min(w, w + dx);
  const y0 = Math.max(0, dy);
  const y1 = Math.min(h, h + dy);
  let n = 0;
  let sa = 0;
  let sb = 0;
  let saa = 0;
  let sbb = 0;
  let sab = 0;
  for (let y = y0; y < y1; y++) {
    const rowA = y * w;
    const rowB = (y - dy) * w - dx;
    for (let x = x0; x < x1; x++) {
      const va = a[rowA + x];
      const vb = b[rowB + x];
      n += 1;
      sa += va;
      sb += vb;
      saa += va * va;
      sbb += vb * vb;
      sab += va * vb;
    }
  }
  const varA = n * saa - sa * sa;
  const varB = n * sbb - sb * sb;
  // A flat image (display off, covered by a hand) matches nothing.
  if (varA <= 0 || varB <= 0) return 0;
  return (n * sab - sa * sb) / Math.sqrt(varA * varB);
}

// Best correlation when `b` is moved up to `maxShift` pixels in any
// direction, so a little camera shake doesn't break the match.
export function matchScore(a, b, w, h, maxShift) {
  let best = -1;
  for (let dy = -maxShift; dy <= maxShift; dy++) {
    for (let dx = -maxShift; dx <= maxShift; dx++) {
      const score = correlationAt(a, b, w, h, dx, dy);
      if (score > best) best = score;
    }
  }
  return best;
}

// Returns the gear whose template looks most like `pixels`, or gear: null
// when nothing matches well enough (glare, a hand, motion blur).
export function classify(pixels, templates, size, { maxShift, minScore }) {
  let gear = null;
  let score = -Infinity;
  for (const template of templates) {
    const s = matchScore(pixels, template.pixels, size.w, size.h, maxShift);
    if (s > score) {
      score = s;
      gear = template.gear;
    }
  }
  return score >= minScore ? { gear, score } : { gear: null, score };
}
