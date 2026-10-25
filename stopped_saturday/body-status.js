/* A view of the fictional character's existing state; this does not change it. */
(function (root) {
  'use strict';

  const PARTS = [
    { key: 'ankle', short: '오른발목', label: '오른쪽 발목' },
    { key: 'shoulder', short: '어깨', label: '어깨' },
    { key: 'back', short: '등·허리', label: '등·허리' },
    { key: 'underarm', short: '겨드랑이', label: '겨드랑이 옆' },
    { key: 'palm', short: '손바닥', label: '손바닥' },
    { key: 'goodLeg', short: '왼쪽 다리', label: '몸을 받치는 왼쪽 다리' }
  ];
  const LEVELS = ['없음', '약함', '보통', '심함'];
  const FILLED = [0, 1, 2, 4];
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function element(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svgElement(doc, tag, attributes, parent) {
    const node = doc.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes || {})) node.setAttribute(key, String(value));
    if (parent) parent.append(node);
    return node;
  }

  function stateFor(part, descriptions) {
    const item = descriptions.find(entry => entry && entry.key === part.key);
    const value = item && Number.isFinite(item.value) ? Math.max(0, Math.min(10, item.value)) : null;
    const level = value === null ? null : value === 0 ? 0 : value <= 2 ? 1 : value <= 6 ? 2 : 3;
    return { ...part, label: item && item.label || part.label, short: item && item.short || part.short,
      side: item && item.side || (part.key === 'ankle' ? 'right' : part.key === 'goodLeg' ? 'left' : null), value, level,
      text: item && typeof item.text === 'string' ? item.text : '표시할 상태 정보가 없습니다.' };
  }

  function diagram(doc, parts) {
    const svg = svgElement(doc, 'svg', { viewBox: '0 0 240 350', class: 'sbs-anatomy', 'aria-hidden': 'true', focusable: 'false' });
    const injuredLeft = parts.find(part => part.key === 'ankle')?.side === 'left';
    const mirror = injuredLeft ? { transform:'translate(240 0) scale(-1 1)' } : {};
    svg.dataset.injuredSide = injuredLeft ? 'left' : 'right';
    const person = svgElement(doc, 'g', { class:'sbs-person', ...mirror }, svg);
    const shape = (tag, attrs, parent = person) => svgElement(doc, tag, attrs, parent);
    shape('ellipse', { cx: 122, cy: 327, rx: 58, ry: 8, fill: '#dedfcf' });
    const outline = { stroke: '#657367', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    // Anatomical right is on the viewer's left in this front view.
    shape('path', { d: 'M98 177 Q90 198 95 228 L96 286 Q97 298 111 296 L119 225 L125 185 Z', fill: '#a5b7a3', ...outline });
    shape('path', { d: 'M119 185 L128 229 L132 300 Q142 307 151 297 L150 228 Q153 200 143 177 Z', fill: '#9eaf9b', ...outline });
    shape('path', { d: 'M97 289 L96 313 Q89 321 95 324 L117 324 Q121 319 115 310 L113 290 Z', fill: '#f8f5e9', ...outline });
    shape('path', { d: 'M132 294 L132 312 L130 323 L158 323 Q160 317 150 313 L148 295 Z', fill: '#e0c1a6', ...outline });
    shape('path', { d: 'M131 317 L154 317 Q162 320 158 326 L131 326 Z', fill: '#667864' });
    shape('path', { d: 'M87 87 Q74 101 70 135 L58 198 Q56 209 66 213 Q75 214 77 202 L90 143 L104 101 Z', fill: '#e2c2a6', ...outline });
    shape('path', { d: 'M153 87 Q167 99 170 136 L182 198 Q185 209 175 213 Q165 215 163 202 L149 143 L136 102 Z', fill: '#e2c2a6', ...outline });
    shape('path', { d: 'M58 198 Q49 205 53 217 Q56 223 61 218 L65 212 Q70 221 75 214 L73 201 Z', fill: '#e2c2a6', ...outline });
    shape('path', { d: 'M181 198 Q191 205 187 217 Q184 223 179 218 L175 212 Q170 221 165 214 L167 201 Z', fill: '#e2c2a6', ...outline });
    shape('path', { d: 'M108 56 L106 77 Q120 88 134 77 L132 56 Z', fill: '#e2c2a6', ...outline });
    shape('path', { d: 'M107 72 Q95 72 84 83 L77 107 L94 115 L96 146 L91 179 Q120 192 149 179 L144 146 L146 115 L163 107 L157 83 Q145 72 133 72 Q120 84 107 72 Z', fill: '#dae2ce', ...outline });
    shape('path', { d: 'M108 74 Q120 90 133 74 M96 170 Q120 178 145 170', fill: 'none', stroke: '#a3b198', 'stroke-width': 2 });
    shape('ellipse', { cx: 120, cy: 39, rx: 22, ry: 26, fill: '#e6c7aa', ...outline });
    shape('path', { d: 'M98 39 Q92 10 116 9 Q144 7 143 36 Q131 30 130 22 Q116 34 100 31 Z', fill: '#5b6254' });
    shape('path', { d: 'M108 41 L111 41 M129 41 L132 41 M116 53 Q120 55 125 52', fill: 'none', stroke: '#5d6050', 'stroke-width': 2, 'stroke-linecap': 'round' });
    // Cloth wrapping makes the right ankle cast readable even with no discomfort.
    shape('path', { d: 'M97 293 L114 297 M96 301 L115 305 M96 309 L116 313 M95 317 L117 320', fill: 'none', stroke: '#b9bdad', 'stroke-width': 2 });

    const zones = {
      ankle: [['path', { d: 'M97 287 L113 289 L118 315 Q118 320 111 322 L96 321 Q91 316 96 310 Z' }]],
      shoulder: [['ellipse', { cx: 92, cy: 87, rx: 13, ry: 10 }], ['ellipse', { cx: 148, cy: 87, rx: 13, ry: 10 }]],
      back: [['path', { d: 'M107 103 Q120 98 133 103 L138 159 Q120 168 102 159 Z', class: 'sbs-back-zone' }]],
      underarm: [['path', { d: 'M92 111 Q102 120 99 135', class: 'sbs-side-zone' }], ['path', { d: 'M148 111 Q138 120 141 135', class: 'sbs-side-zone' }]],
      palm: [['ellipse', { cx: 63, cy: 207, rx: 9, ry: 11 }], ['ellipse', { cx: 177, cy: 207, rx: 9, ry: 11 }]],
      goodLeg: [['path', { d: 'M132 191 Q141 206 140 231 L143 286 Q141 293 135 288 L130 232 L126 197 Z' }]]
    };
    const markers = {
      ankle: [55, 299, 'M68 299 L92 308'],
      shoulder: [190, 72, 'M177 72 L157 83'],
      back: [120, 132, null],
      underarm: [199, 126, 'M186 126 L151 122'],
      palm: [27, 205, 'M40 205 L53 205'],
      goodLeg: [184, 261, 'M171 261 L146 261']
    };
    parts.forEach((part, index) => {
      const group = shape('g', { class: 'sbs-zone', 'data-body-key': part.key, 'data-side': part.side || 'both', 'data-level': part.level === null ? 'unknown' : part.level }, svg);
      zones[part.key].forEach(([tag, attrs]) => shape(tag, { ...attrs, ...mirror, class: `sbs-highlight ${attrs.class || ''}`.trim() }, group));
      const [baseX, cy, line] = markers[part.key];
      const cx = injuredLeft ? 240 - baseX : baseX;
      if (line) shape('path', { d: line, ...mirror, class: 'sbs-leader' }, group);
      shape('circle', { cx, cy, r: 13, class: 'sbs-map-number' }, group);
      const number = shape('text', { x: cx, y: cy + 1, class: 'sbs-map-digit', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, group);
      number.textContent = String(index + 1);
    });
    return svg;
  }

  function render(host, body) {
    if (!host || !host.ownerDocument) return null;
    const doc = host.ownerDocument;
    const parts = PARTS.map(part => stateFor(part, Array.isArray(body) ? body : []));
    const section = element(doc, 'section', 'sbs');
    section.setAttribute('aria-label', '부위별 불편함');
    const heading = element(doc, 'div', 'sbs-heading');
    heading.append(element(doc, 'h3', '', '어디가 불편한지'), element(doc, 'span', '', '그림과 카드의 번호가 같아요'));
    const layout = element(doc, 'div', 'sbs-layout');
    const figure = element(doc, 'figure', 'sbs-figure');
    figure.append(diagram(doc, parts), element(doc, 'figcaption', 'sbs-caption', '정면 · 점선은 등'));
    const cards = element(doc, 'ul', 'sbs-cards');
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      const card = element(doc, 'li', 'sbs-card');
      card.dataset.bodyKey = part.key;
      card.dataset.level = part.level === null ? 'unknown' : String(part.level);
      if (part.value !== null) card.dataset.value = String(part.value);
      const title = element(doc, 'div', 'sbs-card-title');
      const number = element(doc, 'span', 'sbs-card-number', String(index + 1));
      number.setAttribute('aria-hidden', 'true');
      const label = element(doc, 'strong', '', part.short);
      const fullLabel = element(doc, 'span', 'sbs-sr-only', `${part.label}: `);
      label.setAttribute('aria-hidden', 'true');
      title.append(number, fullLabel, label);
      const level = element(doc, 'span', 'sbs-level', part.level === null ? '정보 없음' : LEVELS[part.level]);
      const bars = element(doc, 'span', 'sbs-bars');
      bars.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 4; i++) bars.append(element(doc, 'span', i < (FILLED[part.level] || 0) ? 'is-filled' : ''));
      const sense = element(doc, 'p', 'sbs-sensation', part.text);
      card.append(title, level, bars, sense);
      cards.append(card);
    }
    layout.append(figure, cards);
    section.append(heading, layout, element(doc, 'p', 'sbs-note', '이야기 속 인물이 느끼는 불편함입니다. 자세한 느낌은 아래에서 볼 수 있어요.'));
    host.replaceChildren(section);
    return { parts: parts.map(({ key, value, level }) => ({ key, value, level: level === null ? '정보 없음' : LEVELS[level] })) };
  }

  root.SaturdayBodyStatus = Object.freeze({ render });
})(typeof window !== 'undefined' ? window : globalThis);
