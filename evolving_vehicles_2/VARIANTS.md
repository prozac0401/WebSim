# 원메이크 출고 사양과 튜닝 진화 모형

확인일: 2026-10-19. 한 레이스에는 선택한 차체 한 종류만 들어갑니다. 배기량, 엔진, 구동계, 출력, 토크, 공차중량은 아래의 **완성된 출고 조합** 중에서 뽑습니다. 각 수치를 따로 추첨하거나 다른 차종의 엔진을 붙이지 않습니다. 전기차의 배기량은 `null`이며 화면에는 전기모터로 표시합니다. **예산 없음**은 튜닝과 보정 혜택을 모두 끈 출고 상태 비교입니다.

현재 선택 목록은 **13차종·39사양**입니다. 그랜저·일반 아반떼·레이·무쏘 EV·포터 II는 적합한 외형을 확보할 때까지 숨깁니다. 아래 문서와 엔진 데이터의 **18차종·53사양**은 복구를 위해 보존하며, CN7 아반떼 N은 계속 선택할 수 있습니다.

## 출처와 수록 범위

| 차체 | 수록 출고 조합 | 제조사 자료 |
| --- | --- | --- |
| 레이 | 1.0 가솔린 FWD 14/15인치, EV FWD 35.2 kWh | [가솔린 제원](https://www.kia.com/kr/vehicles/ray/specification), [EV 제원](https://www.kia.com/kr/vehicles/ray-ev/specification) |
| 모닝 | 1.0 가솔린 FWD 14/16인치 | [제원](https://www.kia.com/kr/vehicles/morning/specification) |
| 아반떼 | 2027 2.0 가솔린 FWD 16/18인치 | [제원 PDF](https://www.hyundai.com/contents/repn-car/catalog/spec/avante-27fc-spec.pdf) |
| K5 | 국내 2.0 가솔린·1.6 터보·2.0 LPG·2.0 HEV, 미국 MY2026 GT 2.5T · 모두 FWD | [국내 제원](https://www.kia.com/kr/vehicles/k5/specification), [미국 GT 제원](https://www.kiamedia.com/us/es/models/k5/2026/specifications) |
| 카니발 | 9인승 18인치 · 3.5 가솔린/1.6 터보 HEV, 2024 국내 2.2 디젤 · FWD | [현행 제원 및 HEV 합산 성능](https://www.kia.com/kr/vehicles/carnival/specification), [기아 2024년 4월 카탈로그](https://rental.kia.com/rentfile/carseries/carseries_1713417958657.pdf) |
| G80 | 20인치 기본모델 · 2.5T/3.5T 각각 RWD/AWD | [한국 시장 제원·중량](https://www.genesis.com/kr/en/models/luxury-sedan-genesis/g80/specs.html), [엔진·배기량·출력·토크](https://newsroom.genesis.com/the-all-new-genesis-g80-digital-world-premiere-leading-design-and-luxury-focused-technology/) |
| 아이오닉 5 | Standard RWD 19인치, Long Range RWD/AWD 20인치 | [2027 제원 PDF](https://www.hyundai.com/contents/repn-car/catalog/spec/ioniq5-27my-spec.pdf) |
| 그랜저 | 20인치 · 2.5 가솔린 FWD, 3.5 가솔린 FWD/AWD | [2027 제원 PDF](https://www.hyundai.com/contents/repn-car/catalog/spec/grandeur-27fl-spec.pdf) |
| 싼타페 | 2.5 터보 8DCT 5인승 21인치, 1.6 터보 HEV 6AT 5인승 18인치 · 각각 FWD/AWD | [공식 소개·제원](https://www.hyundai.com/kr/ko/e/vehicles/santafe/intro), [HEV 제원](https://www.hyundai.com/kr/ko/e/vehicles/santafe-hybrid/intro), [2026 가격표의 중량·변속기](https://www.hyundai.com/contents/repn-car/catalog/santafe-2026-price.pdf) 3쪽 |
| 스타리아 | 현행 라운지 7인승 3.5 LPG FWD, 2021 국내 라운지 7인승 2.2 디젤 FWD/AWD | [현행 소개·제원](https://www.hyundai.com/kr/ko/e/vehicles/the-new-staria-lounge/intro), [2021 출시형](https://www.hyundai.com/kr/ko/brand/brandstory/model/staria-history/2021-staria-lounge), [2021 제조사 카탈로그 보관본](https://autocatalogarchive.com/wp-content/uploads/2021/05/Hyundai-Staria-Lounge-2021-KR.pdf) |
| 무쏘 EV | 17인치 FWD/AWD · 80.6 kWh | [KGM 공식 쇼룸](https://www.kg-mobility.com/pr/model/show-room/200000100030003) |
| 토레스 | 1.5 터보 8AT FWD/AWD | [KGM 공식 쇼룸](https://www.kg-mobility.com/pr/model/show-room/200000100010001) |
| 포터 II | 초장축 슈퍼캡 RWD · 현행 2.5 LPG 터보 및 2020 국내 A-2 2.5 CRDi 디젤 · 각각 6MT/5AT | [현행 LPG 카탈로그](https://www.hyundai.com/contents/repn-car/catalog/porter2-catalog.pdf), [2020년 3월 디젤 카탈로그](https://www.hyundai.com/content/dam/hyundai/kr/ko/data/vehicles/catalog/porter2-catalog.pdf) |
| G70 전기형 | 2019 국내 2.0T/3.3T 가솔린·2.2 디젤 RWD/AWD · 모두 8AT | [제조사 카탈로그 보관본](https://www.auto-brochures.com/makes/genesis/G70/Genesis_int%20G70_2019.pdf), [2편 추가 차량의 출처·연식 구분](ADDITIONAL-VEHICLES.md) |
| GR 수프라 A90 | 2019 일본 RZ 3.0T RWD · 8AT · 19인치 단일 사양 | [일본 공식 제원표](https://toyota.jp/pages/contents/carlineup/archive/supra/2019-05/pdf/supra_main_s_201905.pdf), [2편 추가 차량의 출처·연식 구분](ADDITIONAL-VEHICLES.md) |
| BMW M2 F87 | 2016 독일·ACEA N55 3.0T RWD · 7DCT/6MT · 19인치 | [BMW 공식 제원 PDF](https://www.press.bmwgroup.com/bulgaria/article/attachment/T0238670BG/332713), [DIN 질량과 초기형 범위](ADDITIONAL-VEHICLES.md#bmw-m2-f87-전기형) |
| 아반떼 N CN7 | 2021 국내 2.0T FWD · 8DCT/6MT · 19인치 | [현대 국내 가격·제원 PDF](https://www.hyundai.com/contents/repn-car/catalog/avante-n-price.pdf), [2021 출시형 제원](https://www.hyundai.com/kr/ko/brand/brandstory/model/avante-history/2021-avante-n) |
| GR86 ZN8 | 2022 일본 RZ 2.4 RWD · 6MT/6AT · 18인치 | [토요타 2022년 5월 공식 제원·장비 PDF](https://toyota.jp/pages/contents/carlineup/archive/gr86/2022-05/pdf/gr86_main_s_202205.pdf) 5·10·11쪽 |

KGM 수치는 공식 쇼룸 `specific.htmlList`의 기술 제원·공차중량 표에서 확인했습니다. 단위 PS는 미터마력, `kgf·m × 9.80665 = Nm`입니다. 레이 EV의 64.3 kW는 PS로 환산합니다. 기존 13종의 전장·축거 등 공통 치수는 원본 `vehicle-specs.js`를 공유하고, 별도로 명시한 프리셋의 연식·시장·엔진·질량을 사용합니다. G70·수프라는 2019 국내·일본 사양, M2는 2016 독일·ACEA 사양, 아반떼 N은 2021 국내 사양, GR86은 2022 일본 RZ 사양입니다. 해외 시스템 성능이나 기어비를 참고 적용한 항목은 아래와 파워트레인 문서에 따로 표시하며, 국내 확인값으로 합치지 않습니다. 현재 일반 아반떼 HEV는 국내 공식 공차중량을 확보하지 못해 출고 목록에서 제외했습니다. 스타리아 디젤과 포터 디젤은 단종 이전 자료의 독립 프리셋이며 현행 LPG 제원과 구분합니다. 포터의 파트타임 4WD는 AWD처럼 취급하지 않고 초장축 슈퍼캡 RWD만 수록했습니다.

제원은 해당 휠·좌석 구성의 공차 기준이며 승객·화물은 추가하지 않습니다. 모든 판매 트림을 수록했다는 뜻은 아닙니다. 차체 모델은 공통 외형을 사용하므로 그릴·휠 등 개별 트림의 세부 외관은 다를 수 있습니다.

2026-10-19에 추가한 M2는 별도 2016 독일·ACEA 조합입니다. 7DCT 1,520 kg / 6MT 1,495 kg을 모두 DIN 질량으로 사용하며 EU 운전자 포함 질량을 섞지 않습니다. 두 사양 모두 370 PS·일반 토크 465 Nm·RWD입니다. 일시 오버부스트 500 Nm 및 Competition은 포함하지 않습니다. 순정 모드는 두 변속기가 한 대씩, 유료 모드는 이 두 조합을 순환 배정합니다. 동일 출력과 구동 방식이므로 추가 보정 예산은 없습니다.

아반떼 N은 별도 차종 `avante_n`이며 `avante-n-2.0t-dct`와 `avante-n-2.0t-mt` 두 국내 출고 조합을 수록합니다. 2021년 1,998 cc·280 PS·40 kgf·m(392.266 Nm)·FWD를 유지하고 공차중량은 각각 1,485/1,450 kg입니다. NGS 일시 출력 증대를 기본 출력에 더하지 않습니다. eLSD 장비 표기는 별도 능동 제어를 뜻하지 않습니다. 두 사양의 출력과 구동 방식이 같아 보정 예산이 없고, 순정 모드에는 한 대씩 참가합니다. 호주 공식 단별 기어비는 국내 제원과 분리한 해외 참고값으로 [파워트레인 문서](POWERTRAIN-SOURCES.md)에 기록합니다.

GR86은 `gr86-2.4-rz-mt`와 `gr86-2.4-rz-at` 두 일본 RZ 조합이며 기본 사양은 MT입니다. 2,387 cc·235 PS·250 Nm·RWD·215/40R18을 유지하고 차량중량은 각각 1,270/1,290 kg입니다. 단별 기어비와 종감속비까지 같은 2022년 5월 일본 자료를 사용합니다. 국내 231 PS·MT 전용 판매 사양과 혼합하지 않습니다. 순정 모드에는 변속기별 한 대씩 참가하며 추가 보정 예산은 없습니다.

K5는 국내 1.6T 8AT·2.0 가솔린 6AT·2.0 LPG 6AT에 `k5-2.0hev`와 `k5-2.5t-gt`를 추가했습니다. 국내 HEV는 **1.6이 아닌 2.0**이며 1,999 cc·6AT·16인치·1,515 kg입니다. 국내 공식 엔진 152 PS·188.288 Nm와 모터 38.6 kW·205 Nm를 별도로 보관하고, 모형에 사용하는 시스템 195 PS·367 Nm는 [기아 아제르바이잔 K5 HEV](https://www.kia.com/az/showroom/k5-pe/specification.html)의 **해외 참고값**으로 표시합니다. 국내 시스템 성능과의 일치는 미확인이며 엔진·모터 최고값을 단순 합산하지 않습니다.

K5 GT는 **미국 MY2026**의 2,497 cc·FWD·습식 8DCT·245/40R19 조합입니다. 공식 290 SAE hp·311 lb-ft·3,596 lb를 각각 294.022 PS·421.659 Nm·1,631.118 kg으로 환산합니다. 앞축 하중 61%도 같은 미국 공식값이며 속도 상한 250 km/h와 나머지 동역학 계수는 모형 추정입니다. 차체 외형은 공용 K5 페이스리프트 모델을 사용하므로 미국 GT 전용 범퍼·휠을 재현했다는 뜻은 아닙니다. 단별 기어비와 두 종감속비는 공식값이지만 단별 종감속 배정은 추정입니다.

싼타페는 기존 국내 2.5T·8DCT·5인승 21인치와 별도로 `santafe-1.6hev-fwd`·`santafe-1.6hev-awd`를 수록합니다. HEV는 국내 1,598 cc·시스템 235 PS·6AT·235/60R18이며 FWD/AWD 질량은 각각 1,865/1,930 kg입니다. 엔진 180 PS·264.780 Nm와 모터 47.7 kW·264 Nm를 따로 기록합니다. 시스템 토크 367 Nm와 6AT 기어비·종감속비는 [현대 호주 현행 HEV 제원](https://www.hyundai.com/au/en/cars/suvs/santa-fe-hybrid/specifications)의 참고값이며 국내 일치는 미확인입니다. 이전 44.2 kW 모터 자료와 구분합니다.

디젤은 아래 일곱 출고 조합을 별도로 수록합니다. 모두 디젤 연료로 분류하며 가솔린의 회전수 범위·기어비를 그대로 적용하지 않습니다. 차체 외형은 기존 공용 모델이므로 연식별 전면부나 배기구의 완전한 외형 일치를 뜻하지 않습니다.

| 출고 ID | 연식·엔진 | 공식 성능·질량·변속기 |
| --- | --- | --- |
| `porter-diesel-mt`, `porter-diesel-at` | 2020년 3월 국내 초장축 슈퍼캡 RWD · A-2 2.5 CRDi(D4CB) · 2,497 cc | 133 PS / 26.5 kgf·m · 6MT 1,820 kg / 5AT 1,845 kg |
| `g70-2.2d-rwd`, `g70-2.2d-awd` | 2019 국내 전기형 R 2.2 VGT · 2,199 cc · 17인치 | 202 PS / 45 kgf·m · 8AT · RWD 1,690 kg / AWD 1,765 kg |
| `staria-2.2d-fwd`, `staria-2.2d-awd` | 2021 국내 라운지 7인승 R 2.2 VGT · 2,199 cc · 18인치 | 177 PS / 44 kgf·m · 8AT · FWD 2,320 kg / AWD 2,390 kg |
| `carnival-2.2d` | 2024년 4월 국내 페이스리프트 9인승 FWD · Smartstream D2.2 · 2,151 cc · 18인치 | 194 PS / 45 kgf·m · 8AT · 2,115 kg |

포터의 A-2 2.5와 G70·스타리아의 R 2.2, 카니발의 Smartstream D2.2를 같은 엔진으로 취급하지 않습니다. 특히 카니발 2,151 cc를 구형 R 2.2의 2,199 cc로 바꾸지 않습니다. 스타리아의 R 계열명은 [현대 호주 공식 자료](https://www.hyundai.com/content/dam/hyundai/au/en/models/staria/2021/docs/STARIA_Spec-Table_Feb_2023_v1.pdf)를 참고한 필드이며 국내 엔진 코드까지 확인한 것으로 표시하지 않습니다. 자료를 확보하지 못한 해당 엔진의 단별 기어비는 추정 상태를 유지합니다.

## 실측값과 모형 가정의 경계

**아래 M2의 공식 확인 항목, GR86의 평균 윤거, 미국 K5 GT의 앞축 하중 61%를 제외하면 앞뒤 정적 무게배분, 무게중심 높이, 윤거 근사값, 공기저항 면적, 타이어 접지력, 브레이크 계수, 다운포스 및 속도 상한은 모형 추정값입니다.** 제조사가 공개한 차종별 실측 값으로 주장하지 않습니다. 앞 엔진 FWD의 전륜 하중, 전륜/후륜 구동축 차이, 배터리 하부 배치, 큰 차체와 높은 무게중심, 무적재 트럭의 앞 하중 등 특성을 단순화합니다. 각 프리셋의 `modeledFields`와 `estimatedDynamics`로 구분합니다.

M2는 자료를 확보한 항목을 별도로 구분합니다. 항력면적 0.7735 m²는 공식 Cd 0.35 × 전면적 2.21 m², 모형의 단일 윤거 1.590 m는 공식 앞/뒤 1.579/1.601 m의 평균입니다. 최고속도 상한 250 km/h는 공식 기본 전자 제한값을 사용합니다. 이 세 항목은 M2의 `modeledFields`에서 제외하며, 앞축 하중 52%·무게중심 0.49 m·접지 1.04 g·제동 1.12 g 등은 추정으로 유지합니다.

GR86의 단일 윤거 1.535 m는 공식 앞/뒤 1.520/1.550 m의 평균으로 `modeledFields`에서 제외합니다. 항력면적 0.56 m²·앞축 하중 53%·무게중심 0.46 m·접지 1.00 g·제동 1.08 g·속도 상한 230 km/h는 비교용 추정값입니다.

실제 가속력은 출력/질량뿐 아니라 토크, 구동축에 걸리는 하중과 가속 시 하중 이동에 제한됩니다. AWD가 기본적으로 코너링 접지 계수를 더 받는 규칙은 없습니다. 구동 방식은 구동력 배분에 영향을 주고, 그립 보상은 사용자가 요청한 대회 형평성 규칙입니다. 상향 변속은 변속기별 시간과 토크 유지율의 보정용 가정으로 물리에 반영합니다. 수동의 동력 단절 중에는 N을 표시하고 DCT·자동은 숫자 단수를 유지합니다. 정밀 엔진 맵, 타이어 하중 민감도 측정, 실제 클러치·토크컨버터 제어, 배터리 열화·충전 상태, 연료 감소, 열에 따른 출력 저하는 재현하지 않습니다. 구체적인 가정과 출처는 [파워트레인 근거](POWERTRAIN-SOURCES.md)에 구분합니다.

## 예산 없음: 출고 상태 비교

공통 예산 **0 P (`budget === 0`)**는 순정 비교 모드입니다. 가속력·최고속도·브레이크·다운포스 및 그립의 단계와 상한을 모두 0으로 고정하고, 저출력·비 AWD 사양에 주던 추가 보정 예산도 0으로 만듭니다. 낮은 사양이 무료 보정 단계로 튜닝되는 우회 경로를 허용하지 않습니다.

수록된 출고 엔진·구동계·휠 조합별로 **정확히 한 대씩** 참가합니다. 튜닝용 참가 대수 설정은 순정 비교에 적용하지 않습니다. G80은 2종 엔진 × 2종 구동계로 4대, G70은 디젤을 포함한 3종 엔진 × 2종 구동계로 6대입니다. 스타리아는 LPG FWD와 디젤 FWD/AWD의 3대이며 수프라는 단일 사양 1대입니다. 각 차량의 유효 제원에는 동결된 출고 프리셋 객체를 그대로 사용합니다. 출력·토크·질량·무게배분·무게중심·그립·브레이크·공력·감속비·속도 상한에 튜닝 수식이나 반올림을 적용하지 않습니다. 여기서 순정은 **수록된 출고 프리셋에 튜닝을 더하지 않는다**는 뜻이며, 프리셋 자체의 동역학 추정 계수까지 제조사 실측값이 된다는 뜻은 아닙니다.

모듈 API에 같은 시드를 넣으면 같은 출고 배정 순서가 재현됩니다. 다른 시드를 넣어도 각 조합은 한 대씩 모두 포함되고 튜닝은 0단계입니다. 화면에서는 전체 출고 조합이 자동으로 참가하므로 별도 사양 재추첨은 필요하지 않습니다. 같은 노면과 주행선에서 동등 사양은 같은 주행 결과를 내는 고스트 비교입니다.

이 모드에서는 빠른 평가·레이스·동일 구성 재주행으로 비교합니다. 튜닝 조절과 다음 세대 진화는 사용하지 않으며, 기본 자동 진행은 동일한 출고 구성의 레이스를 반복합니다. 모듈 API에서 `breed`를 직접 호출하더라도 각 출고 조합을 정확히 한 대씩 유지하고 출고 프리셋과 0단계로 재구성합니다. 이전 유료 실험의 튜닝 유전자가 남은 입력도 자식에게 전달하지 않습니다. 예산 18·30·45 P를 선택하면 아래의 기존 튜닝·보정 규칙으로 돌아갑니다.

## 네 튜닝 축과 비용

비용 단위는 **가상 포인트(P)**이며 실제 원화 가격이나 판매되는 부품이 아닙니다. 단계 0은 출고 상태입니다. 각 축의 1~6단계 추가 비용은 차례로 **3, 5, 7, 10, 14, 18 P**, 누적 비용은 **3, 8, 15, 25, 39, 57 P**입니다.

| 축 | 단계당 모델 변화 | 함께 발생하는 변화 |
| --- | --- | --- |
| 가속력 `a` | 출력 × `(1+0.10a)`, 토크 × `(1+0.11a)`, 저속 감속비 × `(1+0.045a)` | 짧은 기어비에 따라 속도 상한 ÷ `(1+0.012a)` |
| 최고속도 `s` | 출력 추가 × `(1+0.025s)`, 기본 항력면적 × `(1−0.018s)`, 속도 상한 × `(1+0.04s)` | 저속 감속비 ÷ `(1+0.018s)` |
| 브레이크 `b` | 브레이크 계수 × `(1+0.095b)` | 중량 `+2b kg`; 제동은 실제 접지 한계에도 제한됨 |
| 다운포스·그립 `g` | 접지 계수 × `(1+0.065g)`, 공력 면적 `0.16g m²`, 무게중심 `−0.012g m` | 중량 `+3g kg`, 항력면적 `+0.012g² m²` |

따라서 모든 예산을 공력에 쓰면 직선 속도와 질량에서 손해를 볼 수 있습니다. 최적 배분은 서킷·노면 조건에 따라 바뀝니다. 이 튜닝 효과는 교육용 검색 공간이며 실제 차량에서 가능한 개조량을 인증하지 않습니다.

## 저사양 보상과 단계 상한

이 절은 **공통 예산이 0보다 큰 튜닝 모드**에만 적용합니다. 같은 차체의 수록 사양 중 가장 큰 출고 출력 `Pmax`를 기준으로 `r = Pmax / P`를 구합니다.

- 가속력 보상 단계: `ceil((r−1)/0.10)`, 0~3으로 제한.
- 최고속도 보상 단계: `ceil((cuberoot(r)−1)/0.025)`, 0~3으로 제한. 항력 우세 고속 영역의 출력 대비 속도 관계를 이용한 게임 규칙입니다.
- AWD 출고 조합이 있는 차체에서 비 AWD 사양은 그립 보상 2단계. AWD가 없는 차체에는 가상의 AWD를 만들어 비교하지 않습니다.
- 브레이크 보상은 0단계. 높은 출고 사양의 제동계 차이는 기초 제동 계수로 표현합니다.
- 각 항목 보상 P는 위 보상 단계까지의 누적 비용입니다. 기본 상한은 가속력 3 / 최고속도 3 / 브레이크 4 / 그립 4단계이며 해당 항목 보상 단계만큼 상한이 늘어납니다.

G80 2.5T는 3.5T에 비해 가속력 15 P, 최고속도 15 P의 추가 보상과 각 3단계의 추가 상한을 받습니다. RWD는 같은 차체 AWD 대비 그립 8 P와 2단계 추가 상한을 받습니다. G80 2.5T RWD의 상한은 6/6/4/6, 3.5T AWD는 3/3/4/4입니다. 2.5T의 가속력 3단계 출력은 모형상 395.2 PS로 3.5T 출고 380 PS에 접근합니다. 배기량과 엔진 종류 자체는 바뀌지 않습니다.

카테고리 보상은 그 항목에서만 사용됩니다. 미사용 보상을 다른 항목 예산으로 바꾸지 않습니다. `공통 지출 = Σ max(항목 누적 비용 − 항목 보상, 0)`이며 이것이 공통 예산 이하여야 합니다. 각 개체는 총 명목 비용, 항목별 보상 사용량, 실제 공통 지출, 잔액을 별도로 가집니다. 대회 형평성 보상은 정확히 같은 랩타임을 보장하지 않으며, 무게·구동력·고속 항력의 차이는 남습니다.

## 세대 검색과 재현성

첫 세대는 시드로 출고 조합 순서를 섞습니다. 유료 튜닝 모드에서는 요청한 개체 수만큼 순환 배정하므로 개체 수가 조합 수 이상이면 모든 수록 조합이 포함되며, 예산 안에서 단계를 무작위 배분합니다. 예산 없음에서는 요청 개체 수와 관계없이 모든 출고 조합을 한 대씩만 배정하고 모두 0단계로 둡니다. 같은 시드와 입력은 같은 결과를 만듭니다.

평가는 같은 코스·랩 수·노면에서 완주 시간 순입니다. 미완주 개체는 완주자 다음에 두며 진행 거리로 비교합니다. 다음 세대에는 가장 빠른 개체의 **출고 조합과 네 튜닝 단계**를 그대로 보존합니다. 나머지는 빠른 절반에서 부모를 선택해 네 단계만 교차·돌연변이시키고, 출고 사양은 한 부모의 전체 조합을 상속합니다. 예산을 초과한 자식은 내부에서 단계를 낮춥니다. 마지막 한 개체는 새로운 무작위 후보로 넣어 다양성을 유지합니다.

완주 또는 리타이어하지 않은 차가 남아 있으면 다음 세대를 만들 수 없습니다. 동일 조건의 결정론적 레이스에서 우승 유전자 보존으로 세대 최고 기록이 나빠지지 않습니다. 서킷·노면·랩 수를 변경한 기록은 직접 비교할 수 없습니다. 전역 최적해를 증명하는 알고리즘은 아니며 개선이 정체될 수 있습니다.

## 모듈 계약

`window.TuningEvolution`과 CommonJS 내보내기를 제공합니다. `createPopulation({vehicleId,count,seed,budget})`, `createEntrant({...existingEntrant,levels})`, `quote({vehicleId,variantId,levels,budget})`, `evaluate(population,race.standings())`, `breed(population,results,{seed,generation})`를 사용합니다. 사용자 수동 편집은 범위·예산 초과를 오류로 거절하여 다른 설정을 몰래 낮추지 않습니다. `quote`의 `cost`는 공통 지출, `totalCost`는 명목 총비용, `credits`는 항목별 최대 보상, `creditUsed`는 실제 사용 보상입니다.

`getRules(vehicleId, variantId, {budget})`는 선택한 예산의 상한·보정을 반환합니다. 세 번째 인수를 생략하면 기존 API와 같이 유료 튜닝 규칙을 반환합니다. 순정 모드를 판정할 때는 `{budget:0}`을 넘기거나 해당 예산을 넣은 `quote`의 결과를 사용합니다. `quote`와 `createEntrant`는 예산 0에서 하나라도 양의 튜닝 단계가 요청되면 거절합니다. 유효한 순정 견적의 단계 상한·보상·비용·잔액은 모두 0입니다.

현재 내보낸 목록은 **18차종·53사양**입니다. 검증: `node --test evolving_vehicles_2/tuning-evolution.test.cjs`. 순정 제원 객체 보존, 조합별 정확히 한 대 배정, 단일 사양의 1대 평가, 보정 우회 차단, 재추첨·직접 다음 세대 호출의 조합 수와 0단계 유지, 이전 유료 유전자 차단, 유료 18·30·45 P의 보정·다양성 유지와 기존 평가·진화 동작을 검사합니다.

## 2026-10-15 기어비 점검과 타이어 반경

휠 크기가 다른 프리셋이 공용 차체의 타이어 반경을 상속하던 부분을 아래 공식 규격으로 교정했습니다. `명목 반경(mm) = 단면폭(mm) × 편평비 / 100 + 림 지름(in) × 12.7`이며 실측 동하중 회전반경은 아닙니다. 이 반경은 저속 토크 구동력과 회전수 계산에 쓰입니다. 단별 기어비가 확보된 차량에는 추정 회전반경 보정 0.985를 적용하며, 현재 단수의 물리 구동력과 HUD 회전수가 같은 반경을 사용합니다.

| 출고 사양 | 앞·뒤 타이어 | 명목 반경 | 제조사 근거 |
| --- | --- | ---: | --- |
| 레이 14인치 | 165/60R14 | 276.8 mm | [기아 레이 제원](https://www.kia.com/kr/vehicles/ray/specification) |
| 모닝 14인치 | 175/65R14 | 291.55 mm | [기아 모닝 제원](https://www.kia.com/kr/vehicles/morning/specification) |
| 아반떼 2.0 16인치 | 205/60R16 | 326.2 mm | [현대 2027 아반떼 공식 본문](https://www.hyundai.com/contents/repn-car/html/homepage/model/avante-27fc_intro.content)의 타이어 효율 표 |
| 아반떼 2.0 18인치 | 215/45R18 | 325.35 mm | 같은 공식 본문. 기존 반경을 유지하며 규격도 명시 |
| 아반떼 N 8DCT/6MT 19인치 | 245/35ZR19 | 327.05 mm | [현대 2021 국내 제원](https://www.hyundai.com/kr/ko/brand/brandstory/model/avante-history/2021-avante-n). 일반 아반떼와 다른 규격 |
| GR86 RZ 6MT/6AT 18인치 | 215/40R18 | 314.6 mm | [토요타 일본 2022년 5월 PDF](https://toyota.jp/pages/contents/carlineup/archive/gr86/2022-05/pdf/gr86_main_s_202205.pdf) 5쪽. SZ의 17인치와 구분 |
| K5 1.6T 17인치 | 215/55R17 | 334.15 mm | [기아 K5 제원](https://www.kia.com/kr/vehicles/k5/specification)의 1.6 가솔린 터보 적용 타이어 |
| K5 2.0 가솔린·LPG·HEV 16인치 | 205/65R16 | 336.45 mm | [기아 K5 카탈로그](https://www.kia.com/content/dam/kwp/kr/ko/vehicles/pdf/catalog/catalog_k5.pdf)의 해당 16인치 조합. 기존 가솔린·LPG 반경도 이 규격으로 교정 |
| K5 MY2026 미국 GT 19인치 | 245/40R19 | 339.3 mm | [Kia America 공식 제원](https://www.kiamedia.com/us/es/models/k5/2026/specifications)의 GT 열 |
| 싼타페 1.6T HEV 18인치 | 235/60R18 | 369.6 mm | [현대 국내 HEV 제원](https://www.hyundai.com/kr/ko/e/vehicles/santafe-hybrid/intro). 2.5T 21인치와 구분 |
| 아이오닉 5 Standard 19인치 | 235/55R19 | 370.55 mm | [현대 2027 아이오닉 5 공식 본문](https://www.hyundai.com/contents/repn-car/html/homepage/model/ioniq5-27my_intro.content)의 타이어 효율 표 |

다른 엔진·연식의 타이어 표를 해당 사양의 검증값으로 취급하지 않습니다. 변속기와 감속기의 출처·적용 범위는 [파워트레인 근거](POWERTRAIN-SOURCES.md)에 정리합니다.
