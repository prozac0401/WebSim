/* Depth-tested terrain, roads and scenery on an offscreen surface. The visible
 * game remains one canvas. Software rasterization retains the same occlusion
 * when WebGL is unavailable; no scene layer is unconditionally on top. */
(function(root){
  'use strict';
  const colors=new Map();
  function color(fill){
    if(colors.has(fill))return colors.get(fill);
    const s=String(fill||'#000000'),hex=s.match(/^#([\da-f]{3}|[\da-f]{6})$/i),rgba=s.match(/^rgba?\(([^)]+)\)$/);
    let c;
    if(hex){const h=hex[1].length===3?[...hex[1]].map(x=>x+x).join(''):hex[1];c=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).concat(1);}
    else if(rgba){const v=rgba[1].split(',').map(Number);c=[v[0]/255,v[1]/255,v[2]/255,v[3]??1];}
    else c=[.5,.5,.5,1];
    colors.set(fill,c);return c;
  }
  function ordered(queue){
    const opaque=[],transparent=[];
    for(const face of queue){if(!face.fill||face.points.length<3)continue;(color(face.fill)[3]>=.999?opaque:transparent).push(face);}
    transparent.sort((a,b)=>b.depth-a.depth||a.priority-b.priority);
    return {opaque,transparent};
  }
  function rasterize(queue,width,height,scale=1){
    const w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
    const pixels=new Uint8ClampedArray(w*h*4),depths=new Float32Array(w*h),groups=ordered(queue);
    const alphaSeen=groups.transparent.length?new Uint32Array(w*h):null;let faceId=0;
    for(const faces of [groups.opaque,groups.transparent])for(const face of faces){
      const c=color(face.fill),alpha=c[3];faceId++;
      for(let t=1;t<face.points.length-1;t++){
        const v=[face.points[0],face.points[t],face.points[t+1]].map(p=>({x:p.x*scale,y:p.y*scale,z:1/p.depth}));
        const [a,b,d]=v,area=(b.y-d.y)*(a.x-d.x)+(d.x-b.x)*(a.y-d.y);if(Math.abs(area)<1e-9)continue;
        const x0=Math.max(0,Math.floor(Math.min(a.x,b.x,d.x))),x1=Math.min(w-1,Math.ceil(Math.max(a.x,b.x,d.x)));
        const y0=Math.max(0,Math.floor(Math.min(a.y,b.y,d.y))),y1=Math.min(h-1,Math.ceil(Math.max(a.y,b.y,d.y)));
        for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
          const u=((b.y-d.y)*(x+.5-d.x)+(d.x-b.x)*(y+.5-d.y))/area;
          const v=((d.y-a.y)*(x+.5-d.x)+(a.x-d.x)*(y+.5-d.y))/area,w0=1-u-v;
          if(u<0||v<0||w0<0)continue;
          const reciprocal=u*a.z+v*b.z+w0*d.z,i=y*w+x;if(reciprocal<depths[i]-1e-8)continue;
          // A fan's shared diagonal belongs to one polygon. Blend it once,
          // matching GPU edge ownership instead of drawing a dark alpha seam.
          if(alpha<.999){if(alphaSeen[i]===faceId)continue;alphaSeen[i]=faceId;}
          const k=i*4;
          if(alpha>=.999){depths[i]=reciprocal;pixels[k]=c[0]*255;pixels[k+1]=c[1]*255;pixels[k+2]=c[2]*255;pixels[k+3]=255;}
          else{const old=pixels[k+3]/255,out=alpha+old*(1-alpha);for(let j=0;j<3;j++)pixels[k+j]=(c[j]*255*alpha+pixels[k+j]*old*(1-alpha))/out;pixels[k+3]=out*255;}
        }
      }
    }
    return {pixels,width:w,height:h};
  }
  function depthAt(p,c){return c.distance+(p.x-c.target.x)*c.sinYaw*c.cosPitch-(p.y-c.target.y)*c.cosYaw*c.cosPitch-(p.z-c.target.z)*c.sinPitch;}
  function eyeAt(c){return {x:c.target.x-c.sinYaw*c.cosPitch*c.distance,y:c.target.y+c.cosYaw*c.cosPitch*c.distance,z:c.target.z+c.sinPitch*c.distance};}
  function facePlane(face,origin={x:0,y:0,z:0}){
    if(!face.road&&!face.topSurface)return [0,0,0,-1];
    const [a,b,c]=face.vertices,ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    const scale=(nz<0?-1:1)/(Math.hypot(nx,ny,nz)||1);nx*=scale;ny*=scale;nz*=scale;
    return [nx,ny,nz,nx*(a.x-origin.x)+ny*(a.y-origin.y)+nz*(a.z-origin.z)];
  }
  // Column-major matrix acting on world minus camera.target. DPR affects only
  // the viewport; all projection coefficients use logical canvas dimensions.
  function cameraMatrix(c,width,height,near,far){
    const D=[c.sinYaw*c.cosPitch,-c.cosYaw*c.cosPitch,-c.sinPitch],R=[c.cosYaw,c.sinYaw,0],V=[-c.sinYaw*c.sinPitch,c.cosYaw*c.sinPitch,-c.cosPitch];
    const x=2*c.f/width,ox=2*c.cx/width-1,y=-2*c.f/height,oy=1-2*c.cy/height,z=(far+near)/(far-near),oz=-2*far*near/(far-near);
    const rows=[R.map((v,i)=>x*v+ox*D[i]).concat(ox*c.distance),V.map((v,i)=>y*v+oy*D[i]).concat(oy*c.distance),D.map(v=>z*v).concat(z*c.distance+oz),D.concat(c.distance)];
    return new Float32Array(Array.from({length:16},(_,i)=>rows[i%4][Math.floor(i/4)]));
  }
  function projectFace(face,c,width,height){
    if(!face.fill||!face.vertices||face.vertices.length<3)return null;
    const plane=facePlane(face),eye=eyeAt(c);
    if(plane[0]*eye.x+plane[1]*eye.y+plane[2]*eye.z-plane[3]<=0)return null;
    const near=Math.max(.3,c.distance*.018)+.001,clipped=[];
    for(let i=0;i<face.vertices.length;i++){
      const a=face.vertices[i],b=face.vertices[(i+1)%face.vertices.length],da=depthAt(a,c),db=depthAt(b,c);
      if(da>=near)clipped.push(a);
      if((da>=near)!==(db>=near)){const t=(near-da)/(db-da);clipped.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});}
    }
    if(clipped.length<3)return null;
    const points=clipped.map(p=>{const dx=p.x-c.target.x,dy=p.y-c.target.y,dz=p.z-c.target.z,depth=depthAt(p,c);return {x:c.cx+(dx*c.cosYaw+dy*c.sinYaw)*c.f/depth,y:c.cy+((-dx*c.sinYaw+dy*c.cosYaw)*c.sinPitch-dz*c.cosPitch)*c.f/depth,depth};});
    if(points.every(p=>p.x<-20)||points.every(p=>p.x>width+20)||points.every(p=>p.y<-20)||points.every(p=>p.y>height+20))return null;
    return {points,depth:points.reduce((sum,p)=>sum+p.depth,0)/points.length,fill:face.fill,stroke:face.stroke,width:face.width||.5,priority:face.priority||0};
  }
  function prepareScene(scene){
    if(!Array.isArray(scene?.faces))throw new TypeError('A static world scene requires immutable faces.');
    const opaque=[],transparent=[],bounds={minX:Infinity,minY:Infinity,minZ:Infinity,maxX:-Infinity,maxY:-Infinity,maxZ:-Infinity};
    let vertices=0;
    for(const face of scene.faces){
      if(!face.fill||!Array.isArray(face.vertices)||face.vertices.length<3)continue;
      if(face.vertices.some(p=>![p.x,p.y,p.z].every(Number.isFinite)))throw new TypeError('Static world vertices must be finite.');
      for(const p of face.vertices){bounds.minX=Math.min(bounds.minX,p.x);bounds.minY=Math.min(bounds.minY,p.y);bounds.minZ=Math.min(bounds.minZ,p.z);bounds.maxX=Math.max(bounds.maxX,p.x);bounds.maxY=Math.max(bounds.maxY,p.y);bounds.maxZ=Math.max(bounds.maxZ,p.z);}
      (color(face.fill)[3]>=.999?opaque:transparent).push(face);vertices+=(face.vertices.length-2)*3;
    }
    const origin=vertices?{x:(bounds.minX+bounds.maxX)/2,y:(bounds.minY+bounds.maxY)/2,z:(bounds.minZ+bounds.maxZ)/2}:{x:0,y:0,z:0};
    const data=new Float32Array(vertices*11),ranges=[];let cursor=0;
    for(const list of [opaque,transparent])for(const face of list){
      const start=cursor/11,c=color(face.fill),plane=facePlane(face,origin);
      for(let i=1;i<face.vertices.length-1;i++)for(const p of [face.vertices[0],face.vertices[i],face.vertices[i+1]]){
        data.set([p.x-origin.x,p.y-origin.y,p.z-origin.z,...c,...plane],cursor);cursor+=11;
      }
      if(list===transparent)ranges.push({face,start,count:cursor/11-start});
    }
    return {scene,data,origin,bounds:vertices?bounds:null,opaqueCount:opaque.reduce((n,f)=>n+(f.vertices.length-2)*3,0),transparent:ranges,vertices};
  }
  function sceneRange(cache,c,queue){
    const near=Math.max(.3,c.distance*.018)+.001,D=[c.sinYaw*c.cosPitch,-c.cosYaw*c.cosPitch,-c.sinPitch],b=cache.bounds;
    let far=near+1;
    if(b)far=Math.max(far,depthAt({x:D[0]>=0?b.maxX:b.minX,y:D[1]>=0?b.maxY:b.minY,z:D[2]>=0?b.maxZ:b.minZ},c)+1);
    for(const f of queue)for(const p of f.points)far=Math.max(far,p.depth+1);
    return {near,far};
  }
  function worldProgram(gl){
    const vertex='attribute vec3 aPoint;attribute vec4 aColor;attribute vec4 aPlane;uniform mat4 uMatrix;uniform vec4 uTarget;uniform vec4 uEye;varying vec4 vColor;void main(){gl_Position=uMatrix*vec4(aPoint-uTarget.xyz,1.0);if(dot(aPlane.xyz,uEye.xyz)-aPlane.w<=0.0)gl_Position=vec4(0.0,0.0,2.0,1.0);vColor=aColor;}';
    const fragment='precision mediump float;varying vec4 vColor;void main(){gl_FragColor=vColor;}';
    const program=gl.createProgram(),shaders=[];
    try{
      if(!program)throw new Error('Static world program allocation failed.');
      for(const [kind,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
        const shader=gl.createShader(kind);if(!shader)throw new Error('Static world shader allocation failed.');shaders.push(shader);
        gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));gl.attachShader(program,shader);
      }
      gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
      return {program,point:gl.getAttribLocation(program,'aPoint'),color:gl.getAttribLocation(program,'aColor'),plane:gl.getAttribLocation(program,'aPlane'),matrix:gl.getUniformLocation(program,'uMatrix'),target:gl.getUniformLocation(program,'uTarget'),eye:gl.getUniformLocation(program,'uEye')};
    }catch(error){if(program)gl.deleteProgram(program);throw error;}
    finally{for(const shader of shaders)gl.deleteShader(shader);}
  }
  class TerrainSurfaces{
    constructor(){
      this.canvas=root.document.createElement('canvas');this.available=false;this.kind='software-depth';
      try{
        const gl=this.canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true,preserveDrawingBuffer:true});if(!gl)throw new Error('WebGL unavailable');this.gl=gl;
        const shader=(kind,source)=>{const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
        const vertex='attribute vec3 aPoint;attribute vec4 aColor;uniform vec4 uView;varying vec4 vColor;void main(){float d=aPoint.z;gl_Position=vec4((aPoint.x/uView.x*2.0-1.0)*d,(1.0-aPoint.y/uView.y*2.0)*d,((uView.w+uView.z)*d-2.0*uView.w*uView.z)/(uView.w-uView.z),d);vColor=aColor;}';
        const fragment='precision mediump float;varying vec4 vColor;void main(){gl_FragColor=vColor;}';
        this.program=gl.createProgram();gl.attachShader(this.program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(this.program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.program));
        this.buffer=gl.createBuffer();this.point=gl.getAttribLocation(this.program,'aPoint');this.color=gl.getAttribLocation(this.program,'aColor');this.view=gl.getUniformLocation(this.program,'uView');this.available=true;this.kind='webgl-depth';
        this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.available=false;this.kind='software-depth';});
      }catch(_error){this.available=false;}
    }
    render(queue,width,height,dpr=1){
      this._releaseScene();
      this.sceneStats=null;
      if(!this.available){
        if(!this.software){this.software=root.document.createElement('canvas');this.context=this.software.getContext('2d');}
        // Bound CPU work on high-density/mobile displays. Geometry and reciprocal
        // depth are unchanged; only the fallback image resolution is reduced.
        const data=rasterize(queue,width,height,Math.min(1,800/Math.max(width,height)));
        this.software.width=data.width;this.software.height=data.height;const image=this.context.createImageData(data.width,data.height);image.data.set(data.pixels);this.context.putImageData(image,0,0);return this.software;
      }
      const gl=this.gl,w=Math.round(width*dpr),h=Math.round(height*dpr);
      if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
      gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.useProgram(this.program);
      let near=Infinity,far=1;for(const f of queue)for(const p of f.points){near=Math.min(near,p.depth);far=Math.max(far,p.depth);}
      if(!Number.isFinite(near))return this.canvas;
      gl.uniform4f(this.view,width,height,Math.max(.01,near*.99),far+1);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
      gl.enableVertexAttribArray(this.point);gl.vertexAttribPointer(this.point,3,gl.FLOAT,false,28,0);gl.enableVertexAttribArray(this.color);gl.vertexAttribPointer(this.color,4,gl.FLOAT,false,28,12);
      const groups=ordered(queue);
      for(const [faces,transparent]of [[groups.opaque,false],[groups.transparent,true]]){
        const data=[];for(const f of faces){const c=color(f.fill);for(let i=1;i<f.points.length-1;i++)for(const p of [f.points[0],f.points[i],f.points[i+1]])data.push(p.x,p.y,p.depth,...c);}
        if(!data.length)continue;
        gl.depthMask(!transparent);if(transparent){gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);}else gl.disable(gl.BLEND);
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,data.length/7);
      }
      gl.depthMask(true);gl.disable(gl.BLEND);return this.canvas;
    }
    _releaseScene(){if(this._sceneCache?.buffer){if(this._worldProgram)for(const name of ['point','color','plane'])this.gl.disableVertexAttribArray(this._worldProgram[name]);this.gl.deleteBuffer(this._sceneCache.buffer);}this._sceneCache=null;}
    renderScene(scene,camera,dynamicQueue,width,height,dpr=1,{showShadows=true}={}){
      const fallback=()=>{
        const queue=[];for(const f of scene.faces){if(!showShadows&&f.kind==='tree-shadow')continue;const p=projectFace(f,camera,width,height);if(p)queue.push(p);}
        const canvas=this.render(queue.concat(dynamicQueue),width,height,dpr);
        this.sceneStats={faces:scene.faces.length,cpuProjectedFaces:scene.faces.length,software:true,staticUploads:this._sceneUploads||0};
        return canvas;
      };
      if(!this.available)return fallback();
      try{
        const gl=this.gl;
        if(!this._worldProgram)this._worldProgram=worldProgram(gl);
        if(this._sceneCache?.scene!==scene){
          this._releaseScene();const cache=prepareScene(scene);this._sceneCache=cache;
          cache.buffer=gl.createBuffer();if(!cache.buffer)throw new Error('Static world buffer allocation failed.');
          gl.bindBuffer(gl.ARRAY_BUFFER,cache.buffer);gl.bufferData(gl.ARRAY_BUFFER,cache.data,gl.STATIC_DRAW);
          if(gl.getError&&gl.getError()!==gl.NO_ERROR)throw new Error('Static world buffer upload failed.');
          this._sceneUploads=(this._sceneUploads||0)+1;
          cache.data=null; // The GPU owns the immutable vertex copy after upload.
        }
        const cache=this._sceneCache,program=this._worldProgram,w=Math.round(width*dpr),h=Math.round(height*dpr);
        if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
        const range=sceneRange(cache,camera,dynamicQueue),matrix=cameraMatrix(camera,width,height,range.near,range.far),eye=eyeAt(camera),origin=cache.origin;
        gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.depthMask(true);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
        let active=null;
        const world=()=>{
          if(active==='world')return;active='world';gl.useProgram(program.program);gl.bindBuffer(gl.ARRAY_BUFFER,cache.buffer);
          gl.disableVertexAttribArray(this.point);gl.disableVertexAttribArray(this.color);
          for(const [location,size,offset]of [[program.point,3,0],[program.color,4,12],[program.plane,4,28]]){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,44,offset);}
          gl.uniformMatrix4fv(program.matrix,false,matrix);gl.uniform4f(program.target,camera.target.x-origin.x,camera.target.y-origin.y,camera.target.z-origin.z,0);gl.uniform4f(program.eye,eye.x-origin.x,eye.y-origin.y,eye.z-origin.z,0);
        };
        const screen=faces=>{
          if(!faces.length)return;
          if(active!=='screen'){
            active='screen';gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.uniform4f(this.view,width,height,range.near,range.far);
            // Attributes from the world program can remain enabled at unrelated
            // locations; disable its plane before binding the small screen buffer.
            for(const location of [program.point,program.color,program.plane])gl.disableVertexAttribArray(location);
            gl.enableVertexAttribArray(this.point);gl.vertexAttribPointer(this.point,3,gl.FLOAT,false,28,0);gl.enableVertexAttribArray(this.color);gl.vertexAttribPointer(this.color,4,gl.FLOAT,false,28,12);
          }
          const data=[];for(const f of faces){const c=color(f.fill);for(let i=1;i<f.points.length-1;i++)for(const p of [f.points[0],f.points[i],f.points[i+1]])data.push(p.x,p.y,p.depth,...c);}
          if(data.length){gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,data.length/7);}
        };
        world();if(cache.opaqueCount)gl.drawArrays(gl.TRIANGLES,0,cache.opaqueCount);
        const dynamic=ordered(dynamicQueue);screen(dynamic.opaque);
        const alpha=[];let cpuProjectedFaces=0;
        for(const item of cache.transparent){if(!showShadows&&item.face.kind==='tree-shadow')continue;cpuProjectedFaces++;const projected=projectFace(item.face,camera,width,height);if(projected)alpha.push({...item,depth:projected.depth,priority:projected.priority});}
        for(const face of dynamic.transparent)alpha.push({projected:face,depth:face.depth,priority:face.priority||0});
        alpha.sort((a,b)=>b.depth-a.depth||a.priority-b.priority);
        gl.depthMask(false);gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
        let pending=[];
        for(const item of alpha){
          if(item.projected){pending.push(item.projected);continue;}
          if(pending.length){screen(pending);pending=[];}world();gl.drawArrays(gl.TRIANGLES,item.start,item.count);
        }
        if(pending.length)screen(pending);
        gl.depthMask(true);gl.disable(gl.BLEND);
        this.sceneStats={faces:scene.faces.length,vertices:cache.vertices,staticBytes:cache.vertices*44,staticUploads:this._sceneUploads,transparentFaces:alpha.length,cpuProjectedFaces,near:range.near,far:range.far};
        return this.canvas;
      }catch(error){this.failure=String(error.message||error);this.available=false;this.kind='software-depth';return fallback();}
    }
    dispose(){this._releaseScene();if(this.gl){this.gl.deleteBuffer(this.buffer);this.gl.deleteProgram(this.program);if(this._worldProgram)this.gl.deleteProgram(this._worldProgram.program);}this._worldProgram=null;this.available=false;}
  }
  TerrainSurfaces.rasterize=rasterize;TerrainSurfaces.cameraMatrix=cameraMatrix;TerrainSurfaces.projectFace=projectFace;TerrainSurfaces.prepareScene=prepareScene;TerrainSurfaces.sceneRange=sceneRange;root.TerrainSurfaces=TerrainSurfaces;
  if(typeof module!=='undefined'&&module.exports)module.exports=TerrainSurfaces;
})(typeof window!=='undefined'?window:globalThis);
