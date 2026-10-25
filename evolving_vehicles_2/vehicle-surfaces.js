/* Offscreen WebGL vehicle surfaces: real depth testing and smooth normals.
 * The visible simulator remains a single canvas; Canvas2D fallback is supported.
 * Uses imported manufacturer geometry or the authored vehicle-meshes.js fallback.
 */
(function(root) {
'use strict';
const rgb=hex=>{
 const s=String(hex||'#899ba7').replace('#','');const t=s.length===3?s.split('').map(c=>c+c).join(''):s;
 const n=parseInt(t,16);return Number.isFinite(n)?[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]:[.5,.6,.65];
};
const materials={paint:0,glass:1,rubber:2,chrome:3,light:4,interior:2,plastic:2};
class VehicleSurfaces {
 constructor(onUpdate) {
  this.canvas=document.createElement('canvas');this.cache=new Map();this.assetCache=new Map();this.lodCache=new WeakMap();this.textures=new Map();this.repeatTextureKeys=new Map();this.textureGeneration=0;this.available=false;this.onUpdate=onUpdate;
  try {
   this.gl=this.canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
   const gl=this.gl;if(!gl)return;
   const vertex=`
    precision highp float;
    attribute vec3 aPosition;attribute vec3 aNormal;attribute vec3 aColor;attribute float aMaterial;attribute vec2 aUV;
    uniform vec3 uModelScale;uniform vec3 uModelOffset;uniform vec4 uWheel;
    uniform vec3 uCar;uniform vec2 uPose;uniform vec3 uTarget;uniform vec4 uCamera;uniform vec4 uViewport;uniform vec2 uClip;
    varying vec3 vNormal;varying vec3 vColor;varying vec3 vWorld;varying vec3 vLocal;varying float vMaterial;varying vec2 vUV;
    uniform mat4 uPhotoMatrixA;uniform mat4 uPhotoMatrixB;varying vec3 vPhotoA;varying vec3 vPhotoB;
    vec3 rotateCar(vec3 p){float ca=cos(uPose.x),sa=sin(uPose.x),cg=cos(uPose.y),sg=sin(uPose.y);float x=p.x*cg-p.z*sg;return vec3(x*ca-p.y*sa,x*sa+p.y*ca,p.x*sg+p.z*cg);}
    void main(){
     float wc=cos(uWheel.w),ws=sin(uWheel.w);vec3 offset=aPosition-uWheel.xyz;
     vec3 local=uWheel.xyz+vec3(wc*offset.x+ws*offset.z,offset.y,-ws*offset.x+wc*offset.z);
     vec3 normal=vec3(wc*aNormal.x+ws*aNormal.z,aNormal.y,-ws*aNormal.x+wc*aNormal.z);
     vec3 world=rotateCar((local+uModelOffset)*uModelScale)+uCar;
     vec3 d=world-uTarget;float sy=sin(uCamera.x),cy=cos(uCamera.x),sp=sin(uCamera.y),cp=cos(uCamera.y);
     float h=-d.x*sy+d.y*cy,depth=uCamera.z-h*cp-d.z*sp;
     float right=d.x*cy+d.y*sy,vertical=h*sp-d.z*cp;
     float x=2.0*uCamera.w/uViewport.x*right+(2.0*uViewport.z/uViewport.x-1.0)*depth;
     float y=-2.0*uCamera.w/uViewport.y*vertical+(1.0-2.0*uViewport.w/uViewport.y)*depth;
     float z=(uClip.y+uClip.x)/(uClip.y-uClip.x)*depth-2.0*uClip.y*uClip.x/(uClip.y-uClip.x);
     gl_Position=vec4(x,y,z,depth);vNormal=rotateCar(normal/uModelScale);vColor=aColor;vWorld=world;vLocal=aPosition;vMaterial=aMaterial;vUV=aUV;
     vPhotoA=(uPhotoMatrixA*vec4(aPosition,1.0)).xyz;vPhotoB=(uPhotoMatrixB*vec4(aPosition,1.0)).xyz;
    }`;
   const fragment=`
    precision highp float;
    varying vec3 vNormal;varying vec3 vColor;varying vec3 vWorld;varying vec3 vLocal;varying float vMaterial;varying vec2 vUV;uniform vec3 uEye;
    uniform vec4 uPaint;uniform sampler2D uFlakes;
    uniform sampler2D uTexture;uniform bool uHasTexture;uniform bool uOpaqueTexture;uniform float uOpacity;uniform float uBrake;
    varying vec3 vPhotoA;varying vec3 vPhotoB;uniform bool uPhotoMode;uniform sampler2D uPhotoTextureA;uniform sampler2D uPhotoTextureB;uniform float uPhotoBlend;
    vec3 shade(vec3 base,float material){
     vec3 N=normalize(vNormal),V=normalize(uEye-vWorld);if(dot(N,V)<0.0)N=-N;
     vec3 L=normalize(vec3(-.35,-.50,.85)),H=normalize(L+V);
     float ndl=max(0.0,dot(N,L)),fres=pow(1.0-max(0.0,dot(N,V)),4.0);
     float sky=.5+.5*N.z;vec3 c;
     if(material>3.5){c=base*(.88+.12*ndl);}
     else if(material>2.5){c=base*(.32+.38*ndl)+vec3(.50)*pow(max(0.0,dot(N,H)),90.0)+vec3(.25)*fres;}
     else if(material>1.5){c=base*(.52+.48*ndl);}
     else if(material>.5){
      vec3 R=reflect(-V,N);float horizon=smoothstep(-.12,.22,R.z);
      float strip=pow(max(0.0,dot(R,normalize(vec3(.2,-.65,.75)))),24.0);
      c=base*.48+mix(vec3(.07,.085,.09),vec3(.37,.44,.47),horizon)*(.22+.52*fres)+vec3(.32)*strip;
     }
     else {
      vec3 R=reflect(-V,N);float horizon=smoothstep(-.18,.3,R.z);
      float broad=pow(max(0.0,dot(R,normalize(vec3(.25,-.65,.72)))),18.0);
      float ceiling=pow(max(0.0,dot(R,normalize(vec3(-.5,.4,.77)))),7.0);
      float highlight=pow(max(0.0,dot(N,H)),95.0);
      float fill=max(0.0,dot(N,normalize(vec3(.2,.8,.5))));
      vec3 environment=mix(vec3(.055,.065,.065),vec3(.29,.34,.36),horizon)+vec3(.60)*broad+vec3(.20)*ceiling;
      if(uPaint.x>0.0){
       // Body-local, mip-filtered flakes stay attached to the paint. The coat
       // and pearl tint respond to light/view direction, never a baked photo.
       vec3 local=vLocal;
       float grain=texture2D(uFlakes,local.xy*3.7+local.yz*5.1+local.zx*2.3).r-.5;
       float rough=clamp(uPaint.x,0.0,1.0),coat=clamp(uPaint.w,0.0,1.0);
       float sheen=pow(max(0.0,dot(N,H)),mix(190.0,24.0,rough));
       vec3 pearl=mix(vec3(.965,.99,1.035),vec3(1.035,1.01,.965),fres);
       vec3 pigment=base*mix(vec3(1.0),pearl,max(0.0,uPaint.z));
       // A dielectric clearcoat reflects a crisp light strip and the sky/ground
       // boundary independently of the pigment. The former broad lobe read as
       // a diffuse matte finish, including on factory gloss solid colors.
       float edge=smoothstep(-.05-rough*.08,.10+rough*.12,R.z);
       vec3 coatEnvironment=mix(vec3(.025,.035,.05),vec3(.50,.59,.70),edge);
       coatEnvironment+=vec3(1.35)*pow(max(0.0,dot(R,normalize(vec3(.2,-.65,.75)))),mix(110.0,12.0,rough));
       coatEnvironment+=vec3(.62)*pow(max(0.0,dot(R,normalize(vec3(-.5,.4,.77)))),mix(65.0,8.0,rough));
       // Negative pearl marks only inferred photo-fill panels. Their subtle
       // extra reflection is neutral so it cannot tint the baked body photos.
       if(uPaint.z<0.0)coatEnvironment=vec3(dot(coatEnvironment,vec3(.2126,.7152,.0722)));
       c=pigment*(.48+.34*ndl+.22*fill+.09*sky)*(1.0-.14*coat*fres);
       c+=coatEnvironment*(.12+.62*fres)*coat;
       c+=vec3(.52)*pow(max(0.0,dot(N,H)),mix(260.0,35.0,rough))*coat;
       c+=sqrt(max(base,vec3(0.0)))*(.16*uPaint.y)*sheen+vec3(grain*.10*uPaint.y*sheen);
      }else c=base*(.48+.34*ndl+.22*fill+.09*sky)+environment*(.18+.56*fres)+vec3(.22)*highlight;
     }
     return c;
    }
    void main(){
     vec4 texel=uPhotoMode?mix(texture2D(uPhotoTextureA,vPhotoA.xy/vPhotoA.z),texture2D(uPhotoTextureB,vPhotoB.xy/vPhotoB.z),uPhotoBlend):uHasTexture?texture2D(uTexture,vUV):vec4(1.0);
     float alpha=(uOpaqueTexture||uPhotoMode?1.0:texel.a)*uOpacity;if(alpha<.02)discard;
     vec3 c=shade(vColor*texel.rgb,vMaterial);
     // A per-instance lamp signal leaves the shared body/texture untouched.
     // Retain lens detail while making the lit red independent of sunlight.
     float lens=clamp(dot(texel.rgb,vec3(.2126,.7152,.0722)),0.0,1.0);
     c=mix(c,vec3(1.0,.055,.025)*(.88+.12*lens),clamp(uBrake,0.0,1.0)*.94);
     gl_FragColor=vec4(clamp(c,0.0,1.0),alpha);
    }`;
   const compile=(kind,source)=>{const shader=gl.createShader(kind);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;};
   this.program=gl.createProgram();gl.attachShader(this.program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(this.program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(this.program);
   if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.program));
   this.attributes=Object.fromEntries(['aPosition','aNormal','aColor','aMaterial','aUV'].map(n=>[n,gl.getAttribLocation(this.program,n)]));
   this.uniforms=Object.fromEntries(['uCar','uPose','uTarget','uCamera','uViewport','uClip','uEye','uModelScale','uModelOffset','uWheel','uPaint','uFlakes','uTexture','uHasTexture','uOpaqueTexture','uOpacity','uBrake','uPhotoMode','uPhotoMatrixA','uPhotoMatrixB','uPhotoTextureA','uPhotoTextureB','uPhotoBlend'].map(n=>[n,gl.getUniformLocation(this.program,n)]));
   this.uintIndices=gl.getExtension('OES_element_index_uint');
   this.available=true;
  } catch(error){this.failure=String(error);}
  this.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this._fail(new Error('Vehicle WebGL context lost'));});
 }
 _checkResource(label){
  // WebGL reports allocation failures through error flags rather than throwing.
  // Check only at upload/allocation boundaries, never on every cached draw.
  const error=this.gl.getError?.()??0;
  if(error!==(this.gl.NO_ERROR??0))throw new Error('Vehicle WebGL '+label+' failed ('+error+')');
 }
 _fail(error,notify=true){
  const changed=this.available||!this.failure;
  this.failure=String(error);this.available=false;
  // Partial uploads and delayed image callbacks must not survive a failed GPU.
  try{this.clearGeometry();}catch(_error){}
  if(changed&&notify)this.onUpdate?.();
 }
 _buffer(mesh) {
  if(this.cache.has(mesh))return this.cache.get(mesh);
  root.VehicleWheels?.prepareFaces(mesh);
  const gl=this.gl,triangles=[],normals=new Map();
  const key=(p,face)=>[p.x.toFixed(4),p.y.toFixed(4),p.z.toFixed(4),face.material||'paint',face.part||'body'].join('|');
  for(const face of mesh.faces){
   if(!face.fill||face.vertices.length<3)continue;
   const v=face.vertices;
   for(let i=1;i<v.length-1;i++){
    const verts=[v[0],v[i],v[i+1]],a=verts[0],b=verts[1],c=verts[2];
    const u=[b.x-a.x,b.y-a.y,b.z-a.z],w=[c.x-a.x,c.y-a.y,c.z-a.z];
    const n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
    if(Math.hypot(...n)<1e-10)continue;
    triangles.push({verts,n,face});
    if(['paint','glass'].includes(face.material||'paint')&&!face.flat)for(const p of verts){const k=key(p,face),sum=normals.get(k)||[0,0,0];normals.set(k,sum.map((x,j)=>x+n[j]));}
   }
  }
  const data=[],groups=new Map(),ranges=[];
  for(const triangle of triangles){
   const wheel=triangle.face.wheel,key=wheel?[...wheel.center,wheel.radius,wheel.axle,wheel.side].join('|'):'static';
   if(!groups.has(key))groups.set(key,{wheel,triangles:[]});groups.get(key).triangles.push(triangle);
  }
  for(const group of groups.values()){
   const first=data.length/10;
   for(const {verts,n,face}of group.triangles){
   const color=rgb(face.fill),material=materials[face.material]??0;
   for(const p of verts){const normal=normals.get(key(p,face))||n,len=Math.hypot(...normal)||1;data.push(p.x,p.y,p.z,...normal.map(x=>x/len),...color,material);}
   }
   ranges.push({first,count:data.length/10-first,wheel:group.wheel});
  }
  const buffer=gl.createBuffer();if(!buffer)throw new Error('Vehicle WebGL vertex buffer allocation failed');
  try{
   gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);this._checkResource('vertex buffer upload');
   const result={buffer,count:data.length/10,ranges};this.cache.set(mesh,result);return result;
  }catch(error){gl.deleteBuffer(buffer);throw error;}
 }
 _assetBuffers(model){
  if(this.assetCache.has(model))return this.assetCache.get(model);
  const gl=this.gl,allocated=[];
  try{
  const result=model.primitives.map(p=>{
   let vertices=p.vertices,indices=p.indices;
   if(p.indexType===4&&!this.uintIndices){vertices=new Float32Array(indices.length*8);for(let i=0;i<indices.length;i++)vertices.set(p.vertices.subarray(indices[i]*8,indices[i]*8+8),i*8);indices=null;}
   const buffer=gl.createBuffer();if(!buffer)throw new Error('Vehicle WebGL vertex buffer allocation failed');allocated.push(buffer);
   gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);this._checkResource('vertex buffer upload');
   let indexBuffer;if(indices){indexBuffer=gl.createBuffer();if(!indexBuffer)throw new Error('Vehicle WebGL index buffer allocation failed');allocated.push(indexBuffer);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);this._checkResource('index buffer upload');}
   return {p,buffer,indexBuffer,count:indices?indices.length:vertices.length/8,type:p.indexType===2?gl.UNSIGNED_SHORT:gl.UNSIGNED_INT};
  }).sort((a,b)=>(b.p.alpha??1)-(a.p.alpha??1));
  this.assetCache.set(model,result);return result;
  }catch(error){for(const buffer of allocated)gl.deleteBuffer(buffer);throw error;}
 }
 _texture(source,repeat=false){
  // Imported meshes may use tiled UVs. Keep photos/default assets clamped and
  // cache each sampler separately even when they share the same image bytes.
  // Stable object keys avoid concatenating and hashing a multi-megabyte data
  // URL again on every tiled-material draw.
  let key=source;
  if(repeat){if(!this.repeatTextureKeys.has(source))this.repeatTextureKeys.set(source,{source,repeat:true});key=this.repeatTextureKeys.get(source);}
  if(this.textures.has(key))return this.textures.get(key);
  const gl=this.gl,texture=gl.createTexture();if(!texture)throw new Error('Vehicle WebGL texture allocation failed');
  const record={texture,ready:false};
  const previous=gl.getParameter(gl.TEXTURE_BINDING_2D);
  try{gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));this._checkResource('placeholder texture upload');}
  catch(error){gl.deleteTexture(texture);throw error;}
  finally{gl.bindTexture(gl.TEXTURE_2D,previous);}
  this.textures.set(key,record);
  const generation=this.textureGeneration,image=new Image(),current=()=>this.available&&generation===this.textureGeneration&&this.textures.get(key)===record;
  image.onload=()=>{
   if(!current())return;
   const bound=gl.getParameter(gl.TEXTURE_BINDING_2D);let failure;
   try{
    const powerOfTwo=n=>Number.isInteger(n)&&n>0&&(n&(n-1))===0;
    if(repeat&&(!powerOfTwo(image.naturalWidth||image.width)||!powerOfTwo(image.naturalHeight||image.height)))throw new Error('Vehicle repeating texture requires power-of-two dimensions');
    gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);this._checkResource('image texture upload');
   }
   catch(error){failure=error;}
   finally{gl.bindTexture(gl.TEXTURE_2D,bound);}
   if(failure){this._fail(failure);return;}
   record.ready=true;this.onUpdate?.();
  };
  image.onerror=()=>{if(current())this._fail(new Error('Vehicle texture image decode failed'));};
  image.src=source;return record;
 }
 _photoCameraMatrix(c){
  if(c.matrix)return c.matrix;
  const eye=c.eye,offset=c.offset||[0,0,0],d=c.distance-eye.reduce((s,x,i)=>s+x*offset[i],0),rows=[];
  for(let j=0;j<2;j++){const axis=j?c.up:c.right,sign=j?-1:1,dimension=j?c.height:c.width;rows.push([...eye.map((e,i)=>(-c.center[j]*e+sign*c.focal*axis[i])/dimension),(c.center[j]*d+sign*c.focal*axis.reduce((s,x,i)=>s+x*offset[i],0))/dimension]);}
  const depth=[...eye.map(e=>-e),d];c.matrix=[0,1,2,3].flatMap(i=>[rows[0][i],rows[1][i],depth[i],i===3?1:0]);return c.matrix;
 }
 _photoTexture(source){
  // At most twelve visible entrants can each need two source directions.
  // Bound color/orbit history independently of ordinary UV material textures.
  const recent=this.photoTextures||(this.photoTextures=new Map()),record=this._texture(source);
  recent.delete(source);recent.set(source,record);
  while(recent.size>24){
   const [key,old]=recent.entries().next().value;recent.delete(key);
   if(this.textures.get(key)===old){this.textures.delete(key);this.gl.deleteTexture(old.texture);}
   // _texture's identity check rejects any late decode after this eviction.
  }
  return record;
 }
 _bindPhoto(mesh,position,camera,fixedCamera,car){
  const source=mesh.manufacturer.photoProjection;if(!source)return;
  const variant=source.paintVariants?.[mesh.paintFinish?.code];
  // Each variant is the same calibrated turntable in another factory color.
  // Switching source photographs retains all glazing, lamps and black trim.
  const photo=variant?{...source,...variant}:source;
  const dx=camera.target.x-Math.sin(camera.yaw)*Math.cos(camera.pitch)*camera.distance-position.x,dy=camera.target.y+Math.cos(camera.yaw)*Math.cos(camera.pitch)*camera.distance-position.y,angle=position.angle||0;
  const localAngle=Math.atan2(-dx*Math.sin(angle)+dy*Math.cos(angle),dx*Math.cos(angle)+dy*Math.sin(angle));
  const fixed=Number.isInteger(fixedCamera)?photo.cameras[fixedCamera]:null;
  const nearest=fixed?[{c:fixed,delta:0},{c:fixed,delta:0}]:photo.cameras.map(c=>({c,delta:Math.atan2(Math.sin(Math.atan2(c.eye[1],c.eye[0])-localAngle),Math.cos(Math.atan2(c.eye[1],c.eye[0])-localAngle))})).sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta)).slice(0,2);
  const gl=this.gl,U=this.uniforms;
  const owner=car&&typeof car==='object'?car:mesh,states=this.photoStates||(this.photoStates=new WeakMap()),previous=states.get(owner);
  const valid=pair=>pair&&pair.textures.every((record,i)=>record.ready&&this.textures.get(pair.sources[i])===record);
  // The renderer creates a new mesh when paint changes. Remember the complete
  // prior pair by car so a cold factory-color request cannot flash white. Touch
  // its LRU entries before allocating new pictures; stale/deleted GPU records
  // are never rebound. Async readiness requests the normal idle redraw.
  if(valid(previous))previous.sources.forEach(source=>this._photoTexture(source));
  const sources=nearest.map(({c})=>photo.textures[c.textureIndex]),textures=sources.map(source=>this._photoTexture(source));
  let pair={nearest,sources,textures,paintCode:mesh.paintFinish?.code};
  if(valid(pair))states.set(owner,pair);
  else if(valid(previous))pair=previous;
  pair.nearest.forEach(({c},i)=>{gl.activeTexture(gl.TEXTURE1+i);gl.bindTexture(gl.TEXTURE_2D,pair.textures[i].texture);gl.uniform1i(i?U.uPhotoTextureB:U.uPhotoTextureA,i+1);gl.uniformMatrix4fv(i?U.uPhotoMatrixB:U.uPhotoMatrixA,false,this._photoCameraMatrix(c));});
  gl.uniform1f(U.uPhotoBlend,Math.abs(pair.nearest[0].delta)/(Math.abs(pair.nearest[0].delta)+Math.abs(pair.nearest[1].delta)||1));gl.activeTexture(gl.TEXTURE0);
  return pair;
 }
 _bindPaint(finish){
  const gl=this.gl,U=this.uniforms;
  if(!finish){gl.uniform4f(U.uPaint,0,0,0,0);return;}
  if(!this.paintTexture){
   const texture=gl.createTexture();if(!texture)throw new Error('Vehicle paint texture allocation failed');
   try{
    const size=128,pixels=new Uint8Array(size*size*4);let seed=16973;
    for(let i=0;i<pixels.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const value=seed>>>24;pixels[i]=pixels[i+1]=pixels[i+2]=value;pixels[i+3]=255;}
    gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);gl.generateMipmap(gl.TEXTURE_2D);
    this._checkResource('paint texture upload');this.paintTexture=texture;
   }catch(error){gl.deleteTexture(texture);throw error;}finally{gl.activeTexture(gl.TEXTURE0);}
  }
  gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.paintTexture);gl.uniform1i(U.uFlakes,3);gl.activeTexture(gl.TEXTURE0);
  const matte=finish.finish==='matte',roughness=Math.max(.04,Math.min(1,Number.isFinite(finish.roughness)?finish.roughness:.26));
  gl.uniform4f(U.uPaint,matte?Math.max(.65,roughness):roughness,matte||finish.finish==='solid'?0:.75,finish.photoFill?-1:finish.finish==='pearl'?1:0,matte?0:Math.max(0,Math.min(1,finish.clearcoat??.9)));
 }
 _drawAsset(mesh,position,camera,useLowDetail=false,car){
  const gl=this.gl,A=this.attributes,U=this.uniforms;
  gl.uniform3fv(U.uModelScale,mesh.modelScale);gl.uniform3fv(U.uModelOffset,mesh.modelOffset);
  gl.disableVertexAttribArray(A.aColor);gl.disableVertexAttribArray(A.aMaterial);
  let boundPhotoCamera=null,boundPhoto=null;
  // The watched vehicle keeps its full exterior. Ghost cars share a reduced
  // version of that same source, avoiding repeated high-detail geometry.
  let model=mesh.manufacturer;
  if(useLowDetail&&model.fallbackPrimitives){if(!this.lodCache.has(model))this.lodCache.set(model,{primitives:model.fallbackPrimitives});model=this.lodCache.get(model);}
  for(const b of this._assetBuffers(model)){
   const p=b.p,brake=p.brakeLight?Math.max(0,Math.min(1,car?.brakeLightState?.intensity||0)):0;
   if(p.brakeLight?.overlay&&!brake)continue;
   const opacity=(p.alpha??1)*(p.brakeLight?.overlay?brake:1);
   gl.uniform1f(U.uBrake,brake);gl.bindBuffer(gl.ARRAY_BUFFER,b.buffer);
   const wheel=p.wheel,angle=wheel?(root.VehicleWheels?.angle?.(mesh,wheel,car)||0):0;
   gl.uniform4f(U.uWheel,wheel?.center?.[0]||0,wheel?.center?.[1]||0,wheel?.center?.[2]||0,angle);
   // A photo-fill panel is estimated, not a factory matte finish. Keep its
   // weak neutral reflection below the baked adjacent photograph highlights.
   this._bindPaint(p.photoPaint?{finish:'solid',roughness:.4,clearcoat:.18,photoFill:true}:p.paint?mesh.paintFinish:null);
   for(const [name,size,offset]of [['aPosition',3,0],['aNormal',3,12],['aUV',2,24]]){gl.enableVertexAttribArray(A[name]);gl.vertexAttribPointer(A[name],size,gl.FLOAT,false,32,offset);}
   const photoFill=p.photoPaintColors?.[boundPhoto?.paintCode||mesh.paintFinish?.code];
   gl.vertexAttrib3fv(A.aColor,p.paint?rgb(photoFill||mesh.paint):p.color);gl.vertexAttrib1f(A.aMaterial,p.material);
   gl.uniform1f(U.uOpacity,opacity);gl.uniform1i(U.uHasTexture,!!p.texture);gl.uniform1i(U.uOpaqueTexture,!!p.textureOpaque);
   const photoMode=!!(p.photoProjected&&mesh.manufacturer.photoProjection);
   if(photoMode&&boundPhotoCamera!==(p.photoCameraIndex??-1)){boundPhoto=this._bindPhoto(mesh,position,camera,p.photoCameraIndex,car);boundPhotoCamera=p.photoCameraIndex??-1;}
   gl.uniform1i(U.uPhotoMode,photoMode);
   if(p.texture){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this._texture(p.texture,!!p.textureRepeat).texture);gl.uniform1i(U.uTexture,0);}
   if(opacity<.99){gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);}else{gl.disable(gl.BLEND);gl.depthMask(true);}
   if(b.indexBuffer){gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,b.indexBuffer);gl.drawElements(gl.TRIANGLES,b.count,b.type,0);}else gl.drawArrays(gl.TRIANGLES,0,b.count);
  }
  gl.depthMask(true);gl.disable(gl.BLEND);
 }
 render(entries,camera,width,height,dpr=1) {
  if(!this.available)return null;
  try{
  const gl=this.gl,w=Math.round(width*dpr),h=Math.round(height*dpr);
  if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
  gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.useProgram(this.program);
  const U=this.uniforms;gl.uniform3f(U.uTarget,camera.target.x,camera.target.y,camera.target.z);
  gl.uniform4f(U.uCamera,camera.yaw,camera.pitch,camera.distance,camera.f);gl.uniform4f(U.uViewport,width,height,camera.cx,camera.cy);
  // Match the canvas near plane and include every visible vehicle. A fixed
  // 100 m far plane made distant detailed cars disappear while labels stayed.
  // Keep the range tight when only the watched body is present.
  let far=Math.max(100,camera.distance*2);
  for(const {mesh,position:p}of entries){const horizontal=-(p.x-camera.target.x)*camera.sinYaw+(p.y-camera.target.y)*camera.cosYaw,depth=camera.distance-horizontal*camera.cosPitch-((p.elevation||0)-camera.target.z)*camera.sinPitch;far=Math.max(far,depth+Math.hypot(mesh.length||5,mesh.width||2,mesh.height||2)+2);}
  gl.uniform2f(U.uClip,Math.max(.3,camera.distance*.018),far);
  gl.uniform3f(U.uEye,camera.target.x-Math.sin(camera.yaw)*Math.cos(camera.pitch)*camera.distance,camera.target.y+Math.cos(camera.yaw)*Math.cos(camera.pitch)*camera.distance,camera.target.z+Math.sin(camera.pitch)*camera.distance);
  // Independent ghost cars can occupy the exact same point. Draw the watched
  // body last with its own depth buffer to prevent coplanar flicker at the grid.
  for(const entry of [...entries].sort((a,b)=>Number(!!a.selected)-Number(!!b.selected))){
   if(entry.selected)gl.clear(gl.DEPTH_BUFFER_BIT);
   const {mesh,position:p}=entry;
   gl.uniform3f(U.uCar,p.x,p.y,(p.elevation||0)+.055);gl.uniform2f(U.uPose,p.angle||0,Math.atan(p.grade||0));
   if(mesh.manufacturer)this._drawAsset(mesh,p,camera,entry.selected===false,entry.car);
   for(const geometry of [mesh.manufacturer?null:mesh,entry.effect].filter(Boolean)){
    gl.uniform1f(U.uBrake,0);
    gl.uniform1i(U.uPhotoMode,0);gl.uniform4f(U.uWheel,0,0,0,0);this._bindPaint(geometry.paintFinish||null);
    gl.uniform3f(U.uModelScale,1,1,1);gl.uniform3f(U.uModelOffset,0,0,0);gl.uniform1f(U.uOpacity,1);gl.uniform1i(U.uHasTexture,0);gl.disableVertexAttribArray(this.attributes.aUV);gl.vertexAttrib2f(this.attributes.aUV,0,0);
    const b=this._buffer(geometry);gl.bindBuffer(gl.ARRAY_BUFFER,b.buffer);
    for(const [name,size,offset]of [['aPosition',3,0],['aNormal',3,12],['aColor',3,24],['aMaterial',1,36]]){const a=this.attributes[name];gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,40,offset);}
    for(const range of b.ranges){
     const wheel=range.wheel,angle=wheel?(root.VehicleWheels?.angle(geometry,wheel,entry.car)||0):0;
     gl.uniform4f(U.uWheel,wheel?.center?.[0]||0,wheel?.center?.[1]||0,wheel?.center?.[2]||0,angle);
     gl.drawArrays(gl.TRIANGLES,range.first,range.count);
    }
   }
  }
  return this.canvas;
  }catch(error){this._fail(error,false);return null;}
 }
 clearGeometry(){if(!this.gl)return;this.textureGeneration++;for(const b of this.cache.values())this.gl.deleteBuffer(b.buffer);for(const list of this.assetCache.values())for(const b of list){this.gl.deleteBuffer(b.buffer);if(b.indexBuffer)this.gl.deleteBuffer(b.indexBuffer);}for(const t of this.textures.values())this.gl.deleteTexture(t.texture);if(this.paintTexture)this.gl.deleteTexture(this.paintTexture);this.paintTexture=null;this.cache.clear();this.assetCache.clear();this.lodCache=new WeakMap();this.textures.clear();this.repeatTextureKeys.clear();this.photoTextures?.clear();this.photoStates=new WeakMap();}
 dispose(){if(!this.gl)return;this.clearGeometry();this.available=false;this.gl.deleteProgram(this.program);}
}
root.VehicleSurfaces=VehicleSurfaces;
})(typeof window!=='undefined'?window:globalThis);
