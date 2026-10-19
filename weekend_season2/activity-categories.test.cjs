'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const A=require('./activities.js'),D=require('./data.js');

test('every activity appears once in one of the two groups and all ten categories have useful labels',()=>{
  assert.deepEqual(A.ACTIVITY_GROUPS.map(group=>[group.id,group.label]),[['want','하고 싶은 일'],['need','해야 하는 일']]);
  const categoryIds=A.ACTIVITY_CATEGORIES.map(category=>category.id),listed=A.ACTIVITY_CATEGORIES.flatMap(category=>category.activityIds);
  assert.equal(categoryIds.length,10);assert.equal(new Set(categoryIds).size,10);
  assert.equal(listed.length,A.ACTIVITIES.length);assert.equal(new Set(listed).size,listed.length);
  assert.deepEqual(listed.slice().sort(),A.ACTIVITIES.map(activity=>activity.id).sort());
  assert.equal(A.categoriesForGroup('want').flatMap(category=>category.activityIds).length,20);
  assert.equal(A.categoriesForGroup('need').flatMap(category=>category.activityIds).length,30);
  for(const category of A.ACTIVITY_CATEGORIES){
    assert.ok(category.label.trim());assert.ok(A.ACTIVITY_GROUPS.some(group=>group.id===category.groupId));
    for(const id of category.activityIds){assert.equal(A.ACTIVITY_MAP[id].categoryId,category.id);assert.equal(A.activityCategory(id),category);}
  }
});

test('category lookup is read-only and unknown activity or group identifiers have empty results',()=>{
  const before=JSON.stringify(A);
  const selected=A.categoriesForGroup('want');selected.pop();
  assert.equal(A.categoriesForGroup('want').length,5);assert.equal(A.activityCategory('missing'),null);assert.deepEqual(A.categoriesForGroup('missing'),[]);
  assert.throws(()=>A.ACTIVITY_CATEGORIES[0].activityIds.push('rest'),TypeError);
  assert.throws(()=>{A.ACTIVITY_GROUPS[0].label='changed';},TypeError);
  assert.equal(JSON.stringify(A),before);
});

test('navigation categories preserve age, role, cadence and manual-only restrictions',()=>{
  const config={...D.DEFAULT_CONFIG,age:40,children:1,childAge:'toddler',childProfiles:[{age:1,gender:'woman',militaryStatus:'none'}]};
  const available=A.ACTIVITIES.filter(activity=>activity.parenting&&!D.activityReason(config,activity.id));
  assert.deepEqual(available.map(activity=>activity.id),['baby_feed','baby_change','baby_sleep']);
  assert.ok(available.every(activity=>activity.categoryId==='parenting'&&activity.careOverlap));
  assert.ok(D.activityReason(config,'research'));assert.equal(D.activityReason({...config,role:'graduate'},'research'),'');
  assert.deepEqual(A.ACTIVITIES.filter(activity=>activity.requiresPreference).map(activity=>activity.id),A.ACTIVITY_CATEGORIES.find(category=>category.id==='outings').activityIds);
  assert.ok(A.ACTIVITIES.filter(activity=>activity.procedure).every(activity=>activity.manualOnly&&activity.categoryId==='personal'));
  assert.ok(A.ACTIVITIES.filter(activity=>activity.cadence).every(activity=>activity.categoryId==='personal'));
  assert.equal(A.activityCategory('rest').groupId,'want');
});

test('the standalone planner and game share identical dependency-free category metadata',()=>{
  const sandbox={};vm.runInNewContext(fs.readFileSync(require.resolve('./activities.js'),'utf8'),sandbox);
  assert.equal(JSON.stringify(sandbox.S2Activities.ACTIVITY_GROUPS),JSON.stringify(A.ACTIVITY_GROUPS));
  assert.equal(JSON.stringify(sandbox.S2Activities.ACTIVITY_CATEGORIES),JSON.stringify(A.ACTIVITY_CATEGORIES));
  assert.equal(JSON.stringify(sandbox.S2Activities.ACTIVITIES),JSON.stringify(D.ACTIVITIES));
  assert.equal(sandbox.S2Activities.activityCategory('baby_feed').id,'parenting');
  assert.equal(sandbox.S2Activities.categoriesForGroup('need').length,5);
});
