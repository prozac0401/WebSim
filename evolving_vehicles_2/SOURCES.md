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

## 재생성과 근사 범위

### 원메이크 모드의 주행선과 3D 표시

원본 중심선과 고도는 그대로 보존합니다. 원메이크 모드는 근사 도로 폭 안에서 곡률 에너지를 줄이는 레이싱 라인을 계산합니다. 차량 여유 폭을 두고 경로 이탈을 제한하며 모든 차량이 같은 선을 사용합니다. 이는 실측 레코드 랩 궤적이나 검증된 전역 최적해가 아닙니다. 주행 거리·랩 시간은 계산된 선의 실제 평면 길이를 사용하므로 표의 코스 중심선 길이와 조금 다릅니다. 고도는 같은 도로 위치에서 보간합니다. 3D 표시에서는 고저차를 1.75배로 강조하며, 고도·경사 수치와 주행 계산은 원래 고도를 사용합니다.

회전 가능한 3D 화면의 도로 높이는 이 자료에 근거하며, **스파는 2026 공식 지도에 표시된 거리별 고도 측점으로 보강**했습니다. [사진 기반 주변 환경과 스파 고도 안내](data/environment/README.md)에 원문과 재현 범위가 있습니다. 사진에서 식별한 잔디·숲·런오프에 더해 빈 지면에 기본 잔디와 추정 배경 수목을 표시합니다. 배경 식생의 위치와 지표면 높이는 시각적 근사이며 사진으로 확인한 실제 식생과 구분합니다. 차종별 외형 메시와 무게배분·공력·접지 등 모형 가정 및 공식 출고 조합의 출처는 [VARIANTS.md](VARIANTS.md)에 설명합니다.

11개 코스의 피트·서비스 시설은 [사진·도면별 근거](data/pits/README.md)와 개별 JSON의 관찰/추정 기록을 사용합니다. 용인·인제·영암 GP·영암 상설의 OSM 파생 피트 좌표는 **© OpenStreetMap contributors, ODbL 1.0**으로 제공합니다. BMW·HMG의 서비스·대기 구역은 레이스 피트와 구분합니다. 높이·세부 구조·일부 작업 구획은 사진을 참고한 근사이며 실측 피트 지도가 아닙니다. 원본 사진/PDF는 공개 앱에 포함하지 않고, 출처와 시설 좌표를 오프라인 번들로 제공합니다. 이 시설은 주행선이나 피트 정차 전략을 바꾸지 않습니다.

차량·표시 주행선·추적 카메라는 같은 주기 3차 B-스플라인을 사용합니다. 급커브와 완만한 코너에서 회전량이 직진과 회전 사이를 반복하지 않도록 2·4·6·10·14·18m 거리 척도의 국소 3차 곡선 맞춤을 순서대로 적용하고, 변위 제한에 가까워지는 구간도 완만하게 연결합니다. 원래 계산 주행선과의 차이는 연속 구간 전체에서 수평 0.4m, 수직 0.025m 이내로 제한합니다. 출발선 전후 50m는 기존 제어점 제한을 유지하고 100m까지 새 제한으로 완만하게 전환해 세대 교체의 자세를 보존합니다. 표시 보간은 물리의 위치·속도·랩 판정을 바꾸지 않습니다. 도로 중심선도 별도의 연속 곡선으로 표시하고, 도로·연석·지형이 같은 가장자리 정점을 공유합니다. 곡률과 현의 오차에 따라 급커브를 더 촘촘하게 나눕니다. 추정 도로 폭보다 회전 반경이 작은 포천 구간은 경계가 뒤집히지 않도록 기존 도로 표시를 유지합니다. 추적 카메라는 수직 화각 32도의 망원 시점이며, 차량이 지나온 경로상의 거리를 시간 기반으로 보간해 뒤따릅니다. 기본 눈높이는 당시 노면 위 1.15m이고 차량 하부 쪽을 바라봅니다. 급경사에서 차량 주변 노면의 뒷면을 보게 되는 경우에는 높이만 부드럽게 올려 도로 윗면을 확보합니다. 서로 다른 높이의 인접 복귀 도로는 이 보정에서 제외합니다.

브라우저용 `circuits.js`는 로컬 GeoJSON 경로와 조회한 고도를 포함하며 네트워크 요청 없이 사용할 수 있습니다. 위·경도를 로컬 평면으로 투영한 뒤 각 코스에 기록된 길이를 기준으로 주행 거리를 계산합니다. 좌표 사이의 보간·도로 폭·노면·커브 장식과 차량 성능은 시뮬레이션용 근사입니다. 고도와 경사는 위 DEM 또는 스파 공식 측점 사이의 추정값입니다. 실측 도로 경계, 정확한 피트 레인, 전체 안전 구역, 공식 레이싱 라인은 포함하지 않습니다. 출발선은 지도 경로상의 모형 기준점이며, 실제 경기 출발선 위치와 일치한다고 보장하지 않습니다. 연결 또는 진행 방향 변경은 각 국내 추출 스크립트와 메타데이터에 기록합니다.

데이터 번들을 재생성하려면 저장소 루트에서 `node evolving_vehicles_2/data/build-circuits.cjs`를 실행합니다. 네트워크 없이 저장된 자료만으로 같은 번들을 생성합니다. [manifest.json](data/manifest.json)은 각 원본 파일과 길이 출처, 코스별 라이선스, 고도 파일을 기록합니다. `RaceCircuits`의 `coordinates`는 `[경도, 위도]` 배열이고 `elevations`는 같은 순서의 고도 배열이며 마지막 좌표·고도는 첫 값과 같습니다. 빌더는 닫히지 않은 원본 경로나 좌표 해시와 맞지 않는 고도 자료를 오류로 처리합니다.

OSM 저장 원본에서 다시 추출할 때는 `node evolving_vehicles_2/data/kr-osm/extract-five.cjs`, `node evolving_vehicles_2/data/kr-osm/extract-kic-pocheon.cjs`, `node evolving_vehicles_2/data/merge-korean-manifest.cjs`를 차례로 실행합니다. 고도 조회는 `node evolving_vehicles_2/data/fetch-elevations.cjs`로 실행하며, 검증된 캐시를 재사용하고 없는 좌표만 최대 100개씩 API에 요청합니다. 각 요청은 25초 제한과 재시도를 사용합니다. 원본 지리가 바뀌면 기존 고도 해시가 일치하지 않으므로 고도를 다시 취득해야 합니다.

검증: `node --test evolving_vehicles_2/race-engine.test.cjs evolving_vehicles_2/data/circuit-data.test.cjs`. 원 응답과 좌표·고도 대응, 원본 점 보존, 닫힌 경로 및 고도 이음매, 경사 중력·제동, 모든 차량의 건조·젖은 노면과 출력 조건을 확인합니다. `node evolving_vehicles_2/data/inspect-elevations.cjs`는 코스별 모형 고도·상승량·경사 진단을 출력합니다.

Formula 1 관련 명칭의 권리는 각 권리자에게 있습니다. 본 프로젝트는 Formula 1 및 서킷 운영사와 제휴하지 않습니다.
