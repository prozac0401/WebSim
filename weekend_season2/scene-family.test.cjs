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

test('scene family: marriage and child count are independent, including six-child and childless families', () => {
  for (const maritalStatus of ['single','married']) for (let children=0; children<=6; children++) {
    const family=Scene.familyLayout({gender:'woman',maritalStatus,children,childAge:'school'},'cook');
    assert.equal(family.children.length,children);
    assert.equal(family.childCount,children);
    assert.equal(family.personCount,1+children+(maritalStatus==='married'?1:0));
    assert.equal(!!family.spouse,maritalStatus==='married');
    assert.equal(new Set(members(family).map(person=>person.id)).size,family.personCount);
    if(family.spouse)assert.equal(family.spouse.appearance.gender,'unspecified','spouse gender must not be inferred from player gender');
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
  for(const gender of ['woman','man','other','unspecified'])for(const maritalStatus of ['single','married'])for(let children=0;children<=6;children++)for(const childAge of ['preschool','school','teen'])for(const activity of Data.ACTIVITIES){
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

test('scene family: reduced motion stays deterministic while updates preserve season, collection and simulation state', () => {
  const h=drawingHarness(true), state={config:{...Data.DEFAULT_CONFIG,gender:'woman',maritalStatus:'married',children:6,childAge:'teen'},date:'2026-12-25',artifacts:[{activityId:'photo'},{activityId:'pottery'},{activityId:'music'}]};
  const before=JSON.stringify(state);h.api.attach(h.canvas,state,'run');h.clear();h.api.update(state,'run');const initial=h.snapshot();h.clear();h.api.advance(20000);
  assert.equal(h.snapshot(),initial);assert.equal(JSON.stringify(state),before);
  assert.equal(h.api.describe().reducedMotion,true);assert.equal(h.api.describe().seasonMonth,12);assert.equal(h.api.describe().artifacts,3);
  for(const activity of Data.ACTIVITIES){h.api.update(state,activity.id);assert.equal(h.api.describe().character.activity,activity.id);}
});

test('scene variety: every face, hairstyle, skin, outfit and hair color changes drawing commands', () => {
  const h=drawingHarness(), base={gender:'woman',maritalStatus:'single',children:0,seed:7,generationSeed:7,appearance:{faceShape:'oval',hairStyle:'rounded-crop',hairColor:'espresso',skinTone:'warm',outfitPalette:'moss'}};
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
  assert.equal(legacy.spouse.appearance.hair,'side-wave');assert.equal(home.legacy,true);
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
  assert.deepEqual(reference.player.appearance.options,config.appearance);
  assert.notDeepEqual(Scene.familyLayout({...config,generationSeed:457},'rest').spouse.appearance,reference.spouse.appearance);
  assert.equal(JSON.stringify(config),original);
  const h=drawingHarness(true),state={config,date:'2026-08-01',artifacts:[],stats:{mood:60,fatigue:15},rng:{external:123,followup:789}};
  const before=JSON.stringify(state);h.api.attach(h.canvas,state,'draw');h.clear();h.api.update(state,'draw');const image=h.snapshot();h.clear();h.api.advance(8000);
  assert.equal(h.snapshot(),image);assert.equal(JSON.stringify(state),before);
});

test('scene variety: all new hairstyles and room structures keep family members and children clear of furniture',()=>{
  for(const layout of Scene.OPTIONS.layout)for(const hairStyle of Scene.OPTIONS.hairStyle)for(const children of [0,1,3,6])for(const childAge of ['preschool','school','teen'])for(const activity of ['rest','draw','garden','care'])for(const maritalStatus of ['single','married']){
    const config={seed:2026,generationSeed:2026,gender:'woman',maritalStatus,children,childAge,appearance:{faceShape:'long',hairStyle,hairColor:'espresso',skinTone:'deep',outfitPalette:'mustard'},homeStyle:{palette:'sage',layout,decor:'music',windowView:'hills'}},family=Scene.familyLayout(config,activity),figures=members(family),room=Scene.homeStyle(config);
    for(const figure of figures){const b=figure.bounds;assert.ok(b.left>=0&&b.top>=0&&b.right<=760&&b.bottom<=550,`${layout}/${hairStyle}/${figure.id} clipped`);}
    for(let i=0;i<figures.length;i++)for(let j=i+1;j<figures.length;j++)assert.equal(overlaps(figures[i].bounds,figures[j].bounds),false,`${layout}/${hairStyle}/${children}/${childAge}/${activity}: figures overlap`);
    for(const child of family.children)for(const object of room.furnitureBounds)assert.equal(overlaps(child.bounds,object),false,`${layout}/${hairStyle}/${childAge}: ${child.id} overlaps ${object.id}`);
  }
});

test('scene variety: explicit portraits remain stable when gender changes, while clothing details still reflect the setting',()=>{
  const h=drawingHarness(),appearance={faceShape:'square',hairStyle:'curly',hairColor:'silver',skinTone:'ivory',outfitPalette:'indigo'},drawings=new Set();
  for(const gender of ['woman','man','other','unspecified']){
    h.clear();h.api.attach(h.canvas,{config:{gender,appearance},date:'2026-01-01',artifacts:[]},'rest');
    const person=h.api.describe().character;
    assert.equal(person.gender,gender);assert.equal(JSON.stringify(person.appearance.options),JSON.stringify(appearance));drawings.add(h.snapshot());
  }
  assert.equal(drawings.size,4,'existing gender edit must still change actual pixels');
});
