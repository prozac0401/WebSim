# 실차 외형 참조와 3D 모델 출처

확인일: 기존 모델 2026-10-15, 커뮤니티 모델·사진 기반 차량의 실제 메시 재조사 2026-10-19.

## 무료 커뮤니티 메시 추가

G70·GR 수프라 A90·BMW M2 F87·CN7 아반떼 N·GR86 ZN8·K5 페이스리프트는 제조사 공식 모델이 아닌 **CC BY 4.0 커뮤니티 모델**이다. 공개 배포본의 원작자·원 게시물·라이선스가 내부 메타데이터와 일치하는지 확인했다. 실행용 파일과 아래 출처 표시는 로그인 없이 사용할 수 있다. 이전에 보류한 Genesis Canada의 MY26 공식 G70 파일은 사용하지 않았다.

| 차량 | 원작자·원 게시물 | 실제 취득 경로 | 라이선스·변경 기록 |
| --- | --- | --- | --- |
| G70 전기형 | [Genesis G70 — Lucas.Karlsmoen](https://sketchfab.com/3d-models/genesis-g70-ded2c8428fb9499ebd2bfc69c5592b02) | [AllenAI Objaverse의 개별 GLB](https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-067/ded2c8428fb9499ebd2bfc69c5592b02.glb) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), [출처·원본 해시·변경 내역](assets/models/g70-model-source.json) |
| GR 수프라 A90 3.0T | [Toyota Supra 3D Model (Free) — Mpgs Studios](https://sketchfab.com/3d-models/toyota-supra-3d-model-free-41b83cfb912b4eab9af19a802bcf5ffc) | [원작자·라이선스를 보존한 공개 배포본](https://github.com/ReloadDesigner/Car-Viewer-Test/tree/3c61e52a5243d730705ecffebebf91c5f9d012fa/public/models/toyota/Supra/gr_supra) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), [원본 크레딧](assets/models/supra-LICENSE.txt), [출처·해시·변경 내역](assets/models/supra-source.json) |
| BMW M2 F87 전기형 | [BMW M2 — Manuel Contento](https://sketchfab.com/3d-models/394feedd0a0742c595917c7b0f6edcad) | 원 게시물의 로그인 후 무료 GLB 다운로드(1K/4K 기하 동일 확인) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), [크레딧](assets/models/bmw_m2-LICENSE.txt), [출처·해시·변경 내역](assets/models/bmw_m2-source.json) |
| CN7 아반떼 N 전기형 | [2022 Hyundai Elantra N — tonielpro520](https://sketchfab.com/3d-models/2022-hyundai-elantra-n-cd5741852515425aa3c058b7e081dd2c) | 원 게시물의 로그인 후 무료 GLB 다운로드 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), [크레딧](assets/models/avante_n-LICENSE.txt), [출처·해시·변경 내역](assets/models/avante_n-source.json) |
| GR86 ZN8 | [Toyota GR86 (ZN8) — Mona x Supercars](https://sketchfab.com/3d-models/toyota-gr86-zn8-4919d14eba9640599e838230e8e5ed74) | 원 게시물의 로그인 후 무료 GLB 및 업로드 원본 OBJ 패키지 다운로드 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), [크레딧](assets/models/gr86-LICENSE.txt), [출처·해시·변경 내역](assets/models/gr86-source.json) |
| K5 3세대 페이스리프트 | [Kia K5 2025 — zapkolenko07](https://sketchfab.com/3d-models/kia-k5-2025-0ed1b1fb1a074a42849076b96a15ce9f) | 원 게시물의 로그인 후 무료 GLB 다운로드 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), 원본 내 저작자·라이선스·URL 일치 확인 |

여섯 모델에는 위 출처의 크레딧을 유지하며 WebSim은 기하 단순화, 좌표 변환, 크기 조정, 표시 재질 보정과 소프트웨어 렌더러용 경량 메시를 적용했다. 해당 모델을 렌더링한 사이드바 미리보기도 파생 이미지이며, 모델과 파생 메시·이미지에는 동일한 저작자 표시와 CC BY 4.0 링크가 적용된다. 제조사나 제작자의 후원·승인을 뜻하지 않는다.

BMW M2는 제작자가 Maya로 모델링하고 Substance Painter로 텍스처를 제작했다고 밝힌 원본이다. 이번에는 기존 축소 미러 대신 원 게시물에서 로그인 후 정상 다운로드한 약 67.8만 삼각형 GLB를 재변환했다. 1K·4K 다운로드의 기하가 같음을 확인했고 원본의 199,724개 차체 삼각형을 보존했다. 원본의 약 18.5°로 꺾인 앞바퀴는 직진 자세로 되돌렸으며 브레이크 캘리퍼를 제외한 네 휠을 회전시킨다. 전기형 F87의 차체·범퍼·램프를 사용하고, 차체 스트라이프 재질은 실제 출고색 4종(Alpine White, Long Beach Blue Metallic, Black Sapphire Metallic, Mineral Grey Metallic)으로 바꿀 수 있다. 배지·유리·램프·그릴의 원본 텍스처는 보존한다. 색상명·코드는 BMW 자료 기준이며 화면 RGB·펄·반사 재질은 렌더링 근사값이다. 주행은 2016 유럽 사양의 일반 M2 370 PS, 6MT·7DCT를 적용하며 M2 Competition의 엔진이나 외형으로 표시하지 않는다.

CN7 아반떼 N은 전기형의 N 전용 범퍼·스포일러·원형 듀얼 배기구를 갖춘 커뮤니티 모델이다. 흰 차체와 빨간 장식을 보존했으며 해외 ELANTRA 표기·번호판 등의 차이가 있다. 국내 2021 출시형 2.0T의 6MT·8DCT를 같은 외형으로 비교한다. 원본은 로그인 후 정상 다운로드로 취득했으며, 배포된 실행 모델을 이용할 때는 로그인이 필요하지 않다.

GR86은 2세대 ZN8 커뮤니티 외형이며 일본 초기형 순정색 7종과 해당 펄·메탈릭 표현을 선택할 수 있다. 차체 도장 재질만 바꾸며 색상 RGB와 반사·펄 강도는 근사값이다. 원본에 ADVAN Racing RS 휠과 Kazutoshi Mods 표기가 있어 해당 크레딧과 이미지를 보존한다. 제조사 순정 RZ 휠과는 차이가 있으며 게시자 단독 제작이라고 단정하지 않는다. 업로드 원본 OBJ는 Roblox Studio에서 내보낸 파일이며 별도 제한 문서나 다른 원작 URL은 없었다. 이 내보내기 도구명만으로 다른 게임에서 추출한 모델이라고 판단하지 않는다. 주행 사양은 일본 2022 RZ 235 PS의 6MT·6AT를 사용하고 국내 231 PS 사양과 섞지 않는다.

K5는 실제 GLB의 앞·뒤·측면을 확인해 페이스리프트의 세로로 꺾이는 전면 DRL, 내려가는 양끝 후미등과 변경된 범퍼가 입체 부품으로 존재함을 확인했다. 제목만 2025인 다른 구형 K5 후보와 구별한다. 게시자의 특정 국내 트림·세부 연식 보증은 아니다. 주행 제원은 [출고 조합](VARIANTS.md)의 엔진별 사양을 사용하며 미국형 GT를 포함한 개별 트림의 범퍼·휠 차이까지 별도로 재현하지는 않는다. [크레딧](assets/models/k5-LICENSE.txt)과 [출처·변경 내역](assets/models/k5-source.json)을 함께 제공한다.

모델 원본은 제작자가 정밀 측량·정확한 연식·모든 트림을 보증한 자료가 아니다. [추가 차량 제원 문서](ADDITIONAL-VEHICLES.md)에 외형과 주행 사양의 적용 범위, 제조사 제원과 모형 성능을 구분했다. G70의 네 가지 출고 사양은 같은 전기형 외관을 사용한다. 수프라는 3.0T 단일 트림이고, M2는 같은 외형으로 6MT·7DCT를 비교한다. WebGL이 없으면 동일 원본에서 만든 경량 메시를 사용하며, 파일 자체를 읽지 못한 경우 다른 차종의 외관을 대신 표시하지 않는다.

M340i는 계정 없이 취득할 수 있고 원본 크레딧까지 확인되는 배포본을 확보하지 못해 포함하지 않았다. IONIQ 5 N·EV6 GT 후보는 현재 공개 저장소에 실행용 모델을 배포하는 조건을 충족하는지 확인되지 않았거나 정확한 고성능 트림과 달라 포함하지 않았다. 이 판단은 해당 차종의 모든 무료 모델을 사용할 수 없다는 의미가 아니다.

2026-10-19에 다시 확인한 다운로드 가능 후보와 보류 사유는 다음과 같다. 다운로드 버튼이 있다는 사실과 원본 권리까지 확인한 것은 구분한다.

| 추가 후보 | 확인한 파일·현재 표시 | 보류 이유 |
| --- | --- | --- |
| [718 Spyder RS — Mona](https://sketchfab.com/3d-models/porsche-718-boxster-spyder-rs-1a87f610bb854c6395ed8b03ba8e1965) | 무료 CC BY 표시. 정상 다운로드한 원본 GLB에는 [Ddiaz의 다른 원작](https://sketchfab.com/3d-models/2024-porsche-718-spyder-rs-2c4a64ebf4ba4da29b119f6e3ac7b1fa)이 기록됨 | 원작 페이지는 CSR2 기반을 명시하며 현재 CC BY-NC-SA로 표시한다. 원게임 재배포 권한까지 확인되지 않아 공개 실행 파일에 포함하지 않음 |
| [IONIQ 5 N — Ddiaz](https://sketchfab.com/3d-models/2024-hyundai-ioniq-5-n-8d16325eb7974a948627b3cd77f30f52), [007 / tangwang920](https://sketchfab.com/3d-models/2024-hyundai-ioniq-5-n-2e62fa6cd7814178acf49df42bb4ff24), [teacherap123](https://sketchfab.com/3d-models/2024-hyundai-ioniq-5-n-dcaae227113f4dc6bfc1a5b9e19a39db) | 2026-10-19 공개 API 재확인: 세 게시물 모두 무료 다운로드 가능. Ddiaz는 CC BY-NC 4.0, 나머지 둘은 CC BY 4.0. 모두 295,430 triangles / 189,181 vertices | Ddiaz는 CSR2 기반을 명시한다. 후속 두 게시물에는 별도 제작·원출처 설명이 없고, 이번 재검색에서도 원게임 자료의 재배포 권한을 확인할 추가 근거를 찾지 못했다. 규모 일치만으로 동일 메시나 무단 게시라고 단정하지 않으며, NC 조건 자체를 제외 이유로 삼지 않음 |
| [IONIQ 5N — Alex Murias / Xlay3D](https://sketchfab.com/3d-models/hyundai-ioniq-5n-detailed-interior-82ee61155b3442449b7627f31c3510aa) | 2026-10-19 공개 API에서 다운로드 불가, 재배포 라이선스 미표시. 3,460,251 triangles. Blender 제작·상세 실내를 설명 | 이번에 다시 대조한 별도 후보지만 정상 무료 다운로드와 실행용 메시 재배포 조건을 충족하지 않음 |
| [IONIQ 5N EV — ackeenowaysome](https://sketchfab.com/3d-models/ioniq-5n-ev-a8cc81af86044ee0960b435a05ffd5f5) | 2026-10-19 공개 API에서 다운로드 불가, 재배포 라이선스 미표시. 246,481 triangles. Blender 3D 제작을 설명 | 새로 확인한 후보지만 현재 무료로 받을 수 없어 추가하지 않음. 실제 파일의 세부 외형은 미검증 |
| [IONIQ 5 N — Patricars](https://sketchfab.com/3d-models/hyundai-ioniq-5-n-fe745c40e34943f0b2035b2b800afb89) | 2026-10-19 공개 API에서 다운로드 불가, 재배포 라이선스 미표시. 295,302 triangles. 설명에서 외부 상품 페이지로 연결 | Sketchfab 정상 무료 다운로드 후보가 아니므로 이번 추가 범위에서 제외 |
| [EV6 GT — fishermans garage](https://sketchfab.com/3d-models/kia-ev6-gt-2022-for-3d-printing-a0cc3fda74ef47818b77a6e35a750e39) | 2026-10-19 공개 API에서 무료 다운로드 가능, CC BY-NC 4.0. 449,340 triangles, 단색 3D 프린팅용 STL. Ghost의 SketchUp 모델을 수리·변환했다고 명시 | 아래 Ghøst의 GT 게시물을 찾았지만 해당 원본과 STL의 정확한 동일성, 게시자의 변환 STL 재배포·CC BY-NC 적용 권한 연결은 아직 확인하지 못함. CC BY-NC의 비상업 수정·공유 허용이나 과거 개인용 요청 댓글만으로 허가 여부를 단정하지 않음 |
| [2022 Kia EV6 GT — Ghøst](https://3dwarehouse.sketchup.com/model/8e21c731-084c-460f-a733-42eced8b002a/2022-Kia-EV6-GT) | 2026-10-19 3D Warehouse 원 게시물 확인: 363,980 polygons, 25 MB, 31 materials. GT 전용 휠·앞 범퍼가 보이며 정상 다운로드는 Trimble 로그인을 요구 | 원본을 찾지 못했다는 이전 기록을 정정한다. [작성자 프로필](https://3dwarehouse.sketchup.com/user/u9da13335-caf8-472a-af19-c20647fd81cf/Gh%C3%B8st)은 허가 없는 재게시를 금지한다고 명시한다. 그 문구의 게시 시점과 fishermans에게 별도 허가했는지는 미확인 |
| [Kia Ev6 — MattDoesBlender](https://sketchfab.com/3d-models/kia-ev6-49eff30492bb4f8e875f378b41589c26) | 2026-10-19 공개 API에서 무료 다운로드 가능, CC BY 4.0. 578,384 triangles | 미리보기에서 정확한 GT 트림과 완전한 휠 외형을 확인하지 못해 가장 닮은 모델로 선정하지 않음. GT-Line이라고 단정하지 않음 |

EV6의 [3D Warehouse 약관](https://3dwarehouse.sketchup.com/tou#license) 1.B와 [공식 FAQ](https://help.sketchup.com/en/3d-warehouse/3d-warehouse-terms-use-faq)는 상당한 추가 콘텐츠를 가진 **Combined Work**의 제작·배포를 허용한다. 주행 로직·서킷·UI를 포함한 게임에 적용할 근거가 있으며, 공개 저장소에 실행용 자산이 있다는 사실만으로 독립 모델 재게시라고 판단하지 않는다. 다만 재라이선스와 독립 모델 배포 제한은 별개이므로 이 허용이 fishermans의 Sketchfab STL 배포·CC BY-NC 적용 권한까지 입증하지는 않는다. 이번 보류 사유는 게임 이용 자체의 금지가 아니라 해당 배포본의 권한 연결 미확인이다. 다른 무료 후보 중 제목·외형이 GT-Line인 모델은 제외했고, [iSteven의 정확한 GT](https://sketchfab.com/models/a4cc8826242744dbbe6a3f3c41fa5b55)는 다운로드 불가·외부 유료 상품이어서 제외했다.

## 기존 13종의 출처

2026-10-15 공개 배포 구성: 실행용 `*-runtime.js`, 생성 도구, 출처·보정 기록과 검사용 구조 정보는 저장소에 포함한다. 아래 표의 원본 GLB·ZIP·회전 사진·카탈로그와 대형 구성기 캐시는 제작용 로컬 자료로 보존하며 공개 배포 파일에는 포함하지 않는다. 원본 재생성에는 출처 기록에 따른 해당 자료의 별도 취득이 필요하다.

현재 18종의 외형은 **제조사 공개 구성기의 실제 3D 메시 5종**, **기아 딜러 캠페인의 실제 3D 메시 1종**, **CC BY 커뮤니티 메시 6종**, **공식 회전 사진에서 재구성한 3D 메시 5종**, **공식 도면·사진을 기준으로 곡면을 제작한 포터 II 1종**으로 구분한다. K5는 기존 사진 재구성에서 커뮤니티 메시로 교체했다.

- 제조사 메시: G80, 아이오닉 5, 싼타페, 스타리아, 카니발.
- 딜러 공개 메시: 모닝에 사용하는 유럽형 2024 Picanto 캠페인 기본 구성.
- 사진 재구성: 아반떼, 그랜저, 레이, 토레스, 무쏘 EV.
- 도면·사진 참조 곡면 제작: 포터 II. 공식 정면·측면·후면 치수도와 여러 외관 사진을 기준으로 만든 곡면에 보정한 사진 UV를 적용한다. 회전 사진의 실루엣 교차로 재구성한 5종과 방법을 구별한다.

원본 구성기 메시의 제작 공정이 CAD인지 스캔인지는 확인하지 않았으므로 CAD 원본·실측 스캔·제조 정밀도라고 표시하지 않는다. 실행용 모델에는 성능을 위한 단순화, 제원에 맞춘 크기 조정, 화면용 재질·조명을 적용한다. 사진 재구성의 보이지 않는 지붕·차체 하부·적재함 안쪽은 추정한 형상이다. WebGL을 사용할 수 없거나 해당 모델을 불러오지 못하면 사진·제원을 참조해 직접 제작한 대체 메시가 표시되며, 출처 표시도 실제 렌더링 방식에 맞춰 바뀐다.

## 현재 적용한 제조사 3D 메시

| 차종 / 선택 구성 | 공개 제품 페이지와 구성기 | 보존한 원본 / 실행 파일 |
|---|---|---|
| Genesis G80 2.5T Advanced AWD | [Genesis Canada 제품 페이지](https://www.genesisinteractive.ca/en/visualizer/my26/g80/25t-advanced-awd), 제품 페이지가 연결한 [PlayCanvas 구성기](https://playcanv.as/e/p/ignV6Ejt) | `assets/models/g80/`의 차체 구성 GLB 11개와 `logos.glb`, `config.json`, `scene.json`, 활성 부품 연결 정보 `assembly.json` / `g80-runtime.js` |
| Hyundai IONIQ 5 기본 외관 | [Hyundai Australia 제품 페이지](https://www.hyundai.com/au/en/cars/eco/ioniq5) | `assets/models/ioniq5/IONIQ5-7.glb`, `config.json` / `ioniq5-runtime.js` |
| Hyundai SANTA FE 외관·사양별 휠 | [Hyundai Australia 제품 페이지](https://www.hyundai.com/au/en/cars/suvs/santa-fe) | `assets/models/santafe/SantaFe-2.glb`, `config.json` / `santafe-runtime.js`; 21인치 사양은 원본 ICE Calligraphy 휠 사용 |
| Hyundai STARIA Lounge Hybrid 외관 | [Hyundai Australia 제품 페이지](https://www.hyundai.com/au/en/cars/people-movers-and-commercial/staria) | `assets/models/staria/STARIA_SPINNER_06122026.glb`, `config.json` / `staria-runtime.js` |
| Kia Carnival KA4 인도형 Limousine 외관 | [Kia India 제품 페이지](https://www.kia.com/in/our-vehicles/carnival/showroom.html), [공개 VR 쇼룸](https://www.kia.com/in/vr/showroom/index.html) | `assets/models/carnival/`의 `config.zip`, `config.json`, `scene.json`, `KA4-1115-model.zip`, `model.json`, 원본 텍스처 / `carnival-runtime.js` |

원본의 정확한 다운로드 URL, 크기, SHA-256은 기존 4종의 `assets/models/SOURCES.json`과 기아 추가 모델의 `assets/models/kia-sources.json`에 기록되어 있다. 제품 페이지가 일반 브라우저에 전달하는 공개 파일 경로를 사용했으며, 로그인·유료 다운로드 제한을 우회하지 않았다. **원본의 저작권은 제조사 및 원저작권자에게 있으며, 공개 접근이 가능하다는 사실을 오픈 라이선스나 외부 재배포 허가로 해석하지 않는다.** WebSim 실행용 변환 모델에 출처를 유지하며, 원본 자료의 별도 재배포 허가를 확보했다고 주장하지 않는다.

G80 제품 페이지 경로는 `my26`, 연결된 구성기 제목은 `G80_2.5T Advanced AWD_2027`이다. 현대 세 차종은 호주 시장의 공개 구성을, 카니발은 인도 시장의 KA4 페이스리프트 Limousine 외관과 원본 18인치 휠을 사용한다. 수출 시장 트림·휠·배지가 국내 사양과 일부 다를 수 있으며, 하나의 외형을 동일 차종의 여러 엔진·구동 사양에 공통으로 사용한다. 메시 외형의 트림과 시뮬레이션의 성능 사양을 동일한 원본 데이터라고 주장하지 않는다.

보존 구조와 재생성 방법: [제조사 모델 안내](assets/models/README.md). 캐시 검증은 `node evolving_vehicles_2/assets/models/acquire-models.cjs`로 실행한다.

싼타페 2.5 터보 캘리그래피의 21인치 사양은 원본 `VARIANTGROUPACCS_wheels.002`에서 분리한 32개 부품을 사용한다. [국내 가격표](https://www.hyundai.com/kr/ko/e/vehicles/santafe/price)의 캘리그래피 전용 21인치·피렐리 구성을 대조했으며, 다른 기본 휠 구성과 구별한다. 변환 도구와 부품 기록은 `assets/models/build-wheel-variants.mjs`, `santafe-wheel-variants.json`이다.

## 딜러 공개 3D 메시와 사진 재구성

모닝의 옆 창문 프레임·B필러는 원본 차체 부품 중 9,416개 삼각형의 재질만 차체색으로 변경했다. 유리·거울·하부 내장과 원본 좌표는 보존한다. 변환 도구는 `assets/models/refine-morning-frames.mjs`다.

모닝은 [Edenauto Kia의 2024 Picanto 캠페인](https://www.meta-sense.fr/en/nos-projets/kia-x-edenauto)을 위해 Metasense가 공개한 [3D 구성기](https://kia-picanto-2024.meta-sense.fr/)의 원본 `models/picanto.glb`를 사용한다. 제조사가 직접 배포한 메시로 표시하지 않는다. 원본은 `assets/models/morning/picanto.glb`이며, 원본 파일에는 GT-Line·Baseline 이름의 부품이 혼재하며 정확한 판매 트림은 미확인이다. 유럽형 휠·배지 등은 국내 모닝과 다를 수 있다. 문이 닫힌 초기 애니메이션 자세를 적용하고, 불투명 유리 뒤에 가려진 `Int_` 실내 메시만 제거했다. 실행 파일은 `morning-runtime.js`이며 원본 출처·해시는 `kia-sources.json`에 있다.

사진 재구성은 여러 공식 회전 사진의 실루엣과 실제 축거·바퀴 위치를 맞춰 3D 부피를 만들고 원본 사진을 표면에 투영한 방식이다. 단일 사진을 평면에 붙인 모델과 다르지만, 원본 제조사 메시나 정밀 실측 결과는 아니다. 카메라 보정 오차는 관측한 휠 중심의 영상 투영 오차이며 차체 모든 점의 정확도를 뜻하지 않는다.

| 차종 | 원본 사진 / 재구성 기록 | 실행 파일 |
|---|---|---|
| 아반떼·그랜저 | `assets/models/{avante,grandeur}/turntable/`, `hyundai-additions-sources.json`, 각 `calibration.json`; 공식 60장 회전 사진 | `avante-runtime.js`, `grandeur-runtime.js` |
| 레이 | `assets/reference/turntable/ray/SOURCES.json`; 공식 회전 사진 24장 | `ray-runtime.js` |
| 토레스·무쏘 EV | `assets/reference/turntable/{torres,musso_ev}/sources.json`, 각 모델의 `calibration.json`; 공식 회전 사진 36장 | `torres-runtime.js`, `musso_ev-runtime.js` |

사진 원본의 권리 역시 제조사 및 원저작권자에게 있다. 사진 재구성을 했다는 사실이 원본 사진·파생 모델의 외부 재배포 라이선스 확보를 뜻하지 않는다. 기존 K5 사진 재구성 자료는 `assets/reference/turntable/k5/SOURCES.json`과 `assets/models/k5/calibration.json`에 남아 있지만 현재 실행 외형은 위의 실제 메시다. 나머지 차량의 해외 구성기와 무료 모델도 조사했으며 결과는 아래와 같다. 조사 범위 내 미확보를 모든 출처에 메시가 없다는 뜻으로 단정하지 않는다.

### 사진 기반 7종의 실제 모델 파일 재검토 — 2026-10-19

정상 다운로드 버튼으로 받은 원본은 로컬 검증 자료로 보관하며, 아래의 보류 파일은 실행 모델이나 공개 원본으로 배포하지 않는다. Sketchfab 표기 라이선스와 원본 내 크레딧을 대조하고 실제 형상을 확인했다.

| 대상 | 실제 파일·후보와 판정 |
| --- | --- |
| K5 현행 페이스리프트 | 위 zapkolenko07 GLB 17,835,388 bytes를 정상 취득했다. 88 mesh, 345,765 triangles이며 내부 저작자·CC BY 4.0·URL이 일치한다. 실제 앞뒤 램프와 범퍼가 현행 FL과 맞아 교체에 사용한다. [UZBEK 3D의 다른 2025 후보](https://sketchfab.com/3d-models/kia-k5-2025-1fa025db826442f18db0401757f5695a)는 미리보기의 전기형 후미등·쿼드 배기 형상이 달라 제외했다. |
| 그랜저 | 현재 재구성은 현대 `the-new-grandeur` 페이지의 GN11 코드 사진을 사용한다. GN7 명칭의 [2023 유료 모델](https://www.cgtrader.com/3d-models/car/car/hyundai-grandeur-2023)도 찾았지만 취득하지 않아 실제 파일을 대조하지 못했다. 이번 범위에서 현재 외관의 정상 무료 다운로드 메시를 확보하지 못했다. |
| 일반 아반떼 | 현재 사진 원형은 현대 FN01 `the-all-new-avante`이며 기존 CN7 N과 구별한다. [SQUIR의 Hyundai Avante 2027](https://www.cgtrader.com/3d-models/car/car/hyundai-avante-2027)은 유료 $159 상품으로 확인해 구매·취득하지 않았다. 이번 범위에서 맞는 무료 파일을 확보하지 못했다. |
| 레이 | [Kia Ray — karaman.arman](https://sketchfab.com/3d-models/kia-ray-7287b8a91bf747be8869714c114b0a42)의 무료 CC BY 4.0 GLB 55,927,340 bytes를 취득했고 내부 크레딧이 일치한다. 실제 외관은 타원형 KIA 배지·둥근 램프의 초기형이라 현재 사각 램프 페이스리프트를 대체하지 않는다. |
| 토레스 | [Ssangyong Torres 2023 — Nieve5677](https://sketchfab.com/3d-models/ssangyong-torres-2023-64ec9054a55540f6bb8be76237e56eb7)의 GLB 58,359,940 bytes와 업로드 원본 ZIP을 정상 취득했다. 표시는 CC BY 4.0이지만 원본 FBX·GLB 부품명에 `desirefx.me`가 반복되고 원본 ZIP에는 이를 해소할 출처·허가 문서가 없다. [별도 상용 모델](https://3dmodels.org/3d-models/ssangyong-torres-2023/)도 존재하므로 게시자의 재배포 권한을 확인하지 못한 상태로 보류한다. 파일 규모나 이름만으로 무단 게시라고 확정하지 않는다. |
| 무쏘 EV | [remendyjely의 정확한 EV 후보](https://www.cgtrader.com/3d-models/car/suv/ssang-yong-kgm-musso-ev)는 유료 $260 상품으로 확인했으며 구매·취득하지 않았다. 디젤 Musso나 AI 생성의 다른 외관을 대체품으로 사용하지 않는다. |
| 포터 II | [Hyundai - Pother II, Bongo III — yunho98](https://sketchfab.com/3d-models/hyundai-pother-ii-bongo-iii-3869c5bc8dff40ad97ee165ba31e0ee1)의 무료 CC BY 4.0 GLB 2,176,224 bytes를 정상 취득했다. 9,006 triangles이며 내장 크레딧이 일치하지만 구형 전면·탑차 적재함이라 현재 LPG 초장축 슈퍼캡 평판 모델에 사용하지 않는다. |

검증 원본의 SHA-256·내장 메타데이터·앞뒤 렌더는 로컬 `output/actual-mesh-qa/`에 보관한다. 유료 파일을 구매하거나 로그인·접근 제한을 우회하지 않았다. 맞는 무료 파일을 찾지 못한 차종을 다른 세대로 바꾸지 않았다.

그랜저·일반 아반떼·레이에는 고정 사진 마스크로 차체 음영을 제거하는 보정도 검토했지만 배포하지 않았다. 원래의 문 틈·캐릭터 라인이 함께 사라지거나, 재구성 표면의 요철과 좌우 문손잡이 비대칭으로 사진 경계가 드러나 원본보다 확실히 나은 결과를 얻지 못했다. 이 세 차종과 정확한 무료 메시를 확보하지 못한 무쏘 EV는 기존 사진 재구성을 유지한다. 검토용 마스크·보정 런타임·비교 이미지는 로컬 `output/model-finish-qa/`에만 보관한다.

## 포터 II 공식 도면·사진 참조 모델

[현대 국내 공식 제품 페이지](https://www.hyundai.com/kr/ko/e/vehicles/porter2/intro)의 26MY 콘텐츠와 [공식 영문 카탈로그](https://www.hyundai.com/content/dam/hyundai/kr/ko/data/vehicles/catalog/en/porter2-catalog-eng.pdf)를 추가 조사해 정면·측면·후면 치수도, 전면과 측면의 사선 사진, 헤드램프·범퍼가드·적재함 상세 사진을 확보했다. 이전 조사에서 남긴 “한 방향만 제공”이라는 설명은 이 추가 자료를 반영하지 못한 것이므로 정정한다. 국내 공식 원본 21개와 정확한 URL·크기·SHA-256은 `assets/reference/porter-refinement/SOURCES.json`에 있다. 함께 보존한 해외 H100 조사 HTML은 수출형 비교 자료이며 국내 모델의 원본 메시나 동일 사양의 근거로 사용하지 않는다.

선택한 외형은 **국내 LPG 초장축 슈퍼캡 2WD·범퍼가드**다. 카탈로그 11쪽의 전장 5,155mm, 전폭 1,740mm, 전고 1,970mm, 축거 2,640mm와 적재함 2,860 × 1,630 × 355mm를 사용한다. 전륜 단륜·후륜 복륜 구성도 구별한다. 전기차의 2,810mm 축거와 다른 H100 수출형 치수를 섞지 않는다. 제원 전사와 사진에서 추정한 부분 치수는 `MEASUREMENTS.json`에 별도로 기록했다.

실행 파일은 `assets/models/porter2-runtime.js`, 생성 도구는 `build-porter-model.mjs`, 곡면 정의는 `hyundai-refined.js`, 사진 보정값과 메시 기록은 `assets/models/porter2/{calibration,inspection}.json`이다. 출처 종류는 `photo-reference`, 화면 표시는 **“현대 공식 도면·사진 기반 정밀 제작”**이다. 차체 곡면을 직접 구성하고 정면·측면·후면 사진을 UV로 보정해 입혔으며 제조사 CAD·실측 스캔·다각도 사진측량 결과는 아니다. 지붕, 하부, 적재함 안쪽은 추정이며 반대편 측면에는 확보한 측면 사진을 재사용한다. 위의 무료 탑차 GLB는 실제 취득했지만 선택한 전면·적재함 형식과 달라 교체하지 않았다. 이번 캡 보완은 기존 공식 도면 기반 곡면의 뒤쪽 모서리를 다듬고 도장과 사진 음영을 분리한 작업이다.

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
| [Kia K5 2025](https://sketchfab.com/3d-models/kia-k5-2025-1fa025db826442f18db0401757f5695a) | UZBEK 3D / @doniyorgroup, CC Attribution, 약 294.7k triangles | 2026-10-19 재검토에서 미리보기의 전기형 외관을 확인했다. 원본 미취득이며 현재 적용한 zapkolenko07의 페이스리프트 모델과 다른 게시물이다. |
| [Hyundai Ioniq 5 2022 Lowpoly](https://sketchfab.com/3d-models/hyundai-ioniq-5-lowpoly-675e78311e8440d88714bd212cb7a8fb) | andikapratamaw, CC Attribution, 약 12.4k triangles | 공식 다운로드 API가 인증을 요구하여 원본 파일 미획득. 현재 수록 실차의 연식과 외관 차이도 검토 필요. |
| [Genesis G80 2021](https://sketchfab.com/3d-models/genesis-g80-2021-8f74d7fbc7f64504a9a36f064ca78ada) | SQUIR3D, 유료 Royalty Free 상품, 약 760.2k triangles | 미구매/미다운로드. 현행 페이스리프트와 전면부 및 휠 차이 있음. |

이 후보들의 로그인 제한 우회, 유료 파일 추출, 출처 불명의 게임 리핑 파일은 사용하지 않았다. 현재 총 18종 중 제조사 메시는 5종, 딜러 공개 메시는 1종, CC BY 커뮤니티 메시는 6종, 사진 재구성은 5종, 도면·사진 참조 제작은 1종이다. 각 종류의 출처·라이선스를 구분하며 모든 차량의 원본 제조사 메시나 재배포 라이선스를 확보했다고 주장하지 않는다.
