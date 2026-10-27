# 사진 기반 피트·서비스 시설 데이터

검토일: 2026-10-15.

영암 GP·상설 시설 추가 검토: 2026-10-27. [FIA 2013 행사 자료](https://www.fia.com/events/fia-formula-one-world-championship/season-2013/2013-korean-grand-prix-event-information), [KIC 공식 사진](https://koreacircuit.com/Introduce), [KMG 2025 자료 33쪽](https://www.minigpnea.com/page/KMG_Belle%20foret%20Intro.pdf)과 OSM 외곽을 대조했다. 공통 H/I/J/M/C 관람석은 2013년 지붕 없는 모습으로, GP 메인 관람석은 별도 지붕 있는 모습으로 표현한다. 한옥 교량은 공식 사진을 참고해 생성한 근사 기하이며 CAD가 아니다. 항공사진 촬영 연도와 현재 역사적 관람석의 존치 상태는 미확인이다. 좌석 행·색·높이·교량 부재는 추정이며, [영암 자료의 시점과 적용 범위](../environment/yeongam-reference-20261027.md)에 근거를 기록했다.

인제 주변 시설 추가 검토: 2026-10-27. [운영사 관람석 사진](https://cc.speedium.co.kr:8443/content/03facility/02_01.jsp), [피트·계시대 사진](https://cc.speedium.co.kr:8443/content/03facility/04_01.jsp), [호텔·콘도와 전체 항공사진](https://www.speedium.co.kr/company/content/01_01.jsp)을 현재 OSM 건물 외곽과 대조했다. 긴 파란 하층 관람석과 짧은 녹색 상층·은색 곡면 캐노피를 별도 외곽으로 만들고, 흰 트러스·회색 방송실·LAP/TIME 계시대·파란 옥상 설비를 추가했다. 동쪽 코스 밖의 호텔과 콘도는 곡선 외곽을 따르는 반복 유리창과 밝은 외벽으로 단순화한다. 관제탑은 운영사 기준 지상 4층·지하 1층으로 구분한다. 좌석 행·높이·부재·뒷면 깊이는 사진 추정이며 원본 사진을 텍스처로 배포하지 않는다.

계시대는 항공사진과 피트동 남단의 관계를 바탕으로 배치했고 종방향 약 ±40m 불확실성이 있다. 게임 거리 원점, 공식 START LINE, Finish/Control Line은 서로 같다고 보장하지 않는다. 이를 추가하면서 물리 주행 경로나 거리 원점을 옮기지 않는다. 길게 이어지는 관람석은 표시 지면의 종방향 높이를 따라 기초를 연결하고, 분할한 숙박동은 `baseGroup`의 공통 기초 기준으로 층을 맞춘다. 지표 자체는 인접 도로에서 추정한 값이다.

이 디렉터리의 11개 GeoJSON 컬렉션은 실제 사진과 운영사·행사 배치도에서 확인한 피트 건물, 피트레인, 작업마당, 분리벽 및 차량 대기 시설을 표현한다. 경기장마다 다른 시설 위치와 형태를 보존하기 위한 풍경 데이터다. **피트 진입·정차·정비·재출발, 피트 속도 제한, 타이어 교체와 피트 전략 시뮬레이션은 구현하지 않는다.** 경기 차량의 주행 경로·랩 타임·점수에도 영향을 주지 않는다.

사진을 바탕으로 단순화한 외형이며 측량 모델은 아니다. 건물 높이, 캐노피 깊이, 일부 차고 수, 바닥 구획, 진출입 연결선과 사진에서 가려진 외곽은 추정값을 포함한다. 사진의 촬영일과 현재 운영 상태가 확인되지 않는 경우도 있다. 각 JSON의 `sources`, `metadata.limitations`, feature의 `evidence`와 `estimatedProperties`가 해당 범위의 근거다.

## 서킷별 근거와 표현 범위

| 파일 | 사진·도면 출처 | 표현 및 한계 |
| --- | --- | --- |
| [everland.json](everland.json) | [운영사 항공사진](https://www.everland.com/speedway/home), [2017년 피트 전면 현장사진](https://www.edaily.co.kr/News/Read?mediaCodeNo=257&newsId=01466166616098496), OSM | 피트동, 관제 건물, 레인, 연속 작업마당과 벽. 16개 전면 차고 모듈·높이·마당 깊이는 추정. 확인되지 않은 영구 피트박스 행은 추가하지 않았다. |
| [inje.json](inje.json) | [운영사 항공사진](https://www.speedium.co.kr/company/content/01_01.jsp), [운영사 피트 건물 사진·시설 설명](https://cc.speedium.co.kr:8443/content/03facility/04_01.jsp), OSM | 운영사 설명의 36실을 균일한 차고 간격으로 단순화. 관제동, 밝은 작업마당과 붉은 종방향 띠, 레인과 콘크리트 벽. 높이와 띠 폭은 추정하며 바닥 시공 이음매를 피트박스 도색으로 취급하지 않았다. |
| [yeongam.json](yeongam.json) | [KIC 공식 소개·실사진](https://koreacircuit.com/Introduce), [KMG 2025 자료 p.33 항공사진](https://www.minigpnea.com/page/KMG_Belle%20foret%20Intro.pdf), [2013 행사 시설도](https://www.fia.com/sites/default/files/external_archive/node4128/2013%20KGP%20Media%20Kit.pdf), [2026 F1 트랙데이 배정 자료](https://www.koreacircuit.com/Notice/8/read/119), OSM | **남쪽 GP/F1 피트 단지**. 레인·피트동·관제동·작업마당·벽·청색 작업칸 한 곳, 메인 관람석과 한옥 지붕 교량. 30개 전면 문은 시각적 근사이며 전체 차고 재고 수가 아니다. 공통 역사적 관람석과 원경의 북쪽 상설 피트도 표시하지만 피트 조망은 GP 차고를 유지한다. 현재 수정된 전체 출구 경로는 생략했다. |
| [yeongam-permanent.json](yeongam-permanent.json) | [KMG 전체 항공사진](https://www.minigpnea.com/page/KMG_Belle%20foret%20Intro.pdf), [2013 행사 시설도](https://www.fia.com/sites/default/files/external_archive/node4128/2013%20KGP%20Media%20Kit.pdf), [2019 현장사진](https://bonta.tistory.com/546), [2026 상설코스 피트 배정 자료](https://www.koreacircuit.com/Notice/1/read/242), OSM | **북쪽 상설코스 피트 단지**. 남쪽 GP 피트와 별개다. 공식 배정 자료의 30개 차고, 별도 레인과 좁은 작업마당·벽, 현재 투영으로 옮긴 공통 역사적 관람석. 건물 높이와 처마는 단순화했으며 확인되지 않은 피트박스 도색을 만들지 않았다. |
| [taebaek.json](taebaek.json) | [운영사 코스맵](http://taebaekspeedway.com/document/course), [한국관광공사 사진을 수록한 관광정보](https://www.ktourmap.com/spotDetails.jsp?contentId=3072028) | 본선 안쪽의 2층 피트동, 4층 관제동, 작업마당, 레인과 벽. 관광정보의 32개 피트와 사진의 25–28번 셔터를 교차 확인했다. 정확한 현재 배정은 미확인이다. 높이·길이·배치는 사진 근사이며 종방향 약 30m, 측방 약 7m의 불확실성을 기록했다. 외부 개별 작업칸 도색은 생략했다. |
| [bmw-incheon.json](bmw-incheon.json) | [설계사 Ingenaix 시설 계획도](https://www.ingenaix.de/en/projects/bmw-driving-experience-centre-south-korea/), [2014 개장 항공사진 p.2](https://www.ingenaix.de/media/user_upload/referenzen/12-2360-DEC-South-Korea/download/BMW-Korea-Driving-Center-Eroeffnung.pdf), [2026 BMW 공식 사진](https://www.press.bmwgroup.com/korea/article/detail/T0454844KO/), [8개 정비 베이 공식 설명](https://www.press.bmwgroup.com/korea/article/detail/T0189924KO/) | **교육·고객 서비스 시설**이다. 교육동·브랜드센터·정비센터·차량 대기마당과 연결로를 표시하며 레이스 피트로 부르지 않는다. 8개는 2014년 고객 정비 워크베이 수로, 레이스 피트박스 수가 아니다. 과거 계획도와 실사진을 현재 코스의 네 지점에 정합했으며 기준점 잔차는 최대 약 5.6m이다. 현재의 모든 서비스 구역을 재측량한 것은 아니다. |
| [hmg-taean.json](hmg-taean.json) | [HMG 2025 브로슈어 p.5–6](https://drivingexperience.hyundai.co.kr/kr/common/pdf/hmg_driving_experience_center_ko_2025.pdf), [운영사 센터·스타팅 포인트 설명과 사진](https://drivingexperience.hyundai.co.kr/kr/hmg-driving-experience/about/contents) | **실습 출발 대기 시설**이다. 마른노면 코스 북단 밖의 센터 건물, 차량 대기·진입 마당과 연결로를 표시한다. 실내의 스타팅 포인트 주차선을 실외 레이스 피트박스로 옮기지 않았다. 도식 배치도와 코스의 여섯 지점을 정합한 잔차는 최대 약 28m로, 정밀 지적도 수준의 배치를 주장하지 않는다. |
| [pocheon.json](pocheon.json) | [Encar Magazine 2018 현장 항공사진·피트월 사진](https://www.encar.com/mg/post.do?method=view&pagetype=news&postid=110235&subid=news1) | **2018년에 촬영된 역사적 시설 배치**. 동쪽 메인 직선의 피트·서비스동, 밝은 패독, 레인과 벽. 현재 운영 여부나 후속 변경은 확인하지 못했다. 사진에서 차고 문과 피트박스 수를 셀 수 없어 임의의 행을 만들지 않았다. 위치 불확실성은 종방향 약 35m, 측방 약 10m로 기록했다. |
| [monza.json](monza.json) | [운영사 메인 직선 사진](https://www.monzanet.it/autodromo-nazionale-monza/), [건물 연혁·치수](https://www.monzanet.it/autodromo-di-monza-storia/), [2023 공식 배치도](https://www.monzanet.it/wp-content/uploads/2023/08/Depliant_poster_F1_def_594x420_2023_VERTICAL.pdf), [FIA 2025 피트레인 도면](https://www.fia.com/system/files/decision-document/2025_monza_event_-_f3_monza_pit_lane_map_2025.pdf) | F1 피트, 청색 작업마당, 관제동과 벽. 운영사 건물 길이와 60개 차고 모듈을 반영했다. 20개 작업칸은 차고 세 개씩을 묶은 시각화로, 영구 도색 수나 실제 팀 배정이 아니다. 높이·폭·진출입과 위치는 사진 근사다. |
| [silverstone.json](silverstone.json) | [완공된 Wing 항공사진](https://www.silverstone.co.uk/visit-eat-stay), [2023 참가자 가이드](https://www.silverstone.co.uk/sites/default/files/pdf/Competitor_Guide_to_Silverstone_Festival_2023.pdf), [40개 Wing 차고 운영사 설명](https://www.silverstone.co.uk/venue-hire/awards-dinners), [National Pit Straight 현장사진](https://www.silverstone.co.uk/events/formula-1-british-grand-prix/hospitality/heritage-club) | **Hamilton Straight의 International Wing**과 **Woodcote–Copse의 National 피트**를 별도 단지로 표현한다. 코스 데이터의 거리 원점이 National 직선이어도 Wing을 그곳에 배치하지 않는다. Wing 40개 문은 운영사 수치이며 블록별 배분·지붕·20개 작업칸은 단순화다. National의 1–12 번호 그룹과 중앙 통로를 보존하되 전면 문 수와 관제동 외형은 추정이다. |
| [spa.json](spa.json) | [운영사 F1 테라스 드론사진](https://www.spa-francorchamps.be/en/directory/salles/224_terrasse-formule-1), [2026 접근 배치도](https://www.spa-francorchamps.be/assets/e70cff50-ae5d-4aaa-896b-54c8a953a357/all-plan-acces.pdf), [Endurance 현장사진](https://www.spa-francorchamps.be/fr/directory/kamers/214_mezzanines-endurance), [RAC/Circuit Endurance 도면](https://ser2025.racspa.be/docs/25StandEndurance-planescaliers.pdf), [FIA 2024 F1 피트 자료](https://www.fia.com/sites/default/files/decision-document/2024%20Spa%20Francorchamps%20Event%20-%20F2%20Spa%20Event%20Notes.pdf) | **메인 F1 피트**와 **La Source 이후 Eau Rouge 방향의 Endurance 피트**를 구분한다. 42개 F1 차고와 46개 Endurance 차고는 자료에 근거한다. 내리막 차고는 굴곡을 따라 분할했으며 각 블록의 문 배분은 단순화다. 14개/23개 작업칸은 차고를 묶은 시각화로, 행사별 정차 배정이나 영구 도색을 뜻하지 않는다. 표고 차가 큰 사진을 구간별 도로 대응으로 정합하여 약 10–30m 위치 오차가 가능하다. |

## 지도 데이터 권리와 사진 보관

다음 네 컬렉션의 피트레인·건물 외곽은 OpenStreetMap 데이터를 포함하거나 그 데이터에서 파생했다.

- `everland.json`
- `inje.json`
- `yeongam.json`
- `yeongam-permanent.json`

**© OpenStreetMap contributors.** 해당 지도 데이터는 [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/)에 따라 제공된다. [OpenStreetMap 저작권·기여자 안내](https://www.openstreetmap.org/copyright)를 참조한다. 각 파일의 OSM source에는 취득 영역 URL과 로컬 원본 기록이 있으며, `metadata.attribution`, `license`, `licenseUrl`에도 표시한다. 지도의 ODbL은 참조 사진·운영사 PDF의 이용허락으로 확대 해석하지 않는다.

사진, PDF, 내려받은 페이지 및 검토용 이미지들은 Git에서 제외되는 `output/pit-references/` 및 코스별 `output/*-trackside-qa/`에 보관한다. 사진·도면의 저작권은 원 권리자에게 있으며 **원본 사진이나 PDF를 앱 자산으로 묶거나 배포하지 않는다.** 공개 앱에는 추출·단순화한 시설 좌표와 출처 메타데이터만 포함한다. `localEvidenceFile`은 개발자 검증용 경로로, 공개 배포에서 접근 가능한 URL을 의미하지 않는다. SHA-256은 검토한 원본의 동일성 확인용이며 이용허락을 의미하지 않는다.

## 좌표와 데이터 구조

각 파일은 `type: "FeatureCollection"`, `circuitId`, `coordinateSystem`, `sources`, `metadata`, `features`를 가진다. 모든 feature는 `properties.sourceId`와 `evidence`를 갖는다. `sourceId`는 같은 컬렉션의 source를 가리킨다.

- `wgs84`: 경도·위도 좌표를 현재 `buildTrack(circuit).projection`으로 변환한다.
- `local-metres`: 같은 projection을 적용한 미터 좌표다. x는 동쪽, y는 남쪽이다. 기존 코스의 원점·축척을 바꾸면 이 자료의 정합도 다시 확인해야 한다.
- 지면 표고는 현재 서킷의 도로 표고 모델에서 파생한다. 시설의 실제 지표·기초 높이를 별도로 측량한 자료는 아니다.

지원 형식은 `pit-lane`·`pit-wall`·`pit-box-row`의 LineString과 `pit-building`·`pit-apron`·`pit-box`의 Polygon이다. `pit-building.garageEdge`는 닫기 전 외곽선의 0부터 시작하는 변 번호다. `garageCount`를 생략하면 차고 셔터를 그리지 않는다. 이 덕분에 센터 건물을 가짜 레이스 차고로 만들지 않는다.

추가 형식: `grandstand` Polygon은 `frontEdge`가 본선 쪽 앞변이다. `rows`, `seatingHeight`, `seatingBaseHeight`, 두 좌석 색상, `canopy:false` 또는 `height`·`canopyDepth`·`roofRise`, `pressBoxHeight`로 계단식 좌석과 별도 지붕을 만든다. `timing-gantry`는 기둥 중심을 잇는 두 점 LineString이며 `clearanceHeight`는 횡단 도로의 최고 표시 높이 위 최소 7m로 제한한다. 본선과 겹치는 기둥은 생성하지 않는다. 검은 계시판은 정적 대시를 표시하며 실제 기록으로 가장하지 않는다. `pit-building.windowRows`는 반복 창 띠, `baseGroup`은 분할 건물의 공통 기초, `rooftopEquipment`는 지붕 안쪽에 한정한 설비 외곽을 지원한다. 모든 시설의 높이·폭은 미터이며, 표시 도로의 1.75배 지면 고도 위에 시설 자체 높이를 한 번만 더한다.

`roofed-bridge`는 두 지지점의 LineString에서 교각·통로·지붕·창틀·아치를 생성한다. `deckClearance`는 횡단 도로의 최고 표시 높이를 기준으로 최소 7m를 확보하는 모형 조건이다. 폭·높이·지붕 구조는 사진 근사이며 원 설계도나 공인 차량 통과 높이를 의미하지 않는다. 영암의 교량과 역사적 관람석을 더해도 피트 조망은 `metadata.focusFeatureId`로 자기 레이아웃의 차고 단지를 유지한다.

`pit-box-row` 선은 작업칸의 차로 쪽 경계이며 `depth`는 작업칸 안쪽 깊이다. x 동쪽/y 남쪽 좌표계에서 진행 벡터가 `(dx, dy)`일 때 `side: "left"`는 `(dy, -dx)`, `"right"`는 `(-dy, dx)` 방향이다. 차고 모듈을 묶은 표시를 사용하는 경우 `evidence`와 `estimatedBayCount`에 추정임을 명시한다. 전체 바닥 도색이 확인되지 않는 시설에서는 행을 생략한다.

## 수정·재생성·검증

개별 JSON을 수정한 뒤 저장소 루트에서 다음을 실행한다.

```powershell
node evolving_vehicles_2/data/pits/build-pits.cjs
node --test evolving_vehicles_2/pit-facilities.test.cjs
```

`evolving_vehicles_2` 디렉터리 안에서는 `node data/pits/build-pits.cjs`로 재생성한다. 생성 파일은 `evolving_vehicles_2/pit-facility-data.js`다. 생성 파일을 직접 수정하지 않는다.

검증할 때는 좌표의 유한성·닫힌 Polygon·출처 연결·메시 생성뿐 아니라, 실제 사진과의 위치·방향·차고 전면·연결로 정합을 확인한다. 본선 위에 건물이나 벽이 놓이지 않는지, 도로와 높이가 맞는지, 서로 다른 피트 단지를 거리 원점 때문에 혼동하지 않았는지도 확인한다. 문 수나 바닥 칸 수의 검사는 공식 수치와 시각화 추정을 구분해야 한다.
