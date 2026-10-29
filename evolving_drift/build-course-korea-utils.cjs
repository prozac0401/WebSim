'use strict';
// Offline OSM/DEM reconstruction shared only by the two SDC event datasets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./course-model.js');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function build(sourceFile,outputFile,exportName,check=false){
  const sourceText=fs.readFileSync(path.join(__dirname,sourceFile),'utf8'),source=JSON.parse(sourceText);
  const elevation=read(path.join(__dirname,source.elevationFile));
  const [lon0,lat0]=source.originLonLat,rad=Math.PI/180,R=6371000;
  const local=([lon,lat])=>({x:(lon-lon0)*rad*R*Math.cos(lat0*rad),y:(lat-lat0)*rad*R});
  const full=elevation.coordinates.map(local),arc=[0];
  for(let i=1;i<full.length;i++)arc.push(arc.at(-1)+Math.hypot(full[i].x-full[i-1].x,full[i].y-full[i-1].y));
  const weights=full.map((_,i)=>(arc[Math.min(i+1,arc.length-1)]-arc[Math.max(0,i-1)])/2);
  const smooth=full.map((_,i)=>{let sum=0,total=0;for(let j=0;j<full.length;j++){const d=Math.abs(arc[j]-arc[i]);if(d>270)continue;const w=Math.exp(-.5*(d/90)**2)*weights[j];sum+=elevation.elevations[j]*w;total+=w;}return sum/total;});
  const nearest=xy=>{let index=0,best=Infinity;full.forEach((p,i)=>{const d=(p.x-xy.x)**2+(p.y-xy.y)**2;if(d<best){best=d;index=i;}});return index;};
  // Source retains the public map's node order. DEM data preserves those nodes
  // while adding samples on long straights, so coordinate matching is explicit.
  const road=source.road.coordinates.map(local),elevationIndices=road.map(nearest);
  road.forEach((p,i)=>{if(Math.hypot(p.x-full[elevationIndices[i]].x,p.y-full[elevationIndices[i]].y)>.1)throw Error('Road/DEM source coordinate mismatch.');});
  const datum=smooth[elevationIndices[0]],width=source.road.widthEstimateM;
  const centerline=road.map((p,i)=>({...p,z:smooth[elevationIndices[i]]-datum,widthLeft:width/2,widthRight:width/2,bank:0}));
  const base={...source.course,version:1,kind:'event-reconstruction',verifiedCompetition:true,officialLayout:false,width,centerline,
    judgedStart:0,judgedEnd:1,zones:[],obstacles:[],sources:source.sources,
    provenance:{event:'documented by organizer/participant sources',route:'video-to-OSM alignment; interpreted bend sequence, not an official surveyed event plan',geometry:'OSM mapped centreline; current map snapshot does not establish centimetre-accurate 2017/2018 pavement',
      boundary:'constant-width paved driving corridor estimated from facility/video; event cone coordinates and runoff limits unmeasured',timing:'simulation start/finish and scoring interval',
      elevation:'GLO-90 DSM, arc-weighted Gaussian sigma=90m, ±270m',crossfall:'unknown; zero-bank approximation',materials:'video appearance; uniform dry-grip physics, no measured surface friction',
      vegetation:'OSM woodland only; procedural unclassified crowns, individual positions/species unknown',structures:'OSM footprints; estimated heights unless tagged',datumM:datum,verticalDatum:'EGM2008',visualHeightScale:1},
    elevation:{source:elevation.metadata.elevationSource,resolutionM:90,method:'Arc-weighted Gaussian σ90m, ±270m; zero bank; 1× visual scale',surveyed:false,attribution:elevation.metadata},
    environment:{roadColor:'#555a5c',backgroundColor:source.environment.backgroundColor,surfaces:[],lines:[],structures:[],barriers:[],trees:[]}};
  let track=Model.build(base);
  const progress=index=>{const p=local(source.fullRoad.coordinates[index]);return track.project(p.x,p.y).s;};
  base.judgedStart=Math.max(0,progress(source.road.judgedIndices[0]));base.judgedEnd=Math.min(track.length,progress(source.road.judgedIndices[1]));
  base.zones=source.road.clipIndices.map(c=>({s:progress(c.index),side:c.side,length:c.length||12,provenance:'simulation scoring target; not an official clip-zone coordinate'}));
  track=Model.build(base);
  const at=(s,offset)=>{const p=track.sample(s);return{x:p.x-Math.sin(p.heading)*offset,y:p.y+Math.cos(p.heading)*offset,z:p.z};};
  const withZ=points=>points.map(p=>({...p,z:track.surface(p.x,p.y).z}));
  const samples=[];for(let s=0;s<track.length;s+=4)samples.push(s);samples.push(track.length);
  for(const side of [-1,1])base.environment.lines.push({points:samples.map(s=>at(s,side*(width/2-.2))),width:.12,color:'#dddcd4',source:'approximate white road-edge paint; video appearance'});
  // Each paint strip is subdivided so it follows the unexaggerated road profile.
  for(const kerb of source.environment.kerbs){const start=progress(kerb.fromIndex),end=progress(kerb.toIndex);for(let s=start;s<end;s+=2.3){const next=Math.min(s+2.3,end),side=kerb.side;
    base.environment.lines.push({points:[at(s,side*(width/2+.48)),at(next,side*(width/2+.48))],width:.95,color:Math.floor((s-start)/2.3)%2?'#e4dfd2':'#ad4747',source:kerb.evidence,dimensionsEstimated:true});
    if(kerb.green)base.environment.lines.push({points:[at(s,side*(width/2+1.35)),at(next,side*(width/2+1.35))],width:.8,color:'#4e927e',source:kerb.evidence,dimensionsEstimated:true});
  }}
  const displayBounds={minX:Math.min(...road.map(p=>p.x))-125,maxX:Math.max(...road.map(p=>p.x))+125,minY:Math.min(...road.map(p=>p.y))-125,maxY:Math.max(...road.map(p=>p.y))+125};
  // Clip display geometry, not source coordinates or physical driving bounds.
  // A mapped woodland or kilometre-long fence must not dominate camera fitting.
  function clipPolygon(points){
    let out=points.slice();if(out.length>1&&out[0].x===out.at(-1).x&&out[0].y===out.at(-1).y)out.pop();
    for(const [axis,value,sign]of [['x',displayBounds.minX,1],['x',displayBounds.maxX,-1],['y',displayBounds.minY,1],['y',displayBounds.maxY,-1]]){
      const input=out;out=[];for(let i=0;i<input.length;i++){const a=input[i],b=input[(i+1)%input.length],insideA=(a[axis]-value)*sign>=0,insideB=(b[axis]-value)*sign>=0;
        if(insideA)out.push(a);if(insideA!==insideB){const t=(value-a[axis])/(b[axis]-a[axis]);out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}}
    }return out;
  }
  function clipLine(a,b){let lo=0,hi=1;const dx=b.x-a.x,dy=b.y-a.y;for(const[p,q]of [[-dx,a.x-displayBounds.minX],[dx,displayBounds.maxX-a.x],[-dy,a.y-displayBounds.minY],[dy,displayBounds.maxY-a.y]]){if(Math.abs(p)<1e-12){if(q<0)return null;continue;}const r=q/p;if(p<0)lo=Math.max(lo,r);else hi=Math.min(hi,r);if(lo>hi)return null;}return[{x:a.x+dx*lo,y:a.y+dy*lo},{x:a.x+dx*hi,y:a.y+dy*hi}];}
  // Mapped adjoining pavement provides context; it does not enlarge contains().
  const fullRoad=source.fullRoad.coordinates.map(local),selected=new Set(source.road.indices);
  for(let i=0;i<fullRoad.length-1;i++){
    if(selected.has(i)&&selected.has(i+1))continue;
    const segment=clipLine(fullRoad[i],fullRoad[i+1]);if(!segment)continue;
    const [a,b]=segment,d=Math.hypot(b.x-a.x,b.y-a.y);if(d<.1)continue;
    const nx=-(b.y-a.y)/d*width/2,ny=(b.x-a.x)/d*width/2;
    const za=smooth[nearest(a)]-datum,zb=smooth[nearest(b)]-datum;
    base.environment.surfaces.push({points:[{x:a.x+nx,y:a.y+ny,z:za},{x:b.x+nx,y:b.y+ny,z:zb},{x:b.x-nx,y:b.y-ny,z:zb},{x:a.x-nx,y:a.y-ny,z:za}],color:'#555a5c',material:'asphalt',sourceWay:source.fullRoad.wayId,contextOnly:true,widthEstimated:true});
  }
  for(const feature of source.features){
    const t=feature.tags,raw=feature.coordinates.map(local),points=withZ(clipPolygon(raw)),tag={sourceWay:feature.wayId,displayClipped:true};
    const wooded=t.landuse==='forest'||t.natural==='wood';
    if(points.length>=3&&(t.landuse==='grass'||wooded))base.environment.surfaces.push({points,color:wooded?'#617457':source.environment.grassColor,...tag,material:wooded?'mapped woodland proxy':'grass appearance; soil/grass construction unverified'});
    if(points.length>=3&&t.amenity==='parking')base.environment.surfaces.push({points,color:'#727578',...tag,material:'asphalt appearance'});
    if(points.length>=3&&(t.building||t.leisure==='stadium'||t.leisure==='bleachers')){
      const height=Number(t.height)||Number(t['building:levels'])*3.1||(t.leisure==='stadium'?9:5);
      base.environment.structures.push({points,height,color:t.name?.includes('Stand')?'#9b7779':'#929da1',name:t['name:en']||t.name,...tag,heightEstimated:!t.height});
    }
    // Fence is a visual fence proxy, never mislabeled as a measured solid wall.
    if(t.barrier&&t.barrier!=='gate')for(let i=0;i<raw.length-1;i++){const segment=clipLine(raw[i],raw[i+1]);if(segment)base.environment.barriers.push({points:withZ(segment),height:Number(t.height)||(t.barrier==='fence'?1.7:.8),width:t.barrier==='fence'?.045:.23,color:'#a2a7a8',...tag,kind:t.barrier,dimensionsEstimated:!t.height});}
    if(wooded&&points.length>=3){let n=0;const b=points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minY:Math.min(b.minY,p.y),maxY:Math.max(b.maxY,p.y)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
      for(let x=b.minX+7;x<b.maxX;x+=22)for(let y=b.minY+7;y<b.maxY;y+=22){const p={x:x+Math.sin(++n*2.3)*3,y};if(Model.inPolygon(p.x,p.y,points)&&track.project(p.x,p.y).distance<170)base.environment.trees.push({...p,z:track.surface(p.x,p.y).z,height:6+n%4,crownRadius:3,kind:'unclassified',species:'unknown',placement:'procedural within OSM woodland; approximate heights'});}
    }
  }
  // No area-wide ground extrapolation is presented as surveyed terrain. Only
  // mapped surface footprints receive the nearby road's coarse DEM elevation.
  base.environment.heightMethod='Mapped surface footprints use nearest road DSM profile; slopes outside the road, building/vegetation heights and crossfall are unmeasured.';
  base.environment.displayBounds=displayBounds;
  // Grass footprints are visual evidence. The conservative driveable corridor
  // remains the declared estimated road width, not an invented event cone plan.
  base.mapAttribution={text:'© OpenStreetMap contributors',url:'https://www.openstreetmap.org/copyright',license:'ODbL-1.0',licenseFile:'../evolving_vehicles_2/data/LICENSE.ODbL-1.0.txt',sourceFile};
  base.reconstruction={sourceSha256:hash(sourceText),mapSnapshotSha256:source.mapSnapshotSha256,elevationSha256:hash(JSON.stringify(elevation)),courseLengthM:track.length,judgedLengthM:base.judgedEnd-base.judgedStart,
    heightRangeM:Math.max(...centerline.map(p=>p.z))-Math.min(...centerline.map(p=>p.z)),officialStartFinish:false,officialClips:false,widthEstimated:true,geometryEvidence:source.videoEvidence,sourceRoadIndices:source.road.indices};
  const output='/* Generated by '+path.basename(source.builder)+'; OSM ODbL and DEM attribution embedded. */\n(function(root){\nconst data='+JSON.stringify(base)+';\nroot.'+exportName+'=data;if(typeof module!=="undefined")module.exports=data;\n})(typeof window==="undefined"?globalThis:window);\n';
  const target=path.join(__dirname,outputFile);
  if(check){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==output)throw Error(outputFile+' is stale. Run node evolving_drift/'+source.builder);}
  else if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==output)fs.writeFileSync(target,output);
  console.log(JSON.stringify({id:base.id,lengthM:track.length,judgedLengthM:base.reconstruction.judgedLengthM,relativeHeightM:base.reconstruction.heightRangeM,structures:base.environment.structures.length,trees:base.environment.trees.length,sourceSha256:base.reconstruction.sourceSha256}));
  return base;
}
module.exports={build};
