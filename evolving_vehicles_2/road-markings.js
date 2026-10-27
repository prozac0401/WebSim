/* Cited road paint only: partition existing asphalt triangles on their original
 * planes. Canonical centreline metres and positive-right offsets are display
 * coordinates; no physics path, road width or elevation is changed. */
(function(root){
  'use strict';
  const MAX_FEATURES=500,MAX_OVERLAYS=20000,STEP=2;
  const TYPES=new Set(['line','cross-line','checker','grid-box']);
  const mod=(n,d)=>((n%d)+d)%d;
  const color=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const present=value=>typeof value==='string'&&value.trim().length>0;
  function apply(faces,road,metadata,trackWidth){
    if(!Array.isArray(faces))throw new TypeError('RoadMarkings requires a face array.');
    const rules=Array.isArray(metadata?.roadMarkings)?metadata.roadMarkings:[];
    const stats={features:0,overlayFaces:0,paintedFaces:0,rejected:0,byType:{},limitReached:false};
    const unchanged=()=>({faces,stats});
    if(!rules.length)return unchanged();
    const length=road?.canonicalLength??road?.length;
    if(!finite(length)||length<=0||!finite(trackWidth)||trackWidth<=0||typeof road?.sample!=='function'){
      stats.rejected=rules.length;return unchanged();
    }
    const overlays=[],sources=new Map();
    const number=(value,fallback)=>value===undefined?fallback:value;
    const within=(value,low,high)=>finite(value)&&value>=low&&value<=high;
    function at(s,offset){
      const p=road.sample(mod(s,length));
      if(!p||![p.x,p.y,p.angle].every(finite))throw new TypeError('Invalid road marking sample.');
      return {x:p.x-Math.sin(p.angle)*offset,y:p.y+Math.cos(p.angle)*offset,z:0};
    }
    // A per-feature scratch list makes invalid/oversized features atomic: a
    // half-built grid/checker never leaks into the painted road.
    for(let index=0;index<Math.min(rules.length,MAX_FEATURES);index++){
      const rule=rules[index],type=rule?.type;
      if(!rule||!TYPES.has(type)||!present(rule.sourceId)||!present(rule.evidence)){
        stats.rejected++;continue;
      }
      const pending=[],featureId='road-marking:'+index,available=MAX_OVERLAYS-overlays.length;
      let oversized=false;
      function patch(from,to,left,right,fill){
        if(![from,to,left,right].every(finite)||to<=from||right<=left||!color(fill))throw new TypeError('Invalid marking patch.');
        const count=Math.ceil((to-from)/STEP);
        if(pending.length+count*2>available){oversized=true;throw new RangeError('Road marking overlay budget.');}
        for(let part=0;part<count;part++){
          const a=from+(to-from)*part/count,b=from+(to-from)*(part+1)/count;
          const vertices=[at(a,left),at(b,left),at(b,right),at(a,right)];
          pending.push({vertices:[vertices[0],vertices[1],vertices[2]],fill,kind:'road-marking',featureId},
            {vertices:[vertices[0],vertices[2],vertices[3]],fill,kind:'road-marking',featureId});
        }
      }
      function span(){
        if(!finite(rule.startM)||!finite(rule.endM)||rule.startM===rule.endM)throw new TypeError('Invalid marking interval.');
        const delta=rule.endM-rule.startM;
        return {start:mod(rule.startM,length),distance:Math.abs(delta)>=length?length:mod(delta,length)};
      }
      function across(){
        const left=number(rule.leftOffset,-trackWidth/2),right=number(rule.rightOffset,trackWidth/2);
        if(!within(left,-trackWidth*2,trackWidth*2)||!within(right,-trackWidth*2,trackWidth*2)||right<=left)throw new TypeError('Invalid lateral marking bounds.');
        return {left,right};
      }
      try{
        const fill=number(rule.color,'#e9e9df');
        if(type==='line'){
          const {start,distance}=span(),offset=number(rule.offset,0),width=number(rule.width,.12);
          if(!within(offset,-trackWidth*2,trackWidth*2)||!within(width,.01,trackWidth*2)||!color(fill))throw new TypeError('Invalid line width or color.');
          if(rule.dashLength===undefined&&rule.gapLength===undefined)patch(start,start+distance,offset-width/2,offset+width/2,fill);
          else{
            const dash=rule.dashLength,gap=number(rule.gapLength,dash);
            if(!within(dash,.05,length)||!within(gap,0,length))throw new TypeError('Invalid dash interval.');
            // Bound work before iterating an unusually dense full-lap pattern.
            if(Math.ceil(distance/(dash+gap))*2>available){oversized=true;throw new RangeError('Road marking dash budget.');}
            for(let s=0;s<distance;s+=dash+gap)patch(start+s,start+Math.min(s+dash,distance),offset-width/2,offset+width/2,fill);
          }
        }else if(type==='cross-line'){
          const {left,right}=across(),width=number(rule.width,.3);
          if(!finite(rule.atM)||!within(width,.01,20))throw new TypeError('Invalid cross-line.');
          const s=mod(rule.atM,length);patch(s-width/2,s+width/2,left,right,fill);
        }else if(type==='checker'){
          const {left,right}=across(),depth=number(rule.depth,1),cell=number(rule.cellSize,.5),colors=number(rule.colors,['#e9e9df','#303637']);
          if(!finite(rule.atM)||!within(depth,.05,20)||!within(cell,.05,5)||!Array.isArray(colors)||colors.length!==2||!colors.every(color))throw new TypeError('Invalid checker.');
          const rows=Math.ceil(depth/cell),columns=Math.ceil((right-left)/cell),start=mod(rule.atM,length)-depth/2;
          if(rows*columns*2>available){oversized=true;throw new RangeError('Road marking checker budget.');}
          for(let row=0;row<rows;row++)for(let column=0;column<columns;column++)
            patch(start+row*cell,start+Math.min(depth,(row+1)*cell),left+column*cell,Math.min(right,left+(column+1)*cell),colors[(row+column)%2]);
        }else{
          // atM is the rear edge. Two longitudinal sides extend forward; the
          // forward side stays open unless the authored rule explicitly closes it.
          const width=number(rule.width,1.8),depth=number(rule.length,4.5),stroke=number(rule.stroke,.12),offset=number(rule.offset,0);
          if(!finite(rule.atM)||!within(width,.2,trackWidth*2)||!within(depth,.2,30)||!within(stroke,.01,Math.min(width,depth)/2)||!within(offset,-trackWidth*2,trackWidth*2))throw new TypeError('Invalid grid box.');
          const s=mod(rule.atM,length),left=offset-width/2,right=offset+width/2;
          patch(s,s+stroke,left,right,fill);
          patch(s+stroke,s+depth,left,left+stroke,fill);patch(s+stroke,s+depth,right-stroke,right,fill);
          if(rule.openFront===false)patch(s+depth-stroke,s+depth,left+stroke,right-stroke,fill);
        }
      }catch(error){
        stats.rejected++;
        if(oversized){stats.limitReached=true;stats.rejected+=Math.min(rules.length,MAX_FEATURES)-index-1;break;}
        continue;
      }
      if(!pending.length){stats.rejected++;continue;}
      overlays.push(...pending);sources.set(featureId,{markingId:present(rule.id)?rule.id:featureId,markingType:type,sourceId:rule.sourceId,evidence:rule.evidence});
      stats.features++;stats.byType[type]=(stats.byType[type]||0)+1;
    }
    if(rules.length>MAX_FEATURES){stats.rejected+=rules.length-MAX_FEATURES;stats.limitReached=true;}
    stats.overlayFaces=overlays.length;
    if(!overlays.length||!faces.some(f=>f.kind==='road-asphalt'))return unchanged();
    const terrain=root.CircuitTerrain||(typeof require==='function'?require('./circuit-terrain.js'):null);
    if(!terrain?.paintSurface)throw new Error('Load circuit-terrain.js before road-markings.js.');
    const sourceKey=Symbol('road-marking-source'),wrapped=faces.map(face=>({...face,[sourceKey]:face,
      kind:face.kind==='road-asphalt'?'context-ground':'road-marking-protected'}));
    const painted=terrain.paintSurface(wrapped,overlays).map(face=>{
      const original=face[sourceKey];
      if(face.vertices===original.vertices)return original;
      const {[sourceKey]:unused,...fragment}=face,paint=face.kind==='road-marking';
      if(paint)stats.paintedFaces++;
      return {...fragment,kind:paint?'road-marking':original.kind,road:original.road,
        ...(original.stroke!==undefined?{stroke:fragment.fill}:{}),...(paint?sources.get(face.featureId):{})};
    });
    return {faces:stats.paintedFaces?painted:faces,stats};
  }
  const api={apply};root.RoadMarkings=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
