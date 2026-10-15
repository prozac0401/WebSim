# 파워트레인 표시의 근거와 범위

확인일: 2026-10-15. `powertrain-profiles.js`는 상단 계기판에 사용할 변속기 형식과 전진 단수를 현재 출고 사양 ID에 연결한다. 공식 제조사 자료에서 확인한 **형식·단수**와 화면을 움직이기 위한 **추정 회전수·감속비·에너지 흐름**을 구분한다. 원본 ECU, CAN 계측, 엔진·변속기 제어 맵을 수록한 것이 아니다.

## 현재 출고 조합별 변속기

| 차종과 `variantId` | 확인한 형식·단수 | 제조사 근거 |
| --- | --- | --- |
| 레이 `ray-1.0-14`, `ray-1.0-15` | 4단 자동 | [기아 레이 제원](https://www.kia.com/kr/vehicles/ray/specification)의 14/15인치 연비 표 |
| 모닝 `morning-1.0-14`, `morning-1.0-16` | 4단 자동 | [기아 모닝 가격·기본 품목](https://www.kia.com/kr/vehicles/morning/price) |
| 아반떼 `avante-2.0-16`, `avante-2.0-18` | 스마트스트림 IVT, 숫자 단수 없음 | [현대 2027 아반떼 제원 PDF](https://www.hyundai.com/contents/repn-car/catalog/spec/avante-27fc-spec.pdf) 1쪽. 2.0 가솔린에 해당하며 별도 HEV의 6DCT를 적용하지 않는다. |
| K5 `k5-2.0`, `k5-2.0lpg` | 6단 자동 | [기아 K5 제원](https://www.kia.com/kr/vehicles/k5/specification)의 가솔린/LPG 연비 표 |
| K5 `k5-1.6t` | 8단 자동 | 같은 [K5 제원](https://www.kia.com/kr/vehicles/k5/specification)의 1.6 터보 표 |
| 카니발 `carnival-3.5` | 8단 자동 | [기아 카니발 제원](https://www.kia.com/kr/vehicles/carnival/specification)의 3.5 가솔린 9인승 18인치 표 |
| 카니발 `carnival-1.6heV` | 6단 자동, 하이브리드 | 같은 [카니발 제원](https://www.kia.com/kr/vehicles/carnival/specification)의 1.6 터보 HEV 9인승 18인치 표. ID의 대소문자를 보존한다. |
| G80 `g80-2.5t-rwd`, `g80-2.5t-awd`, `g80-3.5t-rwd`, `g80-3.5t-awd` | 모두 8단 자동 | [제네시스 국내 G80 제원](https://www.genesis.com/kr/ko/models/luxury-sedan-genesis/g80/specs.html)의 G80 2.5T/3.5T 2WD/AWD 연비 표. 같은 페이지에 포함된 G70·GV70·G90 표와 구분했다. |
| 그랜저 `grandeur-2.5`, `grandeur-3.5-fwd`, `grandeur-3.5-awd` | 모두 8단 자동 | [현대 2027 그랜저 제원 PDF](https://www.hyundai.com/contents/repn-car/catalog/spec/grandeur-27fl-spec.pdf) 1쪽 |
| 싼타페 `santafe-2.5t-fwd`, `santafe-2.5t-awd` | 습식 8단 DCT | [현대 싼타페 가격·기본 파워트레인](https://www.hyundai.com/kr/ko/e/vehicles/santafe/price), [2026 가격표 PDF](https://www.hyundai.com/contents/repn-car/catalog/santafe-2026-price.pdf) |
| 스타리아 `staria-lpg` | 8단 자동 | [현대 더 뉴 스타리아 라운지 가격](https://www.hyundai.com/kr/ko/e/vehicles/the-new-staria-lounge/price)의 LPG 3.5 파워트레인 |
| 토레스 `torres-1.5t-fwd`, `torres-1.5t-awd` | 아이신 8단 자동 | [KGM 2026년 5월 뉴 토레스 출시 설명](https://allways.kg-mobility.com/kgm-%EB%89%B4-%ED%86%A0%EB%A0%88%EC%8A%A4-%EC%B6%9C%EC%8B%9C-%ED%8C%8C%EC%9B%8C%ED%8A%B8%EB%A0%88%EC%9D%B8-%EC%97%85%EA%B7%B8%EB%A0%88%EC%9D%B4%EB%93%9C-%EC%A0%95%ED%86%B5-suv-%EA%B0%90%EC%84%B1/). 이전 6AT 토레스와 구분한다. |
| 포터 II `porter-lpg-mt` | 6단 수동 | [현대 포터 II 카탈로그](https://www.hyundai.com/contents/repn-car/catalog/porter2-catalog.pdf) PDF 5·11쪽의 LPG 초장축 슈퍼캡 |
| 포터 II `porter-lpg-at` | 5단 자동 | 같은 [포터 II 카탈로그](https://www.hyundai.com/contents/repn-car/catalog/porter2-catalog.pdf) PDF 5·11쪽. 이 5AT는 2WD 사양이며 4WD 수동 사양을 혼합하지 않는다. |
| 레이 `ray-ev` | 전기 구동, 이 HUD 숨김 | [기아 레이 EV 제원](https://www.kia.com/kr/vehicles/ray-ev/specification) |
| 아이오닉 5 `ioniq5-standard`, `ioniq5-long-rwd`, `ioniq5-long-awd` | 전기 구동, 이 HUD 숨김 | [현대 2027 아이오닉 5 제원 PDF](https://www.hyundai.com/contents/repn-car/catalog/spec/ioniq5-27my-spec.pdf) |
| 무쏘 EV `musso-ev-fwd`, `musso-ev-awd` | 전기 구동, 이 HUD 숨김 | [KGM 2026년 3월 무쏘 EV 가격·제원 PDF](https://www.kg-mobility.com/attached/contents/display/file/200000200010012/20260228234258004_JNYcqu.pdf) PDF 2쪽 |

현재 무작위 출고 목록 31개 중 하이브리드는 카니발 한 조합이다. 다른 차체에도 하이브리드 판매 모델이 있다는 이유만으로 가솔린 출고 차량을 하이브리드로 표시하지 않는다. 예를 들어 [싼타페 국내 파워트레인 설명](https://www.hyundaimotorgroup.com/ko/amp/CONT0000000000106808)의 HEV는 6AT이고, 위 그랜저 PDF의 1.6 HEV 역시 6AT이며, [KGM 토레스 HEV 제원](https://www.kg-mobility.com/attached/contents/display/file/2000001000100170001/20260520173147792_o7faV8.pdf)은 e-DHT다. 이들은 현재의 가솔린 `variantId`에 매핑하지 않는다. 향후 출고 조합을 추가할 때 해당 엔진·연식·구동계의 ID와 근거를 함께 추가해야 한다. e-DHT의 운전 모드 수를 변속기 전진 단수로 사용해서도 안 된다.

## 회전수와 변속 표시의 추정값

`idleRPM`, `shiftRPM`, `maxRPM`, `total1stReduction`, `ratioStep`은 모두 **표시용 모형값**이다. 실제 공회전 제어, 출고 변속 시점, 레드라인, 각 단 기어비 또는 종감속비를 검증한 수치가 아니다. 최고출력 발생 회전수를 엔진 레드라인이라고 해석하지 않는다.

| 표시 매개변수 | 모형값 | 의미 |
| --- | --- | --- |
| `idleRPM` | 900 rpm | 엔진이 작동할 때의 표시 하한 근사 |
| `shiftRPM` | 일반 내연기관/HEV 6000 rpm, 포터 LPG 4000 rpm | 표시 변속 스케줄의 기준. 실제 변속 로직을 주장하지 않는다. |
| `maxRPM` | 일반 7000 rpm, 포터 LPG 5000 rpm | 계기판 표시 범위의 상단. 제조사 레드라인이 아니다. |
| `total1stReduction` | 13.5 | 차속과 바퀴 반지름을 표시 회전수로 연결하는 1단 총 감속비 근사 |
| `ratioStep` | 4단 0.66 / 5단 0.71 / 6단 0.75 / 8단 0.81 | 한 단 올라갈 때 이전 단에 곱하는 등비 근사. 실제 변속기는 이처럼 균일한 비율이 아닐 수 있다. |

포터 LPG의 공식 최고출력 발생 회전수는 3800 rpm이므로 일반 승용차와 같은 6000 rpm 표시 스케줄을 사용하지 않는다. 4000/5000 rpm이라는 표시 기준 자체는 추정이다. IVT에는 `gearCount:null`을 반환하며 `IVT`/`D`로 표시한다. 가상 1~8단을 제조사 실제 단수처럼 만들지 않는다. 수동변속기 모델의 화면상 변속도 시뮬레이터가 자동으로 표시하며 운전자 클러치 조작을 재현하지 않는다.

회전수·변속 표시는 이미 계산된 차속과 주행 상태를 읽는다. 실제 레이스의 구동력·제동력·기어 감속비·코너 속도·랩 타임을 바꾸지 않는다. 출력 튜닝 효과나 변속 충격에 따른 추가 가속을 중복 적용하지 않는다.

## 하이브리드 에너지 흐름

하이브리드 게이지는 감속할 때 **충전 방향**, 코너 탈출 초반의 가속 구간에서는 **배터리 사용 방향**으로 움직이는 표시용 모형이다. 방향과 상대 강도를 보여 주며 **배터리 잔량(SOC), kWh 잔여량, 실제 회생 전력 또는 실제 배터리 전력 계측이 아니다.** 값을 시간에 따라 쌓아서 잔량으로 해석하지 않는다.

실차의 충전 상태·배터리 온도·충전 수용 한계·엔진 운전 여부·동력 분배 제어 맵을 확보하지 않았다. 따라서 모형의 충전·보조 시점과 강도는 제조사의 제어 전략을 검증하거나 복제한 결과가 아니다. 회생으로 계산된 제동력을 다시 더하거나, 보조 표시 때문에 레이스 출력을 추가하지 않는다. 엔진이 없는 EV는 이 엔진 회전수·기어·HEV 흐름 HUD 전체를 숨긴다.

## 프로필 선택 규칙과 API

브라우저에서는 `window.PowertrainProfiles`, Node에서는 CommonJS를 제공한다. `resolve(car)`는 `{vehicleId,variantId,powertrainType,visible,transmissionType,gearCount,transmissionLabel,idleRPM,shiftRPM,maxRPM,total1stReduction,ratioStep,estimatedFields,sourceIds,reviewedAt,verifiedFields}`를 반환한다. 정적 `PROFILES`, `FALLBACKS`, `SOURCES`도 제공하며 값은 동결되어 있다.

1. `car.entrant.variantId`를 우선하고 정확한 차종 ID와 함께 일치시킨다. 직접 전달한 entrant나 `car.variantId`도 지원한다.
2. 변속기 추정에 공용 `spec.variant` 문자열을 사용하지 않는다. 공용 차량 사양의 문구가 다른 출고 조합에서 상속될 수 있기 때문이다.
3. entrant가 없는 기존 레이스는 `vehicle-specs.js`의 실제 기준 조합에 대응하는 `FALLBACKS`를 쓴다. 카니발의 공용 기준은 HEV, 포터는 5AT, 아반떼는 IVT다.
4. 알려지지 않은 variant ID나 ID가 없는 entrant는 숫자 단수를 만들지 않고 `transmissionType:'unknown'`, `gearCount:null`로 반환한다. 명시적으로 전기 구동임이 확인되는 사양은 숨긴다.

EV의 `gearCount:null`은 실제 감속기의 상세 구성을 검증했다는 뜻이 아니라 이 HUD에 엔진 기어 단수를 표시하지 않는다는 계약이다. 웹 자료는 변경될 수 있으므로 출고 사양 갱신 시 공식 형식·단수를 다시 확인한다.
