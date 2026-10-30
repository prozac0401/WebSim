'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {canonicalRuntime,runtimeEquivalent}=require('./audit-pedal-runtime-release.cjs');
test('release-only and newline differences have the same audited runtime code',()=>{
 const before="const RELEASE='one';\nfunction identity(x){return x+RELEASE;}\n";
 const after="const RELEASE='two';\r\nfunction identity(x){return x+RELEASE;}\r\n";
 assert.equal(canonicalRuntime(before),canonicalRuntime(after));
 assert.notEqual(canonicalRuntime(before),canonicalRuntime(after.replace('x+RELEASE','x*2+RELEASE')));
});
test('ambiguous or missing release declarations cannot be normalized',()=>{
 assert.throws(()=>canonicalRuntime('function identity(x){return x;}'),/Unexpected/);
 assert.throws(()=>canonicalRuntime("const RELEASE='a';\nconst RELEASE='b';"),/Unexpected/);
});
test('an unknown historical source hash cannot be accepted as a release-only change',()=>{
 assert.throws(()=>runtimeEquivalent('0'.repeat(64),'1'.repeat(64),'HEAD'),/Cannot establish exact runtime bytes/);
});
