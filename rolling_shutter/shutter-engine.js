/* A deterministic 2-D rolling-shutter sensor. No animation/UI dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ShutterEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TAU = 2 * Math.PI;
  const BACKGROUND = [242, 245, 238];
  const PALETTE = [BACKGROUND, [37, 105, 82], [217, 108, 65], [62, 77, 69]];
  const DEFAULTS = { speed: 3, readout: 100, exposure: 0, phase: 0, direction: 'down', blades: 3 };
  const MISSIONS = [
    { id: 'bend', title: '01 · 휘어진 날개의 비밀',
      brief: '직선 날개가 사진에서는 휘었습니다. 회전 속도는 알고 있어요. 읽는 시간을 찾아 기준 사진을 재현하세요.',
      clue: '알려진 조건: 시계방향 3바퀴/s · 위→아래 · 노출 0ms · 시작 0°',
      hint: '읽는 동안 더 많이 회전할수록 날개의 굽음이 커집니다. 80~120ms 사이를 좁혀 보세요.',
      target: { ...DEFAULTS, readout: 100 }, initial: { ...DEFAULTS, readout: 20 }, editable: ['readout'] },
    { id: 'reverse', title: '02 · 거꾸로 읽은 사진',
      brief: '같은 프로펠러인데 굽는 방향이 다릅니다. 읽는 방향과 시간을 함께 찾아보세요.',
      clue: '알려진 조건: 시계방향 4바퀴/s · 노출 0ms · 시작 20°',
      hint: '위→아래와 아래→위를 먼저 비교하세요. 읽는 시간은 120ms보다 짧습니다.',
      target: { ...DEFAULTS, speed: 4, phase: 20, direction: 'up', readout: 90 },
      initial: { ...DEFAULTS, speed: 4, phase: 20, direction: 'down', readout: 40 }, editable: ['readout', 'direction'] },
    { id: 'blur', title: '03 · 번짐 속의 시작점',
      brief: '휘어짐은 맞췄지만 날개의 잔상이 다릅니다. 한 줄의 노출 시간과 촬영 시작 각도를 찾아보세요.',
      clue: '알려진 조건: 시계방향 5바퀴/s · 위→아래 · 읽기 80ms',
      hint: '노출은 약 20ms보다 조금 깁니다. 주황 날개의 시작 각도는 30~60° 사이입니다.',
      target: { ...DEFAULTS, speed: 5, readout: 80, exposure: 24, phase: 45 },
      initial: { ...DEFAULTS, speed: 5, readout: 80, exposure: 4, phase: 0 }, editable: ['exposure', 'phase'] },
    { id: 'spin', title: '04 · 회전 방향을 찾아라',
      brief: '촬영 기록에는 카메라 설정만 남았습니다. 속도의 부호와 시작 각도를 바꿔 물체의 움직임을 복원하세요.',
      clue: '알려진 조건: 위→아래 · 읽기 140ms · 노출 8ms',
      hint: '음수 속도는 반시계방향입니다. 주황 날개로 시작 각도를 구별하세요. 속력은 3~5바퀴/s 사이입니다.',
      target: { ...DEFAULTS, speed: -4, readout: 140, exposure: 8, phase: 60 },
      initial: { ...DEFAULTS, speed: 2, readout: 140, exposure: 8, phase: 0 }, editable: ['speed', 'phase'] }
  ];
  function rowStart(row, height, settings) {
    const p = height <= 1 ? .5 : row / (height - 1);
    return (settings.direction === 'up' ? 1 - p : p) * settings.readout / 1000;
  }
  function angleAt(time, settings) { return settings.phase * Math.PI / 180 + TAU * settings.speed * time; }
  function sceneClass(x, y, cosines, sines, blades) {
    const r2 = x*x + y*y;
    if (r2 < .010) return 3;
    if (r2 > .80) return 0;
    for (let b = 0; b < blades; b++) {
      const along = x*cosines[b] + y*sines[b];
      const across = -x*sines[b] + y*cosines[b];
      if (along > .075 && along < .87 && Math.abs(across) < .038 + along*.115) return b === 0 ? 2 : 1;
    }
    return 0;
  }
  function render(settings, width = 224, height = width, mode = 'rolling', instantTime = null) {
    const p = { ...DEFAULTS, ...settings };
    const pixels = new Uint8ClampedArray(width * height * 4);
    // Midpoint quadrature over each row's own exposure interval. Zero exposure is a limiting instantaneous sample.
    const exposure = mode === 'instant' ? 0 : p.exposure / 1000;
    const samples = exposure === 0 || p.speed === 0 ? 1 : Math.min(64, Math.max(12, Math.ceil(Math.abs(p.speed) * exposure * 180)));
    const cosines = Array.from({length:samples}, () => new Float64Array(p.blades));
    const sines = Array.from({length:samples}, () => new Float64Array(p.blades));
    for (let y = 0; y < height; y++) {
      const start = mode === 'rolling' ? rowStart(y, height, p) : mode === 'global' ? p.readout / 2000 : (instantTime ?? (p.readout + p.exposure) / 2000);
      for (let s = 0; s < samples; s++) {
        const theta = angleAt(start + exposure * (s + .5) / samples, p);
        for (let b = 0; b < p.blades; b++) {
          cosines[s][b] = Math.cos(theta + TAU*b/p.blades);
          sines[s][b] = Math.sin(theta + TAU*b/p.blades);
        }
      }
      const yy = 2*(y+.5)/height-1;
      for (let x = 0; x < width; x++) {
        const xx = 2*(x+.5)/width-1;
        let r = 0, g = 0, b = 0;
        for (let s = 0; s < samples; s++) {
          const color = PALETTE[sceneClass(xx, yy, cosines[s], sines[s], p.blades)];
          r += color[0]; g += color[1]; b += color[2];
        }
        const i = (y*width+x)*4;
        pixels[i] = r/samples; pixels[i+1] = g/samples; pixels[i+2] = b/samples; pixels[i+3] = 255;
      }
    }
    return { width, height, pixels, samples };
  }
  function similarity(a, b) {
    if (a.width !== b.width || a.height !== b.height) throw new Error('Image dimensions must match');
    let intersection = 0, union = 0;
    for (let i = 0; i < a.pixels.length; i += 4) for (let c = 0; c < 3; c++) {
      const x = Math.abs(BACKGROUND[c]-a.pixels[i+c]), y = Math.abs(BACKGROUND[c]-b.pixels[i+c]);
      intersection += Math.min(x,y); union += Math.max(x,y);
    }
    return union === 0 ? 100 : intersection / union * 100;
  }
  return { DEFAULTS, MISSIONS, BACKGROUND, rowStart, angleAt, render, similarity };
});
