(() => {
  'use strict';
  const tools = document.querySelector('.catalog-tools');
  const cards = [...document.querySelectorAll('.tool-card')];
  const search = document.querySelector('#search');
  const filters = [...document.querySelectorAll('.category-filters button')];
  const count = document.querySelector('#result-count');
  const empty = document.querySelector('.empty-state');
  const normalize = value => value.normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g, ' ').trim();
  const index = cards.map(card => ({card, category: card.dataset.category, text: normalize(card.textContent + ' ' + card.dataset.keywords)}));
  const params = new URLSearchParams(location.search);
  let category = filters.some(button => button.dataset.category === params.get('category')) ? params.get('category') : 'all';
  search.value = params.get('q') || '';
  function update(saveUrl = true) {
    const terms = normalize(search.value).split(' ').filter(Boolean);
    let visible = 0;
    index.forEach(item => {
      const show = (category === 'all' || item.category === category) && terms.every(term => item.text.includes(term));
      item.card.hidden = !show;
      if (show) visible++;
    });
    filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === category)));
    count.textContent = category === 'all' && !terms.length ? `전체 ${cards.length}개 도구` : `${cards.length}개 중 ${visible}개 도구`;
    empty.hidden = visible > 0;
    if (saveUrl) {
      const url = new URL(location.href);
      search.value.trim() ? url.searchParams.set('q', search.value.trim()) : url.searchParams.delete('q');
      category === 'all' ? url.searchParams.delete('category') : url.searchParams.set('category', category);
      try { history.replaceState(null, '', url); } catch (_) { /* Some file URL contexts restrict history. */ }
    }
  }
  search.addEventListener('input', () => update());
  filters.forEach(button => button.addEventListener('click', () => { category = button.dataset.category; update(); }));
  document.querySelector('#clear-filters').addEventListener('click', () => { search.value = ''; category = 'all'; update(); search.focus(); });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.target.closest('input, textarea, select, [contenteditable]')) {
      event.preventDefault(); search.focus();
    }
  });
  tools.hidden = false;
  update(false);
})();
