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
  this.canvas=document.createElement('canvas');this.cache=new Map();this.assetCache=new Map();this.textures=new Map();this.textureGeneration=0;this.available=false;this.onUpdate=onUpdate;
  try {
   this.gl=this.canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
   const gl=this.gl;if(!gl)return;
   const vertex=`
    precision highp float;
    attribute vec3 aPosition;attribute vec3 aNormal;attribute vec3 aColor;attribute float aMaterial;attribute vec2 aUV;
    uniform vec3 uModelScale;uniform vec3 uModelOffset;
    uniform vec3 uCar;uniform vec2 uPose;uniform vec3 uTarget;uniform vec4 uCamera;uniform vec4 uViewport;uniform vec2 uClip;
    varying vec3 vNormal;varying vec3 vColor;varying vec3 vWorld;varying float vMaterial;varying vec2 vUV;
    uniform mat4 uPhotoMatrixA;uniform mat4 uPhotoMatrixB;varying vec3 vPhotoA;varying vec3 vPhotoB;
    vec3 rotateCar(vec3 p){float ca=cos(uPose.x),sa=sin(uPose.x),cg=cos(uPose.y),sg=sin(uPose.y);float x=p.x*cg-p.z*sg;return vec3(x*ca-p.y*sa,x*sa+p.y*ca,p.x*sg+p.z*cg);}
    void main(){
     vec3 world=rotateCar((aPosition+uModelOffset)*uModelScale)+uCar;
     vec3 d=world-uTarget;float sy=sin(uCamera.x),cy=cos(uCamera.x),sp=sin(uCamera.y),cp=cos(uCamera.y);
     float h=-d.x*sy+d.y*cy,depth=uCamera.z-h*cp-d.z*sp;
     float right=d.x*cy+d.y*sy,vertical=h*sp-d.z*cp;
     float x=2.0*uCamera.w/uViewport.x*right+(2.0*uViewport.z/uViewport.x-1.0)*depth;
     float y=-2.0*uCamera.w/uViewport.y*vertical+(1.0-2.0*uViewport.w/uViewport.y)*depth;
     float z=(uClip.y+uClip.x)/(uClip.y-uClip.x)*depth-2.0*uClip.y*uClip.x/(uClip.y-uClip.x);
     gl_Position=vec4(x,y,z,depth);vNormal=rotateCar(aNormal/uModelScale);vColor=aColor;vWorld=world;vMaterial=aMaterial;vUV=aUV;
     vPhotoA=(uPhotoMatrixA*vec4(aPosition,1.0)).xyz;vPhotoB=(uPhotoMatrixB*vec4(aPosition,1.0)).xyz;
    }`;
   const fragment=`
    precision highp float;
    varying vec3 vNormal;varying vec3 vColor;varying vec3 vWorld;varying float vMaterial;varying vec2 vUV;uniform vec3 uEye;
    uniform sampler2D uTexture;uniform bool uHasTexture;uniform bool uOpaqueTexture;uniform float uOpacity;
    varying vec3 vPhotoA;varying vec3 vPhotoB;uniform bool uPhotoMode;uniform sampler2D uPhotoTextureA;uniform sampler2D uPhotoTextureB;uniform float uPhotoBlend;
    void main(){
     vec4 texel=uPhotoMode?mix(texture2D(uPhotoTextureA,vPhotoA.xy/vPhotoA.z),texture2D(uPhotoTextureB,vPhotoB.xy/vPhotoB.z),uPhotoBlend):uHasTexture?texture2D(uTexture,vUV):vec4(1.0);float alpha=(uOpaqueTexture||uPhotoMode?1.0:texel.a)*uOpacity;if(alpha<.02)discard;vec3 base=vColor*texel.rgb;
     vec3 N=normalize(vNormal),V=normalize(uEye-vWorld);if(dot(N,V)<0.0)N=-N;
     vec3 L=normalize(vec3(-.35,-.50,.85)),H=normalize(L+V);
     float ndl=max(0.0,dot(N,L)),fres=pow(1.0-max(0.0,dot(N,V)),4.0);
     float sky=.5+.5*N.z;vec3 c;
     if(vMaterial>3.5){c=base*(.88+.12*ndl);}
     else if(vMaterial>2.5){c=base*(.32+.38*ndl)+vec3(.50)*pow(max(0.0,dot(N,H)),90.0)+vec3(.25)*fres;}
     else if(vMaterial>1.5){c=base*(.52+.48*ndl);}
     else if(vMaterial>.5){
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
      c=base*(.48+.34*ndl+.22*fill+.09*sky)+environment*(.18+.56*fres)+vec3(.22)*highlight;
     }
     gl_FragColor=vec4(clamp(c,0.0,1.0),alpha);
    }`;
   const compile=(kind,source)=>{const shader=gl.createShader(kind);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;};
   this.program=gl.createProgram();gl.attachShader(this.program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(this.program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(this.program);
   if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.program));
   this.attributes=Object.fromEntries(['aPosition','aNormal','aColor','aMaterial','aUV'].map(n=>[n,gl.getAttribLocation(this.program,n)]));
   this.uniforms=Object.fromEntries(['uCar','uPose','uTarget','uCamera','uViewport','uClip','uEye','uModelScale','uModelOffset','uTexture','uHasTexture','uOpaqueTexture','uOpacity','uPhotoMode','uPhotoMatrixA','uPhotoMatrixB','uPhotoTextureA','uPhotoTextureB','uPhotoBlend'].map(n=>[n,gl.getUniformLocation(this.program,n)]));
   this.uintIndices=gl.getExtension('OES_element_index_uint');
   this.available=true;
  } catch(error){this.failure=String(error);}
  this.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.available=false;});
 }
 _buffer(mesh) {
  if(this.cache.has(mesh))return this.cache.get(mesh);
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
  const data=[];
  for(const {verts,n,face}of triangles){
   const color=rgb(face.fill),material=materials[face.material]??0;
   for(const p of verts){const normal=normals.get(key(p,face))||n,len=Math.hypot(...normal)||1;data.push(p.x,p.y,p.z,...normal.map(x=>x/len),...color,material);}
  }
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
  const result={buffer,count:data.length/10};this.cache.set(mesh,result);return result;
 }
 _assetBuffers(model){
  if(this.assetCache.has(model))return this.assetCache.get(model);
  const gl=this.gl,result=model.primitives.map(p=>{
   let vertices=p.vertices,indices=p.indices;
   if(p.indexType===4&&!this.uintIndices){vertices=new Float32Array(indices.length*8);for(let i=0;i<indices.length;i++)vertices.set(p.vertices.subarray(indices[i]*8,indices[i]*8+8),i*8);indices=null;}
   const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
   let indexBuffer;if(indices){indexBuffer=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);}
   return {p,buffer,indexBuffer,count:indices?indices.length:vertices.length/8,type:p.indexType===2?gl.UNSIGNED_SHORT:gl.UNSIGNED_INT};
  }).sort((a,b)=>(b.p.alpha??1)-(a.p.alpha??1));
  this.assetCache.set(model,result);return result;
 }
 _texture(source){
  if(this.textures.has(source))return this.textures.get(source);
  const gl=this.gl,texture=gl.createTexture(),record={texture,ready:false};this.textures.set(source,record);
  const previous=gl.getParameter(gl.TEXTURE_BINDING_2D);
  gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));gl.bindTexture(gl.TEXTURE_2D,previous);
  const generation=this.textureGeneration,image=new Image();image.onload=()=>{if(!this.available||generation!==this.textureGeneration)return;const bound=gl.getParameter(gl.TEXTURE_BINDING_2D);gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.bindTexture(gl.TEXTURE_2D,bound);record.ready=true;this.onUpdate?.();};image.src=source;return record;
 }
 _photoCameraMatrix(c){
  if(c.matrix)return c.matrix;
  const eye=c.eye,offset=c.offset||[0,0,0],d=c.distance-eye.reduce((s,x,i)=>s+x*offset[i],0),rows=[];
  for(let j=0;j<2;j++){const axis=j?c.up:c.right,sign=j?-1:1,dimension=j?c.height:c.width;rows.push([...eye.map((e,i)=>(-c.center[j]*e+sign*c.focal*axis[i])/dimension),(c.center[j]*d+sign*c.focal*axis.reduce((s,x,i)=>s+x*offset[i],0))/dimension]);}
  const depth=[...eye.map(e=>-e),d];c.matrix=[0,1,2,3].flatMap(i=>[rows[0][i],rows[1][i],depth[i],i===3?1:0]);return c.matrix;
 }
 _bindPhoto(mesh,position,camera,fixedCamera){
  const photo=mesh.manufacturer.photoProjection;if(!photo)return;
  const dx=camera.target.x-Math.sin(camera.yaw)*Math.cos(camera.pitch)*camera.distance-position.x,dy=camera.target.y+Math.cos(camera.yaw)*Math.cos(camera.pitch)*camera.distance-position.y,angle=position.angle||0;
  const localAngle=Math.atan2(-dx*Math.sin(angle)+dy*Math.cos(angle),dx*Math.cos(angle)+dy*Math.sin(angle));
  const fixed=Number.isInteger(fixedCamera)?photo.cameras[fixedCamera]:null;
  const nearest=fixed?[{c:fixed,delta:0},{c:fixed,delta:0}]:photo.cameras.map(c=>({c,delta:Math.atan2(Math.sin(Math.atan2(c.eye[1],c.eye[0])-localAngle),Math.cos(Math.atan2(c.eye[1],c.eye[0])-localAngle))})).sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta)).slice(0,2);
  const gl=this.gl,U=this.uniforms;
  const textures=nearest.map(({c})=>this._texture(photo.textures[c.textureIndex]));
  nearest.forEach(({c},i)=>{gl.activeTexture(gl.TEXTURE1+i);gl.bindTexture(gl.TEXTURE_2D,textures[i].texture);gl.uniform1i(i?U.uPhotoTextureB:U.uPhotoTextureA,i+1);gl.uniformMatrix4fv(i?U.uPhotoMatrixB:U.uPhotoMatrixA,false,this._photoCameraMatrix(c));});
  gl.uniform1f(U.uPhotoBlend,Math.abs(nearest[0].delta)/(Math.abs(nearest[0].delta)+Math.abs(nearest[1].delta)||1));gl.activeTexture(gl.TEXTURE0);
 }
 _drawAsset(mesh,position,camera){
  const gl=this.gl,A=this.attributes,U=this.uniforms;
  gl.uniform3fv(U.uModelScale,mesh.modelScale);gl.uniform3fv(U.uModelOffset,mesh.modelOffset);
  gl.disableVertexAttribArray(A.aColor);gl.disableVertexAttribArray(A.aMaterial);
  let boundPhotoCamera=null;
  for(const b of this._assetBuffers(mesh.manufacturer)){
   const p=b.p;gl.bindBuffer(gl.ARRAY_BUFFER,b.buffer);
   for(const [name,size,offset]of [['aPosition',3,0],['aNormal',3,12],['aUV',2,24]]){gl.enableVertexAttribArray(A[name]);gl.vertexAttribPointer(A[name],size,gl.FLOAT,false,32,offset);}
   gl.vertexAttrib3fv(A.aColor,p.paint?rgb(mesh.paint):p.color);gl.vertexAttrib1f(A.aMaterial,p.material);
   gl.uniform1f(U.uOpacity,p.alpha??1);gl.uniform1i(U.uHasTexture,!!p.texture);gl.uniform1i(U.uOpaqueTexture,!!p.textureOpaque);
   const photoMode=!!(p.photoProjected&&mesh.manufacturer.photoProjection);
   if(photoMode&&boundPhotoCamera!==(p.photoCameraIndex??-1)){this._bindPhoto(mesh,position,camera,p.photoCameraIndex);boundPhotoCamera=p.photoCameraIndex??-1;}
   gl.uniform1i(U.uPhotoMode,photoMode);
   if(p.texture){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this._texture(p.texture).texture);gl.uniform1i(U.uTexture,0);}
   if((p.alpha??1)<.99){gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);}else{gl.disable(gl.BLEND);gl.depthMask(true);}
   if(b.indexBuffer){gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,b.indexBuffer);gl.drawElements(gl.TRIANGLES,b.count,b.type,0);}else gl.drawArrays(gl.TRIANGLES,0,b.count);
  }
  gl.depthMask(true);gl.disable(gl.BLEND);
 }
 render(entries,camera,width,height,dpr=1) {
  if(!this.available)return null;
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
   if(mesh.manufacturer){this._drawAsset(mesh,p,camera);continue;}
   gl.uniform1i(U.uPhotoMode,0);
   gl.uniform3f(U.uModelScale,1,1,1);gl.uniform3f(U.uModelOffset,0,0,0);gl.uniform1f(U.uOpacity,1);gl.uniform1i(U.uHasTexture,0);gl.disableVertexAttribArray(this.attributes.aUV);gl.vertexAttrib2f(this.attributes.aUV,0,0);
   const b=this._buffer(mesh);gl.bindBuffer(gl.ARRAY_BUFFER,b.buffer);
   for(const [name,size,offset]of [['aPosition',3,0],['aNormal',3,12],['aColor',3,24],['aMaterial',1,36]]){const a=this.attributes[name];gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,40,offset);}
   gl.uniform3f(U.uCar,p.x,p.y,(p.elevation||0)+.055);gl.uniform2f(U.uPose,p.angle||0,Math.atan(p.grade||0));gl.drawArrays(gl.TRIANGLES,0,b.count);
  }
  return this.canvas;
 }
 clearGeometry(){if(!this.gl)return;this.textureGeneration++;for(const b of this.cache.values())this.gl.deleteBuffer(b.buffer);for(const list of this.assetCache.values())for(const b of list){this.gl.deleteBuffer(b.buffer);if(b.indexBuffer)this.gl.deleteBuffer(b.indexBuffer);}for(const t of this.textures.values())this.gl.deleteTexture(t.texture);this.cache.clear();this.assetCache.clear();this.textures.clear();}
 dispose(){if(!this.gl)return;this.clearGeometry();this.available=false;this.gl.deleteProgram(this.program);}
}
root.VehicleSurfaces=VehicleSurfaces;
})(typeof window!=='undefined'?window:globalThis);
