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
    dispose(){if(this.gl){this.gl.deleteBuffer(this.buffer);this.gl.deleteProgram(this.program);}this.available=false;}
  }
  TerrainSurfaces.rasterize=rasterize;root.TerrainSurfaces=TerrainSurfaces;
  if(typeof module!=='undefined'&&module.exports)module.exports=TerrainSurfaces;
})(typeof window!=='undefined'?window:globalThis);
