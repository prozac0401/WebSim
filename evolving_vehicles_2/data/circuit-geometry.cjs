'use strict';
const crypto = require('node:crypto');
const MAX_SPACING_M = 75;
function distance(a, b) {
  const rad = Math.PI / 180, dlat = (b[1] - a[1]) * rad, dlon = (b[0] - a[0]) * rad;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dlon / 2) ** 2;
  return 2 * 6371008.8 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
function coordinatesFromGeoJSON(raw) {
  const geometry = raw.type === 'Feature' ? raw.geometry : raw.features[0].geometry;
  if (geometry.type !== 'LineString') throw new Error('Expected a LineString centreline.');
  const coordinates = geometry.coordinates.map(p => p.slice(0, 2));
  if (coordinates.length < 3 || coordinates.some(p => p.length !== 2 || !p.every(Number.isFinite))) throw new Error('Invalid centreline coordinates.');
  if (coordinates[0][0] !== coordinates.at(-1)[0] || coordinates[0][1] !== coordinates.at(-1)[1]) throw new Error('Source centreline must already be closed.');
  return coordinates;
}
function densify(coordinates, maxSpacingM = MAX_SPACING_M) {
  if (!Number.isFinite(maxSpacingM) || maxSpacingM <= 0) throw new Error('Invalid sampling interval.');
  const result = [[...coordinates[0]]];
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1], b = coordinates[i], parts = Math.max(1, Math.ceil(distance(a, b) / maxSpacingM));
    for (let n = 1; n < parts; n++) result.push([a[0] + (b[0] - a[0]) * n / parts, a[1] + (b[1] - a[1]) * n / parts]);
    result.push([...b]); // preserve every original vertex exactly and in order
  }
  return result;
}
const coordinateHash = coordinates => crypto.createHash('sha256').update(JSON.stringify(coordinates)).digest('hex');
module.exports = { MAX_SPACING_M, distance, coordinatesFromGeoJSON, densify, coordinateHash };
