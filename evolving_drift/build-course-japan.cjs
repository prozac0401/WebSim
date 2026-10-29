/* Shared, deterministic reconstruction of documented Japanese D1 event sections.
 * Map coordinates and 90m DEM are evidence; edge/clip dimensions remain estimates. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./course-model.js');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t;
function reconstruct(source){
  const cfg=source.configuration,[lon0,lat0]=source.originLonLat,R=6371000,rad=Math.PI/180;
  const local=([lon,lat])=>({x:(lon-lon0)*rad*R*Math.cos(lat0*rad),y:(lat-lat0)*rad*R});
  const route=source.road.coordinates.map(local),arc=[0];
  for(let i=1;i<route.length;i++)arc.push(arc.at(-1)+Math.hypot(route[i].x-route[i-1].x,route[i].y-route[i-1].y));
  const weights=route.map((_,i)=>(arc[Math.min(i+1,arc.length-1)]-arc[Math.max(0,i-1)])/2);
  function smoothHeight(index){let sum=0,total=0;for(let j=0;j<route.length;j++){const d=Math.abs(arc[index]-arc[j]);if(d>270)continue;const w=Math.exp(-.5*(d/90)**2)*weights[j];sum+=source.elevation.values[j]*w;total+=w;}return sum/total;}
  const datum=smoothHeight(0),half=source.road.corridorWidthM/2;
  const centerline=route.map((p,i)=>({...p,z:smoothHeight(i)-datum,widthLeft:half,widthRight:half,bank:0}));
  const base={id:cfg.id,name:cfg.name,shortName:cfg.shortName,version:1,kind:'event-reconstruction',verifiedCompetition:true,officialLayout:false,
    description:cfg.routeDescription,source:'2025 D1GP 공식 프로그램·당일 영상 + OpenStreetMap + Copernicus DEM GLO-90',
    event:{series:'D1GP',year:2025,rounds:cfg.rounds,dates:cfg.dates,category:'D1GP',direction:cfg.direction},
    width:half*2,centerline,judgedStart:cfg.judgedStart,judgedEnd:arc.at(-1)-cfg.judgedEndMargin,
    presentation:{geometry:'공식 행사 구간도를 OSM 도로 중심선에 정합했습니다. 도로 폭 12m·출발/종료·클리핑 목표 위치는 근사이며 공식 실측 데이터가 아닙니다.',
      elevation:'Copernicus 90m 표면고도 자료를 90m 범위로 평활했습니다. 높이 배율은 1배이며 뱅킹·연석 높이·정밀 종단 측량은 없습니다.',
      environment:cfg.key==='ebisu'?'공식 영상의 아스팔트·흰색 경계선과 벽·잔디 경사·피트·관중석·수림을 반영했습니다. 시설 평면은 OSM, 높이·벽 위치·개별 나무는 근사입니다.':'공식 영상의 적백 연석·흰색 가드레일·잔디·피트·관제탑·수림을 반영했습니다. 시설 평면은 OSM, 높이·가드레일 위치·개별 나무는 근사입니다.'},
    provenance:{event:'documented 2025 D1GP event',route:'official event course-guide image and event-day video map',geometry:'OSM centreline for the documented open event section; not the whole circuit',
      boundary:'12m ribbon estimate, not measured event cone/paved-edge coordinates',timing:'map-aligned approximate start/finish and simulation scoring interval',
      clips:'official diagram interpretation; exact coordinates, lengths and offsets are estimates',elevation:'90m DSM; arc-weighted Gaussian sigma 90m, +/-270m',
      crossfall:'unknown; zero-bank approximation',materials:'visual appearance only; uniform dry grip, no measured surface friction or raised kerb dynamics',
      vegetation:'OSM woodland footprint; generic unclassified crowns; individual positions and species unmeasured',structures:'OSM footprints; estimated heights; visually inferred barrier alignment',
      datumM:datum,verticalDatum:'EGM2008',visualHeightScale:1,visualInspection:source.evidence.visualInspection},
    sources:[{title:'D1GP official event and driving section',url:cfg.eventUrl},{title:'D1GP official 2025 event program',url:cfg.programUrl},
      {title:'Official program course-guide image',url:cfg.programImage},{title:'Circuit operator facility diagram (whole facility reference)',url:cfg.officialMap},
      {title:'Official D1GP stream; inspected public storyboard seconds '+cfg.videoTimes.join(', '),url:'https://www.youtube.com/watch?v='+cfg.video},
      {title:'OpenStreetMap source way '+source.road.wayId,url:source.road.sourceUrl},{title:'© OpenStreetMap contributors · ODbL',url:source.mapAttribution.url},
      {title:'Open-Meteo / Copernicus DEM GLO-90',url:source.elevation.url}],
    elevation:{source:source.elevation.source,resolutionM:90,method:'Arc-weighted Gaussian sigma 90m +/-270m; zero bank; 1x vertical scale',surveyed:false,
      attribution:{provider:'Open-Meteo',url:source.elevation.url,license:'CC-BY-4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
        dataset:'Copernicus DEM 2021 GLO-90',datasetUrl:'https://doi.org/10.5270/ESA-c5d3d65',
        datasetLicenseUrl:'https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM',
        credit:'Produced using Copernicus WorldDEM-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved',
        modifications:'Arc-weighted Gaussian road smoothing, regional Gaussian smoothing, interpolation and relative datum; 1x vertical scale',sourceFile:'data/'+cfg.file+'-source.json'}},
    environment:{roadColor:'#515556',backgroundColor:cfg.key==='ebisu'?'#79876c':'#899876',surfaces:[],lines:[],structures:[],barriers:[],trees:[]},
    zones:cfg.zones.map(z=>({...z,provenance:'Official event-map interpretation; coordinates and dimensions estimated, not official clip survey'})),obstacles:[]};
  const track=Model.build(base);base.judgedEnd=track.length-cfg.judgedEndMargin;
  const pointAt=(s,offset)=>{const p=track.sample(s);return {x:p.x-Math.sin(p.heading)*offset,y:p.y+Math.cos(p.heading)*offset,z:p.z};};
  function interval(start,end,step=4){const values=[];for(let s=start;s<end;s+=step)values.push(s);values.push(end);return values;}
  const stations=interval(0,track.length),left=stations.map(s=>pointAt(s,half)),right=stations.map(s=>pointAt(s,-half));
  for(const edge of [left,right])for(const [i,sign]of [[0,-1],[edge.length-1,1]]){const p=track.sample(i?track.length:0);edge[i].x+=Math.cos(p.heading)*8*sign;edge[i].y+=Math.sin(p.heading)*8*sign;}
  base.boundaryPolygons=[[...left,...right.slice().reverse()]];
  // Dense requests/interpolation do not upgrade the underlying DEM resolution.
  const grid=source.elevation.terrain,bounds=grid.bounds,spacing=grid.spacingM;
  const smoothed=grid.values.map((_,k)=>{const x=k%grid.columns,y=Math.floor(k/grid.columns);let sum=0,total=0;
    for(let j=0;j<grid.rows;j++)for(let i=0;i<grid.columns;i++){const d2=((i-x)*spacing)**2+((j-y)*spacing)**2;if(d2>270**2)continue;const w=Math.exp(-.5*d2/90**2);sum+=w*grid.values[j*grid.columns+i];total+=w;}return sum/total-datum;});
  function demHeight(x,y){const gx=clamp((x-bounds.minX)/spacing,0,grid.columns-1),gy=clamp((y-bounds.minY)/spacing,0,grid.rows-1),i=Math.min(grid.columns-2,Math.floor(gx)),j=Math.min(grid.rows-2,Math.floor(gy));
    const at=(a,b)=>smoothed[b*grid.columns+a];return mix(mix(at(i,j),at(i+1,j),gx-i),mix(at(i,j+1),at(i+1,j+1),gx-i),gy-j);}
  function terrainHeight(x,y){const q=track.project(x,y),road=track.sample(q.s).z,t=clamp((q.distance-22)/36,0,1);return mix(road,demHeight(x,y),t*t*(3-2*t))-.09;}
  const withZ=points=>points.map(p=>({...p,z:terrainHeight(p.x,p.y)}));
  // Clip to a bounded event scene: regional forest polygons must not expand the camera.
  function clip(points,limits=bounds){let result=points.map(p=>({...p}));if(result.length>1&&Math.hypot(result[0].x-result.at(-1).x,result[0].y-result.at(-1).y)<1e-6)result.pop();
    for(const [axis,value,sign]of [['x',limits.minX,1],['x',limits.maxX,-1],['y',limits.minY,1],['y',limits.maxY,-1]]){
      const input=result;result=[];if(!input.length)break;
      for(let i=0;i<input.length;i++){const a=input[i],b=input[(i+1)%input.length],insideA=sign*(a[axis]-value)>=0,insideB=sign*(b[axis]-value)>=0;
        if(insideA)result.push(a);if(insideA!==insideB){const t=(value-a[axis])/(b[axis]-a[axis]);result.push({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t)});}}
    }return result;}
  const triangles=[];
  for(let y=bounds.minY;y<bounds.maxY;y+=10)for(let x=bounds.minX;x<bounds.maxX;x+=10){const a={x,y},b={x:x+10,y},c={x:x+10,y:y+10},d={x,y:y+10};triangles.push(withZ([a,b,c]),withZ([a,c,d]));}
  base.environment.terrain={triangles,color:cfg.key==='ebisu'?'#7e8e67':'#899771',material:'terrain',source:source.elevation.url,
    method:'90m DEM Gaussian sigma 90m; display triangles 10m. Within 22m of route matched to road height and blended outward over36m, display-only. No terrain detail finer than the source is claimed.'};
  const features=source.features.map(f=>({...f,points:clip(f.coordinates.map(local))})).filter(f=>f.points.length>=3);
  const woods=features.filter(f=>f.tags.natural==='wood'||f.tags.landuse==='forest');
  for(const f of features){const pts=withZ(f.points),wood=f.tags.natural==='wood'||f.tags.landuse==='forest';
    if(f.tags.landuse==='grass'||wood)base.environment.surfaces.push({points:pts,color:wood?'#607b50':'#8a996b',sourceWay:f.wayId,source:'OSM mapped land cover'});
    if(f.tags.natural==='water')base.environment.surfaces.push({points:pts,color:'#728e91',sourceWay:f.wayId});
    if(f.tags.building){const heightM=f.tags.name?.includes('タワー')?12:f.tags.building==='grandstand'?7:f.tags.name?.includes('ピット')?5:4;
      base.environment.structures.push({points:pts,height:heightM,color:f.tags.building==='grandstand'?'#b2b9b6':'#b3b8b3',sourceWay:f.wayId,name:f.tags.name,heightEstimated:true});}
  }
  // Video shows paved aprons/lanes beyond the event ribbon. Their inferred
  // outlines affect appearance only; they are not invented official run zones.
  // Small triangles sample the same height field to avoid bridging over road paint.
  function apron(polygon,description){const box=polygon.reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minY:Math.min(b.minY,p.y),maxY:Math.max(b.maxY,p.y)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
    // Crop before triangulation: fan-splitting one very long, thin triangle
    // creates thousands of redundant faces for a narrow pit lane.
    for(let y=Math.floor(box.minY/6)*6;y<box.maxY;y+=6)for(let x=Math.floor(box.minX/6)*6;x<box.maxX;x+=6){
      const cell=clip(polygon,{minX:x,maxX:x+6,minY:y,maxY:y+6});if(cell.length<3)continue;
      base.environment.surfaces.push({points:cell.map(p=>({x:p.x,y:p.y,z:terrainHeight(p.x,p.y)+.018})),color:'#515556',source:description,outlineEstimated:true,drivable:false});
    }
  }
  function lane(start,end,near,far){const s=interval(start,end,8);return [...s.map(q=>pointAt(q,near)),...s.slice().reverse().map(q=>pointAt(q,far))];}
  if(cfg.key==='ebisu'){
    apron(interval(260,450,8).map(s=>pointAt(s,half)), 'Official video 4500/9030s: paved first-turn apron; map-aligned outline estimated, outside simulation boundary');
    apron(lane(12,235,-7.7,-26),'Official video 9040s and mapped pit footprint: pit apron extent estimated, outside simulation boundary');
  }else apron(lane(75,335,-7.7,-18),'Official video 4510s and mapped pit footprints: pit-lane extent estimated, outside simulation boundary');
  // Edge paint follows the bounded road ribbon. Raised kerb height is unmeasured.
  for(const side of [-1,1])base.environment.lines.push({points:stations.map(s=>pointAt(s,side*(half-.25))),width:.13,color:'#e3e4df',source:'Official event video; painted edge width estimated'});
  function barrier(start,end,offset,kind){const points=interval(start,end).map(s=>pointAt(s,offset));
    base.environment.barriers.push({points,height:kind==='pit wall'?1:.85,width:.3,color:'#d6d9d5',dimensionsEstimated:true,
      source:'Official video appearance; alignment/height estimated from route, '+kind});
    for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],length=Math.hypot(b.x-a.x,b.y-a.y),nx=-(b.y-a.y)/length*.15,ny=(b.x-a.x)/length*.15;
      base.obstacles.push({type:'polygon',points:[{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},{x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}],provenance:'Visible barrier; inferred alignment, estimated dimensions'});}}
  if(cfg.key==='ebisu')barrier(10,240,-7.5,'pit wall');
  else {barrier(75,335,-7.5,'pit wall');barrier(350,465,8.5,'outside guardrail');barrier(765,860,-8,'outside guardrail');
    for(const [start,end,offset]of [[355,465,-half+.3],[765,855,half-.3]]){const steps=interval(start,end,2.4);for(let i=0;i<steps.length-1;i++)base.environment.lines.push({points:[pointAt(steps[i],offset),pointAt(steps[i+1],offset)],width:.7,color:i%2?'#e4dfd1':'#ad4945',source:'Official video red/white kerbs; extent and width estimated, flush treatment'});}}
  // Show only the mapped immediate continuation around the simulation timing ends.
  const full=source.road.rawWayCoordinates.map(local),before=(cfg.indices[0]-1+full.length)%full.length;
  for(const [s,other]of [[0,full[before]],[track.length,full[cfg.exitIndex]]]){const p=track.sample(s),dx=other.x-p.x,dy=other.y-p.y,d=Math.hypot(dx,dy);if(d<1)continue;
    const distance=Math.min(d,60),q={x:p.x+dx/d*distance,y:p.y+dy/d*distance},sign=s===0?-1:1,nx=-dy/d*half*sign,ny=dx/d*half*sign;
    base.environment.surfaces.push({points:withZ([pointAt(s,half),{x:q.x+nx,y:q.y+ny},{x:q.x-nx,y:q.y-ny},pointAt(s,-half)]),color:'#515556',source:'Immediate OSM road continuation outside simulation timing bounds'});}
  const regional=source.forest?{outer:source.forest.outer.map(local),inner:source.forest.inner.map(p=>p.map(local))}:null;
  let serial=0;
  for(let x=bounds.minX+7;x<bounds.maxX;x+=14)for(let y=bounds.minY+7;y<bounds.maxY;y+=14){const n=serial++,p={x:x+Math.sin(n*2.7)*2,y:y+Math.cos(n*1.9)*2};
    const inWood=woods.some(f=>Model.inPolygon(p.x,p.y,f.points))||(regional&&Model.inPolygon(p.x,p.y,regional.outer)&&!regional.inner.some(h=>Model.inPolygon(p.x,p.y,h)));
    if(!inWood||track.project(p.x,p.y).distance<18||features.some(f=>f.tags.building&&Model.inPolygon(p.x,p.y,f.points)))continue;
    base.environment.trees.push({...p,z:terrainHeight(p.x,p.y),height:5+n%5,crownRadius:2.5+(n%3)*.3,kind:'unclassified',species:'unknown',placement:'Deterministic visual proxy within mapped woodland; no individual-tree survey'});}
  base.mapAttribution={...source.mapAttribution,licenseFile:'../evolving_vehicles_2/data/LICENSE.ODbL-1.0.txt',sourceFile:'data/'+cfg.file+'-source.json'};
  base.reconstruction={sourceSha256:source.sourceSha256,elevationSha256:crypto.createHash('sha256').update(JSON.stringify(source.elevation)).digest('hex'),
    courseLengthM:track.length,judgedLengthM:base.judgedEnd-base.judgedStart,heightRangeM:Math.max(...centerline.map(p=>p.z))-Math.min(...centerline.map(p=>p.z)),
    officialStartFinish:false,officialClips:false,boundarySurveyed:false,fullCircuitIncluded:false};
  return base;
}
function run(file,builder){const source=require('./data/'+file+'-source.json'),data=reconstruct(source),output='/* Generated by '+builder+'; provenance and approximations are part of the data. */\n(function(root){\nconst data='+JSON.stringify(data)+';\nroot.'+source.configuration.globalName+'=data;if(typeof module!=="undefined")module.exports=data;\n})(typeof window==="undefined"?globalThis:window);\n',target=path.join(__dirname,file+'.js');
  if(process.argv.includes('--check')){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==output)throw Error(file+' reconstruction is stale. Run node evolving_drift/'+builder);}
  else if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==output)fs.writeFileSync(target,output);
  console.log(JSON.stringify({id:data.id,lengthM:data.reconstruction.courseLengthM,judgedM:data.reconstruction.judgedLengthM,heightM:data.reconstruction.heightRangeM,structures:data.environment.structures.length,trees:data.environment.trees.length,barriers:data.environment.barriers.length}));
}
module.exports={reconstruct,run};
