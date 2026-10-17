const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('./data.js'),E=require('./engine.js'),S=require('./storage.js');

test('new defaults and generated lives use woman or man with the matching portrait hair pool',()=>{
  assert.ok(['woman','man'].includes(D.DEFAULT_CONFIG.gender));
  assert.ok(D.PRESETS.every(preset=>['woman','man'].includes(preset.config.gender)));
  const genders=new Set(),styles=new Set();
  for(let seed=0;seed<512;seed++){
    const life=D.generateLife(seed),c=life.config;
    assert.ok(['woman','man'].includes(c.gender));
    assert.ok(D.GENDER_HAIR_STYLES[c.gender].includes(c.appearance.hairStyle));
    assert.deepEqual(D.generateLife(seed),life);assert.deepEqual(E.validateConfig(c),[]);
    genders.add(c.gender);styles.add(c.appearance.hairStyle);
    assert.ok(c.childProfiles.every(child=>['woman','man'].includes(child.gender)));
  }
  assert.deepEqual([...genders].sort(),['man','woman']);
  assert.deepEqual([...styles].sort(),[...D.APPEARANCE_OPTIONS.hairStyle].sort());
});

test('gender selection changes no non-hair appearance stream draws',()=>{
  for(const seed of [0,9,48,121,2026,4294967295]){
    const c=D.generateLife(seed).config,random=D.randomStream(seed,'appearance');
    for(const [key,options]of Object.entries(D.APPEARANCE_OPTIONS)){
      const choice=options[Math.floor(random()*options.length)];
      if(key!=='hairStyle')assert.equal(c.appearance[key],choice,key);
    }
  }
});

test('legacy protagonist gender and explicit child profiles remain readable without resampling',()=>{
  for(const gender of ['unspecified','nonbinary','other','female','male']){
    const state=E.create({...D.DEFAULT_CONFIG,gender,children:1,childAge:'school',childProfiles:[{age:9,gender:'unspecified',militaryStatus:'none'}]});
    const before=JSON.stringify(state),loaded=S.parse(S.serialize(state));
    assert.ok(loaded.ok,loaded.reason);assert.equal(JSON.stringify(state),before);
    assert.equal(loaded.state.config.gender,gender);
    assert.deepEqual(loaded.state.config.childProfiles,state.config.childProfiles);
  }
  assert.equal(D.getChildren({...D.DEFAULT_CONFIG,children:1,childAge:'school',childProfiles:null})[0].gender,'unspecified');
});
