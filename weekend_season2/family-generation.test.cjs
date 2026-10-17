'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const D=require('./data.js'),Scene=require('./scene.js');
const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
const profile=age=>({age,gender:'woman',militaryStatus:'none'});

test('new parent ages use the documented fictional gap and coherent sibling spacing, with older families retained',()=>{
  let parents=0,central=0,eligibleForWholeRange=0,olderParents=0,olderWithAdult=0;
  const combinations=new Set(),stages=new Set();
  for(let seed=0;seed<8192;seed++){
    const c=D.generateLife(seed).config;
    combinations.add([c.role,c.maritalStatus,c.children>0].join('/'));
    if(!c.children)continue;
    parents++;assert.ok(c.age>=26);assert.equal(c.childProfiles.length,c.children);
    for(let i=0;i<c.children;i++){
      const child=c.childProfiles[i];assert.ok(c.age-child.age>=25,`seed ${seed}: ${c.age}/${child.age}`);
      assert.ok(child.age>=0&&child.age<=49);stages.add(D.childStage(child.age));
      if(i)assert.ok(c.childProfiles[i-1].age-child.age>=1&&c.childProfiles[i-1].age-child.age<=3);
    }
    const gap=c.age-c.childProfiles[0].age;
    if(c.age>=46){eligibleForWholeRange++;if(gap>=28&&gap<=35)central++;}
    if(c.age>=50){olderParents++;if(c.childProfiles.some(child=>child.age>=18))olderWithAdult++;}
  }
  assert.equal(parents,4096);assert.equal(combinations.size,16);
  assert.ok(central/eligibleForWholeRange>.7&&central/eligibleForWholeRange<.9,'the documented central weights should dominate without being exclusive');
  assert.ok(olderWithAdult/olderParents>.8,'50s and 60s retain adult-child families');
  assert.deepEqual([...stages].sort(),['adult','preschool','school','teen','toddler']);
  assert.equal(D.FAMILY_MODEL.minimumParentAgeGap,25);assert.match(D.FAMILY_MODEL.note,/창작/);
});

test('family generation is reproducible while manual ages and saved profiles remain unchanged',()=>{
  for(const seed of [121,378,556,796,4294967295])assert.deepEqual(D.generateLife(seed),D.generateLife(seed));
  const config={...D.DEFAULT_CONFIG,age:38,maritalStatus:'divorced',children:1,childAge:'adult',childProfiles:[profile(19)],appearance:{skinTone:'ivory'}};
  const before=structuredClone(config);
  assert.equal(D.getChildren(config)[0].age,19);
  assert.equal(Scene.familyLayout(config).children[0].age,19);
  assert.deepEqual(config,before);
});

test('child portraits share the player palette but keep individual faces and clothes, including older saves',()=>{
  for(const skinTone of Scene.OPTIONS.skinTone)for(const seed of [0,121,456]){
    const config={age:60,seed,maritalStatus:'married',children:6,childProfiles:[1,2,8,16,19,32].map(profile),appearance:{skinTone}},before=structuredClone(config);
    const family=Scene.familyLayout(config,'read');
    for(const child of family.children){assert.equal(child.appearance.skinTone,skinTone);assert.deepEqual(child.appearance.skin,family.player.appearance.skin);}
    assert.ok(new Set(family.children.map(child=>JSON.stringify(child.appearance.options))).size>1);
    assert.deepEqual(config,before);
  }
  const legacy=Scene.familyLayout({children:1,childProfiles:[profile(19)]});
  assert.equal(legacy.player.appearance.skin,undefined);assert.equal(legacy.children[0].appearance.skin,undefined,'legacy portraits retain their shared drawing fallback');
});

test('adult and crawling child silhouettes stay separate in mixed and six-child households',()=>{
  for(const layout of Scene.OPTIONS.layout)for(const ages of [[19],[0,1,1,0,1,1],[1,2,9,17,19,32],[19,20,22,24,26,28]])for(const activity of ['rest','draw','care','run']){
    const config={children:ages.length,maritalStatus:'married',childProfiles:ages.map(profile),appearance:{skinTone:'ivory',hairStyle:'bun'},homeStyle:{layout,decor:'music'}},family=Scene.familyLayout(config,activity);
    const people=[family.player,family.spouse,...family.children];
    for(const person of people){const b=person.bounds;assert.ok(b.left>=0&&b.top>=0&&b.right<=760&&b.bottom<=550,`${layout}/${person.id}`);}
    for(let i=0;i<people.length;i++)for(let j=i+1;j<people.length;j++)assert.equal(overlap(people[i].bounds,people[j].bounds),false,`${layout}/${ages}/${activity}/${people[i].id}/${people[j].id}`);
    for(const child of family.children){
      if(child.age>=18){assert.equal(child.scale,.88);assert.equal(child.activity,'child-adult');}
      if(child.age<=1){assert.equal(child.pose,'crawl');assert.equal(child.activity,'child-crawl');assert.ok(child.bounds.right-child.bounds.left>child.bounds.bottom-child.bounds.top);}
      if(child.age===2){assert.equal(child.pose,undefined);assert.equal(child.activity,'child-toddler');}
      for(const object of Scene.homeStyle(config).furnitureBounds){if(child.age>=18&&['sofa','table'].includes(object.id))continue;assert.equal(overlap(child.bounds,object),false,`${layout}/${ages}/${child.id}/${object.id}`);}
    }
  }
});

function harness(reduced){
  let calls=[];const ctx=new Proxy({},{get:(object,key)=>object[key]||((...args)=>calls.push([key,...args])),set:(object,key,value)=>{object[key]=value;calls.push([key,value]);return true;}});
  const canvas={width:760,height:550,clientWidth:760,clientHeight:550,isConnected:true,getContext:()=>ctx};
  const world={matchMedia:()=>({matches:reduced}),requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},devicePixelRatio:1};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'scene.js'),'utf8'),world);
  return {scene:world.S2Scene,canvas,reset:()=>{calls=[];},drawing:()=>JSON.stringify(calls)};
}
test('crawling animation moves only the illustration and is fully still with reduced motion',()=>{
  for(const reduced of [false,true]){
    const h=harness(reduced),s={config:{...D.DEFAULT_CONFIG,children:1,childProfiles:[profile(1)],appearance:{skinTone:'warm'}},date:'2026-06-04',artifacts:[],rng:{external:123,followup:456}},before=structuredClone(s);
    h.scene.attach(h.canvas,s,'rest');h.reset();h.scene.update(s,'rest');const first=h.drawing(),description=JSON.stringify(h.scene.describe());
    h.reset();h.scene.advance(270);const later=h.drawing();
    if(reduced)assert.equal(later,first);else assert.notEqual(later,first);
    assert.equal(JSON.stringify(h.scene.describe()),description);assert.deepEqual(s,before);
    assert.equal(h.scene.describe().family.children[0].pose,'crawl');
  }
});
