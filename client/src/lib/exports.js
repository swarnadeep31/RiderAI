// Ways for viewers to take a trail with them: links and downloadable files.

export const googleMapsUrl = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
export const youtubeUrlAt = (youtubeId, seconds) => `https://youtu.be/${youtubeId}?t=${Math.floor(seconds)}`;

const XML_ESCAPES = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' };
const escapeXml = (text) => String(text).replace(/[<>&'"]/g, (c) => XML_ESCAPES[c]);

// GPX works with GPS apps and devices: Garmin, OsmAnd, Gaia GPS, Komoot...
export function toGpx(trail) {
  const start = trail.recordedAt && trail.trackTimes?.length ? Date.parse(trail.recordedAt) : null;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="TrailCast" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><name>${escapeXml(trail.title)}</name></metadata>`,
  ];
  for (const p of trail.points) {
    lines.push(`  <wpt lat="${p.lat}" lon="${p.lng}">`, `    <name>${escapeXml(p.name)}</name>`);
    if (p.note) lines.push(`    <desc>${escapeXml(p.note)}</desc>`);
    lines.push(`    <link href="${escapeXml(youtubeUrlAt(trail.youtubeId, p.time))}"><text>Watch this moment</text></link>`);
    lines.push('  </wpt>');
  }
  if (trail.track.length > 0) {
    lines.push('  <trk>', `    <name>${escapeXml(trail.title)}</name>`, '    <trkseg>');
    trail.track.forEach(([lat, lng], i) => {
      const time = start === null ? '' : `<time>${new Date(start + trail.trackTimes[i] * 1000).toISOString()}</time>`;
      lines.push(`      <trkpt lat="${lat}" lon="${lng}">${time}</trkpt>`);
    });
    lines.push('    </trkseg>', '  </trk>');
  }
  lines.push('</gpx>', '');
  return lines.join('\n');
}

// KML can be imported into Google My Maps and Google Earth.
export function toKml(trail) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    '  <Document>',
    `    <name>${escapeXml(trail.title)}</name>`,
  ];
  for (const p of trail.points) {
    const description = [p.note, `Watch: ${youtubeUrlAt(trail.youtubeId, p.time)}`].filter(Boolean).join('\n');
    lines.push(
      '    <Placemark>',
      `      <name>${escapeXml(p.name)}</name>`,
      `      <description>${escapeXml(description)}</description>`,
      // KML puts longitude first.
      `      <Point><coordinates>${p.lng},${p.lat}</coordinates></Point>`,
      '    </Placemark>',
    );
  }
  if (trail.track.length > 0) {
    const coordinates = trail.track.map(([lat, lng]) => `${lng},${lat}`).join(' ');
    lines.push(
      '    <Placemark>',
      `      <name>${escapeXml(trail.title)} (route)</name>`,
      `      <LineString><tessellate>1</tessellate><coordinates>${coordinates}</coordinates></LineString>`,
      '    </Placemark>',
    );
  }
  lines.push('  </Document>', '</kml>', '');
  return lines.join('\n');
}

// "Manali to Rohtang!" -> "manali-to-rohtang.gpx"
export function fileNameFor(title, extension) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'trail'}.${extension}`;
}

export function downloadFile(fileName, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: fileName });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
