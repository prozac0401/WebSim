#!/usr/bin/env node
/* Reproducible map reconstruction. This is NOT an official 2016 clip-zone survey. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./course-model.js'),source=require('./data/kic-t21-source.json');
const elevation=JSON.parse(fs.readFileSync(path.join(__dirname,'../evolving_vehicles_2/data/elevation/yeongam.json'),'utf8').replace(/^\uFEFF/,''));
const R=6371000,rad=Math.PI/180,[lon0,lat0]=source.originLonLat;
const local=([lon,lat])=>({x:(lon-lon0)*rad*R*Math.cos(lat0*rad),y:(lat-lat0)*rad*R});
const full=elevation.coordinates.map(local),arc=[0];
for(let i=1;i<full.length;i++)arc.push(arc.at(-1)+Math.hypot(full[i].x-full[i-1].x,full[i].y-full[i-1].y));
// Weight by represented arc length, not by the very uneven OSM vertex density.
const weights=full.map((_,i)=>(arc[Math.min(i+1,arc.length-1)]-arc[Math.max(0,i-1)])/2);
function smoothHeight(index){let total=0,sum=0;for(let j=0;j<full.length;j++){const d=Math.abs(arc[j]-arc[index]);if(d>270)continue;const w=Math.exp(-.5*(d/90)**2)*weights[j];sum+=elevation.elevations[j]*w;total+=w;}return sum/total;}
const datum=smoothHeight(145);
const centerline=source.road.indices.map(i=>({...full[i],z:smoothHeight(i)-datum,widthLeft:7,widthRight:7,bank:0}));
const base={id:'kr-kic-t21-kdl-2016-r2',name:'영암 KIC T21 · 2016 KDL R2',version:3,
  kind:'event-reconstruction',verifiedCompetition:true,officialLayout:false,
  description:'실대회 구간 재구성 · T2 → T1 역방향 · 공식 클리핑 존 미확인',
  source:'FIA 코너 도면 + 2016 KDL R2 개최 기록·리그 영상 + OpenStreetMap',
  event:{series:'KDL',year:2016,round:2,dates:['2016-06-04','2016-06-05'],category:'PRO',direction:'F1 T2 → T1, reverse'},
  width:14,centerline,judgedStart:110,judgedEnd:360,
  competitionBoundary:{kind:'rendered-road-ribbon',widthM:14,whiteLineInsetM:.3,whiteLineWidthM:.12,sceneryApronDrivable:false,surveyed:false},
  presentation:{environment:'경기 구간은 화면에 표시된 기존 14m 도로 띠입니다. 주변의 넓은 포장 공간은 배경이며 주행 구간에 포함하지 않습니다. 흰 선 바깥쪽 끝에서 도로 끝까지 약 0.24m가 남습니다. 이 경계는 모형 설정이며 공식 경기 경계의 실측값은 아닙니다. 노면 마찰·수목 수종·개별 위치·시설 높이는 미확인입니다.'},
  provenance:{event:'documented',route:'documented',geometry:'OSM map reconstruction',boundary:'existing rendered 14m road ribbon is the competition corridor; estimated width, not official event cone positions; surrounding asphalt apron is scenery only',
    timing:'simulation start/finish and scoring interval',elevation:'90m DSM, arc-weighted Gaussian sigma=90m',crossfall:'unknown; zero-bank approximation',
    materials:'visual appearance only; uniform dry grip model, not measured friction',vegetation:'mapped woodland, generic crowns; species and individual positions unknown',
    structures:'OSM footprints; estimated heights',datumM:datum,verticalDatum:'EGM2008',visualHeightScale:1},
  sources:[
    {title:'FIA 2013 Korean GP numbered circuit diagram',url:'https://www.fia.com/sites/default/files/external_archive/node4128/Doc%201%20KOREA_CIRCUIT_13%20FIA.pdf'},
    {title:'2016 KDL season · T21 = T2 to T1',url:'https://www.top-rider.com/article/view/trd201603150012'},
    {title:'2016 KDL R2 results · 4–5 June, PRO T21',url:'https://raceweek.co.kr/?p=4742'},
    {title:'KDL organizer R2 video · 125/130/135/275/285/290/335/340 seconds',url:'https://www.youtube.com/watch?v=i4decJM0q1s'},
    {title:'KIC operator · GP track width 13–15m (facility-wide)',url:'https://koreacircuit.com/Tracks'},
    {title:'© OpenStreetMap contributors · ODbL',url:'https://www.openstreetmap.org/copyright'},
    {title:'Open-Meteo / Copernicus DEM GLO-90',url:'https://open-meteo.com/en/docs/elevation-api'}],
  elevation:{source:source.elevationMetadata.elevationSource,resolutionM:90,method:'Arc-weighted Gaussian σ90m, ±270m; zero bank; 1× visual scale',surveyed:false},
  environment:{roadColor:'#565b5c',backgroundColor:'#a4ac9b',surfaces:[],lines:[],structures:[],barriers:[],trees:[]},obstacles:[],zones:[]};
let track=Model.build(base);
// The two bends, not the facility length, define this experiment's judged window.
const t2=track.project(full[155].x,full[155].y),t1=track.project(full[145].x,full[145].y);
base.judgedStart=t2.s-45;base.judgedEnd=t1.s+55;
base.zones=[{s:t2.s,side:-1,length:13,provenance:'simulation scoring target, not an official clip zone'},
  {s:t1.s,side:1,length:18,provenance:'simulation scoring target, not an official clip zone'}];
const pointsAt=(s,offset)=>{const p=track.sample(s);return {x:p.x-Math.sin(p.heading)*offset,y:p.y+Math.cos(p.heading)*offset,z:p.z};};
const ribbon=[];for(let s=0;s<track.length;s+=4.5)ribbon.push(s);ribbon.push(track.length);
// The race corridor uses the same centreline nodes/normals as renderer._track.
// Nearby asphalt is visible scenery, not a second drivable polygon. Retain all
// rendered endpoints and add timing-line extensions beyond START/FINISH only.
const left=track.points.map(p=>pointsAt(p.s,p.widthLeft)),right=track.points.map(p=>pointsAt(p.s,-p.widthRight));
for(const edge of [left,right]){
  const first=track.sample(0),last=track.sample(track.length),a=edge[0],b=edge.at(-1);
  edge.unshift({...a,x:a.x-Math.cos(first.heading)*8,y:a.y-Math.sin(first.heading)*8});
  edge.push({...b,x:b.x+Math.cos(last.heading)*8,y:b.y+Math.sin(last.heading)*8});
}
const roadPolygon=[...left,...right.slice().reverse()];
const features=source.features.map(f=>({...f,points:f.coordinates.map(local)})),find=id=>features.find(f=>f.wayId===id).points;
const east=find('237655756'),south=find('237655758'),inner=find('237957447');
// Asphalt apron between mapped grass islands. Bounds carry map/visual uncertainty.
const apron=[...east.slice(0,9).reverse(),...south.slice(0,7),...inner.slice(0,12)];
base.boundaryPolygons=[roadPolygon];
base.excludedPolygons=features.filter(f=>['grass','forest'].includes(f.tags.landuse)).map(f=>f.points);
const height=p=>track.surface(p.x,p.y).z;
const withZ=points=>points.map(p=>({...p,z:height(p)}));
// A single large apron face bridges the height field and can cover road paint.
// Triangulate the same 2D polygon, then resample height after each subdivision.
// This changes only display geometry; the physical boundary above stays intact.
function terrainTriangles(polygon){
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const area=polygon.reduce((sum,a,i)=>{const b=polygon[(i+1)%polygon.length];return sum+a.x*b.y-b.x*a.y;},0),sign=area>=0?1:-1;
  const vertices=withZ(polygon),ring=vertices.map((_,i)=>i),coarse=[],triangles=[];
  while(ring.length>3){let cut=false;for(let j=0;j<ring.length;j++){
    const ia=ring[(j+ring.length-1)%ring.length],ib=ring[j],ic=ring[(j+1)%ring.length],a=vertices[ia],b=vertices[ib],c=vertices[ic];
    if(sign*cross(a,b,c)<=1e-9)continue;
    if(ring.some(k=>k!==ia&&k!==ib&&k!==ic&&sign*cross(a,b,vertices[k])>=-1e-9&&sign*cross(b,c,vertices[k])>=-1e-9&&sign*cross(c,a,vertices[k])>=-1e-9))continue;
    coarse.push([a,b,c]);ring.splice(j,1);cut=true;break;
  }if(!cut)throw Error('Cannot triangulate KIC apron without changing its boundary.');}
  coarse.push(ring.map(i=>vertices[i]));
  const sample=p=>({...p,z:height(p)});
  function divide(triangle,depth=0){
    const lengths=triangle.map((a,i)=>{const b=triangle[(i+1)%3];return Math.hypot(b.x-a.x,b.y-a.y);}),longest=Math.max(...lengths),edge=lengths.indexOf(longest);
    const midpoints=triangle.map((a,i)=>{const b=triangle[(i+1)%3];return sample({x:(a.x+b.x)/2,y:(a.y+b.y)/2});});
    const centre=sample({x:triangle.reduce((s,p)=>s+p.x,0)/3,y:triangle.reduce((s,p)=>s+p.y,0)/3});
    const error=Math.max(Math.abs(centre.z-triangle.reduce((s,p)=>s+p.z,0)/3),...midpoints.map((m,i)=>Math.abs(m.z-(triangle[i].z+triangle[(i+1)%3].z)/2)));
    if(depth<24&&(longest>8||(longest>.75&&error>.003))){
      const a=triangle[edge],b=triangle[(edge+1)%3],c=triangle[(edge+2)%3],m=midpoints[edge];
      divide([a,m,c],depth+1);divide([m,b,c],depth+1);
    }else triangles.push(triangle);
  }
  coarse.forEach(triangle=>divide(triangle));return triangles;
}
base.environment.terrain={triangles:terrainTriangles(apron),color:'#565b5c',material:'asphalt',role:'off-course-asphalt',drivable:false,
  source:'OSM grass-island boundaries + KDL video; estimated apron',sourcePolygon:withZ(apron),
  method:'Height-field resampling; longest edge <=8m, adaptive refinement for >3mm sampled display error. Not additional survey detail.'};
// Show the mapped road continuing beyond the experiment, rather than a cut-off
// asphalt rectangle beneath the starting car. Timing bounds remain in contains().
for(const [end,index]of [[0,161],[track.length,136]]){
  const p=track.sample(end),q=full[index],a=pointsAt(end,7),b=pointsAt(end,-7),dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy),nx=-dy/len*7,ny=dx/len*7;
  const outward=end===0?-1:1;
  base.environment.surfaces.push({points:withZ([a,{x:q.x+nx*outward,y:q.y+ny*outward},{x:q.x-nx*outward,y:q.y-ny*outward},b]),color:'#565b5c',source:'OSM continuation outside simulation start/finish'});
}
for(const f of features){
  const pts=withZ(f.points);
  if(f.tags.landuse==='grass'||f.tags.landuse==='forest')base.environment.surfaces.push({points:pts,color:f.tags.landuse==='forest'?'#627a58':'#849565',sourceWay:f.wayId});
  if(f.tags.building||f.tags.leisure==='stadium'){
    const heightM=f.tags.name==='Main Grandstand'?13:f.tags.name==='Paddock/Garage'?7:5;
    base.environment.structures.push({points:pts,height:heightM,color:f.tags.name==='Paddock/Garage'?'#9caaa9':'#838f96',name:f.tags.name,sourceWay:f.wayId,heightEstimated:true});
  }
  if(f.tags.barrier==='wall'){
    base.environment.barriers.push({points:pts,height:.85,width:.35,color:'#c5c9c7',sourceWay:f.wayId,dimensionsEstimated:true});
    for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],d=Math.hypot(b.x-a.x,b.y-a.y),nx=-(b.y-a.y)/d*.175,ny=(b.x-a.x)/d*.175;
      base.obstacles.push({type:'polygon',points:[{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},{x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}],sourceWay:f.wayId});}
  }
}
// Painted green margins and red/white kerbs are visible around the inner island.
// Widths, colour samples and flush kerb treatment are approximations, not surveys.
const innerEdge=inner.slice(0,12);
base.environment.lines.push({points:withZ(innerEdge),width:1.9,color:'#3f957c',source:'KDL video 135/285s; approximate green paint extent'});
for(let i=0;i<innerEdge.length-1;i++){const a=innerEdge[i],b=innerEdge[i+1],n=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/2.2);
  for(let j=0;j<n;j++){const at=t=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});base.environment.lines.push({points:withZ([at(j/n),at((j+1)/n)]),width:.7,color:j%2?'#e0ded3':'#a74344',source:'video curb appearance; width estimated, no vertical bump modeled'});}}
// The red runoff is outside the permitted driving surface across its full
// painted width. One footprint supplies both exclusions and rendered triangles;
// a separate line decal would otherwise leave its inner half drivable.
const runoffEdge=south.slice(0,7),runoffHalfWidth=1.75;
for(let i=1;i<runoffEdge.length;i++){
  const a=runoffEdge[i-1],b=runoffEdge[i],length=Math.hypot(b.x-a.x,b.y-a.y);
  if(!length)continue;
  const nx=-(b.y-a.y)/length*runoffHalfWidth,ny=(b.x-a.x)/length*runoffHalfWidth;
  const polygon=[{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},{x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}];
  const exclusionIndex=base.excludedPolygons.push(polygon)-1;
  for(const triangle of terrainTriangles(polygon))base.environment.surfaces.push({
    // Surfaces receive a further 6mm renderer lift. A 40mm display layer clears
    // the mapped grass's coarse triangles without changing the ground surface.
    points:triangle.map(p=>({...p,z:p.z+.034})),color:'#875657',role:'non-drivable-runoff',drivable:false,exclusionIndex,
    source:'KDL video 135/340s; approximate red-brown runoff extent, excluded across the visible 3.5m width',dimensionsEstimated:true});
}
// Keep street edge paint on the actual ribbon; do not invent sponsor lettering.
base.environment.lines.push({points:ribbon.map(s=>pointsAt(s,6.7)),width:.12,color:'#dddeda'},
  {points:ribbon.map(s=>pointsAt(s,-6.7)),width:.12,color:'#dddeda'});
// The OSM woodland footprint is known; crowns are a deterministic visual proxy.
const forest=find('308827363');let n=0;
const bounds=forest.reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minY:Math.min(b.minY,p.y),maxY:Math.max(b.maxY,p.y)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
for(let x=bounds.minX+3;x<bounds.maxX;x+=12)for(let y=bounds.minY+3;y<bounds.maxY;y+=12){const p={x:x+Math.sin(n++*2.7)*2,y};if(Model.inPolygon(p.x,p.y,forest))base.environment.trees.push({...p,z:height(p),height:5+(n%4),crownRadius:2.8,kind:'unclassified',species:'unknown',placement:'procedural within mapped woodland'});}
base.mapAttribution={text:'© OpenStreetMap contributors',url:'https://www.openstreetmap.org/copyright',license:'ODbL-1.0',licenseFile:'../evolving_vehicles_2/data/LICENSE.ODbL-1.0.txt',sourceFile:'data/kic-t21-source.json'};
base.elevation.attribution=source.elevationMetadata;
base.reconstruction={sourceSha256:source.sourceSha256,elevationSha256:crypto.createHash('sha256').update(JSON.stringify(elevation)).digest('hex'),courseLengthM:track.length,judgedLengthM:base.judgedEnd-base.judgedStart,
  heightRangeM:Math.max(...centerline.map(p=>p.z))-Math.min(...centerline.map(p=>p.z)),cornerProgress:{T2:t2.s,T1:t1.s},officialStartFinish:false,officialClips:false};
const output='/* Generated by build-course-kic.cjs; source provenance is part of the data. */\n(function(root){\nconst data='+JSON.stringify(base)+';\nroot.DriftKicT21=data;if(typeof module!=="undefined")module.exports=data;\n})(typeof window==="undefined"?globalThis:window);\n';
const file=path.join(__dirname,'kic-t21.js');
if(process.argv.includes('--check')){if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==output)throw Error('KIC reconstruction is stale. Run node evolving_drift/build-course-kic.cjs');}
else if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==output)fs.writeFileSync(file,output);
console.log(JSON.stringify({lengthM:track.length,judgedLengthM:base.reconstruction.judgedLengthM,relativeHeightM:base.reconstruction.heightRangeM,structures:base.environment.structures.length,trees:base.environment.trees.length,boundaryVertices:base.boundaryPolygons.map(p=>p.length)}));
