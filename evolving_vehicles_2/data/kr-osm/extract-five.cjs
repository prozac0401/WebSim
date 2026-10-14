'use strict';
// Reproducible extraction: no traced, invented or interpolated source coordinates.
const fs = require('node:fs');
const path = require('node:path');
const raw = require('./korea-raceways.raw.json');
const acquisition = require('./acquisition.json');
const kara = 'https://kara.or.kr/static/upload/boardkara/20260416054401_1026195476_2.pdf';
const definitions = [
  { id: 'everland', name: '용인 에버랜드 스피드웨이', nameEn: 'Everland Speedway', region: '경기 용인', lengthM: 4346, widthM: 11,
    ways: [240199084, 671420801, 671420803, 671420804], lengthSourceUrl: kara, lengthSourceNote: 'KARA 2026 부록 국내 공인 경기장 현황, PDF 6쪽(인쇄 233쪽): 4.346km.',
    description: '용인의 16코너 풀 코스. 입체 교차 구간을 포함한 실제 도로 연결 순서를 평면으로 표시합니다.',
    courseType: '상설 레이스 서킷', direction: 'clockwise',
    derivation: 'Four OSM one-way raceway ways concatenated in their original direction at exactly matching endpoint coordinates; no reversing or artificial joining. Excludes Pit Lane 450059011 and shortcut ways 240200573/885331161/885331162. Bridge way 671420804 retained; bridge elevation is omitted by the simulator.' },
  { id: 'inje', name: '인제 스피디움', nameEn: 'Inje Speedium', region: '강원 인제', lengthM: 3908, widthM: 14,
    ways: [651693293], lengthSourceUrl: kara, lengthSourceNote: 'KARA 2026 부록 국내 공인 경기장 현황, PDF 6쪽(인쇄 233쪽): 3.908km.',
    description: '인제의 풀 코스. A·B 코스를 잇는 실제 중심선과 DEM 지형 고도를 사용합니다.',
    courseType: '상설 레이스 서킷', direction: 'clockwise',
    derivation: 'Original closed OSM Full Course way 651693293, tagged oneway=yes; excludes A/B shortcuts and Pit Lane 677355827. Source geometry coordinates and order unchanged.' },
  { id: 'taebaek', name: '태백 스피드웨이', nameEn: 'Taebaek Speedway', region: '강원 태백', lengthM: 2500, geometryEstimate: true,
    ways: [240211101], lengthSourceUrl: kara, lengthSourceNote: 'KARA 2026 부록 국내 공인 경기장 현황, PDF 7쪽(인쇄 234쪽): 2.5km.',
    description: '태백의 상설 서킷. OSM에 등록된 경로의 측정 길이를 사용하며, KARA 표기 2.5km와 차이가 있습니다.',
    courseType: '상설 레이스 서킷', direction: 'clockwise',
    derivation: 'Original closed oneway raceway 240211101 within Taebaek Speedway, confirmed by venue area 826496121. Excludes Pit Lane 826496123. OSM geometry is approximately 2.322km, differing from the published 2.5km. Geometry measurement is used without stretching the layout to an unverified course variant.' },
  { id: 'bmw-incheon', name: '인천 BMW 드라이빙 센터', nameEn: 'BMW Driving Center', region: '인천 영종도', lengthM: 2600, geometryEstimate: true,
    ways: [530969647], lengthSourceUrl: 'https://www.press.bmwgroup.com/global/article/detail/T0187443EN/bmw-group-opens-first-driving-center-in-asia', lengthSourceNote: 'BMW Group 2014-07-14 개장 보도자료: closed circuit track 2.6km.',
    description: '영종도의 드라이빙 체험 서킷. 실제 주행 폐회로의 OSM 측정 길이이며, 운영사 소개의 2.6km와 차이가 있습니다.',
    courseType: '드라이빙 체험 서킷', direction: 'source-order',
    derivation: 'Original closed motor raceway 530969647 inside BMW Driving Center. Excludes facility-boundary area way 530969676, skidpad circles 530969655/530969656 and shortcut branches. Unnamed way identified by facility location; source direction retained, official race direction not independently confirmed. Uses its approximately 2.486km geometry rather than stretching to the published 2.6km, whose exact configuration is unverified.' },
  { id: 'hmg-taean', name: '태안 HMG 드라이빙 익스피리언스', nameEn: 'HMG Driving Experience Center — Dry Handling Circuit', region: '충남 태안', lengthM: 3400,
    ways: [1104425413], lengthSourceUrl: 'https://drivingexperience.hyundai.co.kr/kr/hmg-driving-experience/track-guide/contents', lengthSourceNote: '운영사 트랙 안내: 마른 노면 서킷 3.4km, 16코너. 4.6km 고속주회로와 별도.',
    description: '태안의 16코너 마른 노면 서킷. 바깥의 고속주회로와 구분한 핸들링 코스입니다.',
    courseType: '드라이빙 체험 서킷', direction: 'source-order',
    derivation: 'Original closed oneway raceway 1104425413 within Hankook Technoring/HMG Driving Experience Center. Identified as the dry handling course by its location and 3.384km winding layout versus the operator published 3.4km dry circuit; excludes surrounding high-speed oval 1104429543 (4.520km mapped geometry) and connector branches 1104425414/1104425416. Original source direction retained.' }
];
function distance(a, b) {
  const radians = Math.PI / 180, dlat = (b[1] - a[1]) * radians, dlon = (b[0] - a[0]) * radians;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin(dlon / 2) ** 2;
  return 2 * 6371008.8 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const metadata = definitions.map(definition => {
  let coordinates = [];
  for (const id of definition.ways) {
    const way = raw.elements.find(e => e.type === 'way' && e.id === id);
    if (!way || way.tags.area === 'yes') throw new Error('Missing centreline way ' + id);
    const next = way.geometry.map(p => [p.lon, p.lat]);
    if (coordinates.length) {
      if (!same(coordinates.at(-1), next[0])) throw new Error('Nonmatching endpoint for way ' + id);
      coordinates.push(...next.slice(1));
    } else coordinates = next;
  }
  if (!same(coordinates[0], coordinates.at(-1))) throw new Error('Route is not actually closed: ' + definition.id);
  const geometryLengthM = coordinates.slice(1).reduce((sum, p, i) => sum + distance(coordinates[i], p), 0);
  const entry = { ...definition, country: '대한민국', localFile: `data/kr-osm/${definition.id}.geojson`, pointCount: coordinates.length,
    geometryLengthM: +geometryLengthM.toFixed(3), sourceUrl: 'https://www.openstreetmap.org/way/' + definition.ways[0],
    sourceUrls: definition.ways.map(id => 'https://www.openstreetmap.org/way/' + id), source: 'OpenStreetMap contributors',
    attribution: '© OpenStreetMap contributors', attributionUrl: 'https://www.openstreetmap.org/copyright', license: 'ODbL-1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/', downloadedAt: acquisition.downloadedAt,
    rawFile: 'data/kr-osm/korea-raceways.raw.json', acquisitionFile: 'data/kr-osm/acquisition.json',
    startNote: '지도 원본의 첫 좌표를 모형 출발선으로 사용합니다. 실제 계측선과 다를 수 있습니다. 원본 좌표 순서로 주행합니다.' };
  entry.referenceLengthM = definition.lengthM;
  entry.referenceLengthSourceUrl = definition.lengthSourceUrl;
  entry.referenceLengthSourceNote = definition.lengthSourceNote;
  entry.lengthKind = definition.geometryEstimate ? 'geometry-estimate' : 'published';
  if (definition.geometryEstimate) {
    entry.lengthM = Math.round(geometryLengthM);
    entry.lengthSourceUrl = entry.sourceUrl;
    entry.lengthSourceNote = `OSM 경로의 구면 거리 합산 측정값 약 ${geometryLengthM.toFixed(1)}m. 공식 참고 길이 ${definition.lengthM}m와 일치하지 않아 공식값에 맞춘 확대를 하지 않습니다.`;
    entry.sourceNote = entry.lengthSourceNote;
  } else {
    entry.sourceNote = `OSM 경로 측정 약 ${geometryLengthM.toFixed(1)}m를 확인된 공시 길이 ${entry.lengthM}m에 맞춰 미세 보정합니다.`;
  }
  delete entry.geometryEstimate;
  const feature = { type: 'Feature', properties: { id: entry.id, name: entry.name, source: entry.source, attribution: entry.attribution, license: entry.license,
    licenseUrl: entry.licenseUrl, sourceWays: entry.ways, derivation: entry.derivation }, geometry: { type: 'LineString', coordinates } };
  fs.writeFileSync(path.join(__dirname, definition.id + '.geojson'), JSON.stringify(feature, null, 2) + '\n');
  console.log(`${entry.id}: ${coordinates.length} source points; ${geometryLengthM.toFixed(1)}m mapped, ${entry.lengthM}m used (${entry.lengthKind})`);
  return entry;
});
fs.writeFileSync(path.join(__dirname, 'korean-circuits.metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
