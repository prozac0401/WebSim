# 실차 외형 참조와 3D 모델 출처

확인일: 2026-10-14.

2026-10-15 공개 배포 구성: 실행용 `*-runtime.js`, 생성 도구, 출처·보정 기록과 검사용 구조 정보는 저장소에 포함한다. 아래 표의 원본 GLB·ZIP·회전 사진·카탈로그와 대형 구성기 캐시는 제작용 로컬 자료로 보존하며 공개 배포 파일에는 포함하지 않는다. 원본 재생성에는 출처 기록에 따른 해당 자료의 별도 취득이 필요하다.

현재 시뮬레이터의 외형은 다음처럼 구분한다. **제조사 공개 구성기의 실제 3D 메시 5종**, **기아 딜러 캠페인의 실제 3D 메시 1종**, **공식 회전 사진에서 재구성한 3D 메시 6종**, **공식 도면·사진을 기준으로 곡면을 제작한 포터 II 1종**이다. 원본 메시가 있는 차종과 사진으로 추정한 차종의 출처를 화면과 데이터에서 구별한다.

- 제조사 메시: G80, 아이오닉 5, 싼타페, 스타리아, 카니발.
- 딜러 공개 메시: 모닝에 사용하는 유럽형 2024 Picanto 캠페인 기본 구성.
- 사진 재구성: 아반떼, 그랜저, K5, 레이, 토레스, 무쏘 EV.
- 도면·사진 참조 곡면 제작: 포터 II. 공식 정면·측면·후면 치수도와 여러 외관 사진을 기준으로 만든 곡면에 보정한 사진 UV를 적용한다. 회전 사진의 실루엣 교차로 재구성한 6종과 방법을 구별한다.

원본 구성기 메시의 제작 공정이 CAD인지 스캔인지는 확인하지 않았으므로 CAD 원본·실측 스캔·제조 정밀도라고 표시하지 않는다. 실행용 모델에는 성능을 위한 단순화, 제원에 맞춘 크기 조정, 화면용 재질·조명을 적용한다. 사진 재구성의 보이지 않는 지붕·차체 하부·적재함 안쪽은 추정한 형상이다. WebGL을 사용할 수 없거나 해당 모델을 불러오지 못하면 사진·제원을 참조해 직접 제작한 대체 메시가 표시되며, 출처 표시도 실제 렌더링 방식에 맞춰 바뀐다.

## 현재 적용한 제조사 3D 메시

| 차종 / 선택 구성 | 공개 제품 페이지와 구성기 | 보존한 원본 / 실행 파일 |
|---|---|---|
| Genesis G80 2.5T Advanced AWD | [Genesis Canada 제품 페이지](https://www.genesisinteractive.ca/en/visualizer/my26/g80/25t-advanced-awd), 제품 페이지가 연결한 [PlayCanvas 구성기](https://playcanv.as/e/p/ignV6Ejt) | `assets/models/g80/`의 차체 구성 GLB 11개와 `logos.glb`, `config.json`, `scene.json`, 활성 부품 연결 정보 `assembly.json` / `g80-runtime.js` |
| Hyundai IONIQ 5 기본 외관 | [Hyundai Australia 제품 페이지](https://www.hyundai.com/au/en/cars/eco/ioniq5) | `assets/models/ioniq5/IONIQ5-7.glb`, `config.json` / `ioniq5-runtime.js` |
| Hyundai SANTA FE 기본 외관·기본 휠 | [Hyundai Australia 제품 페이지](https://www.hyundai.com/au/en/cars/suvs/santa-fe) | `assets/models/santafe/SantaFe-2.glb`, `config.json` / `santafe-runtime.js` |
| Hyundai STARIA Lounge Hybrid 외관 | [Hyundai Australia 제품 페이지](https://www.hyundai.com/au/en/cars/people-movers-and-commercial/staria) | `assets/models/staria/STARIA_SPINNER_06122026.glb`, `config.json` / `staria-runtime.js` |
| Kia Carnival KA4 인도형 Limousine 외관 | [Kia India 제품 페이지](https://www.kia.com/in/our-vehicles/carnival/showroom.html), [공개 VR 쇼룸](https://www.kia.com/in/vr/showroom/index.html) | `assets/models/carnival/`의 `config.zip`, `config.json`, `scene.json`, `KA4-1115-model.zip`, `model.json`, 원본 텍스처 / `carnival-runtime.js` |

원본의 정확한 다운로드 URL, 크기, SHA-256은 기존 4종의 `assets/models/SOURCES.json`과 기아 추가 모델의 `assets/models/kia-sources.json`에 기록되어 있다. 제품 페이지가 일반 브라우저에 전달하는 공개 파일 경로를 사용했으며, 로그인·유료 다운로드 제한을 우회하지 않았다. **원본의 저작권은 제조사 및 원저작권자에게 있으며, 공개 접근이 가능하다는 사실을 오픈 라이선스나 외부 재배포 허가로 해석하지 않는다.** WebSim 실행용 변환 모델에 출처를 유지하며, 원본 자료의 별도 재배포 허가를 확보했다고 주장하지 않는다.

G80 제품 페이지 경로는 `my26`, 연결된 구성기 제목은 `G80_2.5T Advanced AWD_2027`이다. 현대 세 차종은 호주 시장의 공개 구성을, 카니발은 인도 시장의 KA4 페이스리프트 Limousine 외관과 원본 18인치 휠을 사용한다. 수출 시장 트림·휠·배지가 국내 사양과 일부 다를 수 있으며, 하나의 외형을 동일 차종의 여러 엔진·구동 사양에 공통으로 사용한다. 메시 외형의 트림과 시뮬레이션의 성능 사양을 동일한 원본 데이터라고 주장하지 않는다.

보존 구조와 재생성 방법: [제조사 모델 안내](assets/models/README.md). 캐시 검증은 `node evolving_vehicles_2/assets/models/acquire-models.cjs`로 실행한다.

## 딜러 공개 3D 메시와 사진 재구성

모닝은 [Edenauto Kia의 2024 Picanto 캠페인](https://www.meta-sense.fr/en/nos-projets/kia-x-edenauto)을 위해 Metasense가 공개한 [3D 구성기](https://kia-picanto-2024.meta-sense.fr/)의 원본 `models/picanto.glb`를 사용한다. 제조사가 직접 배포한 메시로 표시하지 않는다. 원본은 `assets/models/morning/picanto.glb`이며, 원본 파일에는 GT-Line·Baseline 이름의 부품이 혼재하며 정확한 판매 트림은 미확인이다. 유럽형 휠·배지 등은 국내 모닝과 다를 수 있다. 문이 닫힌 초기 애니메이션 자세를 적용하고, 불투명 유리 뒤에 가려진 `Int_` 실내 메시만 제거했다. 실행 파일은 `morning-runtime.js`이며 원본 출처·해시는 `kia-sources.json`에 있다.

사진 재구성은 여러 공식 회전 사진의 실루엣과 실제 축거·바퀴 위치를 맞춰 3D 부피를 만들고 원본 사진을 표면에 투영한 방식이다. 단일 사진을 평면에 붙인 모델과 다르지만, 원본 제조사 메시나 정밀 실측 결과는 아니다. 카메라 보정 오차는 관측한 휠 중심의 영상 투영 오차이며 차체 모든 점의 정확도를 뜻하지 않는다.

| 차종 | 원본 사진 / 재구성 기록 | 실행 파일 |
|---|---|---|
| 아반떼·그랜저 | `assets/models/{avante,grandeur}/turntable/`, `hyundai-additions-sources.json`, 각 `calibration.json`; 공식 60장 회전 사진 | `avante-runtime.js`, `grandeur-runtime.js` |
| K5 | `assets/reference/turntable/k5/SOURCES.json`, `assets/models/k5/calibration.json`; 72장 주기에서 24장을 사용, 휠 중심 보정 RMS 1.44px | `k5-runtime.js` |
| 레이 | `assets/reference/turntable/ray/SOURCES.json`; 공식 회전 사진 24장 | `ray-runtime.js` |
| 토레스·무쏘 EV | `assets/reference/turntable/{torres,musso_ev}/sources.json`, 각 모델의 `calibration.json`; 공식 회전 사진 36장 | `torres-runtime.js`, `musso_ev-runtime.js` |

사진 원본의 권리 역시 제조사 및 원저작권자에게 있다. 사진 재구성을 했다는 사실이 원본 사진·파생 모델의 외부 재배포 라이선스 확보를 뜻하지 않는다. K5·레이의 해외 구성기, 현대 추가 모델, KGM의 여러 국가별 구성기도 조사했으나 현재 선택한 차체와 일치하고 정상 공개 경로로 취득 가능한 원본 메시를 확보하지 못했다. 조사 범위 내 미확보를 모든 출처에 메시가 없다는 뜻으로 단정하지 않는다. 상세 조사 기록은 `kia-sources.json`, `kgm-sources.json` 및 현대 추가 출처 기록에 보존한다.

## 포터 II 공식 도면·사진 참조 모델

[현대 국내 공식 제품 페이지](https://www.hyundai.com/kr/ko/e/vehicles/porter2/intro)의 26MY 콘텐츠와 [공식 영문 카탈로그](https://www.hyundai.com/content/dam/hyundai/kr/ko/data/vehicles/catalog/en/porter2-catalog-eng.pdf)를 추가 조사해 정면·측면·후면 치수도, 전면과 측면의 사선 사진, 헤드램프·범퍼가드·적재함 상세 사진을 확보했다. 이전 조사에서 남긴 “한 방향만 제공”이라는 설명은 이 추가 자료를 반영하지 못한 것이므로 정정한다. 국내 공식 원본 21개와 정확한 URL·크기·SHA-256은 `assets/reference/porter-refinement/SOURCES.json`에 있다. 함께 보존한 해외 H100 조사 HTML은 수출형 비교 자료이며 국내 모델의 원본 메시나 동일 사양의 근거로 사용하지 않는다.

선택한 외형은 **국내 LPG 초장축 슈퍼캡 2WD·범퍼가드**다. 카탈로그 11쪽의 전장 5,155mm, 전폭 1,740mm, 전고 1,970mm, 축거 2,640mm와 적재함 2,860 × 1,630 × 355mm를 사용한다. 전륜 단륜·후륜 복륜 구성도 구별한다. 전기차의 2,810mm 축거와 다른 H100 수출형 치수를 섞지 않는다. 제원 전사와 사진에서 추정한 부분 치수는 `MEASUREMENTS.json`에 별도로 기록했다.

실행 파일은 `assets/models/porter2-runtime.js`, 생성 도구는 `build-porter-model.mjs`, 곡면 정의는 `hyundai-refined.js`, 사진 보정값과 메시 기록은 `assets/models/porter2/{calibration,inspection}.json`이다. 출처 종류는 `photo-reference`, 화면 표시는 **“현대 공식 도면·사진 기반 정밀 제작”**이다. 차체 곡면을 직접 구성하고 정면·측면·후면 사진을 UV로 보정해 입혔으며 제조사 CAD·실측 스캔·다각도 사진측량 결과는 아니다. 지붕, 하부, 적재함 안쪽은 추정이며 반대편 측면에는 확보한 측면 사진을 재사용한다. 공개 원본 3D 후보도 조사했지만 정상 다운로드 경로에서 확보한 포터 메시가 없으며, 조사 기록과 인증 요구·유료 후보의 미취득 상태는 같은 출처 파일에 남겼다.

## 이번 수정에서 확보한 공식 다각도 참조

`assets/reference/SOURCES.json`에 각 이미지의 정확한 원본 URL, 참조 페이지, 프레임 번호, 바이트 수와 SHA-256이 기록되어 있다. PNG는 수정하지 않은 원본이며 사진의 권리는 각 제조사에 있다. 공개 열람 가능한 공식 제품 사진으로 모델링을 참조했으며, 오픈소스 3D 애셋 라이선스를 주장하지 않는다. 게임의 런타임 3D 메시 대신 이 사진을 평면으로 배치해 3D라고 표시하지 않는다.

| 차종 | 참조 | 추가 파일 |
|---|---|---|
| 제네시스 G80 RG3 페이스리프트 | [G80 공식 페이지](https://www.genesis.com/kr/ko/models/g80), 현행 2027 페이지에 수록된 스탠다드 외관 | `g80-front.png`, `g80-rear.png`, `g80-three-quarter.png` |
| 기아 K5 | [공식 제품 페이지](https://www.kia.com/kr/vehicles/k5/features), 노블레스 360° | `k5-1/13/25/49/61.png` |
| 기아 레이 | [공식 제품 페이지](https://www.kia.com/kr/vehicles/ray/features), 시그니처 360° | `ray-1/13/25/49/61.png` |
| 기아 모닝 | [공식 제품 페이지](https://www.kia.com/kr/vehicles/morning/features), GT-Line 360° | `morning-1/13/25/49/61.png` |
| 기아 카니발 | [공식 제품 페이지](https://www.kia.com/kr/vehicles/carnival/features), 하이브리드 노블레스 360° | `carnival-1/13/25/49/61.png` |
| 현대 아이오닉 5 | [공식 제품 페이지](https://www.hyundai.com/kr/ko/e/vehicles/ioniq5/intro), NE09 360° | `ioniq5-1/13/25/49.png` |
| 현대 싼타페 | [공식 제품 페이지](https://www.hyundai.com/kr/ko/e/vehicles/santafe/intro), MX07 360° | `santafe-1/13/25/49.png` |
| 현대 아반떼 | [공식 제품 페이지](https://www.hyundai.com/kr/ko/e/vehicles/the-all-new-avante/intro), FN01 360° | `avante-1/13/25/49.png` |
| 현대 스타리아 | [공식 제품 페이지](https://www.hyundai.com/kr/ko/e/vehicles/the-new-staria-lounge/intro), US31 360° | `staria-1/13/25/49.png` |
| 현대 그랜저 | [공식 제품 페이지](https://www.hyundai.com/kr/ko/e/vehicles/the-new-grandeur/intro), GN11 360° | `grandeur-1/13/25/49.png` |
| 현대 포터 II | [공식 제품 페이지](https://www.hyundai.com/kr/ko/e/vehicles/porter2/intro), 26MY LPG 초장축 슈퍼캡의 정·측·후면 치수도 및 외관 사진 | 기존 `porter2-1.png`와 `porter-refinement/`의 카탈로그·3방향 치수도·상세 사진, `SOURCES.json`, `MEASUREMENTS.json` |
| KGM 무쏘 EV | [공식 쇼룸](https://www.kg-mobility.com/pr/model/show-room/200000100030003), 울트라 마린 360° | `musso_ev-1/6/19/28.png` |
| KGM 토레스 | [공식 쇼룸](https://www.kg-mobility.com/pr/model/show-room/200000100010001), 라떼 그레이지 360° | `torres-1/6/19/28.png` |

기존 측면 참조와 차체 크기/바퀴 위치는 `../evolving_vehicles/assets/vehicles/SOURCES.json` 및 `../evolving_vehicles/vehicle-artwork.js`에 있다. 추가 이미지가 화면에 사진으로 표시되는 경우 제조사 참조 사진임을 구별한다. 다운포스 튜닝용 스포일러와 차번은 이 프로젝트의 시각 요소이며 제조사 출고 사양을 뜻하지 않는다.

검증/재획득: `node evolving_vehicles_2/assets/reference/acquire-reference.cjs`.

## 이전에 조사했으나 적용하지 않은 외부 메시 후보

아래는 제조사 구성기 원본을 확보하기 전에 조사한 외부 3D 후보 기록이며, **현재 앱에 포함한 파일이 아니다**. 위의 제조사 원본 적용 상태와 구별한다.

| 후보 | 원저자와 조건 | 상태 |
|---|---|---|
| [Kia K5 2025](https://sketchfab.com/3d-models/kia-k5-2025-1fa025db826442f18db0401757f5695a) | UZBEK 3D / @doniyorgroup, CC Attribution, 약 294.7k triangles | 공식 다운로드 API가 인증을 요구하여 원본 파일 미획득. 페이지 표시만으로 실제 배포 포맷을 단정하지 않음. |
| [Hyundai Ioniq 5 2022 Lowpoly](https://sketchfab.com/3d-models/hyundai-ioniq-5-lowpoly-675e78311e8440d88714bd212cb7a8fb) | andikapratamaw, CC Attribution, 약 12.4k triangles | 공식 다운로드 API가 인증을 요구하여 원본 파일 미획득. 현재 수록 실차의 연식과 외관 차이도 검토 필요. |
| [Genesis G80 2021](https://sketchfab.com/3d-models/genesis-g80-2021-8f74d7fbc7f64504a9a36f064ca78ada) | SQUIR3D, 유료 Royalty Free 상품, 약 760.2k triangles | 미구매/미다운로드. 현행 페이스리프트와 전면부 및 휠 차이 있음. |

이 후보들의 로그인 제한 우회, 유료 파일 추출, 출처 불명의 게임 리핑 파일은 사용하지 않았다. 현재 실제 제조사 메시는 5종, 딜러 공개 메시는 1종이다. 나머지는 위에서 구분한 사진 재구성 또는 직접 제작 모델이며, 13종 전체의 원본 메시나 재배포 라이선스를 확보했다고 주장하지 않는다.
