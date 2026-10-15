# 파워트레인 표시의 근거와 범위

확인일: 2026-10-15. `powertrain-profiles.js`는 하단 우측 계기판의 변속기 형식·단수와 확보한 기어비를 출고 사양 ID에 연결한다. **동일 시장 공식값**, **다른 시장의 공식 참고값**, **미확인 차종의 추정값**을 구분한다. 원본 ECU, CAN 계측, 엔진·변속기 제어 맵을 수록한 것이 아니다.

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
| 전기형 G70 `g70-2.0t-rwd`, `g70-2.0t-awd`, `g70-3.3t-rwd`, `g70-3.3t-awd` | 모두 8단 자동 | [2019 국내 제조사 카탈로그 보관본](https://www.auto-brochures.com/makes/genesis/G70/Genesis_int%20G70_2019.pdf). 북미 6MT는 선택 목록에 포함하지 않는다. |
| A90 수프라 `supra-3.0t-rz` | 8단 스포츠 자동 | [토요타 2019 일본 공식 제원표](https://toyota.jp/pages/contents/carlineup/archive/supra/2019-05/pdf/supra_main_s_201905.pdf). RZ 3.0T 단일 트림. |
| 그랜저 `grandeur-2.5`, `grandeur-3.5-fwd`, `grandeur-3.5-awd` | 모두 8단 자동 | [현대 2027 그랜저 제원 PDF](https://www.hyundai.com/contents/repn-car/catalog/spec/grandeur-27fl-spec.pdf) 1쪽 |
| 싼타페 `santafe-2.5t-fwd`, `santafe-2.5t-awd` | 습식 8단 DCT | [현대 싼타페 가격·기본 파워트레인](https://www.hyundai.com/kr/ko/e/vehicles/santafe/price), [2026 가격표 PDF](https://www.hyundai.com/contents/repn-car/catalog/santafe-2026-price.pdf) |
| 스타리아 `staria-lpg` | 8단 자동 | [현대 더 뉴 스타리아 라운지 가격](https://www.hyundai.com/kr/ko/e/vehicles/the-new-staria-lounge/price)의 LPG 3.5 파워트레인 |
| 토레스 `torres-1.5t-fwd`, `torres-1.5t-awd` | 아이신 8단 자동 | [KGM 2026년 5월 뉴 토레스 출시 설명](https://allways.kg-mobility.com/kgm-%EB%89%B4-%ED%86%A0%EB%A0%88%EC%8A%A4-%EC%B6%9C%EC%8B%9C-%ED%8C%8C%EC%9B%8C%ED%8A%B8%EB%A0%88%EC%9D%B8-%EC%97%85%EA%B7%B8%EB%A0%88%EC%9D%B4%EB%93%9C-%EC%A0%95%ED%86%B5-suv-%EA%B0%90%EC%84%B1/). 이전 6AT 토레스와 구분한다. |
| 포터 II `porter-lpg-mt` | 6단 수동 | [현대 포터 II 카탈로그](https://www.hyundai.com/contents/repn-car/catalog/porter2-catalog.pdf) PDF 5·11쪽의 LPG 초장축 슈퍼캡 |
| 포터 II `porter-lpg-at` | 5단 자동 | 같은 [포터 II 카탈로그](https://www.hyundai.com/contents/repn-car/catalog/porter2-catalog.pdf) PDF 5·11쪽. 이 5AT는 2WD 사양이며 4WD 수동 사양을 혼합하지 않는다. |
| 레이 `ray-ev` | 전기 구동, 이 HUD 숨김 | [기아 레이 EV 제원](https://www.kia.com/kr/vehicles/ray-ev/specification) |
| 아이오닉 5 `ioniq5-standard`, `ioniq5-long-rwd`, `ioniq5-long-awd` | 전기 구동, 이 HUD 숨김 | [현대 2027 아이오닉 5 제원 PDF](https://www.hyundai.com/contents/repn-car/catalog/spec/ioniq5-27my-spec.pdf) |
| 무쏘 EV `musso-ev-fwd`, `musso-ev-awd` | 전기 구동, 이 HUD 숨김 | [KGM 2026년 3월 무쏘 EV 가격·제원 PDF](https://www.kg-mobility.com/attached/contents/display/file/200000200010012/20260228234258004_JNYcqu.pdf) PDF 2쪽 |

현재 무작위 출고 목록 36개 중 하이브리드는 카니발 한 조합이다. 다른 차체에도 하이브리드 판매 모델이 있다는 이유만으로 가솔린 출고 차량을 하이브리드로 표시하지 않는다. 예를 들어 [싼타페 국내 파워트레인 설명](https://www.hyundaimotorgroup.com/ko/amp/CONT0000000000106808)의 HEV는 6AT이고, 위 그랜저 PDF의 1.6 HEV 역시 6AT이며, [KGM 토레스 HEV 제원](https://www.kg-mobility.com/attached/contents/display/file/2000001000100170001/20260520173147792_o7faV8.pdf)은 e-DHT다. 이들은 현재의 가솔린 `variantId`에 매핑하지 않는다. 향후 출고 조합을 추가할 때 해당 엔진·연식·구동계의 ID와 근거를 함께 추가해야 한다. e-DHT의 운전 모드 수를 변속기 전진 단수로 사용해서도 안 된다.

## 기어비를 적용한 레이스 변속 표시

`RPM = 속도(m/s) ÷ (2π × 유효 회전반경(m)) × 60 × 해당 단 기어비 × 종감속비`로 계산한다. 아래 차량은 등비 간격 대신 공개된 **서로 다른 단별 기어비**를 사용한다.

| 적용 차량 | 1단 → 8단 | 종감속비 | 출처와 적용 범위 |
| --- | --- | --- | --- |
| G80 2.5T | 3.665 / 2.396 / 1.610 / 1.190 / 1.000 / 0.826 / 0.643 / 0.556 | 3.909 | [호주 MY2026 공식 PDF](https://www.genesis.com/content/dam/genesis/au/en/bto-assets/admin/donwloader-center-management/g80/model-thumbnail/desktop/2026_Genesis_G80_Specification_Sheet.pdf) 1–2쪽의 **2.5T RWD**. 국내 및 2.5T AWD 대응은 참조 가정이다. |
| G80 3.5T | 위 G80 2.5T와 동일 | 3.727 | 같은 PDF의 **3.5T AWD**. 국내 및 3.5T RWD 대응은 참조 가정이다. |
| G70 2.0T 전기형 | 3.964 / 2.468 / 1.610 / 1.176 / 1.000 / 0.832 / 0.652 / 0.565 | 3.727 | [Genesis Motor America의 2019 전기형 공식 발표](https://www.prnewswire.com/news-releases/2019-genesis-g70-equipped-to-compete-300679294.html) 8AT 표. 2019 미국 수치이며 국내 일치는 미확인이다. |
| G70 3.3T 전기형 | 3.665 / 2.396 / 1.610 / 1.190 / 1.000 / 0.826 / 0.643 / 0.556 | 3.538 | 같은 2019 미국 공식 표. 6MT 열이나 2021 페이스리프트를 혼합하지 않는다. 국내 출력·질량은 변경하지 않는다. |
| 수프라 2019 일본 RZ | 5.250 / 3.360 / 2.172 / 1.720 / 1.316 / 1.000 / 0.822 / 0.640 | 3.154 | [일본 공식 제원표](https://toyota.jp/pages/contents/carlineup/archive/supra/2019-05/pdf/supra_main_s_201905.pdf)의 동일 연식·시장·트림. |

G80의 [2024 영국 공식 제원표](https://www.genesis.com/content/dam/genesis-web-eu/documents/uk/pricelists/genesis_g80_pricelist_uk.pdf)에는 6단이 0.832인 표도 있어 시장 차이를 무시하지 않는다. 프로필에서 G80·G70은 `ratioStatus:'reference-market'`, 수프라는 `verified-exact-market`로 구분한다. 국내 G80의 실제 기어비와 엔진별 레드라인·WOT 변속 맵은 이번 자료로 확정하지 못했다.

기어비를 적용한 세 차종은 출고 타이어 규격에서 계산한 뒤 바퀴 반경을 기준으로, 유효 회전반경에 **0.985의 추정 보정**을 적용한다. 실측 타이어 회전수나 동하중 변형값은 아니다. G80의 275/35R20 뒤 타이어는 명목 반경 0.35025 m, 모형 유효 반경 약 0.3450 m다. 튜닝 시에는 기존 `reduction / factoryReduction` 비율만 표시용 종감속비에 곱한다. 종감속 튜닝이나 타이어 보정도 출고 기어비 자체의 공식값과 구분한다.

변속 스케줄은 **레이스 전개 가속(WOT)용 추정값**이다. 일정 속도로 순항할 때 연비를 위해 높은 단을 고르는 자동변속기 제어와 다르다. G80은 6200 rpm, G70·수프라는 6500 rpm을 표시 업시프트 기준으로 쓴다. 제조사 최고출력 회전수(G80 5800, G70 2.0/3.3 6200/6000, 수프라 5000 rpm)를 레드라인이나 실제 변속 시점으로 단정하지 않는다.

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

표는 **출고 ECU의 실제 변속 속도나 차량의 도달 가능 속도가 아니다**. 호주 공식 적용 조합은 2.5T RWD·3.5T AWD이며, 현재 모형에서는 동일 엔진의 다른 구동 사양에도 같은 비율을 참고 적용한다. WOT 기준 6200 rpm과 유효 반경 보정은 추정이고, 물리 엔진의 출력·공기저항·속도 제한에 따라 해당 변속 지점까지 도달하지 않을 수 있다. 튜닝하면 표시용 종감속비가 달라져 표의 속도도 바뀐다.

이 기준에서 순정 G80은 100 km/h에서 3단, 190 km/h에서 약 5단이다. 7→8단 표시 기준은 2.5T 약 321 km/h, 3.5T 약 336 km/h로 계산되며 **그 속도를 실제로 낼 수 있다는 뜻은 아니다**. 레이스의 속도 상한·출력 때문에 높은 단까지 올라가지 않을 수 있다. 이전의 공용 등비 감속 근사에서 190 km/h 부근에 8단이 뜨던 현상을 제거한다.

코너 제동 후 다시 전개 가속할 때는 정격 출력의 35%를 넘는 양의 휠 추진력과 순가속을 확인해 부하 다운시프트를 허용한다. 이전 단으로 내려가도 표시 변속 회전수의 90% 미만일 때만 한 단씩 내려가며, 모든 변속 사이에는 최소 0.65초를 둔다. 200 km/h에서 제동한 뒤 100 km/h로 재가속하는 G80도 3단으로 돌아온다. 무부하 감속의 낮은 다운시프트 문턱은 유지해 경계 속도에서 단수가 반복 전환되는 것을 막는다.

나머지 기어비 미확인 차량은 `ratioStatus:'estimated'`로 남긴다. 기존 1단 총 감속비 13.5와 단간 비율(4단 .66 / 5단 .71 / 6단 .75 / 8단 .81)은 추정이며 제조사 기어비로 표시하지 않는다. 일반 업시프트 6000 rpm, 포터 LPG 4000 rpm, 공회전 표시 900 rpm, 표시 범위 상단 일반 7000/포터 5000 rpm 역시 모형값이다. IVT는 숫자 단수를 만들지 않고 `IVT`로 표시한다.

모든 회전수·변속 표시는 계산된 차속을 읽기만 한다. 실제 레이스의 구동력·제동력·감속비·코너 속도·랩 타임·튜닝 점수는 바꾸지 않는다. 토크컨버터 슬립·실제 변속 지연·클러치 조작도 이번 HUD에서 물리 엔진에 추가하지 않는다.

## 하이브리드 에너지 흐름

하이브리드 게이지는 **충전/사용의 방향과 상대 강도**를 나타낸다. **배터리 잔량(SOC), kWh 잔여량, 실제 회생 전력 또는 실제 배터리 전력 계측이 아니다.** 흐름 값을 적분해서 잔량으로 만들지 않는다.

1. 실제 휠 제동 전력이 100 W를 넘고 속도가 0.5 m/s를 넘는 첫 물리 틱부터 충전한다. 코너 진입 판정을 기다리지 않는다. 내리막 중 제동으로도 순가속이 남는 경우에는 실제 제동 일을 우선한다. 반대로 오르막에서 구동력을 쓰면서 느려진다고 충전으로 표시하지 않는다.
2. 레이싱 라인의 곡률과 횡가속을 0.16초로 평활화하고 진입/탈출 문턱과 0.18/0.22초 지속 조건을 분리한다. 코너에 0.45초 이상 머문 뒤 곡률이 그 코너의 정점에서 12% 줄고 최저속도보다 0.25 m/s 이상 회복하며 실제 추진·가속이 0.18초 이어지면 클리핑 후 구간으로 판단한다. 정밀 측량된 클리핑 좌표가 아니라 모형 경로로부터의 보수적인 추정이다.
3. 클리핑 후에는 적격 가속 시간에 따라 1.2초 동안 사용 요청을 부드럽게 0→75%로 높인다. 확정 탈출 뒤 4초 동안은 사용 요청 100%를 유지하되, 실제 가속과 양의 휠 추진력이 있을 때만 표시한다. 이 100%는 표시용 최대 보조 요청이며 실제 모터 전력이 정격 100%라는 뜻은 아니다.
4. 제동은 항상 사용보다 우선하고, 추진력이 없거나 가속하지 않으면 사용을 즉시 해제한다. 내리막 관성 가속만으로 전기 사용을 만들지 않는다. 표시 막대는 적격 흐름으로 부드럽게 들어가며 에너지 일을 하지 않을 때는 중립으로 돌아온다.
5. 클리핑을 지난 뒤 짧은 제동 보정이 발생해도 코너 단계를 되감지 않는다. 제동 흐름만 즉시 우선한다. 반대 방향의 지속 코너는 새 시케인 접근으로 인식한다. 짧은 곡률 스파이크·코너 중간 틈 때문에 보조 창을 반복해서 새로 열지 않는다.

테스트는 실제 Spa 고도·레이싱 라인 한 바퀴에서 모든 적격 제동 틱의 즉시 충전, 코너 내부의 점진 사용, 탈출 후 최대 요청, 가속/추진 조건 및 단계 흔들림을 검증한다. 동일 물리 틱을 1×·2×·3× 및 불규칙 렌더 배치로 전달해도 표시가 같고, HUD를 완전히 제거한 엔진과 물리 상태·랩타임·순위·세대 평가가 동일함을 비교한다.

실차의 충전 상태·배터리 온도·충전 수용 한계·엔진 운전 여부·동력 분배 제어 맵을 확보하지 않았다. 따라서 모형의 충전·보조 시점과 강도는 제조사의 제어 전략을 검증하거나 복제한 결과가 아니다. 회생으로 계산된 제동력을 다시 더하거나, 보조 표시 때문에 레이스 출력을 추가하지 않는다. 엔진이 없는 EV는 이 엔진 회전수·기어·HEV 흐름 HUD 전체를 숨긴다.

## 프로필 선택 규칙과 API

브라우저에서는 `window.PowertrainProfiles`, Node에서는 CommonJS를 제공한다. `resolve(car)`는 차량·출고 사양, 파워트레인, 변속기 형식·단수, 회전수 표시 기준과 함께 `gearRatios`, `finalDriveRatio`, `ratioStatus`, `ratioMarket`, `estimatedFields`, `referenceFields`, `verifiedFields`, `sourceIds`를 반환한다. 정적 `PROFILES`, `FALLBACKS`, `SOURCES`도 제공하며 값은 동결되어 있다. 기어비가 미확인인 경우 표는 `null`이며 출처 확인처럼 꾸미지 않는다.

`PowertrainTelemetry.describeGearing(car)`는 표시용 유효 반경·총 감속비·출처 상태를, `gearSpeedAtRPM(car, gear, rpm)`은 해당 조합의 이론 차속(m/s)을 돌려준다. HEV 상태의 `battery.cornerPhase`는 `straight`, `corner`, `apex-exit`, `exit` 중 하나이며 SOC가 아니다.

1. `car.entrant.variantId`를 우선하고 정확한 차종 ID와 함께 일치시킨다. 직접 전달한 entrant나 `car.variantId`도 지원한다.
2. 변속기 추정에 공용 `spec.variant` 문자열을 사용하지 않는다. 공용 차량 사양의 문구가 다른 출고 조합에서 상속될 수 있기 때문이다.
3. entrant가 없는 기존 레이스는 `vehicle-specs.js`의 실제 기준 조합에 대응하는 `FALLBACKS`를 쓴다. 카니발의 공용 기준은 HEV, 포터는 5AT, 아반떼는 IVT다.
4. 알려지지 않은 variant ID나 ID가 없는 entrant는 숫자 단수를 만들지 않고 `transmissionType:'unknown'`, `gearCount:null`로 반환한다. 명시적으로 전기 구동임이 확인되는 사양은 숨긴다.

EV의 `gearCount:null`은 실제 감속기의 상세 구성을 검증했다는 뜻이 아니라 이 HUD에 엔진 기어 단수를 표시하지 않는다는 계약이다. 웹 자료는 변경될 수 있으므로 출고 사양 갱신 시 공식 형식·단수를 다시 확인한다.
