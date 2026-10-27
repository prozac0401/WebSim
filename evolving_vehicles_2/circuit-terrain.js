/* Illustrative, road-constrained terrain. This is a render envelope, not a
 * surveyed DEM or evidence of retaining walls. Source/physics heights stay
 * untouched: callers pass the already transformed display track. */
(function (root) {
  'use strict';
  const CLEARANCE = .07, EPS = 1e-7, STITCH_EPS = 3e-6;
  const point = (x, y, z) => ({ x, y, z });
  const cross = (a, b, p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  const boundsOf = vertices => ({ minX: Math.min(...vertices.map(p => p.x)), maxX: Math.max(...vertices.map(p => p.x)),
    minY: Math.min(...vertices.map(p => p.y)), maxY: Math.max(...vertices.map(p => p.y)) });
  const overlap = (a, b) => a.minX <= b.maxX + EPS && a.maxX >= b.minX - EPS && a.minY <= b.maxY + EPS && a.maxY >= b.minY - EPS;
  const area = p => p.reduce((sum, a, i) => sum + a.x * p[(i + 1) % p.length].y - a.y * p[(i + 1) % p.length].x, 0) / 2;
  function clean(poly) {
    const out = [];
    for (const p of poly) if (!out.length || Math.hypot(p.x - out.at(-1).x, p.y - out.at(-1).y) > EPS) out.push(p);
    if (out.length > 1 && Math.hypot(out[0].x - out.at(-1).x, out[0].y - out.at(-1).y) <= EPS) out.pop();
    return out.length >= 3 && Math.abs(area(out)) > 1e-9 ? out : [];
  }
  // Partition a convex polygon at a line. Both halves share the exact cut point.
  function split(poly, a, b) {
    const inside = [], outside = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], u = cross(a, b, p), v = cross(a, b, q);
      if (u >= -EPS) inside.push(p);
      if (u <= EPS) outside.push(p);
      if (u > EPS && v < -EPS || u < -EPS && v > EPS) {
        const t = u / (u - v), cut = point(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t);
        inside.push(cut); outside.push(cut);
      }
    }
    return [clean(inside), clean(outside)];
  }
  function subtract(poly, cutter) {
    if (!overlap(boundsOf(poly), cutter.bounds)) return [poly];
    // Avoid unnecessary partitions along a cutter's infinite edge extensions.
    if (cutter.vertices.some((a, i) => poly.every(p => cross(a, cutter.vertices[(i + 1) % 3], p) < -EPS))) return [poly];
    const out = []; let remaining = poly;
    for (let i = 0; i < 3 && remaining.length; i++) {
      const [inside, outside] = split(remaining, cutter.vertices[i], cutter.vertices[(i + 1) % 3]);
      if (outside.length) out.push(outside);
      remaining = inside;
    }
    return out;
  }
  function spatial(cell) {
    const cells = new Map(), key = (x, y) => x + ',' + y;
    function visit(b, fn) {
      for (let x = Math.floor((b.minX - EPS) / cell); x <= Math.floor((b.maxX + EPS) / cell); x++)
        for (let y = Math.floor((b.minY - EPS) / cell); y <= Math.floor((b.maxY + EPS) / cell); y++) fn(key(x, y));
    }
    return {
      add(value, bounds) { visit(bounds, k => { if (!cells.has(k)) cells.set(k, []); cells.get(k).push(value); }); },
      query(bounds) { const found = new Set(); visit(bounds, k => { for (const value of cells.get(k) || []) found.add(value); }); return [...found]; }
    };
  }
  function triangleHeight(vertices, x, y) {
    const [a, b, c] = vertices, denominator = cross(a, b, c);
    if (Math.abs(denominator) < 1e-10) return null;
    const p = { x, y }, u = cross(b, c, p) / denominator, v = cross(c, a, p) / denominator, w = 1 - u - v;
    return Math.min(u, v, w) >= -1e-6 ? u * a.z + v * b.z + w * c.z : null;
  }
  // Paint existing top triangles, rather than drawing a separately triangulated
  // patch above them. Overlay Z is deliberately ignored: each fragment remains
  // on its original ground plane, including where adjacent planes change slope.
  function paintSurface(faces, overlays) {
    if (!Array.isArray(faces) || !Array.isArray(overlays)) throw new TypeError('Terrain paint requires face arrays.');
    if (!overlays.length) return faces.slice();
    const sameStyle = (a, b) => a && b && a.fill === b.fill && a.kind === b.kind && a.featureId === b.featureId && a.priority === b.priority;
    const index = spatial(64); let order = 0, indexedCells = 0, group = -1, previous = null;
    for (const overlay of overlays) {
      const points = overlay.vertices;
      if (!Array.isArray(points) || points.length < 3 || !overlay.fill) continue;
      if (points.some(p => !Number.isFinite(p.x + p.y))) throw new TypeError('Terrain paint XY must be finite.');
      if (!sameStyle(previous, overlay)) group++;
      previous = overlay;
      for (let i = 1; i < points.length - 1; i++) {
        let vertices = [points[0], points[i], points[i + 1]];
        const turn = cross(...vertices); if (Math.abs(turn) < 1e-9) continue;
        if (turn < 0) vertices = [vertices[0], vertices[2], vertices[1]];
        const bounds = boundsOf(vertices);
        indexedCells += (Math.ceil((bounds.maxX - bounds.minX) / 64) + 2) * (Math.ceil((bounds.maxY - bounds.minY) / 64) + 2);
        if (indexedCells > 1000000) throw new RangeError('Terrain paint exceeds the bounded intersection index.');
        index.add({ vertices, bounds, overlay, group, order: order++ }, bounds);
      }
    }
    function partition(vertices, cutter) {
      if (!overlap(boundsOf(vertices), cutter.bounds)) return null;
      if (cutter.vertices.some((a, i) => vertices.every(p => cross(a, cutter.vertices[(i + 1) % 3], p) < -EPS))) return null;
      const outside = []; let inside = vertices;
      for (let i = 0; i < 3 && inside.length; i++) {
        const [keep, rest] = split(inside, cutter.vertices[i], cutter.vertices[(i + 1) % 3]);
        if (rest.length) outside.push(rest); inside = keep;
      }
      // Touching an edge alone must neither repaint nor subdivide that face.
      return inside.length ? { inside, outside } : null;
    }
    const result = [];
    for (const face of faces) {
      if (!['context-ground', 'terrain-bank'].includes(face.kind)) { result.push(face); continue; }
      const faceBounds = boundsOf(face.vertices);
      const candidates = index.query(faceBounds).filter(c => overlap(faceBounds, c.bounds)).sort((a, b) => a.order - b.order);
      if (!candidates.length) { result.push(face); continue; }
      const groups = [];
      for (const cutter of candidates) {
        if (!groups.length || groups.at(-1)[0].group !== cutter.group) groups.push([]);
        groups.at(-1).push(cutter);
      }
      const output = []; let changed = false;
      for (let i = 1; i < face.vertices.length - 1; i++) {
        const source = [face.vertices[0], face.vertices[i], face.vertices[i + 1]];
        if (Math.abs(cross(...source)) < 1e-9) continue;
        let pieces = [{ vertices: source, overlay: null }];
        for (const cutters of groups) {
          const overlay = cutters[0].overlay;
          const next = [];
          for (const piece of pieces) {
            if (sameStyle(piece.overlay, overlay)) { next.push(piece); continue; }
            let remaining = [piece.vertices]; const painted = [];
            // Only unpainted residuals need testing against the next triangle
            // of one material region. Later different regions still repaint.
            for (const cutter of cutters) {
              if (!remaining.length) break;
              const outside = [];
              for (const vertices of remaining) {
                const clipped = partition(vertices, cutter);
                if (!clipped) { outside.push(vertices); continue; }
                changed = true; outside.push(...clipped.outside); painted.push(clipped.inside);
              }
              remaining = outside;
            }
            if (!painted.length) next.push(piece);
            else if (!remaining.length) next.push({ vertices: piece.vertices, overlay });
            else {
              for (const vertices of remaining) next.push({ vertices, overlay: piece.overlay });
              for (const vertices of painted) next.push({ vertices, overlay });
            }
          }
          pieces = next;
        }
        for (const piece of pieces) {
          const vertices = piece.vertices.map(p => {
            const original = source.find(q => q.x === p.x && q.y === p.y);
            if (original) return original;
            const z = triangleHeight(source, p.x, p.y);
            if (!Number.isFinite(z)) throw new TypeError('Painted terrain escaped its source plane.');
            return point(p.x, p.y, z);
          });
          for (let j = 1; j < vertices.length - 1; j++) {
            const triangle = [vertices[0], vertices[j], vertices[j + 1]];
            if (Math.abs(cross(...triangle)) < 1e-9) continue;
            const style = piece.overlay ? { fill: piece.overlay.fill, kind: piece.overlay.kind, featureId: piece.overlay.featureId } : {};
            output.push({ ...face, ...style, vertices: triangle, center: {
              x: triangle.reduce((sum, p) => sum + p.x / 3, 0), y: triangle.reduce((sum, p) => sum + p.y / 3, 0) } });
          }
        }
      }
      result.push(...(changed ? output : [face]));
    }
    return result;
  }
  function build(track, roadEdges, options = {}) {
    if (!track?.bounds || !Array.isArray(roadEdges)) throw new TypeError('CircuitTerrain requires a track and road edges.');
    if (typeof options.groundHeight !== 'function') throw new TypeError('CircuitTerrain requires groundHeight.');
    const requested = options.bounds || track.bounds, margin = 180;
    const cell = Math.max(24, Math.min(55, Math.max(requested.maxX - requested.minX, requested.maxY - requested.minY) / 64));
    const nx = Math.ceil((requested.maxX - requested.minX + 2 * margin) / cell), ny = Math.ceil((requested.maxY - requested.minY + 2 * margin) / cell);
    if (!Number.isFinite(nx + ny) || nx < 1 || ny < 1 || nx * ny > 100000) throw new RangeError('Terrain extent exceeds the bounded grid budget.');
    const bounds = { minX: requested.minX - margin, minY: requested.minY - margin };
    bounds.maxX = bounds.minX + nx * cell; bounds.maxY = bounds.minY + ny * cell;
    bounds.width = nx * cell; bounds.height = ny * cell;
    const grid = [];
    for (let y = 0; y <= ny; y++) {
      const row = [];
      for (let x = 0; x <= nx; x++) {
        const px = bounds.minX + x * cell, py = bounds.minY + y * cell, z = options.groundHeight(px, py) - .22;
        if (!Number.isFinite(z)) throw new TypeError('Terrain height must be finite.');
        row.push(point(px, py, z));
      }
      grid.push(row);
    }
    function sampleBaseHeight(x, y) {
      if (x < bounds.minX - EPS || x > bounds.maxX + EPS || y < bounds.minY - EPS || y > bounds.maxY + EPS) return null;
      const i = Math.max(0, Math.min(nx - 1, Math.floor((x - bounds.minX) / cell))), j = Math.max(0, Math.min(ny - 1, Math.floor((y - bounds.minY) / cell)));
      const u = (x - grid[j][i].x) / cell, v = (y - grid[j][i].y) / cell;
      const a = grid[j][i].z, b = grid[j][i + 1].z, c = grid[j + 1][i + 1].z, d = grid[j + 1][i].z;
      return v <= u ? a + (b - a) * u + (c - b) * v : a + (c - d) * u + (d - a) * v;
    }
    const cutters = [], roadTriangles = [], cutterIndex = spatial(cell), roadIndex = spatial(cell);
    function triangles(quad, target, index) {
      for (const vertices of [[quad[0], quad[1], quad[2]], [quad[0], quad[2], quad[3]]]) {
        if (!vertices.every(p => p && Number.isFinite(p.x + p.y + p.z))) throw new TypeError('Road edge coordinates must be finite.');
        if (Math.abs(cross(...vertices)) < 1e-9) continue;
        const face = { vertices: cross(...vertices) > 0 ? vertices : [vertices[0], vertices[2], vertices[1]], bounds: boundsOf(vertices) };
        target.push(face); index.add(face, face.bounds);
      }
    }
    for (let i = 0; i < roadEdges.length; i++) {
      const a = roadEdges[i], b = roadEdges[(i + 1) % roadEdges.length];
      triangles([a.outerLeft, b.outerLeft, b.outerRight, a.outerRight], cutters, cutterIndex);
      // Match the renderer's road/curb triangulation, including nonplanar bends.
      const rows = a.left && a.right && b.left && b.right ?
        [[a.outerLeft, b.outerLeft, b.left, a.left], [a.left, b.left, b.right, a.right], [a.right, b.right, b.outerRight, a.outerRight]] :
        [[a.outerLeft, b.outerLeft, b.outerRight, a.outerRight]];
      for (const quad of rows) triangles(quad, roadTriangles, roadIndex);
    }
    function roadHeight(x, y) {
      let z = null;
      for (const t of roadIndex.query({ minX: x, maxX: x, minY: y, maxY: y })) {
        const value = triangleHeight(t.vertices, x, y);
        if (value !== null) z = z === null ? value : Math.min(z, value);
      }
      return z;
    }
    const polygons = [], stats = { gridCells: nx * ny, roadTriangles: roadTriangles.length, clippedGridTriangles: 0, bankFaces: 0, underlayFaces: 0, stitchedVertices: 0 };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i + 1], d = grid[j + 1][i];
      for (const triangle of [[a, b, c], [a, c, d]]) {
        let fragments = [triangle];
        for (const cutter of cutterIndex.query(boundsOf(triangle))) {
          fragments = fragments.flatMap(poly => subtract(poly, cutter));
          if (!fragments.length) break;
        }
        if (fragments.length !== 1 || fragments[0] !== triangle) stats.clippedGridTriangles++;
        for (const vertices of fragments) polygons.push({ vertices, underlay: false });
      }
    }
    for (const t of roadTriangles) polygons.push({ vertices: t.vertices, underlay: true });
    // One global vertex table makes cut edges and neighbouring grid tiles agree.
    // Stitch T-junctions before triangulation; interpolating a lifted road edge
    // independently on each side would reopen a vertical crack.
    const vertexMap = new Map(), vertices = [], vertexIndex = spatial(cell);
    function register(p) {
      const key = Math.round(p.x * 1e6) + ',' + Math.round(p.y * 1e6);
      if (vertexMap.has(key)) return vertexMap.get(key);
      const road = roadHeight(p.x, p.y), z = road === null ? sampleBaseHeight(p.x, p.y) : road - CLEARANCE;
      const v = { x: p.x, y: p.y, z, road: road !== null, id: vertices.length };
      if (!Number.isFinite(z)) throw new TypeError('Clipped terrain escaped its bounds.');
      vertices.push(v); vertexMap.set(key, v); vertexIndex.add(v, boundsOf([v])); return v;
    }
    for (const p of polygons) p.vertices = p.vertices.map(register);
    const faces = [], surfaceIndex = spatial(cell);
    function face(v, kind, fill, surface = true) {
      if (surface && cross(...v) < 0) v = [v[0], v[2], v[1]];
      const center = { x: (v[0].x + v[1].x + v[2].x) / 3, y: (v[0].y + v[1].y + v[2].y) / 3 };
      const f = { vertices: v, fill, kind, priority: -3, estimated: true, center };
      faces.push(f); if (surface) surfaceIndex.add(f, boundsOf(v));
      if (kind === 'terrain-bank') stats.bankFaces++;
      if (kind === 'terrain-underlay') stats.underlayFaces++;
    }
    for (const p of polygons) {
      const ring = [];
      for (let i = 0; i < p.vertices.length; i++) {
        const a = p.vertices[i], b = p.vertices[(i + 1) % p.vertices.length], dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
        ring.push(a); if (length2 < EPS * EPS) continue;
        const interior = vertexIndex.query(boundsOf([a, b])).filter(v => v !== a && v !== b).map(v => ({ v, t: ((v.x - a.x) * dx + (v.y - a.y) * dy) / length2 }))
          .filter(({ v, t }) => t > EPS && t < 1 - EPS && Math.abs(cross(a, b, v)) / Math.sqrt(length2) < STITCH_EPS).sort((u, v) => u.t - v.t);
        for (const entry of interior) ring.push(entry.v);
        stats.stitchedVertices += interior.length;
      }
      const kind = p.underlay ? 'terrain-underlay' : ring.some(v => v.road) ? 'terrain-bank' : 'context-ground';
      const fill = kind === 'terrain-underlay' ? '#77845e' : '#829569';
      if (ring.length === 3) face(ring, kind, fill);
      else {
        const center = ring.reduce((sum, v) => point(sum.x + v.x / ring.length, sum.y + v.y / ring.length, sum.z + v.z / ring.length), point(0, 0, 0));
        for (let i = 0; i < ring.length; i++) if (Math.abs(cross(center, ring[i], ring[(i + 1) % ring.length])) > 1e-9)
          face([center, ring[i], ring[(i + 1) % ring.length]], kind, fill);
      }
    }
    // Close only the far edge of the illustrative terrain patch, not roadside
    // walls. Road banks are sloping surface triangles constrained to off-road XY.
    const floor = vertices.reduce((min, v) => Math.min(min, v.z), Infinity) - 4;
    const boundary = [...grid[0], ...grid.slice(1).map(r => r[nx]), ...grid[ny].slice(0, nx).reverse(), ...grid.slice(1, ny).reverse().map(r => r[0])];
    for (let i = 0; i < boundary.length; i++) {
      const a = boundary[i], b = boundary[(i + 1) % boundary.length], A = point(a.x, a.y, floor), B = point(b.x, b.y, floor);
      face([a, b, B], 'terrain-boundary', '#71825d', false); face([a, B, A], 'terrain-boundary', '#71825d', false);
    }
    const low = [point(bounds.minX, bounds.minY, floor), point(bounds.maxX, bounds.minY, floor), point(bounds.maxX, bounds.maxY, floor), point(bounds.minX, bounds.maxY, floor)];
    face([low[0], low[2], low[1]], 'terrain-base', '#71825d', false); face([low[0], low[3], low[2]], 'terrain-base', '#71825d', false);
    function sampleHeight(x, y) {
      let height = null;
      for (const f of surfaceIndex.query({ minX: x, maxX: x, minY: y, maxY: y })) {
        const z = triangleHeight(f.vertices, x, y);
        if (z !== null) height = height === null ? z : Math.max(height, z);
      }
      return height;
    }
    stats.faces = faces.length;
    return { faces, bounds, grid: { cell, columns: nx, rows: ny }, sampleHeight, sampleBaseHeight, roadHeight, stats,
      classification: 'illustrative road-constrained terrain envelope; not surveyed terrain or mapped retaining walls', clearanceM: CLEARANCE };
  }
  const api = { build, paintSurface };
  root.CircuitTerrain = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
