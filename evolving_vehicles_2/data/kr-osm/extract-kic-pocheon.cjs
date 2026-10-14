/* Reproducible extraction from OSM. Resulting geographic database: ODbL 1.0.
 * © OpenStreetMap contributors, https://www.openstreetmap.org/copyright
 * See acquisition.json and LICENSE.OSM.txt for source query and licensing.
 */
const fs = require('node:fs');
const path = require('node:path');
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'korea-raceways.raw.json'), 'utf8'));
const way = id => {
  const w = raw.elements.find(e => e.type === 'way' && e.id === id);
  if (!w) throw new Error(`Missing original OSM way ${id}`);
  return w.geometry.map(p => [p.lon, p.lat]);
};
const same = (a,b) => a[0]===b[0] && a[1]===b[1];
const radians = Math.PI / 180;
function distance(a,b) {
  const dlat=(b[1]-a[1])*radians,dlon=(b[0]-a[0])*radians;
  const h=Math.sin(dlat/2)**2+Math.cos(a[1]*radians)*Math.cos(b[1]*radians)*Math.sin(dlon/2)**2;
  return 2*6371008.8*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
const length = coords => coords.slice(1).reduce((n,p,i)=>n+distance(coords[i],p),0);
const permanent=way(234764328),extension=way(234764539),pocheon=way(1559045138);
if(!same(permanent[0],permanent.at(-1))||!same(pocheon[0],pocheon.at(-1)))throw new Error('Original rings are not closed');
const branch=permanent.findIndex(p=>same(p,extension[0]));
const candidates=permanent.map((p,i)=>({i,gap:distance(p,extension.at(-1))})).sort((a,b)=>a.gap-b.gap);
const junction=candidates[0];
if(branch<0||junction.i<=branch||junction.gap>1.5)throw new Error('KIC main-route junction failed bounded matching');
// The GP extension ends 0.98 m from the permanent-way junction. Preserve both
// raw coordinates with a sub-1.5 m connecting segment, rather than relocating
// any surveyed point. This tiny OSM topology repair is disclosed in metadata.
const gp=[...permanent.slice(0,branch),...extension,...permanent.slice(junction.i)];
const reference='https://www.koreacircuit.com/';
const common={sourceProfile:'openstreetmap',country:'대한민국',countryCode:'KR',sourceName:'OpenStreetMap',attribution:'© OpenStreetMap contributors',license:'ODbL 1.0',licenseUrl:'https://opendatacommons.org/licenses/odbl/1-0/',retrievedOn:'2026-10-14',sourceRevision:raw.osm3s?.timestamp_osm_base};
const plans=[
  {id:'yeongam',name:'영암 코리아 인터내셔널 · GP',nameEn:'Korea International Circuit · Grand Prix',lengthM:5615,lengthKind:'official',category:'자동차 경주장',file:'kr-osm/kic-gp.geojson',sourceWayIds:[234764328,234764539],sourceUrl:'https://www.openstreetmap.org/way/234764539',lengthSourceUrl:reference,description:'긴 직선과 연속 코너를 잇는 영암 GP 전체 코스입니다.',sourceNote:`OSM GP 확장 경로를 상설 경로에 연결했습니다. 복귀 접점의 ${junction.gap.toFixed(2)} m 좌표 차이는 두 원본 점 사이의 짧은 연결로 보정했습니다.`,startNote:'OSM 상설 경로의 첫 좌표에서 원본 일방통행 순서를 따라 달립니다. 실제 출발선과 다를 수 있습니다.',coords:gp},
  {id:'yeongam-permanent',name:'영암 코리아 인터내셔널 · 상설',nameEn:'Korea International Circuit · Permanent',lengthM:0,lengthKind:'geometry-estimate',referenceLengthM:3040,category:'자동차 경주장',file:'kr-osm/kic-permanent.geojson',sourceWayIds:[234764328],sourceUrl:'https://www.openstreetmap.org/way/234764328',lengthSourceUrl:reference,description:'영암 상설 코스. OSM에 기록된 폐곡선 경로를 달립니다.',sourceNote:'OSM 상설 경로의 측정 거리를 사용합니다. 운영사 공표 3.04 km 및 KARA 경기용 변형 코스와 차이가 있을 수 있습니다.',startNote:'원본 OSM 일방통행 순서와 첫 좌표를 사용합니다. 실제 출발선과 다를 수 있습니다.',coords:permanent},
  {id:'pocheon',name:'포천 레이스웨이',nameEn:'Pocheon Raceway',lengthM:3159,lengthKind:'official',category:'운영 확인 필요',statusNote:'현재 운영 여부 미확인 · 기존 시설의 지도 경로',file:'kr-osm/pocheon.geojson',sourceWayIds:[1559045138],sourceUrl:'https://www.openstreetmap.org/way/1559045138',lengthSourceUrl:'https://www.encar.com/mg/post.do?method=view&pagetype=news&postid=110235&subid=news1',description:'포천의 기존 자동차 코스. 현재 운영 여부는 확인되지 않았습니다.',sourceNote:'OSM에 기록된 주 경로를 사용합니다. 현재 운영 여부는 확인되지 않았으며, 공표 길이는 개장 당시 현장 취재 자료를 참고했습니다.',startNote:'원본 OSM 좌표의 순서를 사용합니다. 실제 경기 출발선과 주행 방향은 확인되지 않았습니다.',coords:pocheon}
];
const metadata=[];
for(const {coords,...record} of plans){
  if(!same(coords[0],coords.at(-1)))throw new Error(`${record.id}: open route`);
  const measured=length(coords);
  if(record.lengthM===0)record.lengthM=Math.round(measured);
  if(record.lengthKind==='official'&&Math.abs(measured/record.lengthM-1)>.025){record.referenceLengthM=record.lengthM;record.lengthM=Math.round(measured);record.lengthKind='geometry-estimate';record.sourceNote+=' 공표 길이와 차이가 있어 OSM 경로의 측정 거리를 사용합니다.';}
  const properties={...common,...record,geometryLengthM:+measured.toFixed(2)};
  const feature={type:'Feature',properties,geometry:{type:'LineString',coordinates:coords}};
  fs.writeFileSync(path.join(__dirname,path.basename(record.file)),JSON.stringify(feature,null,2)+'\n');
  metadata.push(properties);
  console.log(`${record.id}: ${coords.length} points, geometry ${measured.toFixed(2)} m, displayed ${record.lengthM} m (${record.lengthKind})`);
}
fs.writeFileSync(path.join(__dirname,'kic-pocheon.metadata.json'),JSON.stringify(metadata,null,2)+'\n');
fs.writeFileSync(path.join(__dirname,'kic-derivation.json'),JSON.stringify({source:'korea-raceways.raw.json',sourceTimestamp:raw.osm3s?.timestamp_osm_base,permanentWay:234764328,gpExtensionWay:234764539,branchIndex:branch,rejoinIndex:junction.i,rejoinGapM:junction.gap,extensionEnd:extension.at(-1),permanentRejoin:permanent[junction.i],operation:'Replace permanent shortcut between exact GP branch coordinate and bounded nearest rejoin vertex with entire GP extension; preserve original coordinates and add only the recorded junction gap segment.',pocheonWay:1559045138,pocheonOperation:'Copy the closed main way without alteration; exclude shortcut and pit-like auxiliary ways.'},null,2)+'\n');
