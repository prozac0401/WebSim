# 서킷 데이터와 재현 범위

이 시뮬레이터는 국내 코스에 [OpenStreetMap](https://www.openstreetmap.org/copyright), 해외 세 서킷에 Tomislav Bacinger의 [f1-circuits](https://github.com/bacinger/f1-circuits) 공개 지도 좌표를 사용합니다. 원본의 도로 좌표를 이용하며, 임의로 그린 경로를 실제 서킷 데이터로 표시하지 않습니다. 지도 자료는 비공식이며 운영사나 Formula 1의 인증 측량 데이터가 아닙니다.

## 국내 OpenStreetMap 자료

- 출처와 저작권: © OpenStreetMap contributors
- 데이터 라이선스: [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/), 로컬 사본 [data/LICENSE.ODbL-1.0.txt](data/LICENSE.ODbL-1.0.txt)
- 국내 원본: [data/kr-osm/korea-raceways.raw.json](data/kr-osm/korea-raceways.raw.json)
- 쿼리와 취득 정보: [data/kr-osm/acquisition.json](data/kr-osm/acquisition.json)
- 해당 원본에서 추출·연결한 국내 GeoJSON 및 메타데이터는 `data/kr-osm/`에 공개하며, 이 OSM 파생 데이터도 ODbL 1.0으로 제공합니다. 용인 경로는 정확히 일치하는 끝점으로 연결했습니다. 영암 GP 경로의 복귀 접점에는 원본 사이 약 0.98 m 차이가 있어 두 좌표를 모두 보존한 짧은 연결 구간을 추가했습니다. 추출기는 1.5 m보다 큰 차이는 오류로 처리합니다. 해당 처리와 원 좌표는 [kic-derivation.json](data/kr-osm/kic-derivation.json)에 기록했습니다. 피트 레인과 임의의 지름길을 사용하지 않습니다.

국내 범위는 자동차 경주용 상설 코스, 드라이빙 체험 코스, 운영 확인이 필요한 기존 자동차 코스를 구분합니다. BMW·HMG는 체험 시설이고, 포천은 현재 운영 여부가 확인되지 않은 기존 코스입니다. 카트 전용장, 원형 선회 시험장, 일반인 대상이 아닌 차량 시험장 전체, 철거된 임시 도심 코스는 이 자동차 서킷 목록에 포함하지 않습니다. 공개 지도만으로 모든 시설의 현재 운영 여부나 모든 단축 코스를 보증할 수는 없습니다.

각 코스의 `sourceUrl`과 `sourceWayIds` 또는 `ways`는 원본 OSM 도로를 가리킵니다. `localDataUrl`은 원본 좌표 파일이고, `lengthSourceUrl`은 길이 출처입니다. `lengthKind: "geometry-estimate"`인 코스는 OSM 경로에서 측정한 거리를 표시합니다. 운영사가 공표한 최장 코스와 OSM에 기록된 경로 길이가 다르면 그 차이를 `sourceNote`와 `referenceLengthM`으로 남기며, 일치하지 않는 경로를 공표 길이에 강제로 맞추지 않습니다. 포천의 3.159 km는 개장 당시 현장 취재 기사의 제원이며 현재 운영사의 확인값은 아닙니다.

| 국내 코스 | 주행 거리 | 길이 기준 |
| --- | ---: | --- |
| 용인 에버랜드 스피드웨이 | 4,346 m | KARA 공표 제원 |
| 인제 스피디움 | 3,908 m | KARA 공표 제원 |
| 영암 코리아 인터내셔널 GP | 5,615 m | 운영사 공표 제원 |
| 영암 코리아 인터내셔널 상설 | 3,027 m | OSM 경로 측정, 공표 참고값 3,040 m |
| 태백 스피드웨이 | 2,322 m | OSM 경로 측정, KARA 참고값 2,500 m |
| 인천 BMW 드라이빙 센터 | 2,486 m | OSM 경로 측정, 운영사 최장 코스 참고값 2,600 m |
| 태안 HMG 마른 노면 서킷 | 3,400 m | 운영사 공표 제원, 고속주회로와 별개 |
| 포천 레이스웨이 | 3,159 m | 개장 당시 현장 취재 제원, 현재 운영 미확인 |

## 해외 f1-circuits 자료

- 고정 버전: `394d8fbe70ef2c0b0c8d23ff7bee61fa09606055`
- 가져온 날짜: 2026-10-14
- 저작권: Copyright (c) 2019-2025 Tomislav Bacinger
- 라이선스: [MIT 원문](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/LICENSE.md), 로컬 사본: [data/LICENSE.f1-circuits.txt](data/LICENSE.f1-circuits.txt)

| 서킷 | 공표 랩 길이 | 지도 원본 | 길이 확인 |
| --- | ---: | --- | --- |
| 몬차 | 5,793 m | [it-1922.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/it-1922.geojson) | [Formula 1](https://www.formula1.com/en/information/italy-autodromo-nazionalemonza.FiJN1jnQlRLeHqOxIt13m) |
| 실버스톤 | 5,891 m | [gb-1948.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/gb-1948.geojson) | [Formula 1](https://www.formula1.com/en/information/great-britain-silverstone-circuit.2DtFVI1FjkYgLVdGhbAIv0) |
| 스파 프랑코르샹 | 7,004 m | [be-1925.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/be-1925.geojson) | [Formula 1](https://www.formula1.com/en/information/belgium-circuit-de-spa-francorchamps.3LltuYaAXVRU8iezEsjzGw) |

원본 해외 세 GeoJSON은 `data/`에 그대로 보관합니다. 이 MIT 자료의 원래 라이선스는 유지됩니다. 국내 OSM 자료는 위의 별도 ODbL 출처와 라이선스를 따릅니다.

## 실제 지형 고도 자료

국내 8개 코스와 해외 3개 서킷 모두 [Open-Meteo Elevation API](https://open-meteo.com/en/docs/elevation-api)로 조회한 **Copernicus DEM 2021 GLO-90** 고도를 사용합니다. 고도는 90 m 해상도의 지표면 모델(DSM)이며 EGM2008 지오이드 기준 미터 단위입니다. 자료의 2021은 배포판을 의미하며, 주요 관측은 2011–2015년에 이루어졌습니다. [Copernicus 자료 설명](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM), [자료 DOI](https://doi.org/10.5270/ESA-c5d3d65)를 참고하세요.

- 취득일: 2026-10-14. 총 11개 코스, 중복을 제외한 실제 조회 좌표 1,703개.
- 원본 GeoJSON은 그대로 보존합니다. 모든 원본 점을 유지하고 긴 선분에 같은 직선 위의 점을 추가해 조회 간격을 75 m 이하로 줄였습니다. 긴 직선 중간의 지형 변화도 조회하기 위한 처리입니다.
- [data/elevation/acquisition.json](data/elevation/acquisition.json)에 요청·라이선스·변환 정보를 기록합니다. 같은 폴더의 `open-meteo-*.raw.json`은 실제 요청 URL, 좌표, 취득 시각과 API 원 응답을 보존합니다. 코스별 JSON은 각 좌표와 고도 배열, 원본과 보간 좌표의 SHA-256 해시를 포함합니다. 누락된 고도를 생성하거나 다른 값으로 대신하지 않습니다.
- 시뮬레이션은 먼저 좌표와 고도를 같은 비율로 보간합니다. 원본 DEM 셀의 단차가 수 미터 구간의 급경사로 바뀌지 않도록 **고도만 거리 기준 주기 Gaussian σ=90 m, 범위 ±270 m로 평활화**합니다. 경로 평면 좌표는 이 고도 필터로 변하지 않으며, 원 응답도 수정하지 않습니다. 출발선을 가로지르는 구간도 같은 주기 필터를 적용합니다.
- 이 필터는 90 m 자료를 주행에 활용하기 위한 모델 근사입니다. DSM에는 수목·건물·과거 지형이 포함될 수 있으므로 실제 노면 측량, 교량 상판 높이, 캠버나 세부 요철을 재현하지 않습니다. 특히 태백처럼 산지의 경계에 있는 코스는 도로와 주변 지형의 차이가 고저차에 영향을 줄 수 있습니다.

주행에 사용하는 고도에서 경사를 구해 오르막·내리막 중력, 제동 거리와 타이어 수직 하중에 반영합니다. 가로 방향 거리만 코스에 기록된 길이로 보정하며 고도 자체를 확대하지 않습니다. 표시되는 고도 범위·상승량·프로필은 평활화한 모형 값입니다. 3차원 곡선의 미세한 거리 증가, 수직 곡률에 따른 서스펜션 하중, 공기 밀도의 고도 변화는 계산하지 않습니다. 고도 자료가 없는 별도 입력은 ‘고도 자료 없음’으로 남기며 0 m로 표시하지 않습니다.

Open-Meteo 제공 자료는 [CC BY 4.0](https://open-meteo.com/en/licence), Copernicus DEM 원 자료는 해당 무료 이용 라이선스와 출처 표시 조건을 따릅니다. 두 제공자 모두 표시합니다: **Open-Meteo / Copernicus DEM GLO-90 (2021), European Union and ESA**. 가공된 고도에 대한 원 자료 고지문은 다음과 같으며 코스별 메타데이터에도 보존합니다.

> produced using Copernicus WorldDEM-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved

### 태백 첫 오르막의 추정 노면 조정

2026-10-19부터 태백에는 [taebaek-elevation-profile.js](taebaek-elevation-profile.js)의 별도 노면 조정을 적용합니다. 기존 90m DEM 평활화만으로는 첫 급코너의 중심선 경사가 약23%에 이르렀고, 코너 안쪽을 지나는 차체의 기울기 변화가 증폭됐습니다. 코너 중심선500–590m의 양의 높이 상승을85% 줄이고, 400–500m와590–680m에서 완만하게 연결해 제거한 상승분을50–480m 접근 구간에 분산합니다. 출발 직후0–50m의 고도는 그대로 유지합니다. 전환과 분산 가중치는 양끝의1·2차 미분이0이 되도록 연결합니다.

이것은 **실측 고도를 새로 확보한 보정이 아닌 시뮬레이션용 추정 노면 재구성**입니다. 원본 DEM/평면 경로/총 평면 거리/최저·최고 고도를 보존하고680m 이후 높이도 유지하지만, 조정 구간의 높이는 기존 모형보다 최대 약32.1m 높아집니다. 이전 평활화값은`point.demZ`, 조정 방법·범위·이동 상승량은`track.elevationRefinement`에 남깁니다. 도로·지형·차량 접지·카메라·고도 단면이 이 노면을 공유하고, 중력·제동·주행선 계산에도 적용되므로 태백의 랩타임이 달라질 수 있습니다. 다른 서킷과 스파의 공식 측점은 바꾸지 않습니다.

## 재생성과 근사 범위

2026-10-27 영암 GP와 상설은 [2013 코리아 GP 관람 영상](https://www.youtube.com/watch?v=caVSBA3tmrw)(2022-01-05 업로드), [FIA 2013 범례 지도](https://www.fia.com/sites/default/files/external_archive/node4128/14-korea-circuit-print.pdf)·행사 자료, 운영사 항공사진과 OSM 시설 외곽을 대조했다. 영상은 T3가 아닌 T9–T10 고정 관람 구역이며, 별도 T11 줄무늬는 항공사진 근거다. 포장·자갈·연석·녹색 가장자리·금속 방호시설과 관람석·한옥 교량을 구분하고, 공통 시설은 WGS84를 거쳐 두 코스에 재투영한다. FIA 중심선 정합 RMS 약1.30m는 지표 경계 측량 정확도가 아니며, 줄무늬7m 주기·4.5m 도색·2.5m 간격·위상, 시설 높이와 세부 구조는 추정이다. 열린 내부에는 임의 배경 나무를 생성하지 않는다. [자료의 시점·표현 범위·권리](data/environment/yeongam-reference-20261027.md)에 세부 근거를 남겼으며 도로·고도·주행 계산과 랩 계측 원점은 유지한다.

태백의 주변 산지는 2026-10-27 취득한 Open-Meteo / Copernicus DEM GLO-90의 실제 391점(75m 조회 간격, 원 자료 약90m 해상도)으로 보강했다. OSM 산림 8057853·외곽선 655059092와 영상의 노출 암반을 대조해 지표와 수목을 나눈다. 도로·연석·물리 고도는 유지하며 주변 지형만 연결한다. 개별 나무와 갓길 연결 형상은 표시용 근사이고, [자료·보간·보호 범위](data/environment/taebaek-reference-20261027.md)에 한계를 남겼다.

2026-10-27 태백 스피드웨이는 [사용자 제공 재포장 후 영상](https://www.youtube.com/watch?v=Ji6CW56nQz0)(2025-06-29 게시, 촬영일 미상)과 태백시 2024년 행사 사진을 대조했다. 기존 양측 전체 연석을 없애고 확인된 적백 연석 7구간과 흰 가장자리선을 구분하며, 잔디 뒤 금속 가드레일·검정 덮개벽·직선 콘크리트벽과 철망을 배치한다. [근거·구간·근사 범위](data/environment/taebaek-reference-20261027.md)에 위치 추정과 재질 확인의 한계를 기록했다. 방호시설은 영상 순서에 맞춘 표시용 배치이며 OSM 방호시설 실측선이 아니다. 기존 도로·고도 보정·차량 주행 계산은 유지한다.

2026-10-27 용인 에버랜드 스피드웨이는 [사용자 제공 2023년 온보드 영상](https://www.youtube.com/watch?v=l4SqvpMkvYc), [삼성물산 2024년 공식 행사 사진](https://rnc.samsungcnt.com/pr/news/1225267_15633.html), OSM 숲·수목열·방호시설 좌표를 대조했다. 좌우별 청백 연석과 흰 가장자리선, 잔디 뒤 포장 런오프, 금속 가드레일·덮개벽·타이어 방벽, 수목의 수형과 확인되는 노면 표지를 구분한다. 높이·폭·구간 경계와 그리드 간격 등은 표시용 근사이며, 자료에서 확인되지 않은 모래·자갈이나 수종·바닥 숫자는 단정하지 않는다. [확인·추정 범위와 출처](data/environment/everland-reference-20261027.md)에 세부 한계를 기록했다. 명목 도로 폭·원본 고도·물리 계측 원점은 유지한다.

2026-10-27 인제 스피디움 주변 시설을 [운영사 관람석](https://cc.speedium.co.kr:8443/content/03facility/02_01.jsp), [피트·계시대](https://cc.speedium.co.kr:8443/content/03facility/04_01.jsp), [항공사진·호텔·콘도](https://www.speedium.co.kr/company/content/01_01.jsp)와 OSM 외곽에 맞춰 보강했다. 관람석의 두 좌석 층·은색 지붕·트러스, 계시대, 피트 옥상 설비, 곡선 숙박동과 빈틈 있는 안전 펜스를 입체 기하로 표현한다. 사진은 검토용으로만 보관하며 앱에 포함하지 않는다. 시설 높이·좌석 행·부재 배치·지면은 추정이고, 계시대 위치에는 종방향 약 ±40m 불확실성이 있다. 구체적인 출처·근사 범위와 ODbL 좌표 고지는 [시설 데이터 안내](data/pits/README.md) 및 인제 JSON에 기록한다.

### 원메이크 모드의 주행선과 3D 표시

원본 중심선과 고도는 그대로 보존합니다. 원메이크 모드는 근사 도로 폭 안에서 곡률 에너지를 줄이는 레이싱 라인을 계산합니다. 차량 여유 폭을 두고 경로 이탈을 제한하며 차종·사양·튜닝에 따른 성능별 주행선을 사용합니다. 이는 실측 레코드 랩 궤적이나 검증된 전역 최적해가 아닙니다. 주행 거리·랩 시간은 계산된 선의 실제 평면 길이를 사용하므로 표의 코스 중심선 길이와 조금 다릅니다. 고도는 같은 도로 위치에서 보간합니다. 3D 표시에서는 고저차를 1.75배로 강조하며, 고도·경사 수치와 주행 계산은 화면에서 강조하기 전의 노면 고도를 사용합니다.

회전 가능한 3D 화면의 도로 높이는 이 자료에 근거하며, **스파는 2026 공식 지도에 표시된 거리별 고도 측점으로 보강**했습니다. [사진 기반 주변 환경과 스파 고도 안내](data/environment/README.md)에 원문과 재현 범위가 있습니다. 사진에서 식별한 잔디·숲·런오프에 더해 빈 지면에 기본 지표색과 코스별 설정에 따른 추정 배경 수목을 표시합니다. 배경 식생의 위치와 지표면 높이는 시각적 근사이며 사진으로 확인한 실제 식생과 구분합니다. 차종별 외형 메시와 무게배분·공력·접지 등 모형 가정 및 공식 출고 조합의 출처는 [VARIANTS.md](VARIANTS.md)에 설명합니다.

11개 코스의 피트·서비스 시설은 [사진·도면별 근거](data/pits/README.md)와 개별 JSON의 관찰/추정 기록을 사용합니다. 용인·인제·영암 GP·영암 상설의 OSM 파생 피트 좌표는 **© OpenStreetMap contributors, ODbL 1.0**으로 제공합니다. BMW·HMG의 서비스·대기 구역은 레이스 피트와 구분합니다. 높이·세부 구조·일부 작업 구획은 사진을 참고한 근사이며 실측 피트 지도가 아닙니다. 원본 사진/PDF는 공개 앱에 포함하지 않고, 출처와 시설 좌표를 오프라인 번들로 제공합니다. 이 시설은 주행선이나 피트 정차 전략을 바꾸지 않습니다.

차량의 표시 주행선은 주기 3차 B-스플라인을 사용합니다. 급커브와 완만한 코너의 짧은 회전 강도 진동을 줄이기 위해, 2·4·6·10·14·18m 거리 척도의 국소 곡선 맞춤 뒤 수평 제어점의 3차 차분 에너지를 제한 조건 안에서 줄입니다. 약한 2차 차분 항은 코너 끝에 작은 반대 방향 굴곡이 생기는 것을 억제합니다. 단순한 C2 연결 여부뿐 아니라 전 코스의 곡률 변화량과 차체 회전량도 검사합니다. 차체 방향은 수정한 위치 곡선의 접선을 사용하며 별도의 방향 지연을 추가하지 않습니다. 이 경로의 원래 계산 주행선과의 차이는 연속 구간 전체에서 수평 0.70m, 수직 0.025m 이내로 제한합니다. 차체를 그릴 때의 높이·기울기는 별도로 표시 도로 위 앞뒤 차축의 접촉 높이를 사용하므로 급경사에서도 차체와 도로가 서로 다른 높이 보간을 따르지 않습니다. 카메라와 안내 화살표도 같은 표시 노면 높이를 사용합니다. 기존 분할 노면을 유지하는 포천에서는 매끄러운 노면 투영을 사용할 수 없어, 동일한 3차원 표시 경로에서 실제 축간거리에 맞춘 두 높이로 차체 기울기를 근사합니다. 이는 분할 노면과의 정확한 접촉을 뜻하지 않으며 원본 고도나 물리 계산을 바꾸지 않습니다. 출발선 전후 50m는 기존 제어점 제한을 유지하고 100m까지 새 제한으로 완만하게 전환해 세대 교체의 자세를 보존합니다. 표시 보간은 물리의 위치·속도·랩 판정을 바꾸지 않습니다.

도로 중심선도 별도의 연속 곡선으로 표시하고, 도로·연석·지형이 같은 가장자리 정점을 공유합니다. 곡률과 현의 오차에 따라 급커브를 더 촘촘하게 나눕니다. 추정 도로 폭보다 회전 반경이 작은 포천 구간은 경계가 뒤집히지 않도록 기존 도로 표시를 유지합니다. 망원 후방 카메라는 수직 화각 32도이며, 차량이 지나온 경로상의 거리를 시간 기반으로 보간해 뒤따릅니다. 높은 위치에서 내려다보고 차량이 리어뷰와 비슷한 화면 크기를 갖도록 거리를 맞춥니다. 급경사에서 차량 주변 노면의 뒷면을 보게 되는 경우에는 높이를 부드럽게 올려 도로 윗면을 확보합니다. 서로 다른 높이의 인접 복귀 도로는 이 보정에서 제외합니다. 리어뷰는 수직 화각 58도, 약 14도 내려다보는 기존 거리·방향 보간을 유지합니다. 두 후방 시점에서는 관찰 차량보다 뒤처졌거나 같은 출발 위치에 겹친 차량의 고스트를 표시하지 않으며, 해당 차량의 물리·기록 계산은 계속합니다.

브라우저용 `circuits.js`는 로컬 GeoJSON 경로와 조회한 고도를 포함하며 네트워크 요청 없이 사용할 수 있습니다. 위·경도를 로컬 평면으로 투영한 뒤 각 코스에 기록된 길이를 기준으로 주행 거리를 계산합니다. 좌표 사이의 보간·도로 폭·노면·커브 장식과 차량 성능은 시뮬레이션용 근사입니다. 고도와 경사는 위 DEM 또는 스파 공식 측점 사이의 추정값이며, 태백 첫 오르막에는 위에 명시한 노면 재구성을 추가 적용합니다. 실측 도로 경계, 정확한 피트 레인, 전체 안전 구역, 공식 레이싱 라인은 포함하지 않습니다. 출발선은 지도 경로상의 모형 기준점이며, 실제 경기 출발선 위치와 일치한다고 보장하지 않습니다. 연결 또는 진행 방향 변경은 각 국내 추출 스크립트와 메타데이터에 기록합니다.

데이터 번들을 재생성하려면 저장소 루트에서 `node evolving_vehicles_2/data/build-circuits.cjs`를 실행합니다. 네트워크 없이 저장된 자료만으로 같은 번들을 생성합니다. [manifest.json](data/manifest.json)은 각 원본 파일과 길이 출처, 코스별 라이선스, 고도 파일을 기록합니다. `RaceCircuits`의 `coordinates`는 `[경도, 위도]` 배열이고 `elevations`는 같은 순서의 고도 배열이며 마지막 좌표·고도는 첫 값과 같습니다. 빌더는 닫히지 않은 원본 경로나 좌표 해시와 맞지 않는 고도 자료를 오류로 처리합니다.

OSM 저장 원본에서 다시 추출할 때는 `node evolving_vehicles_2/data/kr-osm/extract-five.cjs`, `node evolving_vehicles_2/data/kr-osm/extract-kic-pocheon.cjs`, `node evolving_vehicles_2/data/merge-korean-manifest.cjs`를 차례로 실행합니다. 고도 조회는 `node evolving_vehicles_2/data/fetch-elevations.cjs`로 실행하며, 검증된 캐시를 재사용하고 없는 좌표만 최대 100개씩 API에 요청합니다. 각 요청은 25초 제한과 재시도를 사용합니다. 원본 지리가 바뀌면 기존 고도 해시가 일치하지 않으므로 고도를 다시 취득해야 합니다.

검증: `node --test evolving_vehicles_2/race-engine.test.cjs evolving_vehicles_2/data/circuit-data.test.cjs`. 원 응답과 좌표·고도 대응, 원본 점 보존, 닫힌 경로 및 고도 이음매, 경사 중력·제동, 모든 차량의 건조·젖은 노면과 출력 조건을 확인합니다. `node evolving_vehicles_2/data/inspect-elevations.cjs`는 코스별 모형 고도·상승량·경사 진단을 출력합니다.

Formula 1 관련 명칭의 권리는 각 권리자에게 있습니다. 본 프로젝트는 Formula 1 및 서킷 운영사와 제휴하지 않습니다.
