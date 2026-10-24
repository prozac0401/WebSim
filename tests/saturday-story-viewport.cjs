const assert = require('node:assert/strict');

// Measure before taking a screenshot: screenshots must not hide focus/scroll regressions.
async function storyViewport(page, label, { stacked = true, focus = true } = {}) {
  const measure = () => {
    const mode = JSON.parse(window.render_game_to_text()).mode;
    const selectors = {
      cover: ['#cover h2', '#opening-story p'],
      game: ['#scene-title', '#story-text p'],
      reaction: ['#reaction-title', '#reaction-text p'],
      result: ['#ending-name', '#ending-quote']
    }[mode];
    if (!selectors) return { mode, unsupported: true };
    const heading = document.querySelector(selectors[0]);
    const prose = document.querySelector(selectors[1]);
    const range = document.createRange();
    range.selectNodeContents(prose);
    const firstLine = [...range.getClientRects()].find(r => r.width > 0 && r.height > 0) || prose.getBoundingClientRect();
    const rect = element => {
      const { top, bottom, left, right, width, height } = element.getBoundingClientRect();
      return { top, bottom, left, right, width, height };
    };
    const story = document.querySelector('#story-panel'), aside = document.querySelector('.day-panel');
    return {
      mode, viewport: { width: innerWidth, height: innerHeight }, scrollY,
      heading: rect(heading), firstLine: { top: firstLine.top, bottom: firstLine.bottom },
      story: rect(story), aside: rect(aside), canvas: rect(document.querySelector('#day-canvas')),
      storyBeforeAside: Boolean(story.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING),
      focusedHeading: document.activeElement === heading,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      nestedScrollAreas: [...story.querySelectorAll('*'), story, aside, ...aside.querySelectorAll('*')]
        .filter(el => el.getClientRects().length && /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1)
        .map(el => el.id || el.tagName),
      duplicateMonitorCount: document.querySelectorAll('#effort-monitor, #effort-value, #effort-bars').length
    };
  };
  // Focus is scheduled with requestAnimationFrame by the app.
  await page.waitForFunction(requireFocus => {
    const mode = JSON.parse(window.render_game_to_text()).mode;
    const selectors = { cover: ['#cover h2', '#opening-story p'], game: ['#scene-title', '#story-text p'],
      reaction: ['#reaction-title', '#reaction-text p'], result: ['#ending-name', '#ending-quote'] }[mode];
    if (!selectors) return false;
    const headingElement = document.querySelector(selectors[0]);
    const heading = headingElement.getBoundingClientRect();
    const range = document.createRange(); range.selectNodeContents(document.querySelector(selectors[1]));
    const line = [...range.getClientRects()].find(r => r.width > 0 && r.height > 0);
    return (!requireFocus || document.activeElement === headingElement)
      && line && heading.top >= -1 && heading.bottom <= innerHeight + 1 && line.top >= -1 && line.bottom <= innerHeight + 1;
  }, focus, { timeout: 5000 }).catch(() => {});
  const m = await page.evaluate(measure);
  assert.equal(m.unsupported, undefined, `${label}: unsupported mode`);
  assert.equal(m.storyBeforeAside, true, `${label}: story must precede illustration in DOM`);
  assert.equal(m.horizontalOverflow, false, `${label}: horizontal overflow`);
  assert.deepEqual(m.nestedScrollAreas, [], `${label}: no nested scroll region`);
  assert.equal(m.duplicateMonitorCount, 0, `${label}: duplicate DOM energy monitor removed`);
  assert.ok(m.heading.top >= -1 && m.heading.bottom <= m.viewport.height + 1, `${label}: heading outside viewport ${JSON.stringify(m.heading)}`);
  assert.ok(m.firstLine.top >= -1 && m.firstLine.bottom <= m.viewport.height + 1, `${label}: first prose line outside viewport ${JSON.stringify(m.firstLine)}`);
  if (focus) assert.equal(m.focusedHeading, true, `${label}: heading receives keyboard focus`);
  if (stacked) assert.ok(m.aside.top >= m.story.bottom - 1, `${label}: illustration must follow the complete story/choices`);
  return { label, ...m };
}

async function skipAnimation(page, touch = false) {
  const mode = await page.evaluate(() => JSON.parse(window.render_game_to_text()).mode);
  if (mode === 'animation') {
    if (touch) await page.locator('#skip-animation').tap();
    else await page.locator('#skip-animation').click();
  }
  assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).mode), 'reaction');
}

async function animationViewport(page, label) {
  await page.waitForFunction(() => {
    if (JSON.parse(window.render_game_to_text()).mode !== 'animation') return false;
    const title = document.querySelector('#animation-title').getBoundingClientRect();
    const canvas = document.querySelector('#day-canvas').getBoundingClientRect();
    const skip = document.querySelector('#skip-animation').getBoundingClientRect();
    return title.top >= -1 && canvas.top >= -1 && canvas.bottom <= innerHeight + 1 && skip.top >= -1 && skip.bottom <= innerHeight + 1;
  }, null, { timeout: 5000 }).catch(() => {});
  const m = await page.evaluate(() => {
    const rect = selector => {
      const {top,bottom,left,right,width,height} = document.querySelector(selector).getBoundingClientRect();
      return {top,bottom,left,right,width,height};
    };
    return {mode:JSON.parse(window.render_game_to_text()).mode,viewport:{width:innerWidth,height:innerHeight},scrollY,
      heading:rect('#animation-title'),canvas:rect('#day-canvas'),skip:rect('#skip-animation'),
      figureInStage:document.querySelector('#animation-stage').contains(document.querySelector('#day-canvas')),
      resultHidden:document.querySelector('#reaction-view').hidden || !document.querySelector('#reaction-view').getClientRects().length,
      canvasCount:document.querySelectorAll('#day-canvas').length,
      horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1};
  });
  assert.equal(m.mode,'animation',`${label}: choice must show the animation before text`);
  for(const [name,rect] of [['heading',m.heading],['canvas',m.canvas],['skip',m.skip]])
    assert.ok(rect.top>=-1 && rect.bottom<=m.viewport.height+1,`${label}: ${name} outside viewport ${JSON.stringify(rect)}`);
  assert.equal(m.figureInStage,true,`${label}: the existing figure moves into the animation stage`);
  assert.equal(m.resultHidden,true,`${label}: result text is hidden during animation`);
  assert.equal(m.canvasCount,1,`${label}: the animation uses the single existing canvas`);
  assert.equal(m.horizontalOverflow,false,`${label}: no horizontal overflow`);
  assert.ok(m.skip.height>=44,`${label}: skip has a touch target of at least 44px`);
  return {label,...m};
}

module.exports = { storyViewport, skipAnimation, animationViewport };
