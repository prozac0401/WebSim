(() => {
  'use strict';
  const E = window.RoutineEngine, levels = window.RoutineLevels, $ = id => document.getElementById(id);
  const S = window.RoutineBotStorage, T = window.RoutineBotTiming;
  const store = S.create(undefined, levels), loaded = store.load();
  let saved = loaded.data;
  const blank = () => ({main: [], F1: [], F2: []}), clone = value => JSON.parse(JSON.stringify(value));
  const labels = {forward: '앞으로', left: '왼쪽 회전', right: '오른쪽 회전', wait: '기다리기', repeat: '반복', blocked: '앞이 막힘?', mark: '별 위인가?', box: '앞에 상자?', home: '내 집 위?', F1: 'F1 부르기', F2: 'F2 부르기'};
  const symbols = {forward: '↑', left: '↶', right: '↷', wait: '◷', repeat: '↻', blocked: '▥?', mark: '★?', box: '□?', home: '⌂?', F1: 'F1', F2: 'F2'};
  const chapters = ['','01 · 첫 번째 발걸음','02 · 되풀이의 정원','03 · 생각하는 갈림길','04 · 주머니 속 작은 코드','BONUS · 조금 더 먼 집'];
  const dirs = ['북쪽 ↑','동쪽 →','남쪽 ↓','서쪽 ←'];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let level, program, scope = {root: 'main', trail: []}, selected = null, history = [], runner = null, snapshot = null;
  const collapsedBranches = new Set();
  let running = false, clock = 0, mapIndex = 0, verifiedMaps = 0, totalSteps = 0, transitioning = false, hintIndex = 0;
  let sequence = 0, generation = 0, message = '', celebration = 0, anim = null, audio = null, lastTime = performance.now();
  const initialSaveNotice = loaded.status === 'unavailable' ? '저장 불가 · 이 탭에서만 유지' : loaded.status === 'corrupt' ? '저장 손상 · 새 여정 시작' : loaded.status === 'recovered' ? '이전 저장 복구됨' : loaded.status === 'repaired' ? '일부 코드 손상 · 정상 기록 복구' : '';
  let saveProblem = initialSaveNotice;
  let hazardViewKey = '';
  let tracker = null, selectedRobot = 'A', totalTurns = 0, tutorialIndex = 0, tutorialRunner = null;
  const ctx = $('canvas').getContext('2d');
  function unlocked() { return levels.filter(l => S.isUnlocked(saved,l.id,levels)).map(l=>l.id); }
  function observedRobot() { return snapshot?.robots?.find(r=>r.id===selectedRobot)||snapshot; }
  const recordVersion = () => S.versionKey(level);
  const formatTime = ms => `${Math.floor(ms/60000)}분 ${((ms%60000)/1000).toFixed(1)}초`;
  function syncChallenge() { if(tracker&&level) saved.challenges[level.id]=tracker.snapshot(); }
  function locked() { return !!tracker?.snapshot().resting || $('help-dialog').open; }
  function renderTiming() {
    if(!tracker)return;
    const t=tracker.snapshot();
    $('solve-time').textContent=(t.started?`활성 풀이 ${formatTime(t.elapsedMs)}${t.resting?' · 쉬는 중':t.finished?' · 기록 완료':''}`:'도전 시작 전 · 기록 없음')+(t.hintUsed?' · 도움/예시 사용':'');
    $('challenge-start').hidden=t.started;
    $('rest').disabled=!t.started||t.finished;$('rest').textContent=t.resting?'풀이 재개':'쉬기';
    $('new-record').hidden=!t.started;
    const records=saved.records?.[level.id]?.[recordVersion()];
    const best=records?.unassisted?.best, aided=records?.assisted?.best;
    $('record-summary').textContent=best?`개인 최고 ${formatTime(best.elapsedMs)} · 최초 ${formatTime(records.first.elapsedMs)}`:aided?`도움 받은 최고 ${formatTime(aided.elapsedMs)} · 최초 ${formatTime(records.first.elapsedMs)}`:saved.records?.[level.id]&&Object.keys(saved.records[level.id]).length?'다른 지도·규칙 버전 기록 있음':saved.completed[level.id]?'기존 완료 · 시간 기록 없음':'';
    document.querySelector('.editor').inert=!!t.resting;
    $('timing-note').textContent=t.resting?'쉬는 동안 편집과 실행은 잠겨요. 풀이 재개를 누르면 이어집니다.':t.finished?'기록 완료. 다시 실행은 연습입니다. 시간을 새로 재려면 새 기록 도전을 누르세요.':'도전 시작부터 생각·편집·일시정지 검토 포함 · 도움말·쉬기·숨겨진 시간 제외 · 이 기기의 개인 기록';
  }
  function uid() { return 'b' + Date.now().toString(36) + '-' + (++sequence); }
  function persist() {
    syncChallenge();
    saved.currentLevel = level.id; saved.programs[level.id] = clone(program);
    const result = store.save(saved);
    if (!result.ok) saveProblem = '저장 불가 · 이 탭에서만 유지';
    else saveProblem = '';
    $('save-status').textContent = saveProblem || '✓ 기기에 자동 저장';
  }
  function tell(text) { message = text; $('message').textContent = text; }
  // Older saves may exceed a newer level cap while remaining safe data.
  // Relax only that cap for migration/editing; all structural rules still apply.
  function validateWithoutLevelCap(candidate) { return E.validate(candidate,{...level,maxCommands:E.LIMITS.commands}); }
  function budgetNotice(count) { return `저장 ${count}개가 제한 ${level.maxCommands}개를 넘어요. 코드는 유지했어요. ${count-level.maxCommands}개 줄인 뒤 실행해 주세요.`; }
  function nodeKey(node) { return node.type === 'if' ? node.condition : node.type === 'call' ? node.target : node.type; }
  function listAt(where = scope) {
    let list = program[where.root];
    for (const part of where.trail) { const parent = list.find(n => n.id === part.id); if (!parent || !Array.isArray(parent[part.branch])) return null; list = parent[part.branch]; }
    return list;
  }
  function locate(id) {
    function visit(list, root, trail) {
      for (const n of list) { if (n.id === id) return {root, trail};
        for (const branch of ['body','then','else']) if (n[branch]) { const found = visit(n[branch],root,trail.concat({id:n.id,branch})); if (found) return found; }
      }
    }
    for (const root of ['main','F1','F2']) { const found = visit(program[root],root,[]); if(found) return found; }
    return null;
  }
  function scopeTitle() {
    const parts = [scope.root === 'main' ? '시작' : scope.root];
    let list = program[scope.root];
    for (const p of scope.trail) { const n = list.find(n => n.id === p.id); if (!n) break;
      parts.push(p.branch === 'body' ? n.count + '회 반복' : labels[n.condition] + (p.branch === 'then' ? ' 예' : ' 아니요')); list = n[p.branch];
    }
    return parts.join(' › ');
  }
  function revealScope() { scope.trail.forEach(p => collapsedBranches.delete(p.id + ':' + p.branch)); }
  function sameScope(a, b) { return a.root === b.root && JSON.stringify(a.trail) === JSON.stringify(b.trail); }
  function stop(reset = false) {
    generation++; running = false; clock = 0;
    if (reset) { if (runner) runner.cancel(); runner = null; snapshot = null; transitioning = false; verifiedMaps = 0; totalSteps = 0; totalTurns = 0; anim = null; celebration = 0; $('success-panel').hidden = true; }
    renderPlayback();
  }
  function edit(change, after) {
    if(locked()){tell('풀이를 재개한 뒤 편집해 주세요.');return false;}
    const before = clone(program), previousScope = clone(scope), previousSelected = selected;
    const previousCount = E.validate(before,level).count;
    change();
    const validation = E.validate(program, level);
    const repairing = previousCount > level.maxCommands && validation.count <= previousCount && validateWithoutLevelCap(program).ok;
    if (!validation.ok && !repairing) { program = before; scope = previousScope; selected = previousSelected; tell(validation.errors[0]); return false; }
    history.push({program:before,scope:previousScope,selected:previousSelected}); if(history.length > 40) history.shift();
    stop(true); mapIndex = 0; if(after) after();
    persist(); renderEditor(); renderMapDescription(); draw();
    if(previousCount>level.maxCommands)tell(validation.count>level.maxCommands?budgetNotice(validation.count):'블록 제한 안에 들어왔어요. 실행해서 길을 확인해 보세요.');
    return true;
  }
  function add(kind) {
    const id = uid(); let n = {id,type:kind};
    if (kind === 'repeat') n = {id,type:'repeat',count:3,body:[]};
    if (['blocked','mark','box','home'].includes(kind)) n = {id,type:'if',condition:kind,then:[],else:[]};
    if (kind === 'F1' || kind === 'F2') n = {id,type:'call',target:kind};
    const ok = edit(() => { const list = listAt(); const i = list.findIndex(n => n.id === selected); list.splice(i < 0 ? list.length : i + 1,0,n); selected = id;
      if (n.type === 'repeat' || n.type === 'if') { scope.trail.push({id,branch:n.type === 'repeat' ? 'body' : 'then'}); selected = null; }
    });
    if(ok) tell(n.type === 'repeat' ? '반복을 펼쳤어요. 되풀이할 블록을 넣어 주세요.' : n.type === 'if' ? '예 가지에 코드를 넣어요. 아니요 가지의 추가 버튼으로 위치를 바꿀 수 있어요.' : labels[kind] + ' 블록을 넣었어요.');
  }
  function renderEditor() {
    const previousFocus=document.activeElement;
    const focusField=['data-add','data-scope','data-node','data-enter','data-insert','data-repeat','data-function'].find(key=>previousFocus?.hasAttribute(key));
    const focusValue=focusField?previousFocus.getAttribute(focusField):null;
    if(!listAt()) {scope={root:'main',trail:[]};selected=null;}
    revealScope();
    const checked=E.validate(program,level);
    $('command-count').textContent=`저장 ${checked.count} / ${level.maxCommands}개`;
    $('command-count').setAttribute('aria-label',`저장한 블록 ${checked.count}개, 이 레벨의 제한 ${level.maxCommands}개`);
    $('command-count').classList.toggle('over',!checked.ok);
    $('budget-rule').textContent=checked.count>level.maxCommands?budgetNotice(checked.count):`저장 블록 ${level.maxCommands}개 안에서 집에 도착해요.`;
    $('budget-rule').classList.toggle('over',checked.count>level.maxCommands);
    const paletteKeys=['forward','left','right','repeat','wait','blocked','mark','box','home','F1','F2'].filter(k=>level.unlocks.includes(k));
    $('palette').replaceChildren(...paletteKeys.map(kind=>{const b=document.createElement('button');b.dataset.add=kind;b.setAttribute('aria-label',labels[kind]+' 넣기');b.innerHTML=`<span class="symbol" aria-hidden="true">${symbols[kind]}</span><span>${labels[kind]}</span>`;b.onclick=()=>add(kind);return b;}));
    $('scope-tabs').replaceChildren(...['main','F1','F2'].filter(root=>root==='main'||level.unlocks.includes(root)).map(root=>{const b=document.createElement('button');b.dataset.scope=root;b.textContent=root==='main'?'시작':root+' 보관함';b.setAttribute('aria-pressed',String(scope.root===root));b.onclick=()=>{scope={root,trail:[]};selected=null;renderEditor();};return b;}));
    $('scope-name').textContent=scopeTitle();$('scope-back').hidden=!scope.trail.length;
    $('program').replaceChildren();
    $('program').setAttribute('aria-label',(scope.root==='main'?'시작':scope.root)+' 명령 트리');
    function renderList(list, where, container) {
    if(!list.length&&!where.trail.length){const empty=document.createElement('div');empty.className='empty-program';empty.textContent=where.root==='main'?'↑ 위의 블록을 눌러 첫 발걸음을 넣어 주세요.':'자주 쓰는 움직임을 담아 주세요. 시작에서 '+where.root+'을 부르면 실행돼요.';container.append(empty);}
    list.forEach((n,index)=>{
      const treeNode=document.createElement('div');treeNode.className='tree-node';
      const key=nodeKey(n),card=document.createElement('div');card.className='block '+n.type;card.dataset.block=n.id;
      const active=observedRobot();
      card.classList.toggle('selected',selected===n.id);card.classList.toggle('executing',active?.currentId===n.id&&snapshot?.status!=='failure');card.classList.toggle('crashed',active?.currentId===n.id&&(snapshot?.status==='failure'||active?.event?.cancelled));
      const b=document.createElement('button');b.className='block-main';b.dataset.node=n.id;b.setAttribute('aria-label',`${index+1}번 ${labels[key]} 선택`);b.setAttribute('aria-pressed',String(selected===n.id));
      b.innerHTML=`<span class="block-number">${String(index+1).padStart(2,'0')}</span><span class="symbol" aria-hidden="true">${symbols[key]}</span><span>${labels[key]}${n.type==='repeat'?' × '+n.count:''}</span>`;
      b.onclick=()=>{scope=clone(where);selected=n.id;renderEditor();};card.append(b);treeNode.append(card);
      const children=document.createElement('div');children.className='tree-children';
      const enter=(branch,label)=>{
        const branchKey=n.id+':'+branch,expanded=!collapsedBranches.has(branchKey);
        const branchLabel=branch==='body'?'반복':label+' 가지';
        const childScope={root:where.root,trail:where.trail.concat({id:n.id,branch})};
        const e=document.createElement('button');e.className='enter';e.dataset.enter=branchKey;e.textContent=(branch==='body'?'':label+' ')+(expanded?'접기 ▾':'펼치기 ▸');
        e.setAttribute('aria-expanded',String(expanded));e.setAttribute('aria-controls','branch-'+branchKey);e.setAttribute('aria-label',label+' '+(expanded?'접기':'펼치기'));
        e.onclick=()=>{
          if(expanded){collapsedBranches.add(branchKey);if(scope.root===where.root&&scope.trail.some(p=>p.id===n.id&&p.branch===branch)){scope=clone(where);selected=n.id;}tell(branchLabel+(branch==='body'?'을':'를')+' 접었어요. 명령은 그대로예요.');}
          else{collapsedBranches.delete(branchKey);tell(branchLabel+(branch==='body'?'을':'를')+' 펼쳤어요. 추가할 위치를 골라 주세요.');}
          renderEditor();
        };card.append(e);
        const group=document.createElement('div');group.className='tree-branch';group.id='branch-'+branchKey;group.hidden=!expanded;group.setAttribute('role','group');group.setAttribute('aria-label',label+' 명령');
        group.classList.toggle('insertion-scope',sameScope(scope,childScope));
        const insertion=document.createElement('button');insertion.className='branch-insert';insertion.dataset.insert=branchKey;
        insertion.textContent='＋ '+branchLabel+'에 추가'+(sameScope(scope,childScope)?' · 선택됨':'');insertion.setAttribute('aria-pressed',String(sameScope(scope,childScope)));
        insertion.onclick=()=>{scope=clone(childScope);selected=null;renderEditor();tell(scopeTitle()+' 맨 뒤에 넣어요. 위에서 블록을 골라 주세요.');};group.append(insertion);
        const branchList=document.createElement('div');branchList.className='tree-list';renderList(n[branch],childScope,branchList);group.append(branchList);
        if(!n[branch].length){const hint=document.createElement('p');hint.className='branch-empty';hint.textContent='위의 명령 블록을 골라 담아 주세요.';group.append(hint);}
        children.append(group);
      };
      if(n.type==='repeat'){
        const countLabel=document.createElement('label');countLabel.className='repeat-count';countLabel.append('횟수 ');
        const count=document.createElement('select');count.dataset.repeat=n.id;count.setAttribute('aria-label',`${index+1}번 반복 횟수`);
        for(let v=2;v<=12;v++){const option=document.createElement('option');option.value=v;option.textContent=v+'회';count.append(option);}count.value=n.count;
        count.onchange=()=>edit(()=>{const current=listAt(where).find(node=>node.id===n.id);current.count=Number(count.value);});countLabel.append(count);card.append(countLabel);
        enter('body','반복');
      }
      if(n.type==='if'){enter('then','예');enter('else','아니요');}
      if(n.type==='call'){const e=document.createElement('button');e.className='enter';e.textContent=n.target+' 편집 ↗';e.dataset.function=n.target;e.onclick=()=>{scope={root:n.target,trail:[]};selected=null;renderEditor();};card.append(e);}
      if(children.childElementCount)treeNode.append(children);
      container.append(treeNode);
    });
    }
    renderList(program[scope.root],{root:scope.root,trail:[]},$('program'));
    const list=listAt();
    const i=list.findIndex(n=>n.id===selected);$('move-up').disabled=i<=0;$('move-down').disabled=i<0||i===list.length-1;$('delete').disabled=i<0;
    $('selected-name').textContent=i<0?'블록을 선택하면 옮길 수 있어요':`${i+1}번 ${labels[nodeKey(list[i])]} 다음에 넣어요`;
    $('insert-end').textContent=selected?'＋ 선택 해제 · 맨 뒤에 넣기':'＋ 이 범위 맨 뒤에 넣기';
    $('undo').disabled=!history.length;$('clear').disabled=!checked.count;
    $('save-status').textContent=saveProblem||'✓ 기기에 자동 저장';
    $('editor-tip').textContent=level.id===1?'↑ 앞으로를 세 번 누른 다음, ▶ 실행해 보세요.':level.id===4?'↻ 반복 아래로 가지가 펼쳐져요. 되풀이할 일을 담아 보세요.':level.id===7?'예 / 아니요 가지의 추가 버튼으로 넣을 위치를 골라요.':level.id===10?'F1 보관함에 코드를 담고 시작에서 불러 보세요.':'블록 선택 → 그 뒤에 추가 · 가지의 ＋ 버튼 → 넣을 위치 선택';
    const active=observedRobot(),stack=active?.callStack?.map(s=>s.target)||[];
    $('execution-path').textContent=snapshot?.event?(snapshot.robots?`${selectedRobot} 실행: `:'실행: ')+'시작'+(stack.length?' → '+stack.join(' → '):'')+' · '+(active?.message||snapshot.message):'편집: '+scopeTitle();
    $('execution-path').classList.toggle('active',!!snapshot?.event);
    // Rebuilding the cards must not strand keyboard users on the document body.
    let nextFocus=focusField?document.querySelector(`[${focusField}="${CSS.escape(focusValue)}"]`):null;
    if(!nextFocus&&['data-enter','data-insert','data-repeat'].includes(focusField))nextFocus=document.querySelector(`[data-scope="${scope.root}"]`);
    if(!nextFocus&&focusField==='data-function')nextFocus=document.querySelector(`[data-scope="${scope.root}"]`);
    if(previousFocus?.id==='scope-back'&&$('scope-back').hidden)nextFocus=document.querySelector(`[data-scope="${scope.root}"]`);
    if(nextFocus&&!nextFocus.hidden)nextFocus.focus({preventScroll:true});
  }
  function renderLevels() {
    S.grantUnlocked(saved,levels);const open=unlocked();$('progress-count').textContent=levels.filter(l=>saved.completed[l.id]).length+' / '+levels.length;
    const title=(l,i)=>(saved.completed[l.id]?'✓ ':typeof l.id==='string'?'새 도전 · ':'')+(i+1)+'. '+l.title;
    $('level-select').replaceChildren(...levels.map((l,i)=>{const o=document.createElement('option');o.value=l.id;o.textContent=title(l,i);o.disabled=!open.includes(l.id);return o;}));$('level-select').value=level.id;
    $('level-buttons').replaceChildren(...levels.map((l,i)=>{const b=document.createElement('button');b.dataset.level=l.id;b.textContent=title(l,i);b.disabled=!open.includes(l.id);b.setAttribute('aria-current',String(l.id===level.id));b.onclick=()=>{loadLevel(l.id);$('level-panel').hidden=true;$('levels-toggle').setAttribute('aria-expanded','false');};return b;}));
  }
  function showCurrentCommand() {
    const currentId=observedRobot()?.currentId;if(!currentId)return;
    const card=$('program').querySelector(`[data-block="${CSS.escape(currentId)}"]`);
    if(!card)return;
    const tree=$('program');let rect=card.getBoundingClientRect();
    if(getComputedStyle(tree).overflowY==='auto'){
      const bounds=tree.getBoundingClientRect();
      if(rect.top<bounds.top+4)tree.scrollTop+=rect.top-bounds.top-4;
      else if(rect.bottom>bounds.bottom-4)tree.scrollTop+=rect.bottom-bounds.bottom+4;
    }
    rect=card.getBoundingClientRect();
    const top=matchMedia('(max-width:740px)').matches?document.querySelector('.stage').getBoundingClientRect().bottom+12:12;
    const bottom=window.innerHeight-12;
    if(rect.top<top)window.scrollBy({top:rect.top-top,behavior:'instant'});
    else if(rect.bottom>bottom)window.scrollBy({top:rect.bottom-bottom,behavior:'instant'});
  }
  function renderMapDescription() {
    const map=level.maps[mapIndex],r=snapshot?.robot||map.start;
    const robots=snapshot?.robots||map.robots||[];
    $('coop-legend').hidden=!robots.length;
    $('robot-select').replaceChildren(...robots.map((robot,i)=>{const b=document.createElement('button');b.dataset.robot=robot.id;b.setAttribute('aria-pressed',String(robot.id===selectedRobot));b.textContent=`${robot.id} ${i?'◇':'○'} · ${robot.message||'출발 준비'}`;b.onclick=()=>{selectedRobot=robot.id;const where=locate(observedRobot()?.currentId);if(where)scope=where;renderEditor();renderMapDescription();showCurrentCommand();draw();};return b;}));
    const cells=[];map.rows.forEach((row,y)=>[...row].forEach((c,x)=>{if(c!=='#')cells.push(`${x},${y}${c==='H'?' 집':c==='*'?' 별':''}`);}));
    const hazards=E.hazardState(map,snapshot?.movementCount||0);
    $('map-description').textContent=`왼쪽 위가 0,0. x는 오른쪽, y는 아래. 로봇 ${r.x},${r.y}, ${dirs[r.dir]}. 걸을 수 있는 칸: ${cells.join(' / ')}. 그 외는 벽.`+(hazards.cells.length?` 시간 ${hazards.time}. 지금 위험: ${hazards.active.map(c=>c.x+','+c.y).join(' / ')||'없음'}. 다음 행동 뒤 위험: ${hazards.nextActive.map(c=>c.x+','+c.y).join(' / ')||'없음'}.`:'');
    $('canvas').setAttribute('aria-label',`${level.title}. 지도 ${mapIndex+1}/${level.maps.length}. 로봇 ${r.x},${r.y}, ${dirs[r.dir]}.`);
    if(robots.length){const detail=` 로봇: ${robots.map(r=>`${r.id} (${r.x},${r.y}) ${dirs[r.dir]}, 자기 집 (${r.home.x},${r.home.y})`).join(' / ')}. 상자: ${(snapshot?.boxes||map.boxes||[]).map(c=>`${c.x},${c.y}`).join(' / ')||'없음'}. 상자 목적지: ${(map.targets||[]).map(c=>`${c.x},${c.y}`).join(' / ')||'없음'}.`;$('map-description').textContent+=detail;$('canvas').setAttribute('aria-label',level.title+detail);}
    $('tile-state').hidden=map.rows[r.y][r.x]!=='*';
    $('map-select').value=mapIndex;
  }
  function loadLevel(id) {
    if(!S.isUnlocked(saved,id,levels)){tell('앞선 도전을 마치면 이 길이 열려요.');if(level)$('level-select').value=level.id;return;}
    if(tracker){tracker.pause('level');persist();}
    stop(true);level=levels.find(l=>String(l.id)===String(id))||levels[0];mapIndex=0;selectedRobot='A';
    tracker=T.createTracker({now:()=>performance.now(),saved:saved.challenges[level.id],versionKey:recordVersion()});
    if(document.hidden)tracker.pause('hidden');
    program=clone(saved.programs[level.id]||blank());
    if(!validateWithoutLevelCap(program).ok){program=blank();saveProblem='이 레벨의 잘못된 코드를 초기화했어요';}
    scope={root:'main',trail:[]};selected=null;history=[];hintIndex=0;collapsedBranches.clear();hazardViewKey='';$('hazard-guide').open=false;
    $('chapter-name').textContent=chapters[level.chapter]||'함께 만드는 귀갓길';$('level-title').textContent=String(levels.indexOf(level)+1).padStart(2,'0')+' · '+level.title;$('brief').textContent=level.brief;
    $('map-choice').hidden=level.maps.length<2;
    $('map-select').replaceChildren(...level.maps.map((m,i)=>{const o=document.createElement('option');o.value=i;o.textContent='지도 '+(i+1);return o;}));
    $('hint-text').textContent='막히면, 길을 다른 눈으로 바라봐요.';$('hint').textContent='✦ 작은 힌트';$('hint').disabled=false;
    const count=E.validate(program,level).count;
    tell(count>level.maxCommands?budgetNotice(count):level.id===1?'↑ 앞으로를 눌러 블록을 넣어요. 집까지 이어 볼까요?':level.brief);
    persist();renderLevels();renderEditor();renderMapDescription();renderPlayback();renderTiming();draw();
  }
  function renderPlayback() {
    $('run').textContent=running?'▶ 실행 중':runner&&snapshot?.status==='running'?'▶ 이어서':tracker&&!tracker.snapshot().started?'도전 시작 · 실행':'▶ 실행';$('run').disabled=running||locked();$('pause').disabled=!running;$('step').disabled=locked();$('reset').disabled=locked();
    $('status-dot').className='status-dot '+(running?'running':snapshot?.status==='failure'?'failure':'');
    $('executed').textContent='턴 '+(totalTurns+(snapshot?.movementCount||0))+' · 실행 '+(totalSteps+(snapshot?.steps||0))+'회';
    $('step').textContent=level?.maps[mapIndex].robots?'한 턴':'한 단계';
  }
  function startRunner() {
    if(locked())return false;
    const checked=E.validate(program,level);if(!checked.ok){tell(checked.errors.join(' '));return false;}
    if(!program.main.length){tell('시작에 블록을 하나 넣어 주세요.');return false;}
    if(!runner||['success','failure','cancelled'].includes(snapshot?.status)&&!transitioning){tracker.start();tracker.attempt();persist();stop(true);mapIndex=0;runner=E.createRunner(program,level,0);snapshot=runner.snapshot();renderTiming();}
    return true;
  }
  function sound(kind) {
    if(saved.settings.muted||!audio)return;
    try{const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.connect(gain);gain.connect(audio.destination);oscillator.type='sine';oscillator.frequency.value=kind==='success'?784:kind==='failure'?180:440;gain.gain.setValueAtTime(.04,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.12);oscillator.start();oscillator.stop(audio.currentTime+.13);}catch(_){/* sound is optional */}
  }
  function unlockAudio(){if(!saved.settings.muted){try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});}catch(_){saved.settings.muted=true;updateSound();}}}
  function oneStep() {
    if(transitioning){totalSteps+=snapshot.steps;totalTurns+=snapshot.movementCount;mapIndex++;runner=E.createRunner(program,level,mapIndex);snapshot=runner.snapshot();anim=null;transitioning=false;scope={root:'main',trail:[]};selected=null;tell('같은 코드로 지도 '+(mapIndex+1)+'도 출발!');renderEditor();renderMapDescription();renderPlayback();return;}
    if(!runner)return;
    const from=snapshot?.robot||level.maps[mapIndex].start,fromTime=snapshot?.movementCount||0;snapshot=runner.step();
    anim=snapshot.robots||snapshot.event?.reason==='hazard'?null:{from:clone(from),to:clone(snapshot.robot),fromTime,elapsed:0,duration:190/saved.settings.speed};
    const active=observedRobot(),where=locate(active?.currentId);if(where){scope=where;selected=snapshot.status==='failure'?active.currentId:null;}
    tell(snapshot.message);
    if(snapshot.status==='success') {
      verifiedMaps++;
      if(mapIndex+1<level.maps.length){transitioning=true;tell('지도 '+(mapIndex+1)+' 도착! 코드를 그대로 다음 지도에 보내요.');}
      else complete();
    } else if(snapshot.status==='failure'){running=false;sound('failure');}
    else sound('step');
    renderEditor();renderPlayback();renderMapDescription();showCurrentCommand();
  }
  function complete() {
    running=false;celebration=reduced.matches?0:1100;sound('success');
    const count=E.validate(program,level).count,executed=totalSteps+snapshot.steps;
    const timed=tracker.snapshot();
    if(!timed.finished){const record=tracker.finish();S.recordCompletion(saved,level.id,recordVersion(),{...record,stored:count,executed,turns:totalTurns+snapshot.movementCount});}
    else {const previous=saved.completed[level.id];if(!previous||previous===true||count<previous.stored)saved.completed[level.id]={stored:count,executed};}
    persist();renderLevels();$('success-panel').hidden=false;
    const last=level===levels.at(-1),result=tracker.snapshot();
    $('success-title').textContent=last?'모든 길이 집으로 이어졌어요!':snapshot.robots?'모든 배송과 귀가 완료!':'집에 도착했어요!';
    $('success-detail').textContent=`${timed.finished?'연습 완료 · 이전 기록 ':''}풀이 ${formatTime(result.elapsedMs)} · ${totalTurns+snapshot.movementCount}턴 · 저장 ${count} / ${level.maxCommands}개 · 실행 ${executed}회 · 시도 ${result.attempts}회 · ${result.hintUsed?'힌트·예시 사용':'도움 없음'}`+(level.maps.length>1?` · 지도 ${verifiedMaps}개 통과`:'');
    $('next-level').textContent=last?'여정 돌아보기 ↗':'다음 길 →';
    renderTiming();tell(last?`${levels.length}개 레벨의 마지막 길에 도착했어요!`:'도착! 모든 목표가 함께 충족됐어요.');
  }
  $('run').onclick=()=>{unlockAudio();if(startRunner()){running=true;clock=0;oneStep();renderPlayback();draw();}};
  $('pause').onclick=()=>{stop(false);tell('멈췄어요. 한 단계씩 살펴보거나 이어서 실행하세요.');draw();};
  $('step').onclick=()=>{unlockAudio();stop(false);if(startRunner()){oneStep();renderPlayback();draw();}};
  $('reset').onclick=()=>{stop(true);mapIndex=0;tell('처음 위치로 돌아왔어요. 코드는 그대로예요.');renderEditor();renderMapDescription();draw();};
  $('speed').value=saved.settings.speed;$('speed').onchange=()=>{saved.settings.speed=Number($('speed').value);clock=0;persist();};
  $('map-select').onchange=()=>{const i=Number($('map-select').value);stop(true);mapIndex=i;tell('지도 '+(i+1)+' 미리 보기. 실행하면 첫 지도부터 같은 코드를 시험해요.');renderMapDescription();renderEditor();draw();};
  $('scope-back').onclick=()=>{scope.trail.pop();selected=null;renderEditor();};
  $('insert-end').onclick=()=>{selected=null;renderEditor();tell('지금 범위의 맨 뒤에 넣어요. 위에서 블록을 골라 주세요.');};
  $('move-up').onclick=()=>edit(()=>{const list=listAt(),i=list.findIndex(n=>n.id===selected);if(i>0)[list[i-1],list[i]]=[list[i],list[i-1]];});
  $('move-down').onclick=()=>edit(()=>{const list=listAt(),i=list.findIndex(n=>n.id===selected);if(i>=0&&i<list.length-1)[list[i+1],list[i]]=[list[i],list[i+1]];});
  $('delete').onclick=()=>{if(selected)edit(()=>{const list=listAt(),i=list.findIndex(n=>n.id===selected);if(i>=0)list.splice(i,1);selected=null;});};
  $('clear').onclick=()=>{if(edit(()=>{program=blank();scope={root:'main',trail:[]};selected=null;}))tell('코드를 비웠어요. 실행 취소로 되돌릴 수 있어요.');};
  $('undo').onclick=()=>{if(locked()||!history.length)return;const old=history.pop();stop(true);program=old.program;scope=old.scope;selected=old.selected;mapIndex=0;persist();renderEditor();renderMapDescription();draw();tell('방금 편집을 되돌렸어요.');};
  $('hint').onclick=()=>{tracker.hint();persist();const hints=level.hints;$('hint-text').textContent=hints[Math.min(hintIndex,hints.length-1)];hintIndex++;$('hint').textContent=hintIndex>=hints.length?'✦ 힌트 모두 봤어요':'✦ 한 번 더 보기';$('hint').disabled=hintIndex>=hints.length;};
  $('level-select').onchange=()=>loadLevel($('level-select').value);
  $('next-level').onclick=()=>{const next=S.nextLevelId(level.id,levels);if(next===null){$('level-panel').hidden=false;$('levels-toggle').setAttribute('aria-expanded','true');$('level-panel').scrollIntoView({behavior:'instant'});}else loadLevel(next);};
  $('levels-toggle').onclick=()=>{$('level-panel').hidden=!$('level-panel').hidden;$('levels-toggle').setAttribute('aria-expanded',String(!$('level-panel').hidden));};
  $('levels-close').onclick=()=>{$('level-panel').hidden=true;$('levels-toggle').setAttribute('aria-expanded','false');};
  $('challenge-start').onclick=()=>{tracker.start();persist();renderTiming();renderPlayback();tell('도전을 시작했어요. 생각하고 편집하는 시간도 기록돼요.');};
  $('rest').onclick=()=>{if(tracker.snapshot().resting)tracker.resume('rest');else{stop(false);tracker.pause('rest');}persist();renderTiming();renderPlayback();};
  $('new-record').onclick=()=>{stop(true);tracker.restart();hintIndex=0;$('hint-text').textContent='막히면, 길을 다른 눈으로 바라봐요.';$('hint').textContent='✦ 작은 힌트';$('hint').disabled=false;persist();renderTiming();renderEditor();renderMapDescription();renderPlayback();draw();tell('새 기록 도전을 시작했어요. 작성한 코드는 유지돼요.');};
  const lessons=[
    {key:'box',title:'상자 하나는 앞으로 밀어요',text:'앞에 상자 하나, 그 뒤에 빈칸이 있으면 상자와 로봇이 함께 한 칸 전진해요. 앞으로 블록을 그대로 써요.',level:'box-intro',actions:['forward']},
    {key:'box-chain',title:'미는 방향의 두 상자는 막혀요',text:'옆으로 붙은 상자는 괜찮아요. 앞으로 두 개가 이어지면 밀리지 않으니 옆길로 돌아 분리해요. 여기서 막힌 이동도 한 턴을 써요.',level:'box-detour',actions:['forward','left','forward','right','forward','forward','right','forward']},
    {key:'cooperation',title:'같은 코드, 각자의 판단',text:'앞에 상자?를 두 로봇이 각자 판단해요. 예는 앞으로, 아니요는 기다리기. A/B 번호로 코드를 나누지 않아요.',level:'coop-intro',demo:'branch'},
    {key:'collision',title:'같은 칸을 원하면 둘 다 멈춰요',text:'같은 목적지·같은 상자·자리 맞교환은 모두 취소돼요. 다른 로봇이 턴 시작에 있던 칸도 못 들어가요. 기다리기로 차례를 만들어요.',level:'coop-gate',demo:'collision'},
    {key:'clear-path',title:'친구가 다른 방향에서 길을 열어요',text:'A 앞의 통로를 B가 위에서 밀어 열어요. B가 아직 있는 칸에는 A가 들어갈 수 없어요. 한 턴씩 보며 기다릴 순간을 찾아요.',level:'coop-gate',demo:'branch'},
    {key:'all-goals',title:'배송과 귀가가 함께 끝나야 해요',text:'▣ 목적지마다 상자가 있고, A ○와 B ◇가 자기 집에 동시에 있어야 성공이에요. 먼저 도착해도 멈추지 않고 다시 도울 수 있어요.',level:'coop-delivery',actions:['forward','right','right','forward']},
    {key:'wait',title:'기다리기로 위험 박자를 바꿔요',text:'×는 지금 위험한 칸이에요. 기다리기도 한 턴이므로 안전한 출발 칸에서 쉬고 가면 도착 박자가 달라져요. 현실에서 기다리는 시간과는 달라요.',level:'wait-beat',actions:['wait','forward']},
    {key:'condition',title:'막힌 앞을 보고 회전해요',text:'조건은 이 순간의 상태를 한 번 읽어요. 예이면 오른쪽 회전, 아니요이면 그대로. 뒤에 공통 앞으로를 놓으면 길이 다른 지도에도 같은 약속을 쓸 수 있어요.',level:'condition-fork',demo:'condition'},
    {key:'function',title:'부른 동작이 끝나면 돌아와요',text:'F1은 이름 붙인 동작 묶음이에요. 시작에서 부르면 들어갔다가 호출 다음으로 돌아와요. 아래 예시는 F1의 앞으로·오른쪽 회전을 실행해요.',level:'function-reuse',demo:'function'},
    {key:'coop-timing',title:'두 로봇이어도 시간은 한 번',text:'한 로봇이 기다리고 다른 로봇이 밀어도 전체 시간은 한 턴만 진행해요. 판단과 함수 진입은 시간을 늘리지 않아요. 위험칸에 있는 로봇을 먼저 확인한 뒤 전체 목표를 확인해요.',level:'coop-finale',demo:'timing'}
  ];
  function tutorialSetup(){
    const lesson=lessons[tutorialIndex], source=levels.find(l=>l.id===lesson.level)||levels[0];let map=clone(source.maps[0]);
    let serial=0;const node=(type,extra={})=>({id:'demo-'+(++serial),type,...extra});
    let main=(lesson.actions||[]).map(type=>node(type)),F1=[];
    if(lesson.demo==='branch'){map=clone(levels.find(l=>l.id==='coop-gate').maps[0]);main=[node('if',{condition:'box',then:[node('forward')],else:[node('wait')]})];}
    if(lesson.demo==='collision'){map={rows:['#######','#.....#','#.....#','#######'],start:{x:2,y:1,dir:1},robots:[{id:'A',x:2,y:1,dir:1,home:{x:1,y:2}},{id:'B',x:4,y:1,dir:3,home:{x:5,y:2}}],boxes:[],targets:[]};main=[node('forward'),node('wait')];}
    if(lesson.demo==='condition')main=[node('if',{condition:'blocked',then:[node('right')],else:[]}),node('forward')];
    if(lesson.demo==='function'){main=[node('call',{target:'F1'})];F1=[node('forward'),node('right')];}
    if(lesson.demo==='timing')main=[node('if',{condition:'box',then:[node('forward')],else:[node('wait')]})];
    tutorialRunner=E.createRunner({main,F1,F2:[]},{maps:[map],maxCommands:128,maxSteps:100,unlocks:['forward','left','right','wait','if','box','blocked','home','mark','repeat','call','F1','F2']});
    $('tutorial-page').textContent=`규칙 ${tutorialIndex+1} / ${lessons.length}`;$('tutorial-title').textContent=lesson.title;$('tutorial-text').textContent=lesson.text;$('tutorial-result').textContent='버튼을 눌러 예시를 직접 움직여 보세요.';
    $('tutorial-prev').disabled=tutorialIndex===0;$('tutorial-next').textContent=tutorialIndex===lessons.length-1?'처음부터 다시 보기':'다음 규칙';
    $('tutorial-practice').textContent=saved.completed[lesson.level]?'완료한 도전 다시 보기':'이 도전에서 연습';
    $('tutorial-practice').disabled=!S.isUnlocked(saved,lesson.level,levels);
    if($('tutorial-practice').disabled)$('tutorial-result').textContent='연습 지도는 앞선 도전을 마치면 열려요. 여기서는 예시를 움직일 수 있어요.';
    tutorialDraw(map,tutorialRunner.snapshot());
    $('tutorial-act').onclick=()=>{let s=tutorialRunner.snapshot();if(['success','failure'].includes(s.status)){tutorialSetup();return;}const time=s.movementCount;for(let guard=0;guard<100;guard++){s=tutorialRunner.step();if(s.movementCount!==time||!['ready','running'].includes(s.status))break;}tutorialDraw(map,s);$('tutorial-result').textContent=`${s.movementCount}턴 · ${(s.callStack||[]).map(f=>f.target).join(' → ')} ${s.message}`;};
  }
  function tutorialDraw(map,s){
    const scene=$('tutorial-scene');scene.replaceChildren();scene.style.gridTemplateColumns=`repeat(${map.rows[0].length},1fr)`;
    const robots=s.robots||[{...s.robot,id:'A'}],hazards=E.hazardState(map,s.movementCount).active;
    map.rows.forEach((row,y)=>[...row].forEach((cell,x)=>{const el=document.createElement('span');el.className='tutorial-cell'+(cell==='#'?' wall':'');const robot=robots.find(r=>r.x===x&&r.y===y),box=s.boxes?.some(b=>b.x===x&&b.y===y),target=map.targets?.some(t=>t.x===x&&t.y===y),home=map.robots?.find(r=>r.home.x===x&&r.home.y===y)||(!map.robots&&cell==='H'?{id:'A'}:null);el.textContent=robot?robot.id+(robot.id==='A'?'○':'◇'):box?'□':cell==='*'?'★':'';if(target)el.classList.add('target');if(robot)el.classList.add('demo-robot');if(home||target){const badge=document.createElement('small');badge.className='demo-goal';badge.textContent=home?`${home.id}${home.id==='A'?'○':'◇'} 집`:'▣ 목적지';el.append(badge);}if(hazards.some(h=>h.x===x&&h.y===y)){const hazard=document.createElement('b');hazard.className='demo-hazard';hazard.textContent='×';el.append(hazard);}scene.append(el);}));
  }
  function openHelp(event){event?.preventDefault();stop(false);tracker.pause('help');tracker.hint();persist();const key=level.tutorial;tutorialIndex=Math.max(0,lessons.findIndex(l=>l.key===key));tutorialSetup();$('help-dialog').showModal();renderPlayback();renderTiming();}
  function closeHelp(){if($('help-dialog').open)$('help-dialog').close();tracker.resume('help');persist();renderTiming();renderPlayback();tell('도움말을 닫았어요. 실행은 ▶ 이어서로 직접 재개하세요.');}
  $('help-open').onclick=openHelp;$('tutorial-open').onclick=openHelp;$('help-close').onclick=closeHelp;$('tutorial-skip').onclick=closeHelp;
  $('help-dialog').addEventListener('cancel',e=>{e.preventDefault();closeHelp();});
  $('tutorial-next').onclick=()=>{tutorialIndex=(tutorialIndex+1)%lessons.length;tutorialSetup();};$('tutorial-prev').onclick=()=>{tutorialIndex=Math.max(0,tutorialIndex-1);tutorialSetup();};
  $('tutorial-practice').onclick=()=>{const id=lessons[tutorialIndex].level;closeHelp();if(S.isUnlocked(saved,id,levels))loadLevel(id);};
  document.addEventListener('visibilitychange',()=>{if(document.hidden){tracker.pause('hidden');stop(false);}else tracker.resume('hidden');persist();renderTiming();renderPlayback();});
  window.addEventListener('pagehide',()=>{tracker.pause('hidden');persist();});
  window.addEventListener('pageshow',()=>{if(tracker&&!document.hidden)tracker.resume('hidden');});
  setInterval(()=>{if(tracker){persist();renderTiming();}},1000);
  function updateSound(){ $('sound').textContent=saved.settings.muted?'♪ 소리 꺼짐':'♪ 소리 켜짐';$('sound').setAttribute('aria-pressed',String(!saved.settings.muted));$('sound').setAttribute('aria-label',saved.settings.muted?'소리 켜기':'소리 끄기'); }
  $('sound').onclick=()=>{saved.settings.muted=!saved.settings.muted;unlockAudio();updateSound();persist();sound('step');};
  document.addEventListener('keydown',event=>{if(event.target.closest('input,select,textarea,[contenteditable]'))return;
    if(locked())return;
    if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();(running?$('pause'):$('run')).click();return;}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();$('undo').click();return;}
    if(event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.code==='Space'&&!event.target.closest('button,a,summary')){event.preventDefault();(running?$('pause'):$('run')).click();}
    if(event.key.toLowerCase()==='r')$('reset').click();
    if(event.key.toLowerCase()==='f'){if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else $('game').requestFullscreen?.().catch(()=>{});}
    if(event.key==='Delete'&&!event.target.closest('button'))$('delete').click();
  });
  // One synchronous clock owns all execution; reset/edit/level transitions cancel it.
  // No delayed promise or timeout can write an old runner back into the new level.
  function update(ms){
    if(anim)anim.elapsed+=ms;if(celebration>0)celebration=Math.max(0,celebration-ms);
    if(!running)return;clock+=ms;let count=0;const ticket=generation;
    while(running&&clock>=560/saved.settings.speed&&count++<1000&&ticket===generation){clock-=560/saved.settings.speed;oneStep();}
  }
  function rounded(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.stroke();}}
  function line(x1,y1,x2,y2,color,width=2){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke();}
  function star(x,y,r,color){ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,d=i%2?r*.45:r;const px=x+Math.cos(a)*d,py=y+Math.sin(a)*d;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fillStyle=color;ctx.fill();}
  function visualRobot(){
    const robot=snapshot?.robot||level.maps[mapIndex].start;
    if(!anim||reduced.matches)return {...robot};
    const t=Math.min(1,anim.elapsed/anim.duration),smooth=t*t*(3-2*t);let d=anim.to.dir-anim.from.dir;if(d>2)d-=4;if(d<-2)d+=4;
    return {x:anim.from.x+(anim.to.x-anim.from.x)*smooth,y:anim.from.y+(anim.to.y-anim.from.y)*smooth,dir:anim.from.dir+d*smooth};
  }
  function visualTime(){return anim&&!reduced.matches&&anim.elapsed<anim.duration?anim.fromTime:snapshot?.movementCount||0;}
  function renderHazards(){
    const map=level.maps[mapIndex],time=visualTime(),state=E.hazardState(map,time),target=snapshot?.movementCount||0;
    $('hazard-guide').hidden=!state.cells.length;
    const key=level.id+':'+mapIndex+':'+time+':'+target;if(key===hazardViewKey)return state;hazardViewKey=key;
    $('hazard-time').textContent='시간 '+time+(time!==target?' → '+target:'');
    const future=Array.from({length:6},(_,offset)=>E.hazardState(map,time+offset));
    $('hazard-schedule').replaceChildren(...state.cells.map((cell,index)=>{
      const row=document.createElement('div');row.className='hazard-row';
      const label=document.createElement('strong');label.textContent=String.fromCharCode(65+index);label.title=`위험 칸 ${cell.x},${cell.y}`;row.append(label);
      for(let tick=time;tick<=time+5;tick++){
        const active=future[tick-time].cells[index].active,slot=document.createElement('span');slot.className='hazard-slot'+(active?' danger':'');
        slot.textContent=(active?'×':'·')+' '+tick;slot.setAttribute('aria-label',`시간 ${tick}: ${active?'위험':'안전'}`);row.append(slot);
      }
      return row;
    }));return state;
  }
  function drawCooperative(map,tile,ox,oy){
    const robots=snapshot?.robots||map.robots, boxes=snapshot?.boxes||map.boxes||[];
    const colors=['#21765e','#7955a1'], shapes=['○','◇'];
    robots.forEach((r,i)=>{const x=ox+r.home.x*tile,y=oy+r.home.y*tile;rounded(x+3,y+2,tile-6,tile-6,8,'#fff4d5',colors[i]);ctx.fillStyle=colors[i];ctx.font=`bold ${tile*.23}px system-ui`;ctx.textAlign='center';ctx.fillText(`${r.id} ${shapes[i]} 집`,x+tile*.5,y+tile*.91);});
    boxes.forEach(b=>{const x=ox+b.x*tile,y=oy+b.y*tile;rounded(x+tile*.16,y+tile*.14,tile*.68,tile*.66,5,'#d09b5b','#704b28');line(x+tile*.22,y+tile*.2,x+tile*.78,y+tile*.73,'#8d6234',3);line(x+tile*.78,y+tile*.2,x+tile*.22,y+tile*.73,'#8d6234',3);});
    robots.forEach((r,i)=>{const x=ox+(r.x+.5)*tile,y=oy+(r.y+.43)*tile;
      rounded(x-tile*.3,y-tile*.27,tile*.6,tile*.54,i?3:tile*.2,colors[i],'#fffdf4');
      ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font=`bold ${tile*.27}px system-ui`;ctx.fillText(`${r.id}${shapes[i]}`,x,y+tile*.07);
      const d=E.DIRECTIONS[r.dir];line(x+d.x*tile*.32,y+d.y*tile*.32,x+d.x*tile*.44,y+d.y*tile*.44,'#a36b17',4);
      ctx.save();ctx.translate(x+d.x*tile*.43,y+d.y*tile*.43);ctx.rotate(r.dir*Math.PI/2);ctx.beginPath();ctx.moveTo(0,-tile*.08);ctx.lineTo(-tile*.07,tile*.04);ctx.lineTo(tile*.07,tile*.04);ctx.closePath();ctx.fillStyle='#a36b17';ctx.fill();ctx.restore();
      if(r.id===selectedRobot){ctx.save();ctx.setLineDash([4,3]);rounded(x-tile*.43,y-tile*.41,tile*.86,tile*.82,8,null,colors[i]);ctx.restore();}
    });
    // Draw the target border last so boxes AND robots cannot hide it.
    (map.targets||[]).forEach(t=>{const x=ox+t.x*tile,y=oy+t.y*tile,filled=boxes.some(b=>b.x===t.x&&b.y===t.y);ctx.save();ctx.setLineDash([5,3]);rounded(x+2,y+1,tile-4,tile-4,3,null,filled?'#21765e':'#6e5731');ctx.restore();ctx.fillStyle=filled?'#21765e':'#6e5731';ctx.font=`bold ${tile*.22}px system-ui`;ctx.textAlign='left';ctx.fillText(filled?'▣✓':'▣',x+2,y+tile*.96);});
    (snapshot?.event?.actions||[]).forEach(a=>{if(a.type!=='push'&&!a.cancelled)return;const r=robots.find(r=>r.id===a.robotId);if(!r)return;ctx.fillStyle=a.cancelled?'#b3372c':'#1b795a';ctx.font=`bold ${tile*.2}px system-ui`;ctx.textAlign='center';ctx.fillText(a.cancelled?'× 막힘':'↑ 밀기',ox+(r.x+.5)*tile,oy+(r.y+.02)*tile);});
  }
  function draw(){
    if(!level)return;const W=820,H=570;ctx.clearRect(0,0,W,H);ctx.fillStyle='#e8efdf';ctx.fillRect(0,0,W,H);
    // Quiet pencil grid and a hand-built garden island. No external art or fonts.
    ctx.fillStyle='#d7e0ca';for(let y=25;y<H;y+=30)for(let x=20;x<W;x+=30){ctx.beginPath();ctx.arc(x,y,.9,0,Math.PI*2);ctx.fill();}
    const map=level.maps[mapIndex],rows=map.rows.length,cols=map.rows[0].length,hazards=renderHazards();
    const tile=Math.min(83,650/cols,430/rows),ox=(W-cols*tile)/2,oy=(H-rows*tile)/2+9;
    rounded(ox-14,oy+12,cols*tile+28,rows*tile+10,26,'#b9c8a7');rounded(ox-14,oy-12,cols*tile+28,rows*tile+18,26,'#d3dfc4');
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
      const c=map.rows[y][x],px=ox+x*tile,py=oy+y*tile;
      if(c==='#'){
        rounded(px+3,py+5,tile-6,tile-7,Math.min(13,tile*.17),'#bdcda9');rounded(px+3,py+1,tile-6,tile-9,Math.min(13,tile*.17),'#cbd8b9');
        if((x*3+y*7)%5===0){line(px+tile*.42,py+tile*.61,px+tile*.43,py+tile*.4,'#a1b58b',2);line(px+tile*.43,py+tile*.55,px+tile*.35,py+tile*.46,'#a1b58b',2);line(px+tile*.43,py+tile*.5,px+tile*.51,py+tile*.39,'#a1b58b',2);}
      }else{
        rounded(px+2,py+6,tile-4,tile-5,10,'#bdc5a9');rounded(px+2,py+1,tile-4,tile-6,10,'#f7f1d8','#e5dfc2');
        if(c==='*'){star(px+tile/2,py+tile/2,tile*.24,'#c68b36');star(px+tile/2,py+tile/2,tile*.13,'#fff0ae');}
        if(c==='H'){
          rounded(px+tile*.17,py+tile*.38,tile*.66,tile*.48,6,'#f7bd82','#d08d52');
          ctx.beginPath();ctx.moveTo(px+tile*.1,py+tile*.43);ctx.lineTo(px+tile*.5,py+tile*.06);ctx.lineTo(px+tile*.9,py+tile*.43);ctx.closePath();ctx.fillStyle='#bf7656';ctx.fill();
          rounded(px+tile*.4,py+tile*.55,tile*.21,tile*.31,4,'#6e8a6c');rounded(px+tile*.65,py+tile*.53,tile*.12,tile*.13,2,'#fff2b3');
          ctx.fillStyle='#5d714e';ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.fillText('집',px+tile*.5,py+tile+15);
        }
      }
    }
    const start=map.start;ctx.fillStyle='#b1bb9d';ctx.beginPath();ctx.arc(ox+(start.x+.5)*tile,oy+(start.y+.55)*tile,tile*.21,0,Math.PI*2);ctx.fill();
    hazards.cells.forEach((cell,index)=>{
      const x=ox+cell.x*tile,y=oy+cell.y*tile;
      if(cell.active){
        rounded(x+3,y+2,tile-6,tile-7,9,'#eec1ae','#a54432');
        line(x+tile*.28,y+tile*.27,x+tile*.73,y+tile*.72,'#a54432',Math.max(2,tile*.06));line(x+tile*.73,y+tile*.27,x+tile*.28,y+tile*.72,'#a54432',Math.max(2,tile*.06));
      }else{
        ctx.save();ctx.setLineDash([4,4]);rounded(x+4,y+3,tile-8,tile-9,8,null,cell.nextActive?'#a15b24':'#999c86');ctx.restore();
        if(cell.nextActive){ctx.fillStyle='#9b5424';ctx.textAlign='center';ctx.font=`bold ${tile*.34}px system-ui`;ctx.fillText('!',x+tile*.5,y+tile*.64);}
      }
      ctx.fillStyle=cell.active?'#843a2b':'#62694e';ctx.font=`bold ${Math.max(21,tile*.3)}px system-ui`;ctx.textAlign='left';ctx.fillText(String.fromCharCode(65+index),x+tile*.07,y+tile*.29);
      if(cell.active&&cell.nextActive){ctx.font=`bold ${tile*.22}px system-ui`;ctx.textAlign='right';ctx.fillText('!',x+tile*.87,y+tile*.85);}
      const underlying=map.rows[cell.y][cell.x];
      if(underlying==='*'||underlying==='H'){
        rounded(x+tile*.66,y+tile*.04,tile*.28,tile*.27,3,'#fff6da','#be9761');
        if(underlying==='*')star(x+tile*.8,y+tile*.17,tile*.1,'#ad7524');
        else {ctx.fillStyle='#70542e';ctx.font=`bold ${Math.max(9,tile*.17)}px system-ui`;ctx.textAlign='center';ctx.fillText('집',x+tile*.8,y+tile*.23);}
      }
    });
    if(snapshot?.collision){const c=snapshot.collision,x=ox+c.x*tile,y=oy+c.y*tile;rounded(x+3,y+2,tile-6,tile-6,10,'#e9bd9e','#bd5b37');line(x+tile*.34,y+tile*.34,x+tile*.66,y+tile*.66,'#aa452b',4);line(x+tile*.66,y+tile*.34,x+tile*.34,y+tile*.66,'#aa452b',4);}
    if(map.robots){drawCooperative(map,tile,ox,oy);return;}
    const visual=visualRobot(),rx=visual.x,ry=visual.y,angle=visual.dir*Math.PI/2;
    const cx=ox+(rx+.5)*tile,cy=oy+(ry+.5)*tile,bounce=celebration>0?Math.abs(Math.sin(celebration/110))*5:0;
    const actual=snapshot?.robot||map.start;
    if(snapshot?.event?.reason==='hazard'){
      rounded(ox+actual.x*tile+1,oy+actual.y*tile,tile-2,tile-3,10,null,'#9d3129');
      ctx.fillStyle='#9d3129';ctx.font=`bold ${tile*.28}px system-ui`;ctx.textAlign='center';ctx.fillText('×',cx+tile*.42,cy-tile*.28);
    }
    if(map.rows[actual.y][actual.x]==='*'){
      ctx.strokeStyle='#bd8126';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(cx,cy+tile*.13,tile*.42,tile*.32,0,0,Math.PI*2);ctx.stroke();
      star(cx+tile*.39,cy+tile*.3,tile*.12,'#b07824');
    }
    ctx.fillStyle='#546a4d30';ctx.beginPath();ctx.ellipse(cx,cy+tile*.28,tile*.3,tile*.13,0,0,Math.PI*2);ctx.fill();
    ctx.save();ctx.translate(cx,cy-bounce);const s=tile/80;ctx.scale(s,s);
    rounded(-23,11,15,17,5,'#456252');rounded(8,11,15,17,5,'#456252');rounded(-29,-22,58,45,16,'#6b9677','#41684f');rounded(-26,-25,52,40,13,'#fff9df','#5e8265');
    rounded(-18,-16,36,23,9,'#315e54');ctx.fillStyle='#e8f5d1';ctx.beginPath();ctx.arc(-8,-5,3.4,0,Math.PI*2);ctx.arc(8,-5,3.4,0,Math.PI*2);ctx.fill();
    line(0,-26,0,-34,'#527857',3);ctx.beginPath();ctx.arc(0,-37,5,0,Math.PI*2);ctx.fillStyle='#e6ab53';ctx.fill();
    rounded(-34,-8,7,19,3,'#6c9777');rounded(27,-8,7,19,3,'#6c9777');
    // Direction is a separate large arrow, leaving the face upright at every turn.
    ctx.rotate(angle);ctx.beginPath();ctx.moveTo(0,-56);ctx.lineTo(-9,-43);ctx.lineTo(9,-43);ctx.closePath();ctx.fillStyle='#bd8126';ctx.fill();ctx.restore();
    if(!snapshot){ctx.fillStyle='#506d4a';ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.fillText('출발',cx,cy+tile*.65);}
    if(celebration>0){for(let i=0;i<18;i++){const a=i*2.4,t=(1100-celebration)/1100,d=30+t*110,x=cx+Math.cos(a)*d,y=cy+Math.sin(a)*d-t*20;ctx.globalAlpha=1-t;star(x,y,3+(i%3),i%2?'#c88c38':'#50876c');}ctx.globalAlpha=1;}
  }
  window.render_game_to_text=()=>JSON.stringify({game:'routinebot',coordinates:'origin top-left; x right; y down; dir 0 N,1 E,2 S,3 W',level:level.id,mapIndex,maps:level.maps.length,rows:level.maps[mapIndex].rows,robot:snapshot?.robot||level.maps[mapIndex].start,robots:snapshot?.robots||level.maps[mapIndex].robots||[],boxes:snapshot?.boxes||level.maps[mapIndex].boxes||[],targets:level.maps[mapIndex].targets||[],selectedRobot,challenge:tracker?.snapshot(),records:saved.records[level.id]||{},helpOpen:$('help-dialog').open,renderedRobot:visualRobot(),movementCount:snapshot?.movementCount||0,turns:totalTurns+(snapshot?.movementCount||0),renderedTime:visualTime(),hazards:E.hazardState(level.maps[mapIndex],snapshot?.movementCount||0),renderedHazards:E.hazardState(level.maps[mapIndex],visualTime()),status:running?'running':snapshot?.status||'ready',paused:!running&&snapshot?.status==='running',stored:E.validate(program,level).count,executed:totalSteps+(snapshot?.steps||0),currentId:observedRobot()?.currentId||null,event:snapshot?.event||null,callStack:observedRobot()?.callStack||[],collision:snapshot?.collision||null,editing:scopeTitle(),program:clone(program),completed:Object.keys(saved.completed).map(id=>/^\d+$/.test(id)?Number(id):id),unlocked:unlocked(),verifiedMaps,message,saveStatus:saveProblem||'saved',reducedMotion:reduced.matches,generation});
  window.advanceTime=ms=>{update(Math.max(0,Math.min(Number(ms)||0,600000)));draw();};
  function frame(now){const dt=Math.min(100,Math.max(0,now-lastTime));lastTime=now;update(dt);draw();requestAnimationFrame(frame);}
  S.grantUnlocked(saved,levels);updateSound();loadLevel(S.isUnlocked(saved,saved.currentLevel,levels)?saved.currentLevel:levels[0].id);if(initialSaveNotice)tell(initialSaveNotice+' · 플레이는 계속할 수 있어요.');requestAnimationFrame(frame);
})();
