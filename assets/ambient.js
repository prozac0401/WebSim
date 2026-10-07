(() => {
  'use strict';
  const key = 'websim.ambient';
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let preference = 'on';
  try { preference = localStorage.getItem(key) === 'off' ? 'off' : 'on'; } catch {}
  let enabled = preference === 'on' && !media.matches;
  let elapsed = 0;
  let started = performance.now();
  let button;

  // This clock is exclusively for presentation. It never advances a lab's model.
  const now = () => elapsed + (enabled ? performance.now() - started : 0);
  function refresh() {
    elapsed = now();
    started = performance.now();
    enabled = preference === 'on' && !media.matches;
    document.documentElement.dataset.ambientMotion = enabled ? 'on' : 'off';
    if (button) {
      button.setAttribute('aria-pressed', String(enabled));
      button.disabled = media.matches;
      button.querySelector('span').textContent = media.matches ? '동작 줄임' : enabled ? '효과 켜짐' : '효과 꺼짐';
      button.title = media.matches
        ? '기기의 동작 줄이기 설정에 따라 장식적인 움직임을 멈춥니다.'
        : '물빛, 궤적과 부드러운 전환을 켜거나 끕니다. 실험의 계산은 그대로입니다.';
    }
    window.dispatchEvent(new CustomEvent('websim:ambient-change', {
      detail: { enabled, reducedMotion: media.matches }
    }));
  }
  window.WebSimAmbient = Object.freeze({
    get enabled() { return enabled; },
    get reducedMotion() { return media.matches; },
    now,
    setEnabled(value) {
      preference = value ? 'on' : 'off';
      try { localStorage.setItem(key, preference); } catch {}
      refresh();
    }
  });

  const heading = document.querySelector('.lab-heading-row');
  if (heading) {
    const group = document.createElement('div');
    group.className = 'lab-appearance';
    const badge = heading.querySelector('.lab-model-badge');
    if (badge) group.append(badge);
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'ambient-toggle';
    button.setAttribute('aria-label', '잔잔한 시각 효과');
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8c3-5 5 5 9 0s6 5 9 0M3 16c3-5 5 5 9 0s6 5 9 0"/></svg><span></span>';
    button.addEventListener('click', () => window.WebSimAmbient.setEnabled(!enabled));
    group.append(button);
    heading.append(group);
  }
  media.addEventListener('change', refresh);
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) {
      preference = event.newValue === 'off' ? 'off' : 'on';
      refresh();
    }
  });
  refresh();
})();
