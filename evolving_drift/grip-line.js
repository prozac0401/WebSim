/* Open-course, bounded lateral racing-line candidates. This minimizes a
 * discrete bending/length objective, not lap time or a closed-loop seam.
 * Only subsequent full vehicle simulations determine the selected record. */
(function (root) {
  'use strict';
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
  const length = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  function optimizeOffsets(track, vehicle) {
    const spec = vehicle.physics || vehicle;
    const count = Math.ceil(track.length / 5) + 1, spacing = track.length / (count - 1);
    const anchors = Array.from({ length: count }, (_, index) => {
      const point = track.sample(index * spacing);
      return { ...point, nx: -Math.sin(point.heading), ny: Math.cos(point.heading), offset: 0 };
    });
    const allowance = Math.max(0, Math.min(3.8, track.width / 2 - spec.widthM / 2 - 1.5));
    const bounds = anchors.map(point => {
      const taper=smooth((point.s-35)/55)*smooth((track.length-point.s-25)/55);
      return {left:Math.max(0,Math.min(allowance,(point.widthLeft??track.width/2)-spec.widthM/2-1.5))*taper,
        right:Math.max(0,Math.min(allowance,(point.widthRight??track.width/2)-spec.widthM/2-1.5))*taper};
    });
    const position = index => {
      const p = anchors[index];
      return { x: p.x + p.nx * p.offset, y: p.y + p.ny * p.offset };
    };
    // Coordinate descent on sum |p[i-1]-2p[i]+p[i+1]|^2 plus a small
    // travelled-distance term. Endpoints and their neighbours stay fixed.
    // No modular indexing: the finish is never connected back to the start.
    const lengthWeight = .018;
    for (let iteration = 0; iteration < 700; iteration++) {
      const forward = iteration % 2 === 0;
      for (let j = 2; j < count - 2; j++) {
        const i = forward ? j : count - 1 - j, p = anchors[i];
        const a = position(i - 2), b = position(i - 1), c = position(i), d = position(i + 1), e = position(i + 2);
        const gx = a.x - 4 * b.x + 6 * c.x - 4 * d.x + e.x + lengthWeight * (2 * c.x - b.x - d.x);
        const gy = a.y - 4 * b.y + 6 * c.y - 4 * d.y + e.y + lengthWeight * (2 * c.y - b.y - d.y);
        const change = -(gx * p.nx + gy * p.ny) / (6 + 2 * lengthWeight);
        p.offset = clamp(p.offset + change * .85, -bounds[i].right, bounds[i].left);
      }
    }
    return { anchors, spacing, allowance };
  }

  function makeLine(track, optimized, scale, id) {
    const { anchors, spacing } = optimized;
    const offsetAt = s => {
      const u = clamp(s / spacing, 0, anchors.length - 1);
      const i = Math.min(anchors.length - 2, Math.floor(u)), t = u - i;
      const a = anchors[i].offset, b = anchors[i + 1].offset;
      let da = i ? (b - anchors[i - 1].offset) / 2 : 0;
      let db = i + 2 < anchors.length ? (anchors[i + 2].offset - a) / 2 : 0;
      const delta = b - a;
      // Monotone Hermite slopes avoid overshooting the hard lateral bounds
      // between optimized anchors, without clipping a finished path segment.
      if (Math.abs(delta) < 1e-12) da = db = 0;
      else {
        if (da * delta <= 0) da = 0;
        if (db * delta <= 0) db = 0;
        const norm = Math.hypot(da / delta, db / delta);
        if (norm > 3) { da *= 3 / norm; db *= 3 / norm; }
      }
      return scale * ((2 * t ** 3 - 3 * t ** 2 + 1) * a + (t ** 3 - 2 * t ** 2 + t) * da +
        (-2 * t ** 3 + 3 * t ** 2) * b + (t ** 3 - t ** 2) * db);
    };
    const points = track.points.map(center => {
      const offset = offsetAt(center.s);
      const x=center.x-Math.sin(center.heading)*offset,y=center.y+Math.cos(center.heading)*offset;
      const ground=typeof track.surface==='function'?track.surface(x,y,center.s):null;
      return { x,y,z:ground?.z??center.z??0,grade:center.grade??0,bank:center.bank??0,
        s: center.s, offset, heading: center.heading, curvature: center.curvature };
    });
    const span = Math.max(1, Math.round(3 / (points[1].s - points[0].s)));
    for (let i = 0; i < points.length; i++) {
      const p = points[i], a = points[Math.max(0, i - span)], b = points[Math.min(points.length - 1, i + span)];
      p.heading = Math.atan2(b.y - a.y, b.x - a.x);
      p.grade=(b.z-a.z)/(length(a,b)||1);
      const denominator = length(a, p) * length(p, b) * length(a, b);
      p.curvature = denominator > 1e-9 ? 2 * ((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / denominator : 0;
    }
    const sample = s => {
      s = clamp(s, 0, track.length);
      let low = 0, high = points.length - 1;
      while (low + 1 < high) { const mid = (low + high) >> 1; if (points[mid].s <= s) low = mid; else high = mid; }
      const a = points[low], b = points[high], t = (s - a.s) / Math.max(1e-9, b.s - a.s);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s,
        z:a.z+(b.z-a.z)*t,grade:a.grade+(b.grade-a.grade)*t,bank:a.bank+(b.bank-a.bank)*t,
        curvature: a.curvature + (b.curvature - a.curvature) * t,
        heading: a.heading + Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading)) * t };
    };
    const pathLength = points.slice(1).reduce((sum, p, i) => sum + length(points[i], p), 0);
    return { id, points, sample, pathLength, closed: false, offsetScale: scale,
      maxOffset: Math.max(...points.map(p => Math.abs(p.offset))),
      bendingEnergy: points.reduce((sum, p) => sum + p.curvature ** 2, 0) / points.length };
  }

  function candidates(track, vehicle) {
    const optimized = optimizeOffsets(track, vehicle);
    return [makeLine(track, optimized, 0, 'center'), makeLine(track, optimized, .65, 'bounded-bend-65'),
      makeLine(track, optimized, 1, 'bounded-bend-100')];
  }

  const api = Object.freeze({ candidates, optimizeOffsets });
  root.DriftGripLine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
