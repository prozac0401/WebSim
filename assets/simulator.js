(() => {
  'use strict';
  const script = document.currentScript;
  if (!script) return;
  const base = new URL('../', script.src);
  const current = new URL(location.href);
  const folder = current.pathname.split('/').filter(Boolean).slice(-2, -1)[0];
  const labs = [
    ['weekend_recovery_simulator', '주말 회복 플래너', '생활·도구', '계획 비교', '활동과 휴식의 배치를 바꾸고, 같은 가정 안에서 주말 계획의 여유를 비교하세요.'],
    ['qr_generator', 'QR 코드 만들기', '생활·도구', '정보 부호화', '글과 웹주소를 스캔할 수 있는 그림으로 바꿉니다. 입력한 내용, 보정 수준, 저장 크기를 함께 확인하세요.'],
    ['conway-game-of-life', '생명 게임', '패턴·성장', '세포 자동자', '살아 있는 이웃의 수만으로 다음 세대를 정합니다. 작은 시작 무늬가 어떻게 반복하고 이동하는지 관찰하세요.'],
    ['aco_simulator', '개미의 길 찾기', '무리·사회', '확률적 최적화', '개미의 탐색과 페로몬 갱신으로 경로를 개선합니다. 같은 도시 배치에서 설정에 따른 탐색 결과를 비교하세요.'],
    ['boids_simulation', '새 떼의 움직임', '무리·사회', '개체 기반 모형', '피하기, 방향 맞추기, 모이기. 개별 개체의 작은 규칙이 전체 무리의 움직임을 만드는 과정을 살펴보세요.'],
    ['cosmic-simulator-single-div', '클릭으로 만드는 우주', '우주·물리', '합체·분열 실험', '천체를 만들고 합체와 분열을 관찰하세요. 단순한 입자 규칙으로 만든 상호작용 실험입니다.'],
    ['gravity_simulator', '중력과 위성의 궤도', '우주·물리', '뉴턴식 중력', '위성의 시작 위치와 속도를 바꿔 궤도를 비교하세요. 끌어당기는 힘과 이동 방향이 만드는 경로를 관찰합니다.'],
    ['langtons_ant_simulator', '랭턴의 개미', '패턴·성장', '격자 위의 규칙', '칸의 색에 따라 회전하고, 색을 바꾼 뒤 한 칸 이동합니다. 두 규칙이 남기는 복잡한 발자취를 따라가세요.'],
    ['ulam_spiral', '울람 나선과 소수', '패턴·성장', '수학 시각화', '정수를 나선으로 배치하고 소수의 위치를 표시합니다. 배치 방식에 따라 드러나는 대각선 무늬를 살펴보세요.'],
    ['fractal_tree_simulator', '반복해서 만드는 나무와 무늬', '패턴·성장', 'L-System', '문자열을 치환하고 선으로 그리는 규칙을 반복합니다. 각도와 반복 횟수에 따른 구조의 변화를 비교하세요.'],
    ['dla_simulator', '입자 모양 성장 실험', '패턴·성장', '확산 제한 응집', '무작위로 움직이는 입자가 접촉하며 가지를 만듭니다. 붙을 확률과 이웃 판정이 성장 모양에 미치는 영향을 관찰하세요.'],
    ['predator_prey_simulator', '포식자와 먹이의 관계', '생태·순환', '개체 기반 생태 모형', '식물, 초식동물, 육식동물의 먹이 관계를 관찰합니다. 개체 수와 자원이 시간에 따라 함께 변하는 모습을 비교하세요.'],
    ['ant_nitrogen_cycle_simulator', '개미와 땅속 양분', '생태·순환', '양분 이동과 순환', '양분을 옮기는 개미와 식물의 변화를 관찰하세요. 어디로 이동하고 얼마나 남는지 함께 읽을 수 있습니다.'],
    ['schelling_segregation_simulator', '이웃 선호와 주거 분리', '무리·사회', 'Schelling 모형', '개별 주민의 이웃 선호가 전체 배치에 미치는 영향을 살펴보세요. 조건 충족 비율과 같은 집단의 이웃 비율을 구분해 읽습니다.'],
    ['vicsek_boids_simulator', '무리가 방향을 맞추는 두 방식', '무리·사회', 'Vicsek / Boids', '이웃의 방향을 따라가는 방식과 세 힘을 조합하는 방식을 비교합니다. 국소 규칙과 전체 정렬의 관계를 관찰하세요.']
  ];
  const index = labs.findIndex(lab => lab[0] === folder);
  if (index < 0 || document.querySelector('.lab-topbar')) return;
  const [id, title, category, model, description] = labs[index];
  document.body.classList.add('websim-page', 'lab-page');
  document.body.dataset.lab = id;
  document.documentElement.lang = 'ko';
  document.title = `${title} · WebSim`;

  // Embedded experiments retain their compact layout and omit site navigation.
  if (window.self !== window.top) {
    document.body.classList.add('lab-embedded');
    return;
  }
  const helpUrl = new URL(`${id}/${id}_doc.html`, base).href;
  const homeUrl = new URL('index.html', base).href;
  const header = document.createElement('header');
  header.className = 'websim-nav lab-topbar';
  header.innerHTML = `<div class="lab-topbar-inner">
    <a class="lab-brand websim-home" href="${homeUrl}" aria-label="WebSim 전체 도구 목록"><span class="lab-brand-mark" aria-hidden="true">W<span>·</span></span><span>WebSim<small>Interactive labs</small></span></a>
    <div class="lab-topbar-right">
      <details class="lab-switcher"><summary>다른 실험 <span aria-hidden="true">⌄</span></summary><div class="lab-switcher-menu"><p>다음 실험을 골라 보세요</p><nav aria-label="15개 도구 목록">${labs.map(([slug, name, group]) => `<a href="${new URL(`${slug}/${slug === 'dla_simulator' ? 'standalone' : slug}.html`, base).href}"${slug === id ? ' aria-current="page"' : ''}><span>${name}</span><small>${group}</small></a>`).join('')}</nav><a class="lab-all-tools" href="${homeUrl}">전체 도구 목록 보기 <span aria-hidden="true">↗</span></a></div></details>
      <a class="lab-help-link" href="${helpUrl}">이론·사용법 <span aria-hidden="true">↗</span></a>
    </div>
  </div>`;
  const heading = document.createElement('section');
  heading.className = 'lab-heading';
  heading.setAttribute('aria-labelledby', 'lab-title');
  heading.innerHTML = `<div class="lab-breadcrumb"><a href="${homeUrl}">전체 도구</a><span aria-hidden="true">/</span><span>${category}</span></div>
    <div class="lab-heading-row"><div><p class="lab-eyebrow">EXPERIMENT ${String(index + 1).padStart(2, '0')}</p><h1 id="lab-title">${title}</h1></div><span class="lab-model-badge"><i aria-hidden="true"></i>${model}</span></div>
    <p class="lab-description">${description}</p>`;
  const skip = document.createElement('a');
  skip.className = 'lab-skip-link';
  skip.href = '#lab-experiment';
  skip.textContent = '실험 화면으로 건너뛰기';
  const app = document.querySelector('.sim-app') || document.querySelector('main') || document.body.querySelector('div');
  if (app) {
    app.id ||= 'lab-experiment';
    skip.href = '#' + app.id;
    if (!app.hasAttribute('tabindex')) app.setAttribute('tabindex', '-1');
  }
  document.body.prepend(skip, header, heading);
  const footer = document.createElement('footer');
  footer.className = 'lab-footer';
  footer.innerHTML = `<span>WebSim <span aria-hidden="true">/</span> ${model}</span><a href="${helpUrl}">이 실험의 규칙과 근거 읽기 <span aria-hidden="true">↗</span></a>`;
  document.body.append(footer);
  const switcher = header.querySelector('.lab-switcher');
  document.addEventListener('click', event => { if (!switcher.contains(event.target)) switcher.open = false; });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && switcher.open) { switcher.open = false; switcher.querySelector('summary').focus(); }
  });
  document.querySelectorAll('input[id],select[id],textarea[id]').forEach(control => {
    if (control.labels?.length || control.hasAttribute('aria-label') || control.hasAttribute('aria-labelledby')) return;
    const sibling = control.previousElementSibling;
    if (sibling?.tagName === 'LABEL' && !sibling.htmlFor) sibling.htmlFor = control.id;
  });
})();
