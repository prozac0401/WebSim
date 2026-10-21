# 파워트레인·변속 모형의 근거와 범위

확인일: 2026-10-21. `powertrain-profiles.js`는 물리 엔진과 계기판이 공유하는 변속기 형식·단수·기어비를 출고 사양 ID에 연결한다. **동일 시장 공식값**, **다른 시장의 공식 참고값**, **미확인 차종의 추정값**을 구분한다. 변속 시간과 변속 중 전달 토크는 별도의 **시뮬레이션 보정 가정**이며, 공식 기어비를 확보했다는 이유로 이 값까지 확인된 것으로 취급하지 않는다. 원본 ECU, CAN 계측, 엔진·변속기 제어 맵을 수록한 것이 아니다.

## 현재 출고 조합별 변속기

| 차종과 `variantId` | 확인한 형식·단수 | 제조사 근거 |
| --- | --- | --- |
| 레이 `ray-1.0-14`, `ray-1.0-15` | 4단 자동 | [기아 레이 제원](https://www.kia.com/kr/vehicles/ray/specification)의 14/15인치 연비 표 |
| 모닝 `morning-1.0-14`, `morning-1.0-16` | 4단 자동 | [기아 모닝 가격·기본 품목](https://www.kia.com/kr/vehicles/morning/price) |
| 아반떼 `avante-2.0-16`, `avante-2.0-18` | 스마트스트림 IVT, 숫자 단수 없음 | [현대 2027 아반떼 제원 PDF](https://www.hyundai.com/contents/repn-car/catalog/spec/avante-27fc-spec.pdf) 1쪽. 2.0 가솔린에 해당하며 별도 HEV의 6DCT를 적용하지 않는다. |
| K5 `k5-2.0`, `k5-2.0lpg` | 6단 자동 | [기아 K5 제원](https://www.kia.com/kr/vehicles/k5/specification)의 가솔린/LPG 연비 표 |
| K5 `k5-1.6t` | 8단 자동 | 같은 [K5 제원](https://www.kia.com/kr/vehicles/k5/specification)의 1.6 터보 표 |
| K5 `k5-2.5t-gt` | 미국 GT의 습식 8단 DCT | [Kia America MY2026 공식 제원](https://www.kiamedia.com/us/es/models/k5/2026/specifications). 국내 1.6T의 8단 자동과 구분한다. |
| K5 `k5-2.0hev` | 2.0 하이브리드, 6단 자동 | [기아 국내 K5 제원](https://www.kia.com/kr/vehicles/k5/specification). 국내 K5 HEV는 1.6이 아닌 1,999 cc 2.0이며 엔진 152 PS와 모터 38.6 kW를 별도로 표기한다. |
| 카니발 `carnival-3.5` | 8단 자동 | [기아 카니발 제원](https://www.kia.com/kr/vehicles/carnival/specification)의 3.5 가솔린 9인승 18인치 표 |
| 카니발 `carnival-1.6heV` | 6단 자동, 하이브리드 | 같은 [카니발 제원](https://www.kia.com/kr/vehicles/carnival/specification)의 1.6 터보 HEV 9인승 18인치 표. ID의 대소문자를 보존한다. |
| 카니발 `carnival-2.2d` | 8단 자동, 2.2 디젤 | [기아 2024년 4월 국내 카탈로그](https://rental.kia.com/rentfile/carseries/carseries_1713417958657.pdf). Smartstream D2.2 2,151 cc·9인승·18인치 조합. |
| G80 `g80-2.5t-rwd`, `g80-2.5t-awd`, `g80-3.5t-rwd`, `g80-3.5t-awd` | 모두 8단 자동 | [제네시스 국내 G80 제원](https://www.genesis.com/kr/ko/models/luxury-sedan-genesis/g80/specs.html)의 G80 2.5T/3.5T 2WD/AWD 연비 표. 같은 페이지에 포함된 G70·GV70·G90 표와 구분했다. |
| 전기형 G70 `g70-2.0t-rwd`, `g70-2.0t-awd`, `g70-3.3t-rwd`, `g70-3.3t-awd` | 모두 8단 자동 | [2019 국내 제조사 카탈로그 보관본](https://www.auto-brochures.com/makes/genesis/G70/Genesis_int%20G70_2019.pdf). 북미 6MT는 선택 목록에 포함하지 않는다. |
| 전기형 G70 `g70-2.2d-rwd`, `g70-2.2d-awd` | R 2.2 VGT 디젤, 8단 자동 | 같은 [2019 국내 제조사 카탈로그 보관본](https://www.auto-brochures.com/makes/genesis/G70/Genesis_int%20G70_2019.pdf). 가솔린 2.0T/3.3T의 미국 참고 기어비를 디젤에 복사하지 않는다. |
| A90 수프라 `supra-3.0t-rz` | 8단 스포츠 자동 | [토요타 2019 일본 공식 제원표](https://toyota.jp/pages/contents/carlineup/archive/supra/2019-05/pdf/supra_main_s_201905.pdf). RZ 3.0T 단일 트림. |
| F87 M2 `bmw-m2-3.0t-dct`, `bmw-m2-3.0t-mt` | 각각 7단 M DCT, 6단 수동 | [BMW 10/2015 공식 제원 PDF](https://www.press.bmwgroup.com/bulgaria/article/attachment/T0238670BG/332713) 2쪽. 2016 독일·ACEA 초기형 370 PS 모델. |
| CN7 아반떼 N `avante-n-2.0t-dct`, `avante-n-2.0t-mt` | 각각 습식 8단 DCT, 6단 수동 | [현대 2021 국내 가격·제원 PDF](https://www.hyundai.com/contents/repn-car/catalog/avante-n-price.pdf). 일반 아반떼의 IVT와 구분한다. |
| GR86 ZN8 `gr86-2.4-rz-mt`, `gr86-2.4-rz-at` | 각각 6단 수동, 6단 자동(6 Super ECT) | [토요타 일본 2022년 5월 RZ 공식 PDF](https://toyota.jp/pages/contents/carlineup/archive/gr86/2022-05/pdf/gr86_main_s_202205.pdf) 10–11쪽. 국내 MT 전용 모델과 구분한다. |
| 그랜저 `grandeur-2.5`, `grandeur-3.5-fwd`, `grandeur-3.5-awd` | 모두 8단 자동 | [현대 2027 그랜저 제원 PDF](https://www.hyundai.com/contents/repn-car/catalog/spec/grandeur-27fl-spec.pdf) 1쪽 |
| 싼타페 `santafe-2.5t-fwd`, `santafe-2.5t-awd` | 습식 8단 DCT | [현대 싼타페 가격·기본 파워트레인](https://www.hyundai.com/kr/ko/e/vehicles/santafe/price), [2026 가격표 PDF](https://www.hyundai.com/contents/repn-car/catalog/santafe-2026-price.pdf) |
| 싼타페 `santafe-1.6hev-fwd`, `santafe-1.6hev-awd` | 1.6 터보 하이브리드, 6단 자동 | 같은 [2026 가격표 PDF](https://www.hyundai.com/contents/repn-car/catalog/santafe-2026-price.pdf) 3쪽의 HEV 2WD/AWD 연비·중량 표. 2.5T의 8DCT를 공유하지 않는다. |
| 스타리아 `staria-lpg` | 8단 자동 | [현대 더 뉴 스타리아 라운지 가격](https://www.hyundai.com/kr/ko/e/vehicles/the-new-staria-lounge/price)의 LPG 3.5 파워트레인 |
| 스타리아 `staria-2.2d-fwd`, `staria-2.2d-awd` | R 2.2 VGT 디젤, 8단 자동 | [현대 2021 라운지 출시형](https://www.hyundai.com/kr/ko/brand/brandstory/model/staria-history/2021-staria-lounge), [국내 카탈로그 보관본](https://autocatalogarchive.com/wp-content/uploads/2021/05/Hyundai-Staria-Lounge-2021-KR.pdf)의 7인승. 현행 LPG와 별도 연식·엔진이다. |
| 토레스 `torres-1.5t-fwd`, `torres-1.5t-awd` | 아이신 8단 자동 | [KGM 2026년 5월 뉴 토레스 출시 설명](https://allways.kg-mobility.com/kgm-%EB%89%B4-%ED%86%A0%EB%A0%88%EC%8A%A4-%EC%B6%9C%EC%8B%9C-%ED%8C%8C%EC%9B%8C%ED%8A%B8%EB%A0%88%EC%9D%B8-%EC%97%85%EA%B7%B8%EB%A0%88%EC%9D%B4%EB%93%9C-%EC%A0%95%ED%86%B5-suv-%EA%B0%90%EC%84%B1/). 이전 6AT 토레스와 구분한다. |
| 포터 II `porter-lpg-mt` | 6단 수동 | [현대 포터 II 카탈로그](https://www.hyundai.com/contents/repn-car/catalog/porter2-catalog.pdf) PDF 5·11쪽의 LPG 초장축 슈퍼캡 |
| 포터 II `porter-lpg-at` | 5단 자동 | 같은 [포터 II 카탈로그](https://www.hyundai.com/contents/repn-car/catalog/porter2-catalog.pdf) PDF 5·11쪽. 이 5AT는 2WD 사양이며 4WD 수동 사양을 혼합하지 않는다. |
| 포터 II `porter-diesel-mt`, `porter-diesel-at` | A-2 2.5 CRDi 디젤, 각각 6단 수동·5단 자동 | [현대 2020년 3월 디젤 카탈로그](https://www.hyundai.com/content/dam/hyundai/kr/ko/data/vehicles/catalog/porter2-catalog.pdf) 5·11쪽, [디젤 가격표](https://www.hyundai.com/content/dam/hyundai/kr/ko/data/vehicles/price/porter2-price.pdf). 초장축 슈퍼캡 RWD이며 현행 LPG와 구분한다. |
| 레이 `ray-ev` | 전기 구동, 이 HUD 숨김 | [기아 레이 EV 제원](https://www.kia.com/kr/vehicles/ray-ev/specification) |
| 아이오닉 5 `ioniq5-standard`, `ioniq5-long-rwd`, `ioniq5-long-awd` | 전기 구동, 이 HUD 숨김 | [현대 2027 아이오닉 5 제원 PDF](https://www.hyundai.com/contents/repn-car/catalog/spec/ioniq5-27my-spec.pdf) |
| 무쏘 EV `musso-ev-fwd`, `musso-ev-awd` | 전기 구동, 이 HUD 숨김 | [KGM 2026년 3월 무쏘 EV 가격·제원 PDF](https://www.kg-mobility.com/attached/contents/display/file/200000200010012/20260228234258004_JNYcqu.pdf) PDF 2쪽 |

하이브리드는 카니발 1.6T, K5 2.0, 싼타페 1.6T FWD/AWD를 각각 별도 출고 ID로 구분한다. 같은 차체의 가솔린·LPG 출고 조합에는 HEV 게이지나 HEV 변속기 구조를 적용하지 않는다. 국내 K5의 1.6은 가솔린 터보이며 HEV는 2.0이다. 수록하지 않은 그랜저 1.6 HEV와 [토레스 HEV의 e-DHT](https://www.kg-mobility.com/attached/contents/display/file/2000001000100170001/20260520173147792_o7faV8.pdf)도 기존 가솔린 ID에 매핑하지 않는다. e-DHT의 운전 모드 수를 변속기 전진 단수로 사용해서는 안 된다.

## 변속 시간과 전달 토크의 모형 가정

사용자가 제시한 MT 업시프트 **0.35–0.55초·전달 토크 0%**, DCT **0.08–0.15초·전달 토크 70–95%** 범위에서 대표값을 선택했다. 이는 운전자·변속기·운전 모드별 실측치나 제조사 보증값이 아니다. 현재 53개 사양을 MT 5개, DCT 5개, AT 35개(그중 HEV 4개), IVT 2개, EV 6개로 빠짐없이 구분한다. 연료·구동원 분류는 가솔린 32개, LPG 4개, 디젤 7개, HEV 4개, EV 6개다.

| 모형 분류 | 적용 사양 | 업시프트 시간 | 변속 중 전달 계수 |
| --- | --- | ---: | ---: |
| 수동 `manual` | 아반떼 N·M2·GR86, 포터 II LPG·디젤의 MT 5개 | 0.45초 | 0% |
| 듀얼클러치 `dual-clutch` | 아반떼 N 8DCT, M2 7DCT, K5 GT 8DCT, 싼타페 2.5T FWD/AWD 8DCT의 5개 | 0.12초 | 85% |
| 일반 유단 AT `torque-converter` | 아래 수프라·HEV를 제외한 AT 30개. GR86 6AT와 디젤 AT 포함 | 0.25초 | 65% |
| ZF 8HP51 AT `torque-converter` | 2019 일본 수프라 RZ 1개 | 0.16초 | 80% |
| HEV 유단 AT `hybrid-step` | 카니발 1.6T·K5 2.0·싼타페 1.6T FWD/AWD의 6AT 4개 | 0.25초 | 65% |
| 연속변속·전기 단일감속 | 아반떼 IVT 2개, EV 6개 | 다단 변속 이벤트 없음 | 변속 감쇠 없음 |

`shiftModel.upshiftDurationS`와 `shiftModel.torqueRetention`은 위 시간과 전달 계수이며, 다단 변속기에서는 모두 `assumed:true`, `status:'estimated'`와 `estimatedFields:['…','shiftModel']`로 남긴다. 전달 계수는 변속 중 **추진력 계산에 적용하는 근사값**이다. 공기저항·경사·제동력을 없애거나 차량 속도를 고정하는 비율이 아니다. MT의 동력 차단 중에는 `N`을 표시하고 DCT·AT·HEV AT는 숫자 단수를 유지한다. IVT는 `IVT`, EV는 기존 숨김 정책을 유지한다. 단수가 확인되지 않은 사양에는 임의의 변속 이벤트를 만들지 않는다. 이 시간·감쇠는 업시프트에만 적용하며, 다운시프트는 이상적인 회전수 동기화를 가정한 즉시 전환이다.

기본 구조는 [현대자동차그룹의 변속기 기술 설명](https://www.hyundaimotorgroup.com/en/story/CONT0000000000001176)을 참고했다. 이 글은 일반 AT의 토크컨버터, DCT의 두 클러치, 토크컨버터를 생략하는 병렬 HEV AT를 구분한다. 수록 HEV는 이 구조 차이를 혼동하지 않도록 별도의 `hybrid-step` 모형으로 두며, 모터 토크 보충·클러치 제어를 실측 재현한 것으로 주장하지 않는다. 글에 나온 특정 HEV의 350 ms 제어 사례를 수록 사양 전체의 확인값으로 가져오지 않았다. GR86의 토크컨버터 6AT 구조는 [Toyota Australia의 2022년 출시 설명](https://www.toyota.com.au/discover/news/toyota-launches-new-gr86)에서도 확인되지만, 일본 RZ에 사용하는 0.25초·65%는 별도의 모형 가정이다.

수프라의 `ZF 8HP51` 계열은 아래 토요타 유럽 출처로 구분하고, 시간·전달 계수만 일반 AT와 다른 대표값으로 설정했다. G70·G80 등 현대·제네시스 AT에 ZF 계열명을 붙이지 않는다. **모든 실제 AT가 모든 DCT보다 느리다는 뜻이 아니며**, 이 대표값으로 실차 변속 성능의 우열을 확정할 수 없다. 현재 사양의 실제 운전 모드·부하·유온별 변속 데이터를 확보하지 못했다.

기어비의 `ratioStatus`·`ratioSourceId`·`ratioMarket`, 기존 `sourceIds`는 이 보정값과 독립이다. 동일 시장 기어비가 있는 수프라·M2·GR86도 변속 시간·전달 계수는 추정이며, 다른 시장 참고값과 기어비 미확인 사양의 출처 상태를 상향하지 않는다.

## 아이들링 기준 (2026-10-21)

엔진이 켜져 있는 열간 상태를 기준으로 물리 RPM의 하한과 변속등의 0점을 같은 값으로 맞춘다. 이전의 가솔린·HEV 공통 900 rpm과 디젤 공통 800 rpm을 다음과 같이 구분한다.

| 적용 사양 | 기준 RPM | 근거의 성격 |
| --- | ---: | --- |
| G70 R2.2 RWD/AWD, 스타리아 R2.2 FWD/AWD (모두 8AT) | 800 | 기존 디젤 추정값으로 복원. 해당 8AT의 공회전 수치는 미확인 |
| 가솔린·LPG | 750 | 열간 엔진 작동 상태의 대표 추정값 |
| K5·싼타페·카니발 HEV | 1,000 | 엔진 작동 중의 대표 추정값 |
| 카니발 Smartstream D2.2, 포터 A-2 디젤 | 800 | 별도 엔진 계열의 기존 추정값 유지 |

위 수치는 모두 차종별 제조사 공회전 규정값으로 확인한 값이 아니다. 냉간 시동, 에어컨·발전 부하, 온도에 따른 변화는 모델링하지 않는다. `idleModel`에 수치·보정 상태·작동 조건을 기록하고 기어비 출처와 분리한다. 사용자가 제시한 R2.2 830 rpm은 **6단 사양 기준**이라는 후속 설명에 따라, 8AT 4개 사양에 적용했던 `830 / user-calibrated`를 철회했다. 현재 R2.2 6단 사양은 등록되어 있지 않다. 복원한 800 rpm 역시 실차 확인값이 아니며, 8단이므로 공회전이 더 낮다고 판단한 결과가 아니다.

[기아 K5 HEV 사용설명서](https://ownersmanual.kia.com/full_webhelp/DL3KH/2024/en_GB/topics/chapter1_1.html)는 정차 중 엔진 정지와 충전을 위한 엔진 가동이 모두 가능함을 설명한다. 현재 모형의 HEV 1,000 rpm은 엔진을 켜 둔 상태의 기준이며, 실제 HEV가 항상 그 회전수로 공회전한다는 뜻은 아니다. SOC·열관리·엔진 자동 정지/재시동 제어는 아직 구현하지 않는다. 엔진이 없는 EV에는 아이들링 RPM을 부여하지 않는다.

주행 중에는 기존 차속·단별 총감속비·구름 반경에서 산출한 RPM과 위 하한 중 큰 값을 사용한다. 변속 회전수·기어비·변속 시간은 변경하지 않는다. 정차 시 변속등은 0칸이며 출발하면 해당 엔진의 아이들링 기준에서부터 증가한다.

## R2.2 8AT 공회전·변속 시점 재확인 (2026-10-21)

2019 국내 G70 R2.2 8AT와 2021 국내 스타리아 R2.2 8AT의 **열간 P/N/D별 공회전 RPM, 저부하 및 전가속 단별 상향변속 RPM을 확정할 공개 제조사 수치표는 확보하지 못했다.** 확인한 자료의 범위는 다음과 같다.

- [Genesis 공식 2021 유럽 G70/Shooting Brake 취급설명서](https://org-eu.genesis.com/content/dam/genesis-web-eu/site/document/global/owners-manuals/en/owner-manual_2021_g70_sbg70_en.pdf): 인쇄 6-13쪽은 D에서 8단 자동 제어와 가속페달 추가 입력에 따른 다운시프트, 6-20쪽은 킥다운, 6-54쪽은 SPORT 가속 시 업시프트 지연과 페달을 놓은 뒤 일정 시간 높은 RPM 유지를 설명한다. 따라서 운전 조건에 따라 변속 시점이 달라지지만, 이 설명서는 단별 변속 RPM을 제공하지 않는다. 2021 유럽판의 제어 설명을 2019 국내 ECU 수치 확인으로 취급하지 않는다.
- [현대 호주 스타리아 공식 제원](https://www.hyundai.com/content/dam/hyundai/au/en/models/staria/2021/docs/Hyundai_STARIA-US4_Specifications.pdf) 1쪽: R2.2·8AT, 최고출력 3,800 rpm과 최대토크 1,500–2,500 rpm을 확인한다. **최고출력 회전수는 자동 변속 시점이 아니다.** 이 표에는 공회전과 변속 제어 맵이 없다.

현재 시뮬레이터의 R2.2 **4,200 rpm 상향변속 기준과 4,800 rpm 상한은 추정값을 유지**한다. 실제 로직은 변속 중이 아니고 제동 요청이 없으며 최고단 미만일 때 현재 단의 계산 RPM이 4,200 이상이면 다음 단으로 변속한다. 전가속만을 별도로 감지하는 로직이 아니며, 저부하 조기 변속·차량별 주행 모드·온도에 따른 실제 TCU 맵은 구현하지 않았다. 근거 없이 저부하 또는 전가속 실차 RPM을 새로 만들어 넣지 않는다. 이번 정정은 공회전 하한과 근거 표시에 한정하며 기어비·변속 기준·변속 시간은 변경하지 않는다.

실측 보조자료로 [HeadLight Magazine의 2021-09-15 스타리아 직접 시험](https://www.headlightmag.com/preview-acce-fuel-hyundai-staria-sel/)을 확인했다. 태국 2.2 SEL D4HB·8AT·FWD이며, 계기판 기준 ‘각 단 최고속도’ 기록은 아래와 같다.

| 단수 | 계기판 속도 | 회전수 |
| --- | --- | --- |
| 1 / 2 / 3단 | 각각 38 / 59 / 93 km/h | 약 4,250 rpm |
| 4 / 5 / 6단 | 각각 117 / 139 / 163 km/h | 약 4,100 rpm |

이는 시험 차량의 관측값으로, 공식 변속 명령점이나 국내 FWD/AWD 공통 제어 맵을 확정하는 자료가 아니다. 기존 4,200 rpm 모형값과 비교할 수 있으나 단별 변속 설정으로 바로 전용하지 않았다. 같은 기록의 7단 193 km/h·3,750 rpm은 최고속도 도달값이므로 7→8 변속점으로 사용하지 않는다. 공회전과 저부하 변속 수치도 이 시험에는 제시되어 있지 않다.

## 기어비를 적용한 레이스 변속

`RPM = 속도(m/s) ÷ (2π × 유효 회전반경(m)) × 60 × 해당 단 기어비 × 해당 단의 종감속비`로 계산한다. 아래 차량은 등비 간격 대신 공개된 **단별 기어비**를 사용한다. 현재 출고 조합 53개 중 공식 단별 기어비 배열을 적용한 다단변속기는 **23개**다. 전체 비율의 동일 시장 확인 5개, 다른 시장 참고 17개, 단별 비율·두 종감속비는 공식값이지만 종감속 배정이 추정인 K5 GT 1개로 나뉜다. 나머지는 기어비 미확인 다단변속기 22개, IVT 2개, EV 6개다. EV 중 2개는 별도로 해외 단일 감속비 자료를 물리에 적용하며, 나머지 4개의 감속비는 미확인이다. EV 6개 모두 이 엔진·변속 HUD는 표시하지 않는다. 이 집계는 `TuningEvolution.VARIANTS`의 모든 ID를 `PowertrainProfiles.resolve`로 대조한 결과다.

| 적용 차량 | 1단 → 최고단 | 종감속비 | 출처와 적용 범위 |
| --- | --- | --- | --- |
| G80 2.5T | 3.665 / 2.396 / 1.610 / 1.190 / 1.000 / 0.826 / 0.643 / 0.556 | 3.909 | [호주 MY2026 공식 PDF](https://www.genesis.com/content/dam/genesis/au/en/bto-assets/admin/donwloader-center-management/g80/model-thumbnail/desktop/2026_Genesis_G80_Specification_Sheet.pdf) 1–2쪽의 **2.5T RWD**. 국내 및 2.5T AWD 대응은 참조 가정이다. |
| G80 3.5T | 위 G80 2.5T와 동일 | 3.727 | 같은 PDF의 **3.5T AWD**. 국내 및 3.5T RWD 대응은 참조 가정이다. |
| G70 2.0T 전기형 | 3.964 / 2.468 / 1.610 / 1.176 / 1.000 / 0.832 / 0.652 / 0.565 | 3.727 | [Genesis Motor America의 2019 전기형 공식 발표](https://www.prnewswire.com/news-releases/2019-genesis-g70-equipped-to-compete-300679294.html) 8AT 표. 2019 미국 수치이며 국내 일치는 미확인이다. |
| G70 3.3T 전기형 | 3.665 / 2.396 / 1.610 / 1.190 / 1.000 / 0.826 / 0.643 / 0.556 | 3.538 | 같은 2019 미국 공식 표. 6MT 열이나 2021 페이스리프트를 혼합하지 않는다. 국내 출력·질량은 변경하지 않는다. |
| 수프라 2019 일본 RZ | 5.250 / 3.360 / 2.172 / 1.720 / 1.316 / 1.000 / 0.822 / 0.640 | 3.154 | [일본 공식 제원표](https://toyota.jp/pages/contents/carlineup/archive/supra/2019-05/pdf/supra_main_s_201905.pdf)의 동일 연식·시장·트림. |
| M2 2016 독일 7DCT | 4.806 / 2.593 / 1.701 / 1.277 / 1.000 / 0.844 / 0.671 | 3.462 | [BMW 공식 제원 PDF](https://www.press.bmwgroup.com/bulgaria/article/attachment/T0238670BG/332713) 2쪽 괄호 안의 M DCT 값. |
| M2 2016 독일 6MT | 4.110 / 2.315 / 1.542 / 1.179 / 1.000 / 0.846 | 3.462 | 같은 PDF 괄호 밖의 수동변속기 값. 7단은 없다. |
| GR86 2022 일본 RZ 6MT | 3.626 / 2.188 / 1.541 / 1.213 / 1.000 / 0.767 | 4.100 | [토요타 일본 공식 보관 PDF](https://toyota.jp/pages/contents/carlineup/archive/gr86/2022-05/pdf/gr86_main_s_202205.pdf) 11쪽, RZ 6MT 열. |
| GR86 2022 일본 RZ 6AT | 3.538 / 2.060 / 1.404 / 1.000 / 0.713 / 0.582 | 3.909 | 같은 PDF, RZ 6AT 열. MT와 다른 종감속비를 사용한다. |
| CN7 아반떼 N 8DCT | 3.714 / 2.261 / 2.174 / 1.621 / 0.927 / 0.767 / 0.878 / 0.698 | 3.800 / 2.714, 아래 배정 참조 | [현대 호주 November 2021 i30 Sedan N 공식 PDF](https://www.hyundai.com/content/dam/hyundai/au/en/models/i30-sedan-n/spec-sheet/i30-Sedan-N_Spec-Table_Nov_2021.pdf) 1쪽. 국내 일치는 미확인이다. |
| CN7 아반떼 N 6MT | 3.083 / 1.931 / 1.696 / 1.276 / 1.027 / 0.854 | 4.154 / 3.176, 아래 배정 참조 | 같은 공식 PDF의 수동변속기 열. 국내 일치는 미확인이다. |
| K5 1.6T FWD | 4.717 / 2.906 / 1.864 / 1.423 / 1.224 / 1.000 / 0.790 / 0.635 | 3.367 | [Kia America MY2024 공식 표](https://www.kiamedia.com/us/en/models/k5/2024/specifications)의 1.6T FWD 8AT. 미국 AWD의 3.510, 2.5T DCT와 구분한다. 국내 일치는 미확인이다. |
| K5 MY2026 미국 GT 2.5T FWD | 3.643 / 2.304 / 2.217 / 1.621 / 0.884 / 0.703 / 0.791 / 0.660 | 4.077 / 2.944, 배정은 추정 | [Kia America MY2026 공식 표](https://www.kiamedia.com/us/es/models/k5/2026/specifications)의 GT 습식 8DCT. 단별 기어비와 두 종감속비는 해당 시장 공식값이나 각 단의 종감속비 배정은 공개되지 않았다. |
| 카니발 3.5 FWD | 4.808 / 2.901 / 1.864 / 1.424 / 1.219 / 1.000 / 0.799 / 0.648 | 3.510 | [Kia America MY2025 공식 표](https://www.kiamedia.com/us/en/models/carnival/2025/specifications)의 3.5 가솔린 8AT. 국내 일치는 미확인이다. |
| 카니발 1.6T HEV FWD | 4.639 / 2.826 / 1.841 / 1.386 / 1.000 / 0.772 | 3.648 | [Kia America MY2025 HEV 공식 표](https://www.kiamedia.com/us/en/models/carnival-hev/2025/specifications)의 6AT. 국내 일치는 미확인이다. |
| 싼타페 2.5T FWD/AWD | 3.429 / 2.217 / 2.217 / 1.621 / 0.860 / 0.673 / 0.791 / 0.653 | 4.846 / 3.316, 아래 배정 참조 | [현대 호주 MX5 공식 PDF](https://www.hyundai.com/content/dam/hyundai/au/en/models/santa-fe-ice/docs/Santa-Fe-MX5-Specification-Sheet.pdf) 1–2쪽의 G4KP 2.5T 8DCT. 국내 일치 및 단별 종감속 배정은 미확인이다. |
| 싼타페 1.6T HEV FWD/AWD | 4.639 / 2.826 / 1.841 / 1.386 / 1.000 / 0.772 | 3.510 | [현대 호주 현행 HEV 제원](https://www.hyundai.com/au/en/cars/suvs/santa-fe-hybrid/specifications)의 6AT. 국내 기어비 일치는 미확인이다. 카니발 HEV의 3.648을 가져오지 않는다. |

G80의 [2024 영국 공식 제원표](https://www.genesis.com/content/dam/genesis-web-eu/documents/uk/pricelists/genesis_g80_pricelist_uk.pdf)에는 6단이 0.832인 표도 있어 시장 차이를 무시하지 않는다. 위 G80·가솔린 G70·K5 1.6T·카니발 3.5/HEV·싼타페·아반떼 N의 표는 `ratioStatus:'reference-market'`, 수프라·M2·GR86은 `verified-exact-market`로 구분한다. 같은 차체에 디젤을 추가했다고 가솔린 기어비를 적용하지 않는다. 해외 참고값을 적용한 국내 차량의 실제 기어비 일치, 엔진별 레드라인·WOT 변속 맵은 이번 자료로 확정하지 못했다.

미국 K5 GT는 기어비 자료가 있어도 전체 감속 조합의 `ratioStatus`를 **`estimated`**로 유지한다. 단별 비율은 `gearRatiosStatus:'verified-exact-market'`, 공개된 두 종감속비는 `finalDriveValues:[4.077,2.944]`로 따로 기록한다. 모형의 배정 `[4.077,4.077,2.944,2.944,4.077,4.077,2.944,2.944]`는 전체 총감속비가 순서대로 낮아지도록 선택한 추정이며, `finalDriveAssignmentStatus:'estimated'`와 `estimatedFields`의 `finalDriveRatios`·`finalDriveGearAssignment`로 구분한다. 단순히 8DCT라는 이유로 싼타페의 종감속비를 공유하지 않는다.

싼타페 MX5 표는 두 종감속비 `4.846 / 3.316`을 공개하지만 어느 단에 적용하는지는 생략한다. [현대 호주 MY2021 싼타페 공식 PDF](https://www.hyundai.com/content/dam/hyundai/au/en/models/santa-fe/docs/Hyundai_Santa-Fe_MY21_Specifications_Sheet_2021.pdf) 1쪽의 **구형 2.2 디젤 8DCT**는 동일한 단별 기어비에 `1·2·5·6단 = 4.846`, `3·4·7·8단 = 3.316`을 명시한다. 모형은 이 배정을 현행 2.5T에 참고 적용하며 `estimatedFields`의 `finalDriveGearAssignment`로 추정임을 표시한다. 단별 `finalDriveRatios`는 `[4.846, 4.846, 3.316, 3.316, 4.846, 4.846, 3.316, 3.316]`이고, 단일 `finalDriveRatio`는 `null`이다. 이 배정은 현행 국내 2.5T의 확인값이 아니다. DCT의 2·3단 원 기어비가 같거나 6→7단 원 기어비가 커지더라도 **각 단의 기어비 × 종감속비**는 순서대로 낮아진다. 종감속비 하나를 모든 단에 곱해서는 안 된다.

기어비 자료를 적용한 차량은 출고 타이어 규격에서 계산한 바퀴 반경에 **0.985의 추정 보정**을 적용한다. G70·G80·수프라·M2·GR86은 뒤 타이어, 전륜 기반 K5·카니발·싼타페·아반떼 N은 앞 타이어를 기준으로 한다. 실측 타이어 회전수나 동하중 변형값은 아니다. G80의 275/35R20 뒤 타이어는 명목 반경 0.35025 m, 모형 유효 반경 약 0.3450 m다. 튜닝 시에는 기존 `reduction / factoryReduction` 비율을 공유 총감속비에 한 번 곱하며, 기어비 미확인 차량의 추정 총감속비에도 같은 배율을 반영한다. 종감속 튜닝이나 타이어 보정도 출고 기어비 자체의 공식값과 구분한다.

변속 스케줄은 **레이스 전개 가속(WOT)용 추정값**이다. 일정 속도로 순항할 때 연비를 위해 높은 단을 고르는 자동변속기 제어와 다르다. GR86은 7000 rpm, G80·K5 GT는 6200 rpm, 가솔린 G70·수프라·M2·카니발 3.5·아반떼 N은 6500 rpm, K5 1.6T·K5 HEV·카니발 HEV·싼타페는 6000 rpm을 업시프트 기준으로 쓴다. 제조사 최고출력 회전수(G80 5800, G70 2.0/3.3 6200/6000, 수프라 5000, K5 1.6T 5500·GT 5800, 카니발 3.5 6400, 싼타페 2.5T 5800·HEV 5500 rpm)를 레드라인이나 실제 변속 시점으로 단정하지 않는다. 카니발 HEV의 미국 기어비 자료에는 최고출력 회전수가 없어 `ratedPowerRPM:null`로 남긴다.

다음은 순정 G80의 6200 rpm 업시프트 이론 차속이다. 실제 코드의 `gearSpeedAtRPM(car, gear, 6200) × 3.6`으로 계산해 1 km/h 단위로 반올림했다. 무튜닝, 275/35R20 뒤 타이어의 명목 반경 0.35025 m에 0.985를 곱한 유효 반경 0.34499625 m, 앞서 구분한 호주 시장 참고 기어비·종감속비를 사용한다.

| 변속 | G80 2.5T | G80 3.5T |
| --- | ---: | ---: |
| 1 → 2단 | 56 km/h | 59 km/h |
| 2 → 3단 | 86 km/h | 90 km/h |
| 3 → 4단 | 128 km/h | 134 km/h |
| 4 → 5단 | 173 km/h | 182 km/h |
| 5 → 6단 | 206 km/h | 216 km/h |
| 6 → 7단 | 250 km/h | 262 km/h |
| 7 → 8단 | 321 km/h | 336 km/h |

표는 **출고 ECU의 실제 변속 속도나 차량의 도달 가능 속도가 아니다**. 호주 공식 적용 조합은 2.5T RWD·3.5T AWD이며, 현재 모형에서는 동일 엔진의 다른 구동 사양에도 같은 비율을 참고 적용한다. WOT 기준 6200 rpm과 유효 반경 보정은 추정이고, 물리 엔진의 출력·공기저항·속도 제한에 따라 해당 변속 지점까지 도달하지 않을 수 있다. 튜닝하면 공유 종감속비가 달라져 표의 속도도 바뀐다.

이 기준에서 순정 G80은 100 km/h에서 3단, 190 km/h에서 약 5단이다. 7→8단 표시 기준은 2.5T 약 321 km/h, 3.5T 약 336 km/h로 계산되며 **그 속도를 실제로 낼 수 있다는 뜻은 아니다**. 레이스의 속도 상한·출력 때문에 높은 단까지 올라가지 않을 수 있다. 이전의 공용 등비 감속 근사에서 190 km/h 부근에 8단이 뜨던 현상을 제거한다.

코너 제동 후 다시 전개 가속할 때는 정격 출력의 35%를 넘는 양의 휠 추진력과 순가속을 확인해 부하 다운시프트를 허용한다. 이전 단으로 내려가도 변속 기준 회전수의 90% 미만일 때만 한 단씩 내려간다. 다운시프트에는 최소 0.65초의 간격을 두어 경계 속도에서 반복 전환되는 것을 막지만, 업시프트에는 이 추가 잠금을 적용하지 않는다. 진행 중인 업시프트가 끝나고 RPM 조건이 충족되면 다음 업시프트가 가능하다. 200 km/h에서 제동한 뒤 100 km/h로 재가속하는 G80도 3단으로 돌아온다. 무부하 감속은 현재 회전수가 변속 기준의 53% 미만이고 이전 단의 회전수가 86% 미만일 때 다운시프트한다.

나머지 기어비 미확인 차량은 `ratioStatus:'estimated'`로 남긴다. 기존 1단 총 감속비 13.5와 단간 비율(4단 .66 / 5단 .71 / 6단 .75 / 8단 .81)은 추정이며 제조사 기어비로 표시하지 않는다. 일반 업시프트 6000 rpm, 포터 LPG 4000 rpm, 가솔린 공회전 표시 750 rpm, 표시 범위 상단 일반 7000/포터 5000 rpm 역시 모형값이다. IVT는 숫자 단수를 만들지 않고 `IVT`로 표시한다.

디젤은 별도의 낮은 회전수 모형을 사용한다. 일곱 사양 모두 단별 기어비와 종감속비 표는 `null`이고 1단 총감속비 13.5는 추정이며 공회전 기준은 위 아이들링 표를 따른다. 포터 디젤의 업시프트 3800 rpm·상한 4500 rpm·단간 비율 6MT .75/5AT .71, G70·스타리아·카니발 디젤의 업시프트 4200 rpm·상한 4800 rpm·8AT 단간 비율 .78도 추정이다. 공식 최고출력 회전수는 포터 3600 rpm, 나머지 디젤 3800 rpm으로 따로 기록하며 모형 상한을 공식 레드라인으로 주장하지 않는다. 스타리아의 해외 디젤 비율도 이번에는 채택하지 않았다.

| 기어비 미확인 다단변속기 | 이번 검토에서 적용하지 않은 이유 |
| --- | --- |
| 레이 1.0, 모닝 1.0 (각 2개 휠 조합) | 현행 국내 1.0의 공식 단별 기어비·종감속비 표를 확보하지 못했다. [기아 영국 Picanto 공식 PDF](https://www.kia.com/content/dam/kwcms/kme/uk/en/assets/vehicles/All-New%20Picanto/Specifications/all-new-picanto-specification.PDF)의 4AT는 1.25L 엔진이며, 같은 표의 1.0L은 5MT이므로 가져오지 않았다. |
| K5 2.0 가솔린·LPG·HEV | 현행 DL3 각 조합의 공식 기어비 표를 확보하지 못했다. [기아 말레이시아 JFPE 제원 PDF](https://www.kia.com/content/dam/kwcms/my/en/files/Specification/JFPE.pdf)는 이전 세대 Optima JF PE Nu 2.0 CVVL이므로 적용하지 않았다. HEV에도 일반 가솔린 또는 다른 차종의 6AT 비율을 가져오지 않았다. |
| 그랜저 2.5·3.5 FWD/AWD | 해당 국내 엔진·연식의 공식 기어비 표를 확보하지 못했다. 다른 세대·배기량의 해외 Azera 값을 혼합하지 않았다. |
| G70 2.2 디젤 RWD/AWD | 해당 국내 디젤 조합의 단별·종감속비를 확보하지 못했다. 위 미국 가솔린 2.0T·3.3T의 8AT 비율을 적용하지 않았다. |
| 카니발 Smartstream D2.2 디젤 | 2024 국내 2,151 cc·8AT 조합의 단별·종감속비를 확보하지 못했다. 가솔린 3.5나 HEV의 비율을 적용하지 않았다. |
| 스타리아 LPG 3.5 | 해당 LPG 조합의 공식 기어비 표를 확보하지 못했다. 해외 가솔린·디젤 8AT 값을 LPG에 적용하지 않았다. |
| 스타리아 R 2.2 디젤 FWD/AWD | 국내 2021 라운지 7인승 조합의 비율을 확정하지 못해 두 사양 모두 추정으로 남겼다. |
| 토레스 1.5T FWD/AWD | 2026 뉴 토레스의 아이신 8AT 공식 기어비 표를 확보하지 못했다. 이전 6AT·하이브리드 e-DHT 수치를 사용하지 않았다. |
| 포터 II LPG 6MT·5AT | 해당 LPG 조합의 공식 기어비 표를 확보하지 못했다. 디젤·수출 H-100 자료를 LPG 출고 사양에 적용하지 않았다. |
| 포터 II A-2 디젤 6MT·5AT | 2020 국내 초장축 슈퍼캡 RWD 조합의 단별·종감속비를 확보하지 못했다. 현행 LPG나 다른 연식 수출형의 비율을 복사하지 않았다. |

아이오닉 5 Long Range 84 kWh RWD/AWD의 물리 계산에는 [현대 호주 MY2026 공식 PDF](https://www.hyundai.com/content/dam/hyundai/au/en/models/ioniq5/docs/2026-IONIQ-5-Specification-Sheet.pdf) 1–2쪽의 **감속기 2.263 × 종감속 4.706 = 총감속 10.649678**을 참고 적용한다. 국내 일치는 미확인이다. 이는 다단변속기 표와 별도인 `singleSpeedReduction`, `reductionStatus:'reference-market'`, `reductionSourceId`, `reductionMarket`으로 기록한다. 이 EV의 `ratioStatus:'not-applicable'`, `gearCount:null`과 HUD 숨김은 유지한다. 같은 자료의 확인 범위 밖인 Standard 63 kWh에는 Long Range 수치를 적용하지 않고 기존 감속비 9를 유지한다. 레이 EV·무쏘 EV FWD/AWD 역시 해당 조합의 감속비 미확인으로 기존 모형값을 사용한다.

물리 엔진의 `PowertrainDynamics`가 현재 단수·회전수·진행 중인 업시프트를 결정하고, 계기판과 HEV 게이지는 계산된 주행 상태를 읽기만 한다. 다단변속기는 **현재 단 기어비 × 해당 단 종감속비**로 휠 토크 한도를 계산하고 출력·접지 한도를 함께 적용한다. 업시프트 중에는 위 시간 동안 전달 계수로 추진력을 줄인다. EV의 단일 감속비와 IVT·미확인 단수 사양의 기존 구동력 근사는 유지한다. 기어비 미확인 다단변속기는 명시된 추정 비율을 사용하며, 기어비 출처가 있는 차량의 시장 구분과 싼타페의 종감속 배정 추정도 유지한다. 최고단에서 모형 회전수 상한을 넘으면 추진력을 더하지 않지만 내리막·관성으로 생긴 속도를 강제로 잘라내지는 않는다. HUD를 끄거나 제거해도 변속과 주행 계산은 계속된다. 토크컨버터의 유압 슬립 곡선·클러치 열·운전자의 실제 조작 시간은 재현하지 않는다. 출발 접지력과 검증 조건은 [출발 구동력 설명](LAUNCH-DYNAMICS.md)에 기록한다.

## GR86 일본 RZ의 수동·자동 변속기

두 조합은 같은 2022년 5월 일본 자료의 제원·기어비를 사용하므로 `ratioStatus:'verified-exact-market'`, `ratioMarket:'JP'`다. MT의 1단 총감속은 `3.626 × 4.100 = 14.8666`, AT는 `3.538 × 3.909 = 13.830042`다. 앞뒤 215/40R18의 명목 반경 0.3146 m 중 구동축인 뒤 타이어에 추정 계수 0.985를 적용한다. 튜닝 배율은 기존 출고 `reduction:13.5` 대비 비율을 한 번 적용한다.

일본 공식 최고출력 회전수는 7000 rpm이다. 모형 WOT 변속 기준도 7000 rpm으로 설정하지만 이는 실제 ECU 변속 맵을 확인한 값이 아니다. [Toyota Europe 2022 설명](https://newsroom.toyota.eu/all-new-toyota-gr86/)의 같은 세대 엔진 최대 회전수 7500 rpm을 `maxRPM`의 해외 참고 필드로 사용한다. 수동도 별도의 클러치 입력 없이 모형 운전자가 자동으로 변속하며, 업시프트에는 0.45초의 추진력 차단을 적용한다. AT의 대표값은 0.25초·65% 유지다. 합성 입력의 최고단 검사는 실제 도달 가능 속도 주장이 아니다.

## 아반떼 N의 단별 종감속과 회전수

호주 November 2021 표는 DCT의 `1·2·5·6단 = 3.800`, `3·4·7·8단 = 2.714`, 수동의 `1·2단 = 4.154`, `3·4·5·6단 = 3.176`을 직접 명시한다. `finalDriveRatios`는 각각 `[3.8,3.8,2.714,2.714,3.8,3.8,2.714,2.714]`, `[4.154,4.154,3.176,3.176,3.176,3.176]`이며 단일 `finalDriveRatio`는 `null`이다. 따라서 DCT 6→7단에서 원 기어비가 커져도 바퀴까지의 총감속비와 회전수는 감소한다. 배정 자체는 호주 공식값이므로 `finalDriveGearAssignment` 추정 태그를 넣지 않지만, 국내 동일성은 `domesticRatioMatch`로 미확인을 유지한다.

최고출력 범위 5500–6000 rpm 중 상단 6000을 `ratedPowerRPM`으로 기록한다. 추정 WOT 변속 기준 6500과 표시 상한 7000은 공식 레드라인으로 주장하지 않는다. FWD HUD는 앞 타이어 명목 반경 0.32705 m에 추정 계수 0.985를 적용한다. 두 변속기의 전체 순차 업시프트와 RPM 하락은 합성 속도 입력으로 검사하며, 최고단 검사가 실차 또는 모형의 도달 가능한 최고속도를 의미하지 않는다.

## GR 수프라 ZF 8단 재점검

수록 차량은 2019 일본 RZ 3.0T다. [토요타 유럽의 2019년 5월 3.0·340 DIN hp 자료](https://newsroom.toyota.eu/download/708620/2019-gr-supra-dpl-en-972889.pdf) 32쪽에서 **8HP51** 계열을 확인했으며, [일본 공식 원본](https://toyota.jp/pages/contents/carlineup/archive/supra/2019-05/pdf/supra_main_s_201905.pdf) 4쪽의 단별 비율과 [미국 출시형 MY2020 공식 표](https://pressroom.toyota.com/2020-supra-product-supra/)를 교차 확인했다. 기존 기어비 5.250 / 3.360 / 2.172 / 1.720 / 1.316 / 1.000 / 0.822 / 0.640 및 일본 종감속비 **3.154**는 그대로 유지한다. 유럽 자료의 종감속 표기 3.150을 일본 사양에 덮어쓰지 않는다. `transmissionFamily:'ZF 8HP51'`의 근거는 유럽 자료로 구분한다.

ZF 8단이라는 이름만으로 모든 차에 같은 비율을 적용할 수 없다. 예를 들어 [BMW 공식 8HP45 제원](https://www.press.bmwgroup.com/usa/article/attachment/T0136050EN_US/356622)의 1·2단은 4.714 / 3.143으로, 수프라 표와 다르다. 6MT와 GT4 경주차 자료도 수록 사양의 기준이 아니다.

모형의 순정 수프라는 뒤 타이어 275/35ZR19의 명목 반경 0.33755 m에 0.985를 곱하고, 추정 WOT 변속 기준 6500 rpm을 쓴다. 이에 따른 **이론 변속 차속**은 다음과 같다.

| 변속 | 모형 기준 차속 |
| --- | ---: |
| 1 → 2단 | 49 km/h |
| 2 → 3단 | 77 km/h |
| 3 → 4단 | 119 km/h |
| 4 → 5단 | 150 km/h |
| 5 → 6단 | 196 km/h |
| 6 → 7단 | 258 km/h |
| 7 → 8단 | 314 km/h |

100 km/h는 3단, 190 km/h는 5단, 200 km/h는 6단이다. 순정 속도 상한 250 km/h인 현재 모형에서는 WOT로 7·8단까지 올라가지 않는 것이 이 스케줄의 결과다. 이 표는 실제 도달 가능 속도나 ECU 변속 기록이 아니며, 연비 순항 때의 높은 단 선택을 재현하지 않는다. 실제 ZF 변속 제어를 확보한 것으로 해석해서는 안 된다. 회귀 검사는 전체 단수 전환과 제동 후 100 km/h 재가속의 3단 복귀를 별도로 확인한다.

## 하이브리드 에너지 흐름

하이브리드 게이지는 **충전/사용의 방향과 상대 강도**를 나타낸다. **배터리 잔량(SOC), kWh 잔여량, 실제 회생 전력 또는 실제 배터리 전력 계측이 아니다.** 흐름 값을 적분해서 잔량으로 만들지 않는다.

1. 실제 휠 제동 전력이 100 W를 넘고 속도가 0.5 m/s를 넘는 첫 물리 틱부터 충전한다. 코너 진입 판정을 기다리지 않는다. 내리막 중 제동으로도 순가속이 남는 경우에는 실제 제동 일을 우선한다. 반대로 오르막에서 구동력을 쓰면서 느려진다고 충전으로 표시하지 않는다.
2. 레이싱 라인의 곡률과 횡가속을 0.16초로 평활화하고 진입/탈출 문턱과 0.18/0.22초 지속 조건을 분리한다. 코너에 0.45초 이상 머문 뒤 곡률이 그 코너의 정점에서 12% 줄고 최저속도보다 0.25 m/s 이상 회복하며 실제 추진·가속이 0.18초 이어지면 클리핑 후 구간으로 판단한다. 정밀 측량된 클리핑 좌표가 아니라 모형 경로로부터의 보수적인 추정이다.
3. 클리핑 후에는 적격 가속 시간에 따라 1.2초 동안 사용 요청을 부드럽게 0→75%로 높인다. 확정 탈출 뒤 4초 동안은 사용 요청 100%를 유지하되, 실제 가속과 양의 휠 추진력이 있을 때만 표시한다. 이 100%는 표시용 최대 보조 요청이며 실제 모터 전력이 정격 100%라는 뜻은 아니다.
4. 제동은 항상 사용보다 우선하고, 추진력이 없거나 가속하지 않으면 사용을 즉시 해제한다. 내리막 관성 가속만으로 전기 사용을 만들지 않는다. 표시 막대는 적격 흐름으로 부드럽게 들어가며 에너지 일을 하지 않을 때는 중립으로 돌아온다.
5. 클리핑을 지난 뒤 짧은 제동 보정이 발생해도 코너 단계를 되감지 않는다. 제동 흐름만 즉시 우선한다. 반대 방향의 지속 코너는 새 시케인 접근으로 인식한다. 짧은 곡률 스파이크·코너 중간 틈 때문에 보조 창을 반복해서 새로 열지 않는다.

테스트는 실제 Spa 고도·레이싱 라인 한 바퀴에서 모든 적격 제동 틱의 즉시 충전, 코너 내부의 점진 사용, 탈출 후 최대 요청, 가속/추진 조건 및 단계 흔들림을 검증한다. 동일 물리 틱을 1×·2×·3× 및 불규칙 렌더 배치로 전달해도 표시가 같고, HUD를 완전히 제거한 엔진과 물리 상태·랩타임·순위·세대 평가가 동일함을 비교한다.

실차의 충전 상태·배터리 온도·충전 수용 한계·엔진 운전 여부·동력 분배 제어 맵을 확보하지 않았다. 따라서 모형의 충전·보조 시점과 강도는 제조사의 제어 전략을 검증하거나 복제한 결과가 아니다. 회생으로 계산된 제동력을 다시 더하거나, 보조 표시 때문에 레이스 출력을 추가하지 않는다. 엔진이 없는 EV는 이 엔진 회전수·기어·HEV 흐름 HUD 전체를 숨긴다.

## BMW M2 초기형의 회전수와 표시 범위

2016 독일 사양 두 조합은 같은 공식 표의 기어비·종감속비를 사용하므로 `ratioStatus:'verified-exact-market'`, `ratioMarket:'DE'`다. 공통 1단 총감속비를 넣지 않고 DCT는 `4.806 × 3.462 = 16.638372`, MT는 `4.110 × 3.462 = 14.228820`을 저속 구동력 한도로 사용한다. 튜닝 배율은 기존 명목 `reduction:13.5`와 출고 기준의 비에서 한 번 적용한다.

공유 변속 모형은 후륜 265/35ZR19의 명목 반경 0.33405 m에 추정 보정 0.985를 곱한다. 공식 최고출력 회전수는 6500 rpm이다. [BMW 영국 2016 발표](https://www.press.bmwgroup.com/united-kingdom/article/detail/T0238509EN_GB/the-new-bmw-m2)가 같은 N55 엔진의 최대 7000 rpm을 명시하므로 `maxRPM`은 UK 출처의 참고 필드로 기록한다. 업시프트 기준 6500 rpm, 공회전 750 rpm, 유효 반경 보정은 추정으로 남긴다. 수동변속기도 운전자 조작을 별도 입력받지 않고 모형 운전자가 변속하며, MT·DCT에 서로 다른 시간·전달 계수를 적용한다.

이론상 6500 rpm 차속은 DCT 1–7단 약 **48.46 / 89.82 / 136.92 / 182.38 / 232.90 / 275.95 / 347.09 km/h**, MT 1–6단 약 **56.67 / 100.60 / 151.04 / 197.54 / 232.90 / 275.29 km/h**다. 높은 단의 수치는 공식 최고속도 또는 레이스 도달 가능 속도가 아니다. 변속을 마친 가속 상태의 100 km/h에서는 DCT 3단·MT 2단이고, 높은 단에서 감속한 뒤 100 km/h로 재가속하면 MT는 기존 90% 다운시프트 보호 조건 때문에 3단을 유지한다. 80 km/h에서는 두 변속기 모두 2단으로 복귀한다. 표시가 별도로 단수를 선택하지 않고 물리 변속 상태를 따른다.

## G70 3.3T 회전수 재점검 (2026-10-21)

현재 3.3T RWD/AWD는 위 2019 미국 제조사 발표의 8단 표와 종감속비 3.538을 사용한다. 6단은 0.826, 뒤 타이어는 국내 프리셋의 255/35R19이며, 유효 반경은 명목 0.33055 m × 추정 보정 0.985다. 이 조합의 순정 100 km/h·6단은 약 **2,381 rpm**이다. 추정 업시프트 기준 6500 rpm에서 1→2단은 약 61.5 km/h, 2→3단은 약 94.1 km/h이므로 정지 출발 후 100 km/h 가속 상태는 **3단·약 4,641 rpm**이다. 이는 기어비로 계산한 값이며 실제 변속 제어 맵을 검증한 결과는 아니다.

100 km/h·6단에서 변속등 7칸이 켜진 사용자 사례를 점검했으나 현재 3.3T 물리 상태에서는 재현하지 못했다. 가솔린 기어비를 임의로 변경하지 않았다. 별도의 2.2 디젤 추정 기어비와 가속 튜닝 조합에서는 유사 화면이 재현되지만, 이를 사용자의 3.3T 사례 원인으로 확정하지 않는다. 디젤의 국내 단별·종감속비 확보는 별도 미완료 항목이다.

모바일과 PC의 계기판에 실제 관찰 차량 번호·엔진 사양·구동방식과 계산 RPM을 함께 표시한다. RPM은 물리 변속 상태를 읽어 10 rpm 단위로 반올림하고 ≈를 붙인다. 관찰 전환과 세대 전환 때 동일한 차량의 사양·기어·RPM을 함께 갱신한다. `render_game_to_text`의 `watchIdentity`에는 동일 차량의 UID·variantId·variantLabel·차속을 포함해 상태를 대조할 수 있다. IVT처럼 물리 RPM이 없는 경우 숫자를 만들지 않는다.

## 프로필 선택 규칙과 API

브라우저에서는 `window.PowertrainProfiles`, Node에서는 CommonJS를 제공한다. `resolve(car)`는 차량·출고 사양, 파워트레인, 변속기 형식·단수, 회전수 기준과 함께 `gearRatios`, `finalDriveRatio`, `finalDriveRatios`, `ratioStatus`, `ratioMarket`, `estimatedFields`, `referenceFields`, `verifiedFields`, `sourceIds`, `shiftModel`을 반환한다. 싼타페 DCT처럼 단마다 종감속비가 다르면 `finalDriveRatios` 배열을 사용한다. 정적 `PROFILES`, `FALLBACKS`, `SOURCES`, `SHIFT_MODELS`도 제공하며 값은 동결되어 있다. 기어비가 미확인인 경우 표는 `null`이며 출처 확인처럼 꾸미지 않는다. `shiftModel.family`는 `manual`, `dual-clutch`, `torque-converter`, `hybrid-step`, `continuous`, `single-speed`, `unknown` 중 하나다. IVT·EV는 `status:'not-applicable'`, 알려지지 않은 변속기는 `status:'unavailable'`이며 다단 변속 이벤트를 만들지 않는다.

`PowertrainDynamics.describeGearing(car)`는 공유 유효 반경·총 감속비·출처 상태를, `gearSpeedAtRPM(car, gear, rpm)`은 해당 조합의 이론 차속(m/s)을 돌려준다. Telemetry의 동일 API도 이 계산을 사용한다. HEV 상태의 `battery.cornerPhase`는 `straight`, `corner`, `apex-exit`, `exit` 중 하나이며 SOC가 아니다.

1. `car.entrant.variantId`를 우선하고 정확한 차종 ID와 함께 일치시킨다. 직접 전달한 entrant나 `car.variantId`도 지원한다.
2. 변속기 추정에 공용 `spec.variant` 문자열을 사용하지 않는다. 공용 차량 사양의 문구가 다른 출고 조합에서 상속될 수 있기 때문이다.
3. entrant가 없는 기존 레이스는 `vehicle-specs.js`의 실제 기준 조합에 대응하는 `FALLBACKS`를 쓴다. 카니발의 공용 기준은 HEV, 포터는 5AT, 아반떼는 IVT다.
4. 알려지지 않은 variant ID나 ID가 없는 entrant는 숫자 단수를 만들지 않고 `transmissionType:'unknown'`, `gearCount:null`로 반환한다. 명시적으로 전기 구동임이 확인되는 사양은 숨긴다.

EV의 `gearCount:null`은 이 HUD에 엔진 기어 단수를 표시하지 않는다는 계약이다. 물리용 단일 감속비를 확보한 EV는 별도의 `singleSpeedReduction` 및 `reductionStatus`로 자료 범위를 기록하며, HUD 숨김과 감속비 확인 상태를 혼동하지 않는다. 웹 자료는 변경될 수 있으므로 출고 사양 갱신 시 공식 형식·단수를 다시 확인한다.
