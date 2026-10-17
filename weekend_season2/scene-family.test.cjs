'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Scene = require('./scene.js');
const Data = require('./data.js');

const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const members = family => [family.player, ...(family.spouse ? [family.spouse] : []), ...family.children];
function drawingHarness(reducedMotion = true) {
  const calls = [];
  const context = new Proxy({}, {
    get(target, key) { return target[key] || ((...args) => { calls.push([key, ...args]); }); },
    set(target, key, value) { calls.push([key, value]); target[key] = value; return true; }
  });
  const canvas = { width:760, height:550, clientWidth:760, clientHeight:550, isConnected:true, getContext:() => context };
  const sandbox = { matchMedia:() => ({ matches:reducedMotion }), requestAnimationFrame:() => 1, cancelAnimationFrame:() => {}, devicePixelRatio:1 };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'scene.js'), 'utf8'), sandbox);
  return { api:sandbox.S2Scene, canvas, calls, snapshot() { return JSON.stringify(calls); }, clear() { calls.length = 0; } };
}

test('scene family: gender selection changes actual drawing commands and appearance immediately', () => {
  const h = drawingHarness(), snapshots = new Set(), state = { config:{...Data.DEFAULT_CONFIG, personaName:'나래', maritalStatus:'single'}, date:'2026-01-01', artifacts:[] };
  for (const gender of ['woman','man','other','unspecified']) {
    h.clear(); h.api.attach(h.canvas, {...state, config:{...state.config,gender}}, 'read');
    const description = h.api.describe();
    assert.equal(description.character.gender, gender); assert.equal(description.character.name, '나래');
    snapshots.add(h.snapshot());
  }
  assert.equal(snapshots.size, 4, 'each choice needs a visibly distinct draw path, not metadata alone');
  h.api.update({...state,config:{...state.config,gender:'woman'}}, 'read');
  assert.equal(h.api.describe().character.appearance.hair, 'long-soft');
  assert.equal(Scene.familyLayout({gender:'female'}).player.appearance.gender,'woman');
  assert.equal(Scene.familyLayout({gender:'male'}).player.appearance.gender,'man');
  assert.equal(Scene.familyLayout({gender:'nonbinary'}).player.appearance.gender,'other');
});

test('scene gender: saved portraits and aliases show the selected hairstyle family without changing the life', () => {
  const h=drawingHarness(),traits={faceShape:'square',hairColor:'silver',skinTone:'tan',outfitPalette:'rose'};
  for(const [gender,alias] of [['man','male'],['woman','female']]){
    const drawings=new Set();
    for(const hairStyle of Scene.OPTIONS.hairStyle){
      const saved={config:{gender,appearance:{...traits,hairStyle},seed:19,generationSeed:37},date:'2026-10-17',artifacts:[{activityId:'draw'}],rng:{external:123,followup:456},stats:{mood:71,fatigue:25},cash:250000,history:[{activityId:'pottery',cost:45000}],ledger:[{amount:-45000}]},before=JSON.stringify(saved);
      Object.freeze(saved.config.appearance);
      h.clear();h.api.attach(h.canvas,saved,'read');
      const person=h.api.describe().character.appearance;
      assert.equal(person.gender,gender);
      assert.ok(Data.GENDER_HAIR_STYLES[gender].includes(person.hair),`${gender}/${hairStyle} must use its illustration family`);
      assert.equal(person.hairStyle,person.hair);assert.equal(person.options.hairStyle,person.hair);
      for(const [key,value] of Object.entries(traits))assert.equal(person.options[key],value,`${key} must keep its saved variation`);
      if(Data.GENDER_HAIR_STYLES[gender].includes(hairStyle))assert.equal(person.hair,hairStyle,'an already matching portrait stays unchanged');
      drawings.add(h.snapshot());
      assert.deepEqual(Scene.appearance({...saved.config,gender:alias}),Scene.appearance(saved.config),'legacy aliases render identically');
      h.api.advance(8000);h.api.update(saved,'read');
      assert.equal(JSON.stringify(saved),before,'rendering must not change saved appearance, money, history or RNG');
    }
    assert.equal(drawings.size,Data.GENDER_HAIR_STYLES[gender].length,'all five matching silhouettes remain available');
  }
  assert.equal(Scene.appearance({gender:'male',appearance:{hairStyle:'bun'}}).hair,'curly');
  assert.equal(Scene.appearance({gender:'female',appearance:{hairStyle:'buzz'}}).hair,'braids');
});

test('scene gender: explicit children keep their matching portraits when the parent gender changes',()=>{
  for(let generationSeed=0;generationSeed<64;generationSeed++){
    const childProfiles=['man','woman','male','female','unspecified','other'].map((gender,index)=>({age:4+index*4,gender,militaryStatus:'none'}));
    const config={gender:'man',generationSeed,children:6,maritalStatus:'married',appearance:{faceShape:'heart',hairStyle:'bun',skinTone:'warm',outfitPalette:'moss'},childProfiles},before=JSON.stringify(config);
    const family=Scene.familyLayout(config),otherParent=Scene.familyLayout({...config,gender:'woman'});
    assert.equal(family.spouse.appearance.gender,'woman');
    assert.equal(otherParent.spouse.appearance.gender,'man');
    assert.deepEqual(family.children.map(child=>child.appearance),otherParent.children.map(child=>child.appearance));
    for(const child of family.children){
      const shown=child.appearance,canonical=shown.gender;
      if(canonical==='man'||canonical==='woman')assert.ok(Data.GENDER_HAIR_STYLES[canonical].includes(shown.hair),`${child.gender}/${generationSeed} child hair must match`);
      assert.equal(shown.hair,shown.hairStyle);assert.equal(shown.hair,shown.options.hairStyle);
      assert.equal(shown.skinTone,'warm');
    }
    assert.equal(JSON.stringify(config),before);
  }
});

test('scene spouse: married gender pairs and legacy aliases render matching spouses without changing saved life data',()=>{
  const h=drawingHarness(),cases=[['man','woman'],['male','woman'],['woman','man'],['female','man'],['other','unspecified'],['nonbinary','unspecified'],['unspecified','unspecified'],['unknown','unspecified'],[null,'unspecified'],[undefined,'unspecified']];
  function freezeTree(value){if(value&&typeof value==='object'){Object.values(value).forEach(freezeTree);Object.freeze(value);}return value;}
  for(const modern of [false,true])for(const [gender,expected] of cases){
    const config={gender,age:64,maritalStatus:'married',children:2,childAge:'school',seed:19,generationSeed:37,...(modern?{appearance:{faceShape:'heart',hairStyle:'braids',hairColor:'silver',skinTone:'warm',outfitPalette:'teal'}}:{})};
    const saved=freezeTree({config,date:'2026-10-17',artifacts:[{activityId:'draw'}],rng:{external:123,followup:456},stats:{mood:71,fatigue:25},finance:{cash:250000,totalSpent:45000,ledger:[{date:'2026-10-10',type:'activity',amount:-45000}]},log:[{date:'2026-10-10',activityId:'pottery',cost:45000}]}),before=JSON.stringify(saved);
    const first=Scene.familyLayout(config,'rest',saved).spouse;
    const previousPortrait=Scene.familyLayout({...config,gender:'unspecified'}).spouse.appearance;
    assert.equal(first.appearance.gender,expected,`${gender}/${modern} spouse gender`);
    if(expected!=='unspecified')assert.ok(Data.GENDER_HAIR_STYLES[expected].includes(first.appearance.hair),`${gender}/${modern} spouse silhouette`);
    else assert.deepEqual(first.appearance,previousPortrait,'unknown older identities keep an unspecified spouse');
    for(const key of ['faceShape','hairColor','skinTone','skin','outfitPalette','top','trim'])assert.deepEqual(first.appearance[key],previousPortrait[key],`${key} keeps the spouse's original seeded appearance`);
    if(modern){assert.equal(first.appearance.hair,first.appearance.hairStyle);assert.equal(first.appearance.hair,first.appearance.options.hairStyle);}
    const canonical=gender==='male'?'man':gender==='female'?'woman':gender;
    assert.deepEqual(first.appearance,Scene.familyLayout({...config,gender:canonical}).spouse.appearance,'aliases must render identically');
    h.clear();h.api.attach(h.canvas,saved,'rest');
    if(expected!=='unspecified'){
      assert.ok(h.calls.some(call=>call[0]==='roundRect'&&call[1]===-20&&call[2]===43&&call[3]===40&&call[4]===5),'the woman clothing detail is drawn');
      assert.ok(h.calls.some(call=>call[0]==='roundRect'&&call[1]===9&&call[2]===18&&call[3]===10&&call[4]===10),'the man clothing detail is drawn');
    }
    for(const activity of Data.ACTIVITIES){
      h.api.update(saved,activity.id);
      assert.equal(JSON.stringify(h.api.describe().family.spouse.appearance),JSON.stringify(first.appearance),'spouse identity remains stable through every activity');
    }
    h.clear();h.api.update(saved,'rest');const still=h.snapshot();h.clear();h.api.advance(8000);assert.equal(h.snapshot(),still);
    assert.equal(JSON.stringify(saved),before,'rendering cannot rewrite gender, source appearance, cash, history or RNG');
    for(const maritalStatus of ['single','divorced','widowed','unspecified']){
      const absent=Scene.familyLayout({...config,maritalStatus},'rest',saved);
      assert.equal(absent.spouse,null,`${maritalStatus} must not acquire a spouse`);assert.equal(absent.personCount,3);
    }
  }
});

test('scene spouse: every generated spouse hairstyle stays inside each room across activity poses',()=>{
  for(const gender of ['man','woman']){
    const seen=new Set();
    for(let generationSeed=0;generationSeed<32;generationSeed++)for(const layout of Scene.OPTIONS.layout)for(const activity of ['rest','draw','care']){
      const config={gender,generationSeed,maritalStatus:'married',children:6,childAge:'teen',appearance:{hairStyle:'bun'},homeStyle:{layout}},family=Scene.familyLayout(config,activity),spouse=family.spouse;
      seen.add(spouse.appearance.hair);
      const b=spouse.bounds;assert.ok(b.left>=0&&b.right<=760&&b.top>=0&&b.bottom<=550,`${gender}/${spouse.appearance.hair}/${layout}/${activity} spouse clipped`);
      for(const person of [family.player,...family.children])assert.equal(overlaps(b,person.bounds),false,`${gender}/${layout}/${activity} spouse overlaps ${person.id}`);
    }
    assert.deepEqual([...seen].sort(),[...Data.GENDER_HAIR_STYLES[gender==='man'?'woman':'man']].sort(),'all spouse silhouettes remain available');
  }
});

test('scene family: marriage and child count are independent, including six-child and childless families', () => {
  for (const maritalStatus of ['single','married','divorced','widowed','unspecified']) for (let children=0; children<=6; children++) {
    const family=Scene.familyLayout({gender:'woman',maritalStatus,children,childAge:'school'},'cook');
    assert.equal(family.children.length,children);
    assert.equal(family.childCount,children);
    assert.equal(family.maritalStatus,maritalStatus);
    assert.equal(family.personCount,1+children+(maritalStatus==='married'?1:0));
    assert.equal(!!family.spouse,maritalStatus==='married');
    assert.equal(new Set(members(family).map(person=>person.id)).size,family.personCount);
    if(family.spouse)assert.equal(family.spouse.appearance.gender,'man');
  }
  assert.equal(Scene.familyLayout({children:2,childAge:'school'}).spouse,null,'legacy missing marriage setting stays unspecified/single visually');
});

test('scene family: age bands change child silhouettes without changing their count', () => {
  const h=drawingHarness(), heights=[],drawings=new Set();
  for(const childAge of ['preschool','school','teen']){
    const s={config:{...Data.DEFAULT_CONFIG,children:2,childAge,maritalStatus:'married'},date:'2026-05-01',artifacts:[]};
    h.clear();h.api.attach(h.canvas,s,'rest');drawings.add(h.snapshot());
    const family=h.api.describe().family;
    assert.equal(family.children.length,2);assert.equal(family.childAge,childAge);
    assert.ok(family.children.every(child=>child.ageStage===childAge));
    heights.push(family.children[0].bounds.bottom-family.children[0].bounds.top);
  }
  assert.ok(heights[0]<heights[1]&&heights[1]<heights[2]);
  assert.equal(drawings.size,3);
});

test('scene family: every supported family and activity fits inside the room with separated figures', () => {
  for(const gender of ['woman','man','other','unspecified'])for(const maritalStatus of ['single','married','divorced'])for(let children=0;children<=6;children++)for(const childAge of ['preschool','school','teen'])for(const activity of Data.ACTIVITIES){
    const family=Scene.familyLayout({gender,maritalStatus,children,childAge},activity.id), figures=members(family);
    for(const figure of figures){const b=figure.bounds;assert.ok(b.left>=0&&b.top>=0&&b.right<=760&&b.bottom<=550,figure.id+' outside room');}
    for(let i=0;i<figures.length;i++)for(let j=i+1;j<figures.length;j++)assert.equal(overlaps(figures[i].bounds,figures[j].bounds),false,`${gender}/${maritalStatus}/${children}/${childAge}/${activity.id}: ${figures[i].id} overlaps ${figures[j].id}`);
    for(const child of family.children){
      const furniture=[{left:64,top:330,right:267,bottom:439},{left:503,top:348,right:654,bottom:443},{left:679,top:264,right:731,bottom:426},{left:99,top:437,right:137,bottom:475},{left:674,top:459,right:732,bottom:471}];
      for(const object of furniture)assert.equal(overlaps(child.bounds,object),false,'child overlaps furniture or floor props');
    }
  }
});

test('scene family: care pose draws exactly the configured children and uses a book instead of an extra baby', () => {
  const h=drawingHarness();
  for(const children of [0,1,6]){
    h.clear();h.api.attach(h.canvas,{config:{...Data.DEFAULT_CONFIG,children,childAge:'preschool',maritalStatus:'single'},date:'2026-01-03',artifacts:[]},'care');
    assert.equal(h.api.describe().family.personCount,children+1);
    assert.equal(h.api.describe().family.children.length,children);
    assert.equal(h.calls.some(call=>call[0]==='ellipse'&&call[1]===2&&call[2]===19&&call[3]===12&&call[4]===12),false,'former extra baby head must not be drawn');
    assert.ok(h.calls.some(call=>call[0]==='roundRect'&&call[1]===-23&&call[2]===27&&call[3]===46&&call[4]===29),'care storybook remains visible');
  }
});

test('scene parenting: nine activities show distinct supplies and involve only the existing children in that age band',()=>{
  const groups={baby_feed:[0,2],baby_change:[0,2],baby_sleep:[0,2],preschool_hygiene:[3,6],preschool_play:[3,6],preschool_ready:[3,6],school_homework:[7,12],school_reading:[7,12],school_tidy:[7,12]};
  const h=drawingHarness(),state={config:{gender:'woman',maritalStatus:'married',children:6,childAge:'toddler',generationSeed:117,appearance:{hairStyle:'bun',skinTone:'warm'},childProfiles:[0,2,3,6,7,12].map((age,i)=>({age,gender:i%2?'man':'woman',militaryStatus:'none'}))},date:'2026-10-17',artifacts:[],rng:{external:123,followup:456},finance:{cash:250000,ledger:[{amount:-5000}]},log:[]},before=JSON.stringify(state),drawings=new Set();
  for(const [id,ages]of Object.entries(groups)){
    h.clear();h.api.attach(h.canvas,state,id);drawings.add(h.snapshot());const described=h.api.describe();
    assert.equal(described.character.activity,id);assert.equal(described.family.personCount,8);assert.equal(described.family.visibleChildCount,6);
    const involved=described.family.children.filter(child=>child.parentingActivity===id);
    assert.equal(involved.length,2);assert.deepEqual(Array.from(involved,child=>child.age),ages);
    assert.equal(described.family.children[0].pose,'crawl','the baby remains the existing floor figure');
    assert.equal(h.calls.some(call=>call[0]==='ellipse'&&call[1]===2&&call[2]===19&&call[3]===12&&call[4]===12),false,'parenting must not draw another baby in the parent arms');
    h.clear();h.api.update(state,id);const still=h.snapshot();h.clear();h.api.advance(5000);assert.equal(h.snapshot(),still);
    assert.equal(JSON.stringify(state),before,'supplies and poses do not spend money or advance the life');
  }
  assert.equal(drawings.size,9,'each parenting activity must have its own visible equipment');
});

test('scene parenting: age-band poses fit every room without changing child count or family placement',()=>{
  const ids=['baby_feed','baby_change','baby_sleep','preschool_hygiene','preschool_play','preschool_ready','school_homework','school_reading','school_tidy'];
  for(const layout of Scene.OPTIONS.layout)for(const children of [0,1,3,6])for(const id of ids){
    const config={gender:'man',maritalStatus:'married',children,appearance:{hairStyle:'curly'},homeStyle:{layout},childProfiles:[0,2,4,7,12,20].slice(0,children).map((age,i)=>({age,gender:i%2?'woman':'man',militaryStatus:'none'}))};
    const family=Scene.familyLayout(config,id),figures=members(family);assert.equal(family.personCount,children+2);
    for(const person of figures){const b=person.bounds;assert.ok(b.left>=0&&b.right<=760&&b.top>=0&&b.bottom<=550,`${id}/${layout}/${person.id} clipped`);}
    for(let i=0;i<figures.length;i++)for(let j=i+1;j<figures.length;j++)assert.equal(overlaps(figures[i].bounds,figures[j].bounds),false,`${id}/${layout} figures overlap`);
    const adult=family.children.find(child=>child.age===20);if(adult){assert.equal(adult.activity,'child-adult');assert.equal(adult.parentingActivity,undefined);}
  }
});

test('scene outings: handlebars, travel bag, golf equipment and steering wheel are distinct without advancing costs or accident RNG',()=>{
  const h=drawingHarness(),ids=['motorbike_tour','domestic_trip','golf_round','circuit_drive'],images=new Set();
  const state={config:{gender:'man',maritalStatus:'married',children:2,childProfiles:[{age:4,gender:'woman',militaryStatus:'none'},{age:9,gender:'man',militaryStatus:'none'}],appearance:{hairStyle:'curly'},homeStyle:{layout:'window-right'}},date:'2026-10-17',rng:{external:73,followup:29},finance:{cash:900000,ledger:[]},log:[],artifacts:[]},before=JSON.stringify(state);
  for(const id of ids){
    h.clear();h.api.attach(h.canvas,state,id);images.add(h.snapshot());const shown=h.api.describe();
    assert.equal(shown.character.activity,id);assert.equal(shown.family.personCount,4);
    for(const child of shown.family.children)assert.equal(child.parentingActivity,undefined);
    for(const layout of Scene.OPTIONS.layout){const family=Scene.familyLayout({...state.config,homeStyle:{layout}},id),figures=members(family);for(const person of figures){const b=person.bounds;assert.ok(b.left>=0&&b.right<=760&&b.top>=0&&b.bottom<=550);}for(let i=0;i<figures.length;i++)for(let j=i+1;j<figures.length;j++)assert.equal(overlaps(figures[i].bounds,figures[j].bounds),false);}
    h.api.advance(9000);assert.equal(JSON.stringify(state),before);
  }
  assert.equal(images.size,4);
});

test('scene family: reduced motion stays deterministic while updates preserve season, collection and simulation state', () => {
  const h=drawingHarness(true), state={config:{...Data.DEFAULT_CONFIG,gender:'woman',maritalStatus:'married',children:6,childAge:'teen'},date:'2026-12-25',artifacts:[{activityId:'photo'},{activityId:'pottery'},{activityId:'music'}]};
  const before=JSON.stringify(state);h.api.attach(h.canvas,state,'run');h.clear();h.api.update(state,'run');const initial=h.snapshot();h.clear();h.api.advance(20000);
  assert.equal(h.snapshot(),initial);assert.equal(JSON.stringify(state),before);
  assert.equal(h.api.describe().reducedMotion,true);assert.equal(h.api.describe().seasonMonth,12);assert.equal(h.api.describe().artifacts,3);
  for(const activity of Data.ACTIVITIES){h.api.update(state,activity.id);assert.equal(h.api.describe().character.activity,activity.id);}
});

test('scene family: divorced metadata keeps the same parent and children without adding a spouse or a visual stereotype',()=>{
  const h=drawingHarness(true),config={...Data.DEFAULT_CONFIG,gender:'woman',maritalStatus:'single',children:2,childAge:'toddler',childProfiles:[{age:2,gender:'man',militaryStatus:'none'},{age:9,gender:'woman',militaryStatus:'none'}]},state={config,date:'2026-03-01',artifacts:[],rng:{external:12,followup:34}};
  h.api.attach(h.canvas,state,'care');const single=h.snapshot(),before=JSON.stringify(state);
  const next={...state,config:{...config,maritalStatus:'divorced'}};
  h.clear();h.api.update(next,'care');const description=h.api.describe();
  assert.equal(h.snapshot(),single,'divorce changes the label, not the family appearance');
  assert.equal(description.family.maritalStatus,'divorced');assert.equal(description.family.spouse,null);
  assert.equal(description.family.personCount,3);assert.equal(description.family.childCount,2);
  assert.equal(JSON.stringify(description.family.children.map(child=>child.age)),JSON.stringify([2,9]));
  assert.equal(description.reducedMotion,true);assert.equal(JSON.stringify(state),before);
  h.clear();h.api.advance(9000);assert.equal(h.snapshot(),single);
});

test('scene variety: every face, hairstyle, skin, outfit and hair color changes drawing commands', () => {
  const h=drawingHarness(), base={gender:'unspecified',maritalStatus:'single',children:0,seed:7,generationSeed:7,appearance:{faceShape:'oval',hairStyle:'rounded-crop',hairColor:'espresso',skinTone:'warm',outfitPalette:'moss'}};
  for(const key of ['faceShape','hairStyle','hairColor','skinTone','outfitPalette']){
    const drawings=new Set();
    for(const value of Scene.OPTIONS[key]){
      const config={...base,appearance:{...base.appearance,[key]:value}};
      h.clear();h.api.attach(h.canvas,{config,date:'2026-03-01',artifacts:[]},'read');
      drawings.add(h.snapshot());
      const shown=h.api.describe().character.appearance;
      assert.equal(shown.options[key],value,`rendered ${key} must be inspectable`);
      assert.ok(shown.hairColor.startsWith('#'));
    }
    assert.equal(drawings.size,Scene.OPTIONS[key].length,`${key} cannot be metadata-only`);
  }
  assert.ok(Scene.OPTIONS.faceShape.length>=5);
  assert.ok(Scene.OPTIONS.hairStyle.length>=8);
  assert.ok(Scene.OPTIONS.skinTone.length>=4);
  assert.ok(Scene.OPTIONS.outfitPalette.length>=6);
});

test('scene variety: home palettes, structures, decorations and views are visibly distinct',()=>{
  const h=drawingHarness(),base={region:'city',homeStyle:{palette:'oat',layout:'window-left',decor:'plants',windowView:'skyline'}};
  for(const key of ['palette','layout','decor','windowView']){
    const drawings=new Set();
    for(const value of Scene.OPTIONS[key]){
      h.clear();h.api.attach(h.canvas,{config:{...base,homeStyle:{...base.homeStyle,[key]:value}},date:'2026-06-20',artifacts:[]},'rest');
      drawings.add(h.snapshot());const room=h.api.describe().home;
      assert.equal(room[key],value);assert.equal(room.legacy,false);
      assert.equal(room.mirrored,value==='window-right'||key!=='layout'&&base.homeStyle.layout==='window-right');
    }
    assert.equal(drawings.size,Scene.OPTIONS[key].length,`${key} must change the background`);
  }
  assert.ok(Scene.OPTIONS.palette.length>=6);assert.ok(Scene.OPTIONS.layout.length>=3);assert.ok(Scene.OPTIONS.decor.length>=4);
});

test('scene variety: old saves keep their default faces, outfits, palette and family proportions',()=>{
  const old={gender:'woman',age:35,maritalStatus:'married',children:1,childAge:'teen',region:'city',generationSeed:7788};
  const legacy=Scene.familyLayout(old,'rest'),home=Scene.homeStyle(old);
  assert.deepEqual(legacy.player.appearance,{gender:'woman',hair:'long-soft',top:'#b57879',trim:'#e7ccae',hairColor:'#574a3b'});
  assert.equal(legacy.player.x,165);assert.equal(legacy.children[0].scale,.53);
  assert.equal(legacy.spouse.appearance.gender,'man');assert.ok(Data.GENDER_HAIR_STYLES.man.includes(legacy.spouse.appearance.hair));assert.equal(home.legacy,true);
  assert.equal(home.colors.wall,'#ece8d7');assert.equal(home.layout,'window-left');
  assert.equal(legacy.player.appearance.options,undefined);
});

test('scene variety: seeded family portraits are stable across activities, separate members and never consume game randomness',()=>{
  const config={seed:123,generationSeed:456,gender:'man',maritalStatus:'married',children:6,childAge:'school',appearance:{faceShape:'heart',hairStyle:'braids',hairColor:'chestnut',skinTone:'tan',outfitPalette:'teal'},homeStyle:{palette:'rose',layout:'window-right',decor:'music',windowView:'river'}};
  const original=JSON.stringify(config),reference=Scene.familyLayout(config,'rest');
  const first=members(reference).map(p=>p.appearance);
  for(const activity of Data.ACTIVITIES)assert.deepEqual(members(Scene.familyLayout(config,activity.id)).map(p=>p.appearance),first);
  assert.deepEqual(Scene.familyLayout(config,'rest'),reference);
  assert.ok(new Set(first.map(a=>JSON.stringify(a.options))).size>=4,'family members should have separate visual identities');
  assert.deepEqual(reference.player.appearance.options,{...config.appearance,hairStyle:'buzz'});
  assert.notDeepEqual(Scene.familyLayout({...config,generationSeed:457},'rest').spouse.appearance,reference.spouse.appearance);
  assert.equal(JSON.stringify(config),original);
  const h=drawingHarness(true),state={config,date:'2026-08-01',artifacts:[],stats:{mood:60,fatigue:15},rng:{external:123,followup:789}};
  const before=JSON.stringify(state);h.api.attach(h.canvas,state,'draw');h.clear();h.api.update(state,'draw');const image=h.snapshot();h.clear();h.api.advance(8000);
  assert.equal(h.snapshot(),image);assert.equal(JSON.stringify(state),before);
});

test('scene variety: all new hairstyles and room structures keep family members and children clear of furniture',()=>{
  for(const layout of Scene.OPTIONS.layout)for(const hairStyle of Scene.OPTIONS.hairStyle)for(const children of [0,1,3,6])for(const childAge of ['preschool','school','teen'])for(const activity of ['rest','draw','garden','care'])for(const maritalStatus of ['single','married']){
    const config={seed:2026,generationSeed:2026,gender:'unspecified',maritalStatus,children,childAge,appearance:{faceShape:'long',hairStyle,hairColor:'espresso',skinTone:'deep',outfitPalette:'mustard'},homeStyle:{palette:'sage',layout,decor:'music',windowView:'hills'}},family=Scene.familyLayout(config,activity),figures=members(family),room=Scene.homeStyle(config);
    for(const figure of figures){const b=figure.bounds;assert.ok(b.left>=0&&b.top>=0&&b.right<=760&&b.bottom<=550,`${layout}/${hairStyle}/${figure.id} clipped`);}
    for(let i=0;i<figures.length;i++)for(let j=i+1;j<figures.length;j++)assert.equal(overlaps(figures[i].bounds,figures[j].bounds),false,`${layout}/${hairStyle}/${children}/${childAge}/${activity}: figures overlap`);
    for(const child of family.children)for(const object of room.furnitureBounds)assert.equal(overlaps(child.bounds,object),false,`${layout}/${hairStyle}/${childAge}: ${child.id} overlaps ${object.id}`);
  }
});

test('scene variety: gender edits change hair and clothing while preserving the other saved portrait traits',()=>{
  const h=drawingHarness(),appearance={faceShape:'square',hairStyle:'curly',hairColor:'silver',skinTone:'ivory',outfitPalette:'indigo'},drawings=new Set();
  for(const gender of ['woman','man','other','unspecified']){
    h.clear();h.api.attach(h.canvas,{config:{gender,appearance},date:'2026-01-01',artifacts:[]},'rest');
    const person=h.api.describe().character;
    assert.equal(person.gender,gender);
    assert.equal(JSON.stringify(person.appearance.options),JSON.stringify({...appearance,hairStyle:gender==='woman'?'bun':'curly'}));
    drawings.add(h.snapshot());
  }
  assert.equal(drawings.size,4,'existing gender edit must still change actual pixels');
});

test('scene life stages: toddlers, schoolchildren and adult children have separate visible activities and ages',()=>{
  const childProfiles=[{age:1,gender:'woman',militaryStatus:'none'},{age:5,gender:'man',militaryStatus:'none'},{age:10,gender:'unspecified',militaryStatus:'none'},{age:17,gender:'woman',militaryStatus:'none'},{age:18,gender:'man',militaryStatus:'none'},{age:35,gender:'woman',militaryStatus:'none'}];
  const config={children:6,childAge:'toddler',childProfiles,maritalStatus:'married'};
  const family=Scene.familyLayout(config,'rest');
  assert.deepEqual(family.children.map(c=>c.ageStage),['toddler','preschool','school','teen','adult','adult']);
  assert.deepEqual(family.children.map(c=>c.age),[1,5,10,17,18,35]);
  assert.equal(family.children[0].activity,'child-crawl');assert.equal(family.children[5].activity,'child-adult');
  assert.ok(family.children[5].scale>=.82,'adult children must look grown, at a comparable scale to their parents');
  assert.equal(family.children[0].appearance.gender,'woman');assert.equal(family.children[1].appearance.gender,'man');
  const h=drawingHarness(),images=new Set();
  for(const age of [1,5,10,17,24]){h.clear();h.api.attach(h.canvas,{config:{children:1,childProfiles:[{age,gender:'woman',militaryStatus:'none'}]},date:'2026-02-04',artifacts:[]},'rest');images.add(h.snapshot());}
  assert.equal(images.size,5);
});

test('scene military: serving child is away except during their dated leave, without changing the saved state',()=>{
  const config={children:2,childProfiles:[{age:22,gender:'man',militaryStatus:'serving'},{age:20,gender:'woman',militaryStatus:'none'}]},h=drawingHarness();
  const state={config,date:'2026-08-01',artifacts:[],flags:{militaryChildIndex:0,militaryLeaveUntil:'2026-08-03'},rng:{external:55,followup:22}},before=JSON.stringify(state);
  h.api.attach(h.canvas,state,'rest');let family=h.api.describe().family;
  assert.equal(family.childCount,2);assert.equal(family.visibleChildCount,2);assert.equal(family.children[0].onLeave,true);assert.equal(family.children[0].activity,'child-leave');
  h.api.update({...state,date:'2026-08-04'},'rest');family=h.api.describe().family;
  assert.equal(family.childCount,2);assert.equal(family.visibleChildCount,1);assert.equal(family.awayChildren[0].id,'child-1');assert.equal(family.personCount,2);
  h.api.update({...state,flags:{militaryChildIndex:1,militaryLeaveUntil:'2026-08-03'}},'rest');assert.equal(h.api.describe().family.visibleChildCount,1,'leave for another child must not bring the soldier home');
  assert.equal(JSON.stringify(state),before);
});

test('scene life stages: mixed ages and all-adult families fit every room with separated figures and safe foreground depth',()=>{
  for(const layout of Scene.OPTIONS.layout)for(const ages of [[1,5,10,17,24,41],[18,20,22,24,26,28]])for(const activity of ['rest','care','draw','cleaning']){
    const config={children:6,maritalStatus:'married',childAge:'adult',appearance:{hairStyle:'bun'},homeStyle:{layout},childProfiles:ages.map((age,i)=>({age,gender:i%2?'man':'woman',militaryStatus:'none'}))};
    const family=Scene.familyLayout(config,activity),figures=members(family);
    for(const figure of figures){assert.ok(figure.bounds.bottom<=550&&figure.bounds.top>=0&&figure.bounds.left>=0&&figure.bounds.right<=760,`${layout}/${figure.id} clipped`);}
    for(let i=0;i<figures.length;i++)for(let j=i+1;j<figures.length;j++)assert.equal(overlaps(figures[i].bounds,figures[j].bounds),false,`${activity}/${figures[i].id}/${figures[j].id} overlaps`);
    for(const child of family.children)for(const object of Scene.homeStyle(config).furnitureBounds){if(child.ageStage==='adult'&&['sofa','table'].includes(object.id))continue;assert.equal(overlaps(child.bounds,object),false,`${layout}/${child.id}/${object.id} overlaps`);}
  }
});

test('scene household and illness: visible mess, tidiness and specific sick family member are deterministic',()=>{
  const h=drawingHarness(),config={children:1,childProfiles:[{age:2,gender:'man',militaryStatus:'none'}]},base={config,date:'2026-03-11',artifacts:[]},snapshots=new Set();
  for(const cleanliness of [20,60,90]){h.clear();h.api.attach(h.canvas,{...base,household:{cleanliness}},'rest');snapshots.add(h.snapshot());assert.equal(h.api.describe().household.cleanliness,cleanliness);}
  assert.equal(snapshots.size,3);
  const state={...base,household:{cleanliness:20},healthEpisode:{kind:'hfmd',subject:'child',childIndex:0,started:'2026-03-11',recoveryDue:'2026-03-18',approach:'share'}},before=JSON.stringify(state);
  h.api.attach(h.canvas,state,'care');assert.equal(h.api.describe().family.children[0].ill,true);assert.equal(h.api.describe().character.ill,undefined);
  h.clear();h.api.update(state,'care');const commands=h.snapshot();h.clear();h.api.advance(9000);assert.equal(h.snapshot(),commands);assert.equal(JSON.stringify(state),before);
  h.api.update({...base,healthEpisode:{...state.healthEpisode,subject:'self',childIndex:null}},'rest');assert.equal(h.api.describe().character.ill,true);assert.equal(h.api.describe().family.children[0].ill,undefined);
});

test('scene side jobs: delivery, part-time work and a personal project have distinct visible equipment',()=>{
  const h=drawingHarness(),state={config:{...Data.DEFAULT_CONFIG},date:'2028-02-29',artifacts:[],flags:{},rng:{external:123,followup:456}},before=JSON.stringify(state),pictures=new Set();
  for(const activity of ['rest','delivery','parttime','sideproject']){
    h.clear();h.api.attach(h.canvas,state,activity);pictures.add(h.snapshot());
    assert.equal(h.api.describe().character.activity,activity);
    assert.equal(h.api.describe().date,'2028-02-29');
  }
  assert.equal(pictures.size,4);assert.equal(JSON.stringify(state),before);
});

test('scene recovery: a dated recovery period changes the figure only while active and exposes the health record',()=>{
  const h=drawingHarness(),base={config:{...Data.DEFAULT_CONFIG},date:'2026-10-03',artifacts:[],flags:{recoveryCause:'traffic_minor',recoveryUntil:'2026-10-04',overloadSaturday:'2026-10-03',vaccineDate:'2026-09-20'}};
  h.api.attach(h.canvas,base,'rest');const during=h.snapshot(),description=h.api.describe();
  assert.equal(description.character.recovering,'traffic_minor');assert.equal(description.recovery.active,true);
  assert.equal(description.overloadSaturday,'2026-10-03');assert.equal(description.vaccineDate,'2026-09-20');
  h.clear();h.api.update({...base,date:'2026-10-05'},'rest');
  assert.equal(h.api.describe().character.recovering,undefined);assert.equal(h.api.describe().recovery.active,false);
  assert.notEqual(h.snapshot(),during);
  h.clear();h.api.update({...base,flags:{...base.flags,recoveryCause:'low_condition_week'}},'rest');
  assert.notEqual(h.snapshot(),during,'an accident bandage and a comfort scarf should be distinct');
});
