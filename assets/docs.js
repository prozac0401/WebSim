(() => {
  'use strict';
  const article = document.querySelector('.doc-content');
  if (!article || document.querySelector('.doc-layout')) return;
  const nav = document.querySelector('.doc-shell > .doc-nav');
  if (nav?.firstElementChild) {
    nav.firstElementChild.textContent = 'WebSim';
    nav.firstElementChild.setAttribute('aria-label', 'WebSim 전체 도구 목록');
  }
  const kicker = document.querySelector('.doc-kicker');
  if (kicker) kicker.textContent = 'WEBSIM / FIELD GUIDE';
  const layout = document.createElement('div');
  layout.className = 'doc-layout';
  const aside = document.createElement('aside');
  aside.className = 'doc-toc';
  aside.setAttribute('aria-label', '이 설명서의 목차');
  const disclosure = document.createElement('details');
  disclosure.open = matchMedia('(min-width: 721px)').matches;
  const summary = document.createElement('summary');
  summary.textContent = '이 페이지에서';
  const contents = document.createElement('nav');
  contents.setAttribute('aria-label', '사용법 목차');
  const sections = [...article.querySelectorAll(':scope > h2')];
  sections.forEach((section, index) => {
    section.id ||= `guide-section-${index + 1}`;
    const link = document.createElement('a');
    link.href = `#${section.id}`;
    const number = document.createElement('span');
    number.textContent = String(index + 1).padStart(2, '0');
    link.append(number, document.createTextNode(section.textContent));
    contents.append(link);
  });
  const principles = article.querySelector('.doc-principles');
  if (principles) {
    principles.id ||= 'guide-theory';
    const label = principles.querySelector('summary');
    if (label?.textContent.trim() === '제작 원리와 상세 기능') label.textContent = '이론적 근거와 구현 원리';
    const link = document.createElement('a');
    link.className = 'doc-toc-theory';
    link.href = `#${principles.id}`;
    link.textContent = '규칙·가정·참고자료 ↗';
    link.addEventListener('click', () => { principles.open = true; });
    contents.append(link);
    const revealHash = () => {
      const target = document.getElementById(location.hash.slice(1));
      if (target && principles.contains(target)) principles.open = true;
    };
    addEventListener('hashchange', revealHash);
    revealHash();
  }
  article.querySelectorAll('h3').forEach(heading => {
    if (heading.textContent.trim() === 'Script Functions') heading.textContent = '구현 함수';
  });
  disclosure.append(summary, contents);
  aside.append(disclosure);
  article.before(layout);
  layout.append(aside, article);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting);
      if (!visible.length) return;
      contents.querySelectorAll('[aria-current]').forEach(link => link.removeAttribute('aria-current'));
      contents.querySelector(`a[href="#${visible[0].target.id}"]`)?.setAttribute('aria-current', 'location');
    }, { rootMargin: '-10% 0px -65% 0px' });
    sections.forEach(section => observer.observe(section));
  }
})();
