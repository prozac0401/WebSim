/* Source-gated roadside braking-distance boards. Positions are canonical road
 * chainage; dimensions are rendering estimates. No physics or road edits.
 * height is the total ground-to-top height, not the white panel height. */
(function (root) {
  'use strict';
  const FONT = {
    '0': ['111', '101', '101', '101', '111'],
    '1': ['010', '110', '010', '010', '111'],
    '5': ['111', '100', '111', '001', '111']
  };
  const LABELS = new Set(['50', '100', '150']), MAX_BOARDS = 128;
  const mod = (x, n) => ((x % n) + n) % n;
  const finite = Number.isFinite;
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const evidence = value => text(value) || Array.isArray(value) && value.some(text);

  function build(road, metadata, options = {}) {
    if (!road || typeof road.sample !== 'function' || !finite(road.length) || road.length <= 0)
      throw new TypeError('TracksideBoards requires a canonical road length and sample(s).');
    const inputs = Array.isArray(metadata?.distanceBoards) ? metadata.distanceBoards : [];
    const faces = [], stats = { requested: inputs.length, boards: 0, faces: 0, digitCells: 0,
      rejectedUnsourced: 0, rejectedInvalid: 0, rejectedClearance: 0,
      rejectedMissingClearance: 0, truncated: Math.max(0, inputs.length - MAX_BOARDS), placements: [] };
    const hasClearance = typeof options.roadDistance === 'function' && finite(options.roadClearance) && options.roadClearance >= 0;
    for (let index = 0; index < Math.min(inputs.length, MAX_BOARDS); index++) {
      const board = inputs[index];
      if (!board || !text(board.sourceId) || !evidence(board.evidence)) { stats.rejectedUnsourced++; continue; }
      const width = board.width ?? 1, height = board.height ?? 1.2;
      if (!LABELS.has(board.label) || !finite(board.atM) || !finite(board.offset) ||
          !finite(width) || width < .3 || width > 4 || !finite(height) || height < .5 || height > 4) {
        stats.rejectedInvalid++; continue;
      }
      // Fail closed when a caller cannot test the entire road, including a
      // nearby parallel leg. abs(offset) alone is not a safe clearance check.
      if (!hasClearance) { stats.rejectedMissingClearance++; continue; }
      const atM = mod(board.atM, road.length), pose = road.sample(atM);
      if (!pose || ![pose.x, pose.y, pose.angle].every(finite)) { stats.rejectedInvalid++; continue; }
      const tx = Math.cos(pose.angle), ty = Math.sin(pose.angle), nx = -ty, ny = tx;
      const x = pose.x + nx * board.offset, y = pose.y + ny * board.offset;
      const xy = (u, v) => ({ x: x + nx * u + tx * v, y: y + ny * u + ty * v });
      const halfWidth = width / 2, halfDepth = .05;
      let clear = true;
      // Euclidean distance to a road is 1-Lipschitz. Testing each cell centre
      // with its half diagonal protects the whole panel/post footprint, not
      // just its corners (which can straddle another narrow/parallel lane).
      const columns = Math.ceil(width / .25), cellWidth = width / columns;
      const radius = Math.hypot(cellWidth / 2, halfDepth);
      const probes = [[0, 0], [-halfWidth, -halfDepth], [-halfWidth, halfDepth],
        [halfWidth, -halfDepth], [halfWidth, halfDepth]];
      for (const [u, v] of probes) {
        const p = xy(u, v), d = options.roadDistance(p.x, p.y);
        if (!finite(d) || d < options.roadClearance) { clear = false; break; }
      }
      if (clear) for (let column = 0; column < columns; column++) {
        const p = xy(-halfWidth + (column + .5) * cellWidth, 0), d = options.roadDistance(p.x, p.y);
        if (!finite(d) || d < options.roadClearance + radius) { clear = false; break; }
      }
      if (!clear) { stats.rejectedClearance++; continue; }
      const sampledGround = typeof options.groundHeight === 'function' ? options.groundHeight(x, y) : undefined;
      const ground = finite(sampledGround) ? sampledGround : pose.z;
      if (!finite(ground)) { stats.rejectedInvalid++; continue; }
      const featureId = text(board.id) ? board.id : 'distance-board-' + index + '-' + board.label;
      const panelHeight = Math.min(.6, width * .6, height * .46), bottom = ground + height - panelHeight, top = ground + height;
      const point = (u, v, z) => ({ ...xy(u, v), z });
      const add = (vertices, fill, boardPart, extra) => faces.push({ vertices, fill,
        kind: 'distance-board', featureId, boardPart, ...extra });
      function box(w, depth, low, high, front, rest, part) {
        const a = w / 2, b = depth / 2;
        // Front winding normal is -tangent, facing approaching traffic.
        add([point(-a,-b,low),point(-a,-b,high),point(a,-b,high),point(a,-b,low)],front,part || 'front');
        add([point(-a,b,low),point(a,b,low),point(a,b,high),point(-a,b,high)],rest,part || 'back');
        add([point(-a,-b,low),point(-a,b,low),point(-a,b,high),point(-a,-b,high)],rest,part || 'edge');
        add([point(a,-b,low),point(a,-b,high),point(a,b,high),point(a,b,low)],rest,part || 'edge');
        add([point(-a,-b,high),point(-a,b,high),point(a,b,high),point(a,-b,high)],rest,part || 'edge');
        add([point(-a,-b,low),point(a,-b,low),point(a,b,low),point(-a,b,low)],rest,part || 'edge');
      }
      box(.075,.075,ground,bottom+.02,'#7d8587','#727b7d','post');
      box(width,.07,bottom,top,'#f1f2eb','#969f9f');
      const glyphColumns = board.label.length * 4 - 1;
      const cell = Math.min(width * .78 / glyphColumns, panelHeight * .70 / 5);
      const left = -glyphColumns * cell / 2, textTop = (bottom + top) / 2 + 2.5 * cell;
      let digitCells = 0;
      for (let digit = 0; digit < board.label.length; digit++) {
        const glyph = FONT[board.label[digit]];
        for (let row = 0; row < 5; row++) for (let column = 0; column < 3; column++) if (glyph[row][column] === '1') {
          const a = left + (digit * 4 + column) * cell, b = a + cell;
          const high = textTop - row * cell, low = high - cell;
          add([point(a,-.041,low),point(a,-.041,high),point(b,-.041,high),point(b,-.041,low)],
            '#111416','digit',{ digit, row, column });
          digitCells++;
        }
      }
      stats.boards++; stats.digitCells += digitCells;
      stats.placements.push({ featureId, label: board.label, atM, offset: board.offset, x, y, ground,
        width, height, panelHeight, frontNormal: { x: -tx, y: -ty, z: 0 }, sourceId: board.sourceId, digitCells });
    }
    stats.faces = faces.length;
    return { faces, stats };
  }
  const api = { build };
  root.TracksideBoards = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
