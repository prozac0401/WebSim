/* Conservative visibility for static world faces. No geometry, height, winding
 * or draw ordering changes: surviving faces still use the renderer's clipping. */
(function (root) {
  'use strict';
  const CELL = 64, MARGIN = 20;
  function build(faces) {
    if (!Array.isArray(faces)) throw new TypeError('World face batches require an array.');
    const cells = new Map(), groups = [], membership = new Uint32Array(faces.length);
    for (let i = 0; i < faces.length; i++) {
      let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const p of faces[i].vertices || []) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); minZ = Math.min(minZ, p.z);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); maxZ = Math.max(maxZ, p.z);
      }
      const valid = Number.isFinite(minX + minY + minZ + maxX + maxY + maxZ);
      // Assign each face once, but bound its entire extent, not just its cell.
      // Large return legs and faces crossing the eye plane cannot disappear.
      const key = valid ? Math.floor((minX + maxX) / (2 * CELL)) + ',' + Math.floor((minY + maxY) / (2 * CELL)) : 'unbounded';
      let group = cells.get(key);
      if (!group) {
        group = { id: groups.length, count: 0, minX, minY, minZ, maxX, maxY, maxZ, unbounded: !valid };
        cells.set(key, group); groups.push(group);
      } else {
        group.minX = Math.min(group.minX, minX); group.minY = Math.min(group.minY, minY); group.minZ = Math.min(group.minZ, minZ);
        group.maxX = Math.max(group.maxX, maxX); group.maxY = Math.max(group.maxY, maxY); group.maxZ = Math.max(group.maxZ, maxZ);
      }
      group.count++; membership[i] = group.id;
    }
    for (const g of groups) {
      g.x = (g.minX + g.maxX) / 2; g.y = (g.minY + g.maxY) / 2; g.z = (g.minZ + g.maxZ) / 2;
      g.ex = (g.maxX - g.minX) / 2; g.ey = (g.maxY - g.minY) / 2; g.ez = (g.maxZ - g.minZ) / 2;
    }
    const visible = new Uint8Array(groups.length), stats = { faces: faces.length, batches: groups.length, candidateFaces: faces.length, rejectedBatches: 0 };
    function query(camera, width, height) {
      const { target, cosYaw: cy, sinYaw: sy, cosPitch: cp, sinPitch: sp, distance, f, cx, cy: screenY } = camera || {};
      if (!target || ![target.x, target.y, target.z, cy, sy, cp, sp, distance, f, cx, screenY, width, height].every(Number.isFinite) || !(f > 0 && width > 0 && height > 0)) return faces;
      // The renderer uses depth = distance + D dot (world - target),
      // screen = centre + f * (R,V) / depth. These linear halfspaces include
      // its 20 px screen margin and its exact near clipping threshold.
      const D = [sy * cp, -cy * cp, -sp], R = [cy, sy, 0], V = [-sy * sp, cy * sp, -cp];
      const plane = (axis, scale, margin) => [scale * axis[0] + margin * D[0], scale * axis[1] + margin * D[1], scale * axis[2] + margin * D[2], margin * distance];
      const planes = [[...D, distance - Math.max(.3, distance * .018) - .001],
        plane(R, f, cx + MARGIN), plane(R, -f, width + MARGIN - cx),
        plane(V, f, screenY + MARGIN), plane(V, -f, height + MARGIN - screenY)];
      let count = 0, rejected = 0;
      for (const g of groups) {
        const x = g.x - target.x, y = g.y - target.y, z = g.z - target.z;
        let outside = false;
        if (!g.unbounded) for (const [nx, ny, nz, constant] of planes) {
          const center = nx * x + ny * y + nz * z + constant, radius = Math.abs(nx) * g.ex + Math.abs(ny) * g.ey + Math.abs(nz) * g.ez;
          // Roundoff near a tangent plane only retains extra faces.
          if (center + radius < -1e-9 * (1 + Math.abs(center) + radius)) { outside = true; break; }
        }
        visible[g.id] = outside ? 0 : 1;
        if (outside) rejected++; else count += g.count;
      }
      stats.candidateFaces = count; stats.rejectedBatches = rejected;
      if (count === faces.length) return faces;
      const result = [];
      // Preserve the legacy face order, including equal-depth painter ties.
      for (let i = 0; i < faces.length; i++) if (visible[membership[i]]) result.push(faces[i]);
      return result;
    }
    return { query, stats };
  }
  const api = { build };
  root.WorldFaceBatches = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
