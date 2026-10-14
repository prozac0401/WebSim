'use strict';
const fs = require('node:fs');
const path = require('node:path');
const data = require('./korea-raceways.raw.json');
const ids = [240199084, 671420801, 671420803, 671420804, 240211101, 530969647, 651693293, 1104425413, 1104429543, 861244821];
const distance = (a, b) => Math.hypot((a.lon - b.lon) * 111195 * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180), (a.lat - b.lat) * 111195);
let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1400"><rect width="100%" height="100%" fill="white"/>';
ids.forEach((id, n) => {
  const e = data.elements.find(x => x.id === id), points = e.geometry;
  let metres = 0;
  for (let i = 1; i < points.length; i++) metres += distance(points[i - 1], points[i]);
  console.log(JSON.stringify({ id, geometryLengthM: +metres.toFixed(1), points: points.length, bounds: e.bounds }));
  const bx = n % 2 * 500, by = Math.floor(n / 2) * 280, b = e.bounds;
  const lat = (b.minlat + b.maxlat) / 2, cosine = Math.cos(lat * Math.PI / 180);
  const scale = Math.min(440 / ((b.maxlon - b.minlon) * cosine), 230 / (b.maxlat - b.minlat));
  svg += `<text x="${bx + 20}" y="${by + 22}" font-family="sans-serif" font-size="16">${id}: ${metres.toFixed(1)}m</text><path fill="none" stroke="#357260" stroke-width="3" d="${points.map((p,i) => `${i?'L':'M'}${(bx+20+(p.lon-b.minlon)*cosine*scale).toFixed(2)},${(by+40+(b.maxlat-p.lat)*scale).toFixed(2)}`).join(' ')}"/>`;
});
fs.writeFileSync(path.join(__dirname, 'geometry-review.svg'), svg + '</svg>');
