const test=require('node:test'),assert=require('node:assert/strict');
const Surface=require('./terrain-surfaces.js');
const Renderer=require('./circuit-renderer.js');
const face=(fill,depths)=>({fill,depth:depths.reduce((a,b)=>a+b)/3,points:[{x:0,y:0,depth:depths[0]},{x:12,y:0,depth:depths[1]},{x:0,y:12,depth:depths[2]}]});
const pixel=(image,x,y)=>Array.from(image.pixels.slice((y*image.width+x)*4,(y*image.width+x)*4+4));
test('a nearer bank occludes asphalt independently of scene submission order',()=>{
  const road=face('#465250',[12,12,12]),bank=face('#829569',[4,4,4]);
  for(const queue of [[road,bank],[bank,road]])assert.deepEqual(pixel(Surface.rasterize(queue,12,12),3,3),[130,149,105,255]);
});
test('crossing surfaces use per-pixel perspective depth rather than mean face depth',()=>{
  const slope=face('#00ff00',[2,20,2]),road=face('#ff0000',[5,5,5]);
  const image=Surface.rasterize([slope,road],12,12);
  assert.deepEqual(pixel(image,1,1),[0,255,0,255]);
  assert.deepEqual(pixel(image,10,0),[255,0,0,255]);
  assert.deepEqual(Surface.rasterize([road,slope],12,12).pixels,image.pixels);
});
test('transparent guidance is blocked behind a hill and blends above visible road',()=>{
  const road=face('#202020',[8,8,8]),arrow=face('rgba(0,255,0,0.5)',[7,7,7]),bank=face('#829569',[3,3,3]);
  assert.deepEqual(pixel(Surface.rasterize([arrow,road],12,12),2,2),[16,144,16,255]);
  assert.deepEqual(pixel(Surface.rasterize([road,bank,arrow],12,12),2,2),[130,149,105,255]);
});
test('asphalt top faces are invisible below their plane, while a bank remains two-sided',()=>{
  const r=Object.assign(Object.create(Renderer.prototype),{width:400,height:400});
  const vertices=[{x:-4,y:-4,z:10},{x:4,y:-4,z:10},{x:4,y:4,z:10},{x:-4,y:4,z:10}];
  for(const reverse of [false,true]){
    const f={vertices:reverse?vertices.slice().reverse():vertices,fill:'#465250',road:true};
    const below=r._createCamera({x:0,y:0,z:0},20,0,.2,100,200,200),above=r._createCamera({x:0,y:0,z:10},20,0,.8,100,200,200);
    const hidden=[],shown=[],bank=[];r._queue(f,below,hidden);r._queue(f,above,shown);r._queue({...f,road:false},below,bank);
    assert.equal(hidden.length,0);assert.equal(shown.length,1);assert.equal(bank.length,1);
  }
});
test('a transparent polygon is composited once along its triangulation diagonal',()=>{
  const quad={fill:'rgba(0,255,0,0.5)',depth:5,points:[{x:0,y:0,depth:5},{x:16,y:0,depth:5},{x:16,y:16,depth:5},{x:0,y:16,depth:5}]};
  const image=Surface.rasterize([quad],16,16);
  assert.deepEqual(pixel(image,5,5),[0,255,0,128]);
  assert.deepEqual(pixel(image,6,5),pixel(image,5,5));
});
