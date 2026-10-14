# 원메이크 출고 사양과 튜닝 진화 모형

확인일: 2026-10-14. 한 레이스에는 선택한 차체 한 종류만 들어갑니다. 배기량, 엔진, 구동계, 출력, 토크, 공차중량은 아래의 **완성된 출고 조합** 중에서 뽑습니다. 각 수치를 따로 추첨하거나 다른 차종의 엔진을 붙이지 않습니다. 전기차의 배기량은 `null`이며 화면에는 전기모터로 표시합니다.

## 출처와 수록 범위

| 차체 | 수록 출고 조합 | 제조사 자료 |
| --- | --- | --- |
| 레이 | 1.0 가솔린 FWD 14/15인치, EV FWD 35.2 kWh | [가솔린 제원](https://www.kia.com/kr/vehicles/ray/specification), [EV 제원](https://www.kia.com/kr/vehicles/ray-ev/specification) |
| 모닝 | 1.0 가솔린 FWD 14/16인치 | [제원](https://www.kia.com/kr/vehicles/morning/specification) |
| 아반떼 | 2027 2.0 가솔린 FWD 16/18인치 | [제원 PDF](https://www.hyundai.com/contents/repn-car/catalog/spec/avante-27fc-spec.pdf) |
| K5 | 2.0 가솔린, 1.6 터보, 2.0 LPG · FWD | [제원](https://www.kia.com/kr/vehicles/k5/specification) |
| 카니발 | 9인승 18인치 · 3.5 가솔린/1.6 터보 HEV · FWD | [제원 및 시스템 합산 출력·토크](https://www.kia.com/kr/vehicles/carnival/specification) |
| G80 | 20인치 기본모델 · 2.5T/3.5T 각각 RWD/AWD | [한국 시장 제원·중량](https://www.genesis.com/kr/en/models/luxury-sedan-genesis/g80/specs.html), [엔진·배기량·출력·토크](https://newsroom.genesis.com/the-all-new-genesis-g80-digital-world-premiere-leading-design-and-luxury-focused-technology/) |
| 아이오닉 5 | Standard RWD 19인치, Long Range RWD/AWD 20인치 | [2027 제원 PDF](https://www.hyundai.com/contents/repn-car/catalog/spec/ioniq5-27my-spec.pdf) |
| 그랜저 | 20인치 · 2.5 가솔린 FWD, 3.5 가솔린 FWD/AWD | [2027 제원 PDF](https://www.hyundai.com/contents/repn-car/catalog/spec/grandeur-27fl-spec.pdf) |
| 싼타페 | 2.5 터보 5인승 21인치 FWD/AWD | [공식 소개·제원](https://www.hyundai.com/kr/ko/e/vehicles/santafe/intro), [제원 HTML](https://www.hyundai.com/contents/repn-car/html/homepage/model/santafe-26my_intro.content) |
| 스타리아 | 라운지 7인승 3.5 LPG FWD | [공식 소개·제원](https://www.hyundai.com/kr/ko/e/vehicles/the-new-staria-lounge/intro), [제원 HTML](https://www.hyundai.com/contents/repn-car/html/homepage/model/staria-lounge-26pe_intro.content) |
| 무쏘 EV | 17인치 FWD/AWD · 80.6 kWh | [KGM 공식 쇼룸](https://www.kg-mobility.com/pr/model/show-room/200000100030003) |
| 토레스 | 1.5 터보 8AT FWD/AWD | [KGM 공식 쇼룸](https://www.kg-mobility.com/pr/model/show-room/200000100010001) |
| 포터 II | 초장축 슈퍼캡 2.5 LPG 터보 RWD · 6MT/5AT | [공식 카탈로그 4·10페이지](https://www.hyundai.com/contents/repn-car/catalog/porter2-catalog.pdf) |

KGM 수치는 공식 쇼룸 `specific.htmlList`의 기술 제원·공차중량 표에서 확인했습니다. 단위 PS는 미터마력, `kgf·m × 9.80665 = Nm`입니다. 레이 EV의 64.3 kW는 PS로 환산합니다. 전장·축거 등 공통 차체 치수는 기존 `vehicle-specs.js`를 공유합니다. 이전 세대·해외 시장 조합은 섞지 않았습니다. 현재 아반떼 하이브리드의 공식 공차중량은 미공개이므로 무작위 출고 목록에서 제외했습니다. 스타리아는 확인된 라운지 LPG 조합만 쓰며 튜닝 유전자는 개체별로 달라집니다. 포터의 파트타임 4WD는 AWD처럼 취급하지 않고, 동일한 초장축 슈퍼캡 RWD 두 변속기만 수록했습니다.

제원은 해당 휠·좌석 구성의 공차 기준이며 승객·화물은 추가하지 않습니다. 모든 판매 트림을 수록했다는 뜻은 아닙니다. 차체 모델은 공통 외형을 사용하므로 그릴·휠 등 개별 트림의 세부 외관은 다를 수 있습니다.

## 실측값과 모형 가정의 경계

**앞뒤 정적 무게배분, 무게중심 높이, 윤거 근사값, 공기저항 면적, 타이어 접지력, 브레이크 계수, 다운포스 및 속도 상한은 모형 추정값입니다.** 제조사가 공개한 차종별 실측 값으로 주장하지 않습니다. 앞 엔진 FWD의 전륜 하중, 전륜/후륜 구동축 차이, 배터리 하부 배치, 큰 차체와 높은 무게중심, 무적재 트럭의 앞 하중 등 특성을 단순화합니다. 각 프리셋의 `modeledFields`와 `estimatedDynamics`로 구분합니다.

실제 가속력은 출력/질량뿐 아니라 토크, 구동축에 걸리는 하중과 가속 시 하중 이동에 제한됩니다. AWD가 기본적으로 코너링 접지 계수를 더 받는 규칙은 없습니다. 구동 방식은 구동력 배분에 영향을 주고, 그립 보상은 사용자가 요청한 대회 형평성 규칙입니다. 정밀 엔진 맵, 타이어 하중 민감도 측정, 변속 지연, 배터리 열화·충전 상태, 연료 감소, 열에 따른 출력 저하를 재현하지 않습니다.

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

같은 차체의 수록 사양 중 가장 큰 출고 출력 `Pmax`를 기준으로 `r = Pmax / P`를 구합니다.

- 가속력 보상 단계: `ceil((r−1)/0.10)`, 0~3으로 제한.
- 최고속도 보상 단계: `ceil((cuberoot(r)−1)/0.025)`, 0~3으로 제한. 항력 우세 고속 영역의 출력 대비 속도 관계를 이용한 게임 규칙입니다.
- AWD 출고 조합이 있는 차체에서 비 AWD 사양은 그립 보상 2단계. AWD가 없는 차체에는 가상의 AWD를 만들어 비교하지 않습니다.
- 브레이크 보상은 0단계. 높은 출고 사양의 제동계 차이는 기초 제동 계수로 표현합니다.
- 각 항목 보상 P는 위 보상 단계까지의 누적 비용입니다. 기본 상한은 가속력 3 / 최고속도 3 / 브레이크 4 / 그립 4단계이며 해당 항목 보상 단계만큼 상한이 늘어납니다.

G80 2.5T는 3.5T에 비해 가속력 15 P, 최고속도 15 P의 추가 보상과 각 3단계의 추가 상한을 받습니다. RWD는 같은 차체 AWD 대비 그립 8 P와 2단계 추가 상한을 받습니다. G80 2.5T RWD의 상한은 6/6/4/6, 3.5T AWD는 3/3/4/4입니다. 2.5T의 가속력 3단계 출력은 모형상 395.2 PS로 3.5T 출고 380 PS에 접근합니다. 배기량과 엔진 종류 자체는 바뀌지 않습니다.

카테고리 보상은 그 항목에서만 사용됩니다. 미사용 보상을 다른 항목 예산으로 바꾸지 않습니다. `공통 지출 = Σ max(항목 누적 비용 − 항목 보상, 0)`이며 이것이 공통 예산 이하여야 합니다. 각 개체는 총 명목 비용, 항목별 보상 사용량, 실제 공통 지출, 잔액을 별도로 가집니다. 대회 형평성 보상은 정확히 같은 랩타임을 보장하지 않으며, 무게·구동력·고속 항력의 차이는 남습니다.

## 세대 검색과 재현성

첫 세대는 시드로 출고 조합 순서를 섞은 뒤 순환 배정하므로 개체 수가 조합 수 이상이면 모든 수록 조합이 포함됩니다. 튜닝은 예산 안에서 단계별로 무작위 배분합니다. 같은 시드와 입력은 같은 결과를 만듭니다.

평가는 같은 코스·랩 수·노면에서 완주 시간 순입니다. 미완주 개체는 완주자 다음에 두며 진행 거리로 비교합니다. 다음 세대에는 가장 빠른 개체의 **출고 조합과 네 튜닝 단계**를 그대로 보존합니다. 나머지는 빠른 절반에서 부모를 선택해 네 단계만 교차·돌연변이시키고, 출고 사양은 한 부모의 전체 조합을 상속합니다. 예산을 초과한 자식은 내부에서 단계를 낮춥니다. 마지막 한 개체는 새로운 무작위 후보로 넣어 다양성을 유지합니다.

완주 또는 리타이어하지 않은 차가 남아 있으면 다음 세대를 만들 수 없습니다. 동일 조건의 결정론적 레이스에서 우승 유전자 보존으로 세대 최고 기록이 나빠지지 않습니다. 서킷·노면·랩 수를 변경한 기록은 직접 비교할 수 없습니다. 전역 최적해를 증명하는 알고리즘은 아니며 개선이 정체될 수 있습니다.

## 모듈 계약

`window.TuningEvolution`과 CommonJS 내보내기를 제공합니다. `createPopulation({vehicleId,count,seed,budget})`, `createEntrant({...existingEntrant,levels})`, `quote({vehicleId,variantId,levels,budget})`, `evaluate(population,race.standings())`, `breed(population,results,{seed,generation})`를 사용합니다. 사용자 수동 편집은 범위·예산 초과를 오류로 거절하여 다른 설정을 몰래 낮추지 않습니다. `quote`의 `cost`는 공통 지출, `totalCost`는 명목 총비용, `credits`는 항목별 최대 보상, `creditUsed`는 실제 사용 보상입니다.

검증: `node --test evolving_vehicles_2/tuning-evolution.test.cjs`. 출고 조합 불변성, G80·구동계 보상, 항목별 비용 격리, 예산·단계 제한, 고정 시드 재현, 평가 순서, 세대 우승 유전자 보존을 검사합니다.
