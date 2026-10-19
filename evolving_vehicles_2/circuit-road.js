/* Display-only road ribbon. Physics/source points remain untouched. Asphalt,
 * curbs and terrain must share these exact edges, including the closing seam. */
(function (root) {
  'use strict';
  const POSE = root.DrivingPose || (typeof require === 'function' ? require('./driving-pose.js') : null);
  const MAX_SPAN = 8, MAX_TURN = 2.5 * Math.PI / 180, MAX_ERROR = .025;
  const MAX_EDGES = 65536, MAX_DEPTH = 12;
  const mod = (v, n) => ((v % n) + n) % n;
  const turn = a => Math.atan2(Math.sin(a), Math.cos(a));
  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const point = (x, y, z) => ({ x, y, z });
  function chordError(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / (dx * dx + dy * dy + dz * dz || 1)));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy, p.z - a.z - t * dz);
  }
  function build(track) {
    const source = track?.points, length = track?.centerlineLength || track?.length, width = track?.width;
    if (!Array.isArray(source) || source.length < 3 || source.length > 8192 || !Number.isFinite(length) || length < 20 || length > 100000 ||
      !Number.isFinite(width) || width < 1 || width > 30 || source.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.z != null && !Number.isFinite(p.z)))
      throw new TypeError('CircuitRoad requires a finite, built centreline and road width.');
    if (!POSE?.sample) throw new Error('Load driving-pose.js before circuit-road.js.');
    const spacing = length / source.length, half = width / 2, curb = Math.min(1.1, width * .065), outer = half + curb;
    // Never use race.track.length here: for a running race it can describe the
    // shorter racing line, whereas track.points always describes the road.
    const owner = { pathPoints: source, track: { ...track, length, spacing } };
    const sample = s => POSE.sample(owner, s);
    function edge(p, s, index = Math.floor(mod(s, length) / spacing)) {
      const nx = -Math.sin(p.angle), ny = Math.cos(p.angle), z = p.z || 0;
      const at = d => point(p.x + nx * d, p.y + ny * d, z);
      return { left: at(-half), right: at(half), outerLeft: at(-outer), outerRight: at(outer), p, index, s };
    }
    let maximumOffsetCurvature = 0;
    // An offset curve reverses when |curvature| * offset reaches one. The
    // imported Pocheon course has such a turn at the estimated 14 m width.
    // Preserve the existing whole-course ribbon there instead of introducing
    // a new inward loop, changing physics, or silently narrowing the road.
    const probes = Math.ceil(length);
    for (let i = 0; i < probes; i++) maximumOffsetCurvature = Math.max(maximumOffsetCurvature, Math.abs(sample(length * i / probes).curvature) * outer);
    if (maximumOffsetCurvature >= .98) {
      const step = source.length > 1300 ? 2 : 1, edges = [];
      for (let i = 0; i < source.length; i += step) {
        const a = source[mod(i - 1, source.length)], b = source[(i + 1) % source.length], p = source[i];
        const pose = { ...p, angle: Math.atan2(b.y - a.y, b.x - a.x) };
        edges.push(edge(pose, i * spacing, i));
      }
      return { edges, points: edges.map(e => e.p), sample: s => {
        const u = mod(s, length) / spacing, i = Math.floor(u), t = u - i, a = source[i], b = source[(i + 1) % source.length];
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * t,
          angle: Math.atan2(b.y - a.y, b.x - a.x), s: mod(s, length) };
      }, stats: { method: 'legacy-offset-fallback', fallbackReason: 'source-turn-tighter-than-road-width',
        sourcePointCount: source.length, edgeCount: edges.length, maximumOffsetCurvature, originOffsetM: 0 } };
    }
    const memo = new Map(), edges = [];
    function at(s) {
      if (!memo.has(s)) memo.set(s, edge(sample(s), s));
      return memo.get(s);
    }
    let maximumChordError = 0, maximumTangentTurn = 0, maximumSpan = 0;
    function divide(from, to, depth) {
      const span = to - from, a = at(from), b = at(to), probes = [a, at(from + span / 4), at(from + span / 2), at(from + span * .75), b];
      let rotation = 0, error = 0;
      for (let i = 1; i < probes.length; i++) rotation += Math.abs(turn(probes[i].p.angle - probes[i - 1].p.angle));
      for (const p of probes.slice(1, -1)) for (const side of ['outerLeft', 'p', 'outerRight']) error = Math.max(error, chordError(p[side], a[side], b[side]));
      if (rotation > MAX_TURN || error > MAX_ERROR) {
        if (depth >= MAX_DEPTH) throw new RangeError('Road tessellation cannot meet the bounded curve tolerance.');
        const middle = from + span / 2; divide(from, middle, depth + 1); divide(middle, to, depth + 1); return;
      }
      if (edges.length >= MAX_EDGES) throw new RangeError('Road tessellation exceeds its geometry budget.');
      edges.push(a); maximumChordError = Math.max(maximumChordError, error); maximumTangentTurn = Math.max(maximumTangentTurn, rotation); maximumSpan = Math.max(maximumSpan, span);
    }
    const sections = Math.ceil(length / MAX_SPAN);
    for (let i = 0; i < sections; i++) divide(length * i / sections, length * (i + 1) / sections, 0);
    const originOffsetM = distance(edges[0].p, { ...source[0], z: source[0].z || 0 });
    memo.clear(); // Quarter-point probes are build scratch, not persistent geometry.
    return { edges, points: edges.map(e => e.p), sample,
      stats: { method: 'adaptive-c2-centreline', fallbackReason: null, sourcePointCount: source.length, edgeCount: edges.length,
        maximumOffsetCurvature, maximumChordErrorM: maximumChordError, maximumTangentTurnRad: maximumTangentTurn,
        maximumSpanM: maximumSpan, chordToleranceM: MAX_ERROR, turnToleranceRad: MAX_TURN, originOffsetM,
        deviationBoundM: POSE.info(owner)?.deviationBoundM, elevationDeviationBoundM: POSE.info(owner)?.elevationDeviationBoundM } };
  }
  const api = { build };
  root.CircuitRoad = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
