# 차량 외형 원본과 사진 재구성

확보일: 2026-10-14. 이 디렉터리는 제조사 공개 구성기 메시 5종, 딜러 공개 캠페인 메시 1종, 공식 회전 사진 재구성 6종과 포터 II 공식 도면·사진 참조 곡면 모델의 원본·보정 기록과 실행 파일을 보관한다. 인증·유료 다운로드 제한을 우회하지 않았다. 원본 메시, 회전 사진 재구성, 포터 II의 도면·사진 참조 곡면 제작은 서로 구별한다.

**원본의 저작권은 제조사·캠페인 제작사 및 원저작권자에게 있다. 오픈소스 또는 재배포 허가를 주장하지 않는다.** WebSim 실행용 변환 모델에 출처를 유지하며, 외부 배포용 라이선스를 확보한 애셋으로 표시하지 않는다. 출처 URL, 파일 크기, SHA-256은 기존 4종의 `SOURCES.json`, 기아 추가 모델의 `kia-sources.json`, 현대 사진의 `hyundai-additions-sources.json` 및 각 회전 사진 폴더의 출처 파일에 기록되어 있다.

2026-10-15 공개본에는 실행 파일, 생성 도구와 작은 출처·보정·구조 정보만 포함한다. 아래 표의 원본 GLB·ZIP, 사진과 대형 구성기 캐시는 제작용 로컬 자료로 보존하며 Git에서 제외한다. 실행 화면과 회귀검사는 원본 바이너리 없이 동작한다. 현대 3종의 `*.glb.json`은 원본 GLB의 JSON 청크를 그대로 분리한 구조 정보로, 검사의 출고 구성·부품 선택 대조에 사용한다. 모델 재생성 명령에는 별도로 취득한 원본 자료가 필요하다.

| 모델 | 공개 출처 | 파일 |
|---|---|---|
| Genesis G80 2.5T Advanced AWD | [Genesis Canada](https://www.genesisinteractive.ca/en/visualizer/my26/g80/25t-advanced-awd)의 [공개 PlayCanvas 구성기](https://playcanv.as/e/p/ignV6Ejt) | `g80/`의 차체 구성 GLB 11개 및 `logos.glb`, 구성기 `config.json`, `scene.json` |
| Hyundai IONIQ 5 | [Hyundai Australia](https://www.hyundai.com/au/en/cars/eco/ioniq5) | `ioniq5/IONIQ5-7.glb`, `config.json` |
| Hyundai SANTA FE | [Hyundai Australia](https://www.hyundai.com/au/en/cars/suvs/santa-fe) | `santafe/SantaFe-2.glb`, `config.json` |
| Hyundai STARIA | [Hyundai Australia](https://www.hyundai.com/au/en/cars/people-movers-and-commercial/staria) | `staria/STARIA_SPINNER_06122026.glb`, `config.json` |
| Kia Carnival KA4 Limousine | [Kia India VR 쇼룸](https://www.kia.com/in/vr/showroom/index.html) | `carnival/model.json`, 원본 ZIP과 구성·씬·텍스처 캐시 |
| Kia Picanto 2024 캠페인 기본 구성 (딜러 캠페인) | [Edenauto Kia / Metasense](https://www.meta-sense.fr/en/nos-projets/kia-x-edenauto), [공개 구성기](https://kia-picanto-2024.meta-sense.fr/) | `morning/picanto.glb` |

구성기의 수출 시장 트림·휠·배지는 국내 사양과 일부 다를 수 있다. 외형 메시의 출처/트림을 유지하며, 시뮬레이션의 엔진·구동 방식·성능 데이터와 구별한다. G80 페이지 경로는 `my26`, 공개 구성기 제목은 `G80_2.5T Advanced AWD_2027`이다. 확인된 파일명을 그대로 보존했다. 카니발은 인도형 Limousine, 모닝은 정확한 판매 트림이 확인되지 않은 유럽형 Picanto 캠페인 원본을 사용하므로 국내 휠·배지 등과 차이가 있다. Picanto 메시의 제공자는 딜러 캠페인 제작사이며 제조사 직접 제공 자료로 표시하지 않는다.

## 가져오기 구조

- **G80:** 파일명에 Draco가 포함되어 있지만 실제 GLB는 압축 확장 없이 일반 glTF 2.0 인터리브 POSITION/NORMAL/인덱스를 담는다. 재질은 GLB 내부가 아니라 PlayCanvas 씬에 지정되어 있다. `assembly.json`은 실제 씬에서 활성화된 차량 렌더 인스턴스 65개만 추출한다. 각 `file`, `mesh`, `materials`, `matrix`를 사용한다. `matrix`는 열 우선(column-major) 월드 행렬이며, 여기에 GLB 노드 행렬을 다시 적용하면 안 된다. 쇼룸과 비활성 임시 박스는 제외했다. 원본 합계는 1,241,550개 삼각형이며 변환 스크립트에서 실행용 메시를 단순화한다.
- **G80 좌표:** 미터, Y 위, 전방 -X. 실제 정점 전체의 월드 범위는 `exactBounds`에 있다. 최저 Y는 -0.010192m, 최고 Y는 1.480774m, X는 -2.434806…2.581582m, Z는 -1.049852…1.063431m이다. 폭에는 미러가 포함된다.
- **Hyundai 세 모델:** Draco 압축과 PBR 재질을 포함한다. 원본은 여러 트림의 차체·휠을 동시에 담고 있으므로 모든 노드를 표시하면 중복 외형이 생긴다. `config.json`의 `options[].visibleObjs`를 `objectNames`로 실제 노드/그룹 이름에 대응시켜, 선택된 트림 그룹과 하위 메시만 표시한다. 이름 대응에는 구성기의 glTF 이름 정규화(예: `Object143.001` → `Object143001`)가 필요할 수 있다.
- **IONIQ 5 기본 사양:** `ExteriorBaseModel`, `STOCK_BODYKIT`, `STOCK_LIGHTS`, `STOCK_MIRROR`, `STOCK_ROOF`, `STOCK_WHEELS`, `STOCK_INTERIOR`를 표시한다. 다른 `VARIANTGROUP_*`와 `DYNAMIQ_LOGO`는 기본 사양에서 제외한다. 상위 `IONIQ`/`IONIQTRANSFORM`의 변환은 유지한다.
- **STARIA 라운지 외형:** `Staria Lounge Hybrid` 옵션이 기존 한국형 스타리아 라운지 참조와 가장 가깝다. 일반 디젤의 범퍼/램프와 섞지 않는다.

- **Carnival:** Kia India VR 쇼룸의 활성 `exterior6` 씬에 들어 있는 PlayCanvas JSON 모델이다. 공개 `.json.bin` 파일은 일반 ZIP이므로 정상 압축 해제해 원본 JSON과 함께 보존했다. 활성 차량 엔티티·노드 행렬과 재질 대응을 적용하고 그림자 평면·도우미만 제외한다. 앞은 원본 -X, 위는 Y다.
- **Picanto:** glTF 2.0 원본의 활성 씬과 `00_OPEN` 애니메이션 0초 자세를 사용해 문을 닫는다. 앞은 원본 -Z, 위는 Y다. 원본 텍스처의 알파값이 있더라도 glTF 재질이 OPAQUE이면 불투명하게 표시한다. 불투명 외관 유리 뒤에 가려진 `Int_` 실내 메시만 제외해 실행용을 262,394개 삼각형으로 줄였다.

`inspection.json`과 `*.glb.json`은 구조 확인용 파생 정보이며 실행용 메시가 아니다. 실행용 변환 결과의 정확도와 재질·조명은 실제 화면에서 따로 검증해야 한다.

## 실행용 모델 재생성

저장소 루트에서 실행한다. 변환 도구는 `output/model-tools/`에 설치하며, 실행 화면에는 Node.js나 변환 도구가 필요하지 않다.

```powershell
npm install --prefix output/model-tools @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions draco3dgltf meshoptimizer gl-matrix
node evolving_vehicles_2/assets/models/acquire-models.cjs
node evolving_vehicles_2/assets/models/build-models.mjs
node evolving_vehicles_2/assets/models/build-extra-models.mjs
node evolving_vehicles_2/assets/models/build-kia-models.mjs
```

- `build-models.mjs`: 활성 G80 부품 연결 정보와 IONIQ 5 기본 구성을 사용해 `g80-runtime.js`, `ioniq5-runtime.js`를 생성한다.
- `build-extra-models.mjs`: SANTA FE 기본 사양과 STARIA 라운지 하이브리드 구성만 선택해 `santafe-runtime.js`, `staria-runtime.js`를 생성한다. 정점·인덱스 유효성, 실차 치수 범위, 지면 높이, 전방 램프 +X / 후방 차체 -X 방향을 검사한다.
- `build-kia-models.mjs`: 보존한 Kia India Carnival PlayCanvas 원본과 Edenauto/Metasense Picanto GLB로 `carnival-runtime.js`, `morning-runtime.js`를 생성한다. 텍스처는 중복을 제거하고 `textureIndex`로 참조한다.
- `*-runtime-summary.json`: 실행 파일의 구성·삼각형 수·범위와 부품 메타데이터를 기록한다. 추가 모델의 요약에는 선택 그룹과 수치 검증 결과도 포함된다.

실행 파일은 **JSON을 gzip으로 압축한 뒤 base64로 담아 `ManufacturerModels.registerCompressed(...)`를 호출**한다. JSON에는 정점·법선·UV·인덱스, 재질 정보와 필요한 내장 텍스처가 들어 있다. `manufacturer-models.js`가 브라우저의 `DecompressionStream('gzip')`으로 복원한 뒤 레지스트리에 등록한다. 차종별 `ManufacturerModels.load(id)`로 필요한 실행 파일을 읽고 완료를 기다리며, 모든 모델을 초기 화면에서 한꺼번에 풀지 않는다. 원본 GLB나 원격 텍스처를 실행 중에 다시 요청하지 않으며 로컬 `file://`에서도 동작한다.

사진 재구성과 도면 참조 제작의 실행 데이터도 같은 압축 형식을 사용한다. 회전 사진 재구성 6종의 정점은 보정된 여러 사진의 실루엣 교차로 만든 3D 부피이고, `photoProjection`은 원본 카메라 위치·투영 파라미터와 내장 JPEG를 담는다. `photoProjected` 표면은 시점에 가까운 사진을 투영·보간하며, `photoCameraIndex`가 지정된 보닛·유리·데크 등의 면은 지정한 원본 카메라에 고정해 투영한다. 사진에서 관측되지 않은 지붕 등은 별도의 추정 표면을 사용한다. 포터 II는 아래의 별도 곡면 제작·고정 사진 UV 방식을 사용한다. 원본 사진은 수정하지 않고 보존한다.

재구성 도구는 Python의 numpy, scipy, scikit-image, Pillow를 사용하며 저장소 루트에서 실행한다. 도구는 `output/model-python`의 설치 패키지 또는 일반 Python 환경을 사용할 수 있다.

```powershell
python evolving_vehicles_2/assets/models/reconstruct-hyundai.py
python evolving_vehicles_2/assets/models/reconstruct-k5.py
python evolving_vehicles_2/assets/models/reconstruct-ray.py
python evolving_vehicles_2/build-kgm-reconstruction.py
```

- 현대 스크립트는 아반떼·그랜저의 공식 60장 사진과 휠 중심 보정 기록을 사용한다.
- K5 스크립트는 `assets/reference/turntable/k5/`의 24장을 사용하며 `--calibrate-only`로 보정 결과만 다시 계산할 수 있다.
- KGM 스크립트는 토레스·무쏘 EV의 공식 36장 사진과 보정 기록을 사용한다. 토레스 EVX나 디젤 무쏘의 다른 차체로 대체하지 않는다.
- Ray 재구성 스크립트는 `assets/models/reconstruct-ray.py`이며 공식 24장 사진을 사용한다.
- 사진 재구성은 제조사 CAD를 확보한 것이 아니다. 지붕, 하부와 가려진 적재함 등의 형상 및 사진 사이의 표면은 추정이 포함되며, 확대할수록 사진 해상도·실루엣 보정의 한계가 드러날 수 있다.

## 포터 II 곡면 모델 재생성

포터 II는 [현대 국내 제품 페이지](https://www.hyundai.com/kr/ko/e/vehicles/porter2/intro)와 공식 카탈로그의 정면·측면·후면 치수도 및 26MY 외관 사진을 사용한다. `../reference/porter-refinement/SOURCES.json`에 국내 공식 원본 21개와 조사 페이지의 URL·크기·해시, `MEASUREMENTS.json`에 선택 사양의 치수와 별도로 표시한 영상 추정치를 보존한다. 공식 참조가 한 방향뿐이라는 이전 설명을 정정한다. 해외 H100 조사 페이지는 국내 차체·트림과 동일하다고 확인된 자료가 아니며 이 모델의 치수 근거로 사용하지 않는다.

```powershell
node evolving_vehicles_2/build-porter-model.mjs
```

생성 도구는 `../../hyundai-refined.js`에 직접 정의한 차체 곡면과 공식 정·측·후면 사진의 고정 UV 보정을 사용해 `porter2-runtime.js`를 만든다. 보정값과 한계는 `porter2/calibration.json`, 메시 구성 기록은 `porter2/inspection.json`에 기록한다. `source.kind`는 `photo-reference`, 표시는 “현대 공식 도면·사진 기반 정밀 제작”이며 원본 제조사 메시나 회전 사진의 다각도 사진측량 결과로 표시하지 않는다. 국내 LPG 초장축 슈퍼캡 2WD·범퍼가드의 5,155 × 1,740 × 1,970mm, 축거 2,640mm와 단륜 앞바퀴·복륜 뒷바퀴를 기준으로 한다. 지붕·하부·적재함 안쪽은 추정하며 반대편 측면에는 확보한 측면 사진을 재사용한다. 공개 3D 후보는 인증 요구 또는 유료 조건 등으로 원본을 확보하지 못했고, 정상 취득한 원본 포터 메시가 있다고 주장하지 않는다.

재질·유리·조명은 시뮬레이터 렌더러에 맞게 변환하며 원래 구성기의 렌더링 결과와 완전히 같다는 뜻은 아니다. 기본 창문은 외형 확인을 위해 짙은 유리로 표현하고, 램프 덮개는 필요한 투명도를 유지한다. 자세한 현재 적용 차종과 사진 기반 대체 모델의 구분은 [전체 모델 출처](../../MODEL-SOURCES.md)에 있다.

`acquire-models.cjs`의 기본 동작은 보존 원본의 해시 검증이다. 누락된 파일을 공개 원본 URL에서 다시 받으려면 `--download`를 추가한다. 원격 파일의 크기나 해시가 바뀌면 자동으로 덮어쓰지 않고 중단하므로 원본 변경 내용을 먼저 검토한다.

## BMW M2 공개 커뮤니티 모델

BMW M2 F87은 Manuel Contento의 CC BY 4.0 모델이다. `bmw_m2-source.json`에 고정된 공개 GitHub 다운로드 URL, SHA-256과 미러의 기존 가공 내역을 보존한다. 별도 로그인이나 제작자 요청 없이 취득한 파일이며 위 제조사 구성기 원본과 라이선스를 구분한다. 크레딧은 `bmw_m2-LICENSE.txt`를 유지한다.

원본을 `output/new-car-candidates/bmw-m2/bmw-m2-source.glb`에 저장한 뒤 저장소 루트에서 `node evolving_vehicles_2/assets/models/build-free-bmw-m2.mjs`를 실행한다. 다른 경로는 마지막 인자로 전달할 수 있다. 빌더는 입력 SHA를 검증하고 파일을 자동 다운로드하거나 덮어쓰지 않는다. 기존 변환 도구 의존성에 `sharp`가 필요하며 Meshopt decoder를 사용한다.

실행 파일에는 촬영용 바닥을 제외한 차량의 228,676개 삼각형과 6개 원본 base-color 텍스처를 보존한다. 차체 두 파트만 스트라이프 텍스처 연결을 제거하고 출고색 Long Beach Blue Metallic(C16)의 고정 근사색을 적용했다. 배지·유리·램프·그릴·휠의 재질은 유지한다. 별도 6,658삼각형 경량 메시는 Canvas 및 멀리 있는 차량에 사용하며 텍스처 대신 표본 평균색을 사용한다. 생성 파일의 줄바꿈은 LF로 고정해 플랫폼별 파일 크기·출처 검사가 일치하도록 한다. 원본과 공식 비교 사진은 공개 실행 파일에 추가로 복제하지 않는다.

## 아반떼 N CN7 공개 커뮤니티 모델

CN7 전기형 N은 tonielpro520의 `2022 Hyundai Elantra N` CC BY 4.0 모델을 사용한다. 정상 Sketchfab 로그인 후 받은 GLB의 내장 출처·저자·라이선스를 게시 정보와 대조했다. `avante_n-source.json`에 원본 페이지, 파일 크기와 SHA-256, 실제 변환 내용을 기록하고 `avante_n-LICENSE.txt`에 크레딧을 보존한다. 해외 ELANTRA 표기·번호판·램프 등은 원본을 유지하며 국내 외형과 완전히 일치한다고 표시하지 않는다.

원본을 `output/cn7-n/source.glb`에 저장한 뒤 저장소 루트에서 `node evolving_vehicles_2/assets/models/build-free-avante-n.mjs`를 실행한다. 다른 원본 경로는 마지막 인자로 전달한다. 빌더는 SHA-256을 검증하며 원본을 자동 다운로드하지 않는다. 의존성은 위 변환 도구와 같고 Meshopt를 사용한다.

실행용 모델은 원본 169개 부품을 변환에 포함하고 25개 재질을 유지하면서 500,248개 삼각형을 214,650개로 줄였다. Canvas 및 원거리 표시에는 별도 26,757삼각형 메시를 사용한다. 원본 Ceramic White 차체·빨간 N 장식·배지·스포일러·실내·바퀴를 보존하고 유일한 번호판 JPEG를 그대로 내장한다. 압축 실행 파일은 약 8.48 MiB이며 실제 실행 시에는 Sketchfab 로그인이나 원격 모델 요청이 필요 없다. 휠은 기존 차량 표시 방식과 같이 정적인 형상을 사용한다.

## Toyota GR86 ZN8 공개 커뮤니티 모델

GR86은 Mona x Supercars (Car2022)가 CC BY 4.0으로 공개한 모델이다. 정상 다운로드한 GLB의 출처·저자·라이선스와 업로드 원본 OBJ/MTL/PNG 묶음을 확인했다. 원본 휠 이미지의 추가 크레딧인 Kazutoshi Mods도 유지하며, 업로더의 단독 제작물이라고 단정하지 않는다. 출처 검토 내용과 해시는 `gr86-source.json`, 크레딧과 변경 사항은 `gr86-LICENSE.txt`에 있다.

원본을 `output/gr86/source.glb`에 저장한 뒤 저장소 루트에서 `node evolving_vehicles_2/assets/models/build-free-gr86.mjs`를 실행한다. 다른 원본 경로는 마지막 인자로 전달한다. 빌더는 SHA-256을 확인하며 원본을 자동 다운로드하지 않는다. 의존성은 위 변환 도구와 같다.

실행용은 166,674삼각형, Canvas 및 원거리용은 35,434삼각형이다. 메인 차체의 불투명 도장 면은 원본 삼각형을 그대로 유지하고, 다른 부품은 법선·UV를 고려해 단순화했다. 경량 외장도 패널 경계와 보닛의 밀착된 안팎 면을 보존해 틈이나 관통을 줄였다. 원본 앞뒤 타이어의 높이 차이는 차체 전체를 약 0.624° 회전해 수평으로 맞췄다. 붉은 차체·배지·실내와 원본 PNG 14개를 유지하며 반복 UV를 지원한다. 압축 실행 파일은 9,035,121바이트이고 Sketchfab 로그인 없이 로컬 애셋만으로 표시된다. 원본의 ADVAN Racing RS 휠은 일본 RZ 출고 휠과 다르며, 차체 모델의 외형과 일본 2022 RZ 6MT·6AT의 성능 제원을 구별한다.
