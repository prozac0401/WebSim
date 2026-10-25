# 멈춘 토요일 수정 요청 커버리지

기준: 2026-10-24의 `멈춘_토요일_수정_요청_프롬프트.txt`·개선 기획안 v1.0과 이후 12단계·활동 시간, 포장 귀가, 무작위 환경 확장 요청입니다. 이전 실행 보고와 첨부 문서의 Edge 7회 진행은 최신 검사 수에 합산하지 않습니다.

### 최신 수정: 다친 쪽의 무작위 선택과 좌우 일치

새 하루는 기존 환경·외형·방의 여섯 번 추출 뒤에 `conditions.injuredSide`를 `right` 또는 `left`로 한 번 정합니다. 시작 전 도입은 “한쪽 다리”로 설명하고, 시작 뒤 본문·몸 상태의 발목과 반대쪽 다리·삽화의 깁스와 지지 다리를 함께 맞춥니다. 선택 효과·활동 시간·결말은 좌우에 따라 달라지지 않습니다. 다친 쪽만 다른 기록을 비교할 때 같은 규칙을 적용한다는 사실과 좌우 차이를 표시합니다.

다친 쪽은 당일 장면·새로고침·분기·내보내기·가져오기에서 유지합니다. 이전 기록에 필드가 없으면 없는 채로 보존하고 기존 오른쪽 부상 설정으로 재현합니다. 저장 버전과 친구 파일의 최상위 필드는 유지합니다. 이는 게임의 대칭 규칙이며 실제 좌우 부상의 영향을 같다고 검증한 결과는 아닙니다.

**최종 검증:** Node **135/135**(이전 엔진 44·새 엔진 27·저장 34·무작위 추출 5·외형 호환 7·방 호환 6·부상측 호환 8·카탈로그 4), Chromium 기본 이야기 **22/22**·일지 **26/26**·부상측 UI **6/6**·애니메이션 흐름 **6/6**·외형 및 실제 재생 **4/4**·방 UI **10/10** 묶음이 통과했습니다. 부상측 렌더러 **5/5**, 기존 외형 렌더러 **4/4**·방 렌더러 **5/5** 회귀도 통과했습니다.

일지는 일곱 번의 추출, 왼쪽 기록의 저장·복원·분기·공유, 깁스와 지지 다리의 반대 관계 및 몸 상세 라벨, 잘못된 값 거부, 좌우만 또는 외형·방까지 함께 다른 기록의 비교를 확인했습니다. v2·초기 v3와 방 정보까지 있는 이전 기록의 부상측 필드 부재를 보존합니다. 기본 오른쪽인 이전 기록과 명시적 `right` 기록을 비교할 때 “다친 쪽은 다르며”라는 안내가 나오지 않는 회귀 검사도 추가해 전체 26개 묶음을 다시 통과했습니다. JavaScript/console 오류 0, 일지 검사의 외부 자동 요청 0입니다.

렌더러는 양쪽 부상과 방·동작을 포함한 200조합·196,104프레임을 검사했습니다. 걷기·계단에서 다친 발에 체중을 싣지 않는 표시와 지지의 연속성, 쉬는 자세의 깁스 받침을 확인하고 방·글자 자체는 뒤집지 않았습니다. 양쪽 부상 비교 이미지, 320px 화면, 네 방의 휴식 화면과 원본 develop-web-game 클라이언트 PNG·상태 JSON도 직접 확인했습니다. 이 수치는 자동화된 삽화 검사이며 의료적 보행 검증은 아닙니다. 실물 모바일·실제 스크린리더·운영체제 기본 공유창·사전 설명 없는 사용자 검토는 미실행입니다.

근거: `../output/playwright/saturday-injury-classic/results.json`, `../output/playwright/saturday-injury-journal/results.json`, `../output/playwright/saturday-injury/results.json`, `../output/playwright/saturday-injury-flow-final/results.json`, `../output/playwright/saturday-injury-character-final/results.json`, `../output/playwright/saturday-injury-room-final/results.json`, `../output/playwright/saturday-injury-renderer/results.json`, `../output/playwright/saturday-injury-character-regression/results.json`, `../output/playwright/saturday-injury-room-regression/results.json`, `../output/playwright/saturday-injury-client/`. 아래 126개 Node 및 Chromium 수치는 이전 방 배치 작업의 완료된 이력이며 이번 수에 합산하지 않습니다.

### 이전 검증: 네 가지 방 배치와 기록 유지

새 하루마다 `conditions.roomLayout`을 `window-left`·`window-right`·`wide-living`·`compact-studio` 중 하나로 정합니다. 환경 세 번·성별·머리의 기존 순서를 유지하고 방을 마지막 여섯 번째 독립 추출로 추가합니다. 당일 장면과 복원·분기·내보내기·가져오기에서 같은 방을 유지하며, 이전 기록에 필드가 없으면 없는 채로 보존하고 그림에서만 `window-left`를 사용합니다. 방이나 외형만 다른 기록은 같은 게임 조건으로 비교합니다. 선택·몸 상태·시간·결말·저장 버전은 바꾸지 않습니다.

**최종 검증:** Node **126/126**(이전 엔진 44·새 엔진 27·저장 34·무작위 추출 4·외형 호환 7·방 호환 6·카탈로그 4), Chromium 기본 이야기 **22/22**·일지 **26/26**·애니메이션 흐름 **6/6**·외형 및 실제 재생 **4/4**·방 UI **10/10**·방 렌더러 **5/5**·기존 외형 렌더러 회귀 **4/4** 묶음이 통과했습니다. 일지는 여섯 번의 시작 추출, 방 복원·분기·공유, 잘못된 방 값 거부, 이전 기록의 필드 부재와 표시 대체, 외형만·방만·둘 다 다른 기록의 비교를 확인했습니다. 외형은 있지만 방 정보는 없는 직전 버전의 기록도 가져오기·내보내기·분기 때 방 필드를 삽입하지 않습니다.

네 방의 창문·소파·책상·문·부엌 배치를 구분하고, 실제 집에 있을 때만 적용합니다. 넓은 거실의 별도 창가 좌석, 작은 원룸의 수납장, 소파 옆 탁자·선반·깁스 받침도 확인했습니다. 방 UI는 320/390px × 네 방의 96개 선택과 카페에 집 이름이 표시되지 않는지 검사했으며, 최종 가구 간격 조정 뒤 다시 통과했습니다. 렌더러는 소품 받침 12경우·이동 15,852프레임에서 지지 누락 0건, 외부 장소 5종의 불변을 확인했습니다. 기존 외형 렌더러 회귀의 22,116프레임과 애니메이션 흐름의 146회 화면 위치 측정도 별도 묶음으로 통과했습니다. 이 수치는 자동화된 삽화 검사이며 의료적 보행 검증은 아닙니다.

JavaScript/console 오류 0, 일지 검사의 외부 자동 요청 0입니다. 원본 develop-web-game 클라이언트도 통과했고, 여성·묶은 머리·왼쪽 창가 거실의 1,500ms 동작 PNG·상태 JSON을 직접 확인했습니다. 네 방의 모바일 화면과 넓은 거실의 책상·오른쪽 창가의 휴식·작은 원룸의 창가 소품 화면도 확인했습니다. 실물 모바일·실제 스크린리더·운영체제 기본 공유창·사전 설명 없는 사용자 검토는 미실행입니다.

근거: `../output/playwright/saturday-room-classic/results.json`, `../output/playwright/saturday-room-journal/results.json`, `../output/playwright/saturday-room-flow/results.json`, `../output/playwright/saturday-room-character/results.json`, `../output/playwright/saturday-room-integration-final/results.json`, `../output/playwright/saturday-rooms/results.json`, `../output/playwright/saturday-room-character-renderer/results.json`, `../output/playwright/saturday-room-client/`. 아래 119개 Node 및 Chromium 수치는 이전 외형 작업의 완료된 이력이며 이번 수에 합산하지 않습니다.

### 이전 검증: 최소 3초 애니메이션·다양한 동작·외형 보존

선택 뒤 애니메이션의 자동 종료는 최소 3초 이후로 조정하며, 건너뛰기·Escape·움직임 줄이기는 유지합니다. 행동에 맞는 움직임을 보강하고 새 하루에서 성별과 머리 모양을 독립적으로 정합니다. `conditions.appearance`는 `gender`와 `hairStyle`만 담으며, 세 환경에 이어 성별·머리를 한 번씩 정하므로 새 시작의 추출은 총 다섯 번입니다. 복원·분기·내보내기·가져오기는 저장된 외형을 유지합니다. 기존 기록에 외형 정보가 없으면 없는 채로 보존하고 그림에만 기본 외형을 사용합니다.

이야기 선택·효과·시간·신체 상태·저장 버전은 바꾸지 않습니다. 외형만 다른 두 기록은 같은 게임 조건으로 비교하며, 외형 차이는 별도로 설명합니다. 앉기·전화·책상 작업·휴식·관찰·서 있기에는 시선·호흡·손동작의 짧은 변주를 넣고 끝난 뒤 안정된 자세로 돌아옵니다.

**최종 검증:** Node **119/119**(이전 엔진 44·새 엔진 27·저장 34·환경/외형 추출 3·외형 호환 7·카탈로그 4), Chromium 기본 이야기 **22/22**·일지 **26/26**·애니메이션 흐름 **6/6**·외형 및 실제 재생 통합 **4/4**·렌더러 **4/4** 묶음이 통과했습니다. 일지는 다섯 번의 시작 추출, 복원·분기·공유 외형 유지, 외형만 다른 기록 비교, 기존 기록의 외형 필드 부재 보존을 확인했습니다. 실제 시계로 측정한 자동 완료는 약 3,020ms였으며, 스킵과 움직임 줄이기는 먼저 결과로 넘어갑니다.

외형 12조합과 짧은 활동 18종을 확인했고, 이동·계단의 5ms 간격 22,116프레임 검사에서는 지지 누락과 지면 침투가 0건이었습니다. 자동화된 삽화 검사이며 의료적 보행 검증은 아닙니다. 애니메이션 흐름의 146회 화면 위치 측정, 원본 클라이언트 PNG·상태 JSON, 외형·동작 모음 이미지와 모바일 화면을 확인했습니다. JavaScript/console 오류 0, 일지 검사의 외부 자동 요청 0입니다.

근거: `../output/playwright/saturday-character-classic/results.json`, `../output/playwright/saturday-character-journal/results.json`, `../output/playwright/saturday-character-flow/results.json`, `../output/playwright/saturday-character-integration/results.json`, `../output/playwright/saturday-character-renderer/results.json`, `../output/playwright/saturday-character-client/`. 아래 111개 Node·22/25/6개 Chromium 묶음은 이전 화면·대사 수정의 결과이며 이번 결과로 합산하지 않습니다. 실물 모바일·실제 스크린리더·운영체제 기본 공유창·사전 설명 없는 사용자 검토는 미실행입니다.

### 이전 검증: 본문 중심 화면·선택 후 애니메이션·대사 교정

본문과 선택지를 먼저 보여 주고, **선택 → 건너뛸 수 있는 삽화 애니메이션 → 결과 글** 순으로 진행합니다. 건너뛰기 버튼과 Escape를 제공하고, 움직임 줄이기를 존중합니다. 삽화 아래의 큰 에너지 모니터는 제거하며 그림 안의 작은 표시만 유지합니다. 애니메이션 중 새로고침하면 이미 확정된 선택의 결과 글을 복구하고 시간·에너지를 다시 적용하지 않습니다.

추가 일곱 단계와 기존 이야기의 설명식 문장을 행동·감각·내적 망설임으로 다듬었습니다. 현재·이전 버전의 화면 용어는 “친구”와 “픽업하러 온다”로 교정했습니다. 선택 ID·조건·숫자·시간·동작·저장 형식은 유지합니다. 현재 이야기의 용어 교정을 정규화해 이전 HEAD와 비교한 1,152개 대표 경로·14,976개 상태에서 결과 문장 외의 진행 상태가 일치했습니다. 전수 경로 검사 수로 표현하지 않습니다.

**이번 최종 재검증:** Node **111/111**(이전 엔진 44·새 엔진 27·저장 34·환경 추출 2·카탈로그 4), Chromium 기본 이야기 **22/22**·일지 **25/25**·애니메이션 흐름 **6/6** 검사 묶음이 통과했습니다. 애니메이션의 자연 종료·건너뛰기·도중 새로고침, 결과 글과 다음 장면의 읽기 위치, 움직임 줄이기, 중복 상태 적용 방지를 확인했습니다. 146회의 화면 위치 측정과 백업 대화상자 안의 Escape 처리도 포함하며 별도 시험 수에 더하지 않습니다. 320/390/768px과 데스크톱에서 본문 순서·초점·가로 넘침·큰 모니터 제거를 검사했고 320/390px의 애니메이션→결과 PNG 및 원본 클라이언트 PNG·상태 JSON도 직접 확인했습니다. JavaScript/console 오류 0, 일지 검사에서 외부 자동 요청 0입니다.

근거: `../output/playwright/saturday-animation-classic-final/results.json`, `../output/playwright/saturday-animation-journal/results.json`, `../output/playwright/saturday-animation-flow/results.json`, `../output/playwright/saturday-story-animation-client/`. 아래 111개 Node·22/25개 Chromium 묶음은 이전 환경 확장의 결과이며 이번 수에 합산하지 않습니다. 실물 모바일·실제 스크린리더·운영체제 기본 공유창·사전 설명 없는 사용자 검토는 미실행입니다.

### 이전 검증: 무작위 문·층간 이동·주문 환경과 포장 귀가

새 하루를 시작할 때 문(`manual`·`automatic`·`revolving`), 층간 이동(`stairs`·`escalator`), 주문(`counter`·`kiosk`) 환경을 한 번 정합니다. 해당 장소에 도달했을 때 조건에 맞는 장면을 보여 주며 새로고침·이어 하기·분기는 환경을 다시 뽑지 않습니다. 전용 자동문 비교 버튼은 제거했습니다. 기존 자동문 비교 기록과 버전 2 기록은 재현할 수 있고, 이전 버전 3에 없던 층간 이동·주문 조건은 임의로 삽입하지 않습니다.

회전문은 확인된 옆 출입구, 에스컬레이터는 엘리베이터·확인된 다른 통로·귀가 선택으로 이어집니다. 에스컬레이터 탑승은 없습니다. 키오스크는 주문과 결제 완료, 도움 범위, 지갑의 카드 위치를 기록합니다. S09 포장 실패는 음식을 가게에 두고 빈손으로 돌아온 상태를 그림·새로고침·후속 글·일지에 유지합니다. 실제 시설의 안전성이나 모든 사람의 이동 능력을 보장하는 장면은 아닙니다.

**최종 검증:** Node **111/111**(이전 엔진 44·새 엔진 27·저장 34·환경 추출 2·카탈로그 4), Chromium 기본 이야기 **22/22**·일지 **25/25** 검사 묶음이 통과했습니다. JavaScript/console 오류 0, 외부 자동 요청 0입니다. 별도의 환경·시각 검사 **16묶음**과 원본 develop-web-game 클라이언트도 통과하고 실제 화면·상태를 확인했습니다. 자동문·회전문·에스컬레이터·키오스크, 320/390px 화면과 포장 귀가 일지를 살폈습니다. 실물 기기·실제 스크린리더·운영체제 공유창·사전 설명 없는 사용자 검토는 미실행입니다.

근거: `../output/playwright/saturday-environment-classic/results.json`, `../output/playwright/saturday-environment-journal/results.json`, `../output/playwright/saturday-environment-client/`, `../output/saturday-environments/`. 일지 검사는 환경 추출 3회·시작 취소 시 0회·복원 시 0회, 저장 조건 유지, 회전문 옆문 경로, 에스컬레이터 비탑승, 키오스크 결제·카드 보존, 구형 v3의 선택 필드 부재, 기존 v2의 다섯 선택 재현을 확인했습니다. S09 포장 실패와 이미 결제한 뒤의 자리 대기 서술도 포함합니다. 아래 95개 Node·22/20개 브라우저 묶음은 이전 12단계 확장의 결과이며 최신 수에 합산하지 않습니다.

### 이전 검증: 12단계·선택별 활동 시간·이전 기록 호환

새 하루는 이야기 버전 3의 열두 선택입니다. 기존 핵심 장면 다섯 개와 준비·식사·남은 시간의 활동·자리·물건 정리 일곱 단계를 진행합니다. 오전 10:12에서 시작해 선택한 활동의 소요 분만 더하고 오전·오후 시각을 표시합니다. 화면 읽기·애니메이션 대기는 게임 속 시각을 늘리지 않으며 장면 전환만으로 특정 시각에 맞춰 건너뛰지 않습니다. 귀가 문구는 실제 외출 여부와 거리·걸린 시간에 맞춥니다.

버전 2의 다섯 선택 기록은 별도 이전 엔진으로 이어 하기·완료·분기·내보내기·가져오기를 지원합니다. 새 시작만 버전 3이 되며, 원래 기록을 열두 선택으로 늘리거나 같은 버전으로 위장하지 않습니다. 최종 Node **95/95**(이전 엔진 44·새 엔진 13·저장 34·카탈로그 4), 실제 Chromium 기본 이야기 **22/22**·일지 **20/20**가 통과했습니다. 원본 develop-web-game 클라이언트도 완료했고 실제 이동 화면과 상태를 직접 확인했습니다. 증거는 `../output/playwright/saturday-time-classic/`, `saturday-time-journal/`, `saturday-time-client-final/`입니다. 아래 70개 Node·21/19개 브라우저 묶음은 5단계 화면 정리 당시의 결과입니다.

12단계 확장은 [PR #112](https://github.com/prozac0401/WebSim/pull/112)로 병합한 뒤 GitHub Pages에 배포했고, 공개 화면에서 파일과 열두 선택 진행·저장 복원을 확인했습니다. 해당 작업 시작 시 원격 head `84ba9c106d9b492ba9c8be13c46d6af7e8ba9853`에는 별도의 GitHub 검사·상태·PR 실행 워크플로가 없었습니다. 로컬 검사와 Pages 빌드 확인을 외부 CI 검사 통과로 바꾸어 표현하지 않습니다.

현재 버전의 Node 검사는 이전 엔진과 새 엔진을 함께 실행합니다.

```sh
node --test stopped_saturday/story-engine.test.cjs stopped_saturday/story-engine-v3.test.cjs stopped_saturday/day-environment.test.cjs stopped_saturday/appearance.test.cjs stopped_saturday/room-layout.test.cjs stopped_saturday/injury-side.test.cjs stopped_saturday/saturday-store.test.cjs tests/stopped-saturday-catalog.test.cjs
```

### 이전 수정: 화면 높이와 상태 표시 정리

큰 인체 그림·여섯 카드 영역을 숨기고, 기존 **부위별 느낌 자세히 보기**는 기본적으로 닫고 화면 이동 때 다시 접습니다. 본문 글자 크기는 14px을 유지했습니다. 동일하게 재현한 플레이 화면의 전후 높이를 비교했을 때 데스크톱 약 32–36%, 모바일 약 19–20% 줄었습니다. 이는 확인한 화면의 측정값이며 모든 장면에 같은 감소율을 적용하지 않습니다.

관련 Node **70/70**, Chromium 기존 하루 **21/21**·새 일지 **19/19** 검사 묶음이 통과했습니다. 원본 develop-web-game 클라이언트는 종료 코드 0으로 완료했고 화면도 직접 확인했습니다. 증거: `../output/playwright/saturday-compact-classic/`, `../output/playwright/saturday-compact-journal/`, `../output/playwright/saturday-compact-client/`, 전후 비교 `../output/playwright/saturday-compact/`. 아래 검증 이력과 합산하지 않습니다.

### 이전 수정: 도입 이야기·일지 서식·신체 상태 표시

병원에서 돌아온 뒤 첫 주말이라는 도입과 오른쪽 다리의 깁스 설정을 명확히 했습니다. 결과·일지·비교 화면은 같은 항목 서식을 사용해 번호를 한 번만 표시하고, 시각·행동·결과 문단·몸 반응을 나누어 보여 줍니다. 새 `body-status.js`·`body-status.css`는 여섯 부위를 인체 그림과 카드의 같은 번호로 연결하고 단계 글자·막대·감각 설명을 표시합니다. 쉬기 선택의 문구는 “이제부턴 휴식을 취한다”로 맞췄습니다.

**이번 변경의 검증:** 관련 Node **70/70**, Chromium 기존 하루 **21/21**·새 일지 **19/19** 검사 묶음이 통과했습니다. 새 도입과 여섯 부위의 상태 대응, 중복 번호 제거·결과 문단 세 개·몸 반응 분리 검사를 추가했습니다. 16,573개 상태·11,176개 완주 경로의 진행 규칙 지문은 변경 전과 같고, JavaScript/console 오류와 외부 자동 요청은 0개입니다. 데스크톱 도입·신체 표시·상세 일지의 화면도 직접 확인했습니다. 증거: `../output/playwright/saturday-body-classic/`, `../output/playwright/saturday-body-journal/`. 아래 이전 단계의 검증 결과와 합산하지 않습니다.

별도로 320/390px에서 도입·여섯 카드·가로 넘침·쉬기 선택의 정확한 문구·저장된 일지 서식을 검사하고 화면을 직접 확인했습니다. 신체 표시도 320/390/740/1440px에서 단계 경계값 0·1·2·3·6·7·10, 그림과 카드의 대응, 상태를 바꾸지 않는지와 중복 표시 여부를 확인했습니다. 원본 develop-web-game 클라이언트는 종료 코드 0으로 완료했고 화면과 상태를 직접 확인했습니다. 추가 증거는 `../output/playwright/saturday-body-preview/`, `../output/playwright/saturday-body-client/`이며, 이 별도 확인은 위 자동 검사 수에 합산하지 않습니다. 실물 모바일·실제 스크린리더·운영체제 공유창·사전 설명 없는 실제 사용자 플레이는 미실행입니다.

### 추가 요청: 비유적인 문구 교정

“오늘을 닫는다”, “마음의 온도”, “누군가에게 닿는다”처럼 뜻을 다시 해석해야 하는 표현을 실제 행동과 기분을 설명하는 일상적인 한국어로 고쳤습니다. 결말 이름과 안내 문구도 함께 바꿨으며, 게임 제목 《멈춘 토요일》과 시나리오·선택·결말 ID, 진행·저장 규칙은 유지했습니다. 문을 닫거나 걸음을 멈추는 실제 동작은 그대로 표현합니다.

**문구 교정 후 재검증:** 관련 Node **70/70**(엔진 44·저장 22·카탈로그/설명서 4), Chromium의 기존 하루 **20/20**·새 일지 **18/18** 검사 묶음이 통과했습니다. JavaScript/console 오류와 외부 자동 요청은 0개였습니다. 16,573개 상태와 11,176개 결말의 진행 규칙을 비교한 SHA-256 값도 교정 전과 같았습니다. 마지막 화면 문구 세 개를 추가로 다듬은 뒤 데스크톱·모바일에서 쉬기 선택 → 결과 → 새로고침 → 일지의 새 문구를 별도로 확인했습니다. 증거: `../output/saturday-copy-review/`, `../output/playwright/saturday-copy-classic/`, `../output/playwright/saturday-copy-journal/`.

저녁 장면 제목을 “어느새 저녁이다”로 마지막 교정한 뒤에도 Node 70/70·진행 규칙 비교·화면 확인이 통과했으며, 원본 develop-web-game 클라이언트의 최종 실행도 종료 코드 0으로 끝나 `../output/playwright/saturday-copy-client-final/`의 화면과 상태를 직접 확인했습니다.

아래 80개 Node 검사와 18/20개 브라우저 묶음은 **S01~S13·F01~F05 확장 당시, 문구 교정 전의 검증 기록**입니다. 최신 검증 수에 합산하지 않습니다. 실물 모바일·실제 스크린리더·운영체제 공유창·사전 설명 없는 실제 사용자 플레이는 이번에도 미실행입니다.

## 1. 변경 요약과 기존 작업 보존

기존 v0.1에서 이어 온 네 출발 경로·여섯 결말을 바탕으로 한 `classic`과 서로 다른 일상의 조건을 다루는 다섯 시나리오 묶음을 제공합니다. 버전 3의 새 하루는 열두 선택이며, 버전 2의 다섯 선택 기록은 이전 엔진에 보존했습니다. 현재 진행, 완료 일지, 선택을 바꾼 새 기록, 수동으로 가져온 비교 기록을 구분합니다. 앞선 로컬 검토와 12단계 확장·배포를 보존하며 최신 요청의 환경과 귀가 수정을 추가했습니다.

현재 상태: 13개 장면과 5개 기능의 로컬 구현·자동 검증 근거를 확보했습니다. 실제 사용자 대상의 사전 설명 없는 플레이 검토와 실물 기기 검증은 별도 미실행 항목입니다.

## 2. 변경 파일과 이유

| 파일 | 역할 |
| --- | --- |
| `scenario-scenes.js` | S01~S13의 장면 조건·선택·효과·후속 결과와 짧은 시나리오 묶음 |
| `story-engine.js` | 기존 하루를 유지하면서 새 장면·기록의 결정적 재현을 연결하고 실제 경험과 기억을 구별 |
| `day-rhythm.js`, `legacy/story-engine-v2.js`, `legacy/scenario-scenes-v2.js` | 12단계·시간 규칙과 버전 2의 원래 5단계 재현을 분리 |
| `day-environment.js` | 새 하루의 환경·외형·방 배치·다친 쪽을 한 번 추출하고 선택 기록의 조건으로 전달 |
| `story-engine.test.cjs` | 13개 장면·모든 조건별 선택·실제 귀가·장소 정보·기존 실내 기억의 회귀 검사 |
| `story-engine-v3.test.cjs` | 새 열두 단계와 선택별 시간, 실제 귀가·이전 버전 호환 검사 |
| `saturday-store.js` | 진행·완료·분기·가져온 기록의 버전 관리와 재현·검증 |
| `saturday-app.js`, `stopped_saturday.html`, `saturday.css` | 시나리오 선택, 이어 하기, 일지, 분기·환경·친구 비교, 수동 내보내기·가져오기 |
| `movement-scene.js` | 새 장면의 물건 배치·출입구 환경과 대기 자세를 기존 이동 삽화에 연결 |
| `saturday-store.test.cjs`, `../tests/stopped-saturday-journal.browser.cjs` | 저장·삭제·분기·공유 검증과 실제 화면의 5개 기능·사용성 검사 |
| `../tests/stopped-saturday.browser.cjs` | 기존 하루 선택을 명시해 이전 이동·공유·카탈로그 회귀 검사 유지 |
| `README.md`, `stopped_saturday_doc.html`, `coverage.md` | 실행·사용법, 저장 범위·한계, 18개 요구와 검증 근거 |
| `../progress.md` | 작업 범위·진행·실제 시험 및 미검증 범위 기록 |

기존 카탈로그와 원래 하루의 경로·결말 검사는 유지하며, 기존 브라우저 검사가 새 시나리오 선택 UI에서 `classic`을 명시하도록 조정했습니다. 별도 설치나 저장소 초기화를 하지 않았습니다.

## 3. S01~S13 및 F01~F05 추적표

경로는 시작 화면의 시나리오 묶음과 핵심 선택 ID로 기록합니다. 버전 3은 이 핵심 장면 사이에 일곱 추가 단계를 진행합니다. E·P·B 시험명은 최초 확장 때 확보한 근거이며 최신 추가 검사와 구분합니다. 이번 환경 변경의 추가 근거는 최상단에 기록합니다. `scenario-scenes.js#Sxx`는 해당 장면 정의를 뜻하며 웹 URL의 앵커가 아닙니다. 선택 ID의 `S01-bottle / split` 표기는 `S01-bottle` 또는 `S01-split`이라는 뜻입니다.

시험 약칭: **E** = `story-engine.test.cjs`(44개 통과), **P** = `saturday-store.test.cjs`(22개 통과), **B** = `../tests/stopped-saturday-journal.browser.cjs`(18개 검사 묶음 통과). E의 각 `Sxx …` 이름과 `all new scenarios …`, P의 각 기능별 시험, B의 `Fxx …` 검사를 아래에 연결합니다.

| ID | 구현 위치·반영해야 하는 결과 | 도달 경로 | 관련 시험·결과 | 구현 상태 |
| --- | --- | --- | --- | --- |
| S01 | `scenario-scenes.js#S01` — 용기·컵/전화 위치·왕복 수·마신 장소 네 가지 차이 | `home` 시작 → `S01-bottle / split / table / help` | E `S01 leaves four distinct item arrangements…`·전수경로, B 컵/물병/전화 그림 일치 통과 | 완료 |
| S02 | `scenario-scenes.js#S02` — 미는 문·자동문·회전문에 맞는 대기·출입구·요청 | `doors` → `S02-ask / wait / side`, `S02-auto-*`, `S02-revolving-*` | E의 기존 문 변형·대기 검사 통과. 무작위 세 문 환경 추가 검사는 최상단 참조 | 완료 |
| S03 | `scenario-scenes.js#S03` — 사전 위험 설명·개인 요청과 실제 통행 정리의 분리 | `doors` → `S02-ask` → `S03-coordinate / leave / notify-wait` | E `S03 waiting progresses only after actual staff action…`·행동/환경 별도 기록 통과 | 완료 |
| S04 | `scenario-scenes.js#S04` — 감사/속도 설명/다음 편과 기다린 시간 | `company` → `S08-planned` → `S11-slower` → `S12-elevator` → `S04-*` | E 전수경로의 세 선택 완주·`S08 route distance…` 다음 편 경로, 시간제한 없는 UI 검토 통과 | 완료 |
| S05 | `scenario-scenes.js#S05` — 확인된 출입 조건·다른 장소·귀가와 기대 | `cafe` 시작 → `S05-staff / another / home` | E `S05 returning home uses explicit fallback scenes…`·전수경로 통과 | 완료 |
| S06 | `scenario-scenes.js#S06` — 카운터 카드 회수 또는 키오스크 주문·결제 완료와 도움 범위 | `cafe` → `S05-staff` → `S06-ask / pause` 또는 `S06-kiosk-*`; 휴대전화는 소지 조건 필요 | E의 기존 대체 결제 검사 통과. 키오스크·카드 위치 추가 검사는 최상단 참조 | 완료 |
| S07 | `scenario-scenes.js#S07` — 수락/컵만/거절, 먼저 묻는 도움 변형 | `home` → `S01-help` → `S07-all / cup / decline`; `helpStyle:ask`로 질문형 변형 | E `S07 takeover and asking variants…`의 각 세 선택, B 질문형 도움 통과 | 완료 |
| S08 | `scenario-scenes.js#S08` — 출발·체류·실제 귀가와 남은 일정 | `company` 시작, 또는 `planning`의 `S13-*` 다음 → `S08-planned / near / later` | E `S08 route distance and S12 detours…`의 300/100m·귀가·출발 취소 통과 | 완료 |
| S09 | `scenario-scenes.js#S09` — 낮은 좌석·대기와 포장 음식을 들지 못한 빈손 귀가 | `doors` → `S02-ask` → `S03-coordinate` → `S09-wait / ask / takeout` | E의 좌석·실제 착석 검사 통과. 포장 실패·물건 위치·모바일 일지 추가 검사는 최상단 참조 | 완료 |
| S10 | `scenario-scenes.js#S10`, `reflectionNode` — 물/식기 미수령과 수령, 재요청 | `doors` → `S02-ask` → `S03-coordinate` → `S09-wait` → `S10-defer` → `REFLECT-request` | E `S10 deferred water stays unresolved…`·주문 변경, B 미수령→재요청·일지 검사 통과 | 완료 |
| S11 | `scenario-scenes.js#S11` — 놓친 말·되돌아봄·다시 나란히 된 때 | `company` → `S08-planned` → `S11-slower / stop / own` | E `S11 changes conversation participation…`·이후 회고와 관계 점수 부재 통과 | 완료 |
| S12 | `scenario-scenes.js#S12` — 다섯 계단·에스컬레이터 앞의 대체 경로·거리·시간 | `company` → `S08-planned` → `S11-slower` → `S12-elevator / confirm / home` 또는 `S12-escalator-*` | E의 계단 대체 경로·기존 계단 보존 검사 통과. 에스컬레이터 대체 경로 추가 검사는 최상단 참조 | 완료 |
| S13 | `scenario-scenes.js#S13` — 화장실·문턱·거리·쉼터 각각의 확인 여부 | `planning` 첫 핵심 → `S13-check / known / onsite`; `home` 네 번째 핵심에도 도달 | E `S13 keeps all four access fields with provenance…`·목적지 변경 시 확인정보 무효화 통과 | 완료 |
| F01 | `saturday-store.js`, `saturday-app.js` — 마지막 확정 진행과 상태·이력·조건 복원 | 새 하루 → 선택 → 새로고침/뒤로·앞으로/재열기 → 이어 하기 | P 확정 단계·손상/구버전/차단·저장 실패·다른 탭 보존, B F01 탐색·재열기·중복 선택 통과 | 완료 |
| F02 | `saturday-store.js`, `saturday-app.js` — 현재 진행과 별도 완료 일지 | 두 하루 완료 → 일지 → 새 하루 → 각 기록 읽기/개별 삭제 | P 완료 중복·초기화·개별/전체 삭제, B F02 두 일지·삭제 확인·범위 통과 | 완료 |
| F03 | `saturday-store.js`, `saturday-app.js` — 부모 기록·분기점과 원본 불변 | 완료 일지 → 선택 한 곳부터 다시 보기 → 후속 선택 직접 진행 | E canonical replay, P strict prefix·원본 불변·중단, B F03 부모 연결·다른 선택 통과 | 완료 |
| F04 | `day-environment.js`, `scenario-scenes.js`, `saturday-store.js`, `saturday-app.js` — 새 하루의 무작위 환경과 기존 환경 비교 기록 호환 | 새 하루 → 장소에서 환경 확인 → 새로고침·분기에서 보존; 다른 하루와 조건 차이 표시 | 이전 E·P의 자동문 비교 API 검증 유지. 전용 UI는 무작위 만남으로 변경, 최신 브라우저 근거는 최상단 참조 | 최신 요청으로 변경 |
| F05 | `saturday-store.js`, `saturday-app.js` — 최소 허구 기록의 미리보기·수동 교환 | 일지 → 공유 미리보기 → 복사/파일 → 직접 전달 → 가져오기 → 비교 | P 5필드·16KiB·버전·경로 검증, B F05 실제 복사/파일·확인·안전 입력·조건 불일치·개별 삭제 통과 | 완료 |

## 4. S01~S13·F01~F05 확장 당시의 검증 결과와 재현 절차

아래는 **S01~S13·F01~F05 확장의 최종 파일로 직접 실행한 결과**입니다. 이후 수정 결과와 구별합니다. 과거 38개 검사·20개 Chromium 묶음·첨부 Edge 7회와 합산하지 않았습니다. 확장 완료 시점에 기존 1,024개 경로와 기존 브라우저 20개 묶음도 새로 재실행했습니다. 초기 `saturday-journal` 폴더의 일부 화면은 후속 실행에서 갱신됐으므로 당시 검사 수는 그 실행의 결과 JSON을 기준으로 읽고 최신 화면 근거는 위의 환경 검사 폴더를 사용합니다.

| 검사 | 결과 | 이번 근거 |
| --- | --- | --- |
| Node 자동 검사 | **80/80 통과**, 실패 0·미실행 0 | 엔진 44 + 저장 22 + 카탈로그/설명서 4 + 기존 회귀 10. `../output/saturday-plan-review/final-node-tests.txt` |
| 선택 경로 전수 검사 | **10,152개 새 완주 경로 + 1,024개 기존 완주 경로 통과** | 다섯 묶음×시작 조건 8조합. 13개 장면의 모든 선택·S07 두 변형·조건 생략·5회 완료·범위·결정적 재현 확인. 별도 시험 수에 더하지 않음 |
| 신규 일지/시나리오 Chromium | **18/18 묶음 통과** | `../output/playwright/saturday-journal/results.json`. F01~F05, 5묶음, S01 물건 그림, S10 재요청, 320×568·390×844 터치, 키보드 시작→일지→복사→분기, 동작 줄이기·200% CSS 확대 |
| 기존 하루 Chromium 회귀 | **20/20 묶음 통과** | `../output/playwright/saturday-journal-classic/results.json`. 기존 이동·계단·모니터·결말·이미지·카탈로그와 공유 분기 |
| 원본 develop-web-game 클라이언트 | **재실행 통과**, 상태와 화면 직접 확인 | `../output/playwright/saturday-journal-client/` |
| 화면과 통신 검토 | **통과** | 데스크톱 시작/일지/분기/자동문, 320px 일지, 390px 내보내기 캡처 직접 검토. 신규 검사에서 JavaScript/console 오류 0, 외부 자동 요청 0 |
| 실제 사용자 사전 설명 없는 플레이와 인터뷰 | **미실행** | 질문 UI는 제공했지만 실제 사람의 해석·망설임을 시험한 것으로 간주하지 않음 |
| 실물 모바일·실제 스크린리더·운영체제 기본 공유창 | **미실행** | 터치 에뮬레이션·키보드 검사·공유 API 분기 검사를 실제 기기·보조공학 결과와 구별 |

신규 공유 검사는 테스트 Chromium의 클립보드를 실제로 쓰고 다시 읽어 JSON이 일치하는지 확인했으며 파일 다운로드도 확인했습니다. 복사를 차단한 별도 환경에서는 성공 문구 없이 선택 가능한 텍스트와 파일 대안을 보였습니다. 사용자의 평소 Edge 프로필과 모든 운영체제의 클립보드·다운로드 동작을 보장하는 결과는 아닙니다. 기본 공유 API 분기는 테스트용 대체 API로 확인했으며 실제 운영체제 공유창은 미실행입니다.

저장소 루트에서 다음으로 자동 검사를 재현합니다.

```sh
node --test stopped_saturday/story-engine.test.cjs stopped_saturday/saturday-store.test.cjs tests/stopped-saturday-catalog.test.cjs tests/new-labs.test.cjs tests/preset-scenes.test.cjs tests/routine-bot-server.test.cjs
python -m http.server 8766
```

정적 서버를 유지한 채 별도 PowerShell에서 아래 명령을 실행합니다. 기존에 준비된 Playwright/Chromium을 사용하며 새 프로그램 설치는 하지 않습니다. 테스트는 분리한 임시 브라우저 문맥의 기록을 만들고 삭제합니다.

```powershell
$env:WEBSIM_URL = 'http://127.0.0.1:8766/'
$env:WEBSIM_EVIDENCE = 'output/playwright/saturday-journal'
node tests/stopped-saturday-journal.browser.cjs
$env:WEBSIM_EVIDENCE = 'output/playwright/saturday-journal-classic'
node tests/stopped-saturday.browser.cjs
```

중간 검토에서 찾아 고친 항목은 가져오기 필드 전달, 삭제 설명과 실제 범위, 원본 삭제 후 분기 일지 열기, 실내의 과거 문 기억, 반복되던 집 장면, 이동과 맞지 않던 몸 반응·대기 자세입니다. 최종 재실행에서 위 실패는 남지 않았습니다. 자동 경로 검증만으로 이야기의 정서적 효과나 모든 사용자의 경험을 입증하지 않습니다.

## 5. 저장 형식·호환성·삭제·내보내기

저장 키 `websim.stopped-saturday.v1`과 `schemaVersion: 1`은 유지하고 현재 저장 묶음의 `scenarioVersion`은 `"3"`입니다. `current`, `completed`, `replays`, `imported`, `nextSerial`을 구분합니다. 각 기록은 자체 이야기 버전, `id`, `serial`, 시나리오 ID, `conditions`, `choiceIds`, `complete`, `phase`, `parentId`, `branchIndex`, `comparisonKind`를 갖습니다. 시작 조건은 문 유형·층간 이동·주문 방식·도움 제안 방식·휴대전화 결제 소지 여부라는 허구 설정입니다. 새 버전 3은 `doorMode`에 `revolving`을 허용하고 `verticalRoute`·`orderMode`를 기록합니다. 이전 버전 3에 두 선택 필드가 없으면 없는 채로 보존하고 기존 계단·카운터 장면을 재현합니다. 현재 장면·게임 속 시각·에너지·조건 플래그는 해당 버전에서 확정 선택 ID를 재현해 얻으며 저장된 파생 수치를 신뢰하지 않습니다. 실제 플레이 시각은 넣지 않습니다.

| 조작 | 남는 것과 지워지는 것 |
| --- | --- |
| 새 하루 | 현재 진행을 새 기록으로 교체. 미완료 선택이 있으면 확인. 완료·분기·가져온 일지는 유지 |
| 현재 하루 초기화 | 이어 하기만 제거. 모든 보관 일지는 유지 |
| 이 기록만 삭제 | 선택한 일지 한 개만 제거. 해당 기록이 마지막 완료 하루면 그 이어 하기 표시도 제거. 다른 미완료 진행·다른 일지는 유지 |
| 보관 기록 전체 삭제 | 완료·분기·가져온 세 목록과 마지막 완료 하루의 이어 하기 표시 제거. 미완료 현재 하루는 유지 |
| 원본 일지만 삭제 | 다른 분기 일지는 독립 기록으로 남고 부모 ID 유지. 원본이 목록에 없다는 설명 제공 |
| 친구용 내보내기 | 삭제 없음. 저장/이야기 버전·시나리오·조건·선택 ID의 5개 필드만 미리보기/복사/JSON 저장. 완료 길이는 버전 3에서 12개, 버전 2에서 5개 |
| 로컬 백업 | 삭제 없음. `stopped-saturday-local-backup` 형식으로 현재 로컬 묶음과 보존 원문을 따로 저장. 친구용 가져오기와 구별 |

삭제 조작은 UI에서 범위를 설명하고 확인합니다. 알려진 버전 2 저장 묶음은 전체 기록 검증 후 메모리의 상위 버전만 3으로 바꾸고, 다음 명시적 저장 때 반영합니다. 개별 기록의 버전·ID·선택·단계는 유지하며 이전 엔진으로 이어 하기·완료·분기·공유를 지원합니다. 알 수 없는 버전·손상 저장은 원문을 읽기 전용으로 보존하고 임의로 변환·삭제·덮어쓰기하지 않습니다. 저장 접근 차단·쓰기 실패·다른 탭의 저장 변경도 경고하고 현재 탭의 메모리 진행과 백업을 제공합니다. 탭을 닫으면 저장되지 않은 메모리 진행은 사라질 수 있습니다. 백업 파일을 현재 UI에서 전체 복원하는 기능은 제공하지 않습니다.

공유 입력은 UTF-8 16 KiB·정확한 허용 필드·버전·조건·해당 버전에서 가능한 완료 경로를 검사합니다. 버전 3과 2를 비교하면 이야기 버전이 달라 같은 조건의 비교가 아님을 표시합니다. 공유 데이터에는 실제 시각·실명·연락처·주소·건강 정보·자유 입력이 없습니다. 파일이 누가 만든 것인지 인증하지는 않으며, 허구 선택의 재현 가능성을 확인합니다. 로컬 저장 지원 범위는 2 MiB·일지 500개이고 초과 시 기존 기록을 자동 정리하지 않습니다.

## 6. 재플레이·환경·친구 비교 예시

다음 세 예시는 버전 2의 엔진과 저장 API를 실행한 재현 스크립트로 확인한 이전 검증 기록입니다. 새 버전 3의 열두 단계 전체 경로로 읽지 않습니다. 특히 자동문 전용 버튼과 포장 음식을 집에서 마시는 결과는 현재 버전의 사용법이 아닙니다. 현재 화면은 무작위 환경을 저장하며 포장 음식을 들지 못한 경로는 빈손 귀가로 이어집니다. 아래 ID는 설명을 위해 주입한 식별자이며 실제 앱은 무작위 ID를 만듭니다. 우열·승패·공감 점수는 없습니다.

1. **원본과 분기**: `doors`의 원본 `local-day-1`은 `S02-ask → S03-coordinate → S09-wait → S10-defer → REFLECT-request`로 끝냅니다. 문을 잡아 달라고 부탁하고 공간을 확인한 뒤 낮은 자리를 기다렸으며, 미뤘던 물·식기를 마지막에 실제로 받습니다. 결말 ID는 `shared`이며 교정한 이름은 “누군가에게 말을 건 토요일”입니다. 세 번째 선택 직전(`branchIndex: 2`)에서 만든 `local-day-2`는 앞의 두 선택만 재현하고 `S09-takeout → HOME-4-quiet → REFLECT-note`를 직접 고릅니다. 집에서 마시고 쉬는 결말 `rest`(“쉬면서 보낸 토요일”)가 되며 `parentId`는 원본을 가리킵니다. 원본 기록의 내용은 전후 동일했습니다.
2. **문 환경만 바꾸기**: 원본의 첫 문 직전에서 `doorMode: manual → automatic`만 바꾼 `local-day-3`을 만듭니다. 첫 선택은 `S02-auto-enter`, 나머지는 `S03-coordinate → S09-wait → S10-defer → REFLECT-request`로 진행합니다. 문을 잡아 달라는 첫 요청은 사라지지만 안쪽 통행 정리·낮은 자리 대기·물과 식기의 재요청은 남습니다. 비교 결과의 `changedConditions`는 `doorMode` 한 개이고 원본은 변하지 않았습니다.
3. **같은 조건의 두 기록**: 선택을 바꾼 하루의 친구용 JSON을 명시적으로 가져와 원본과 비교합니다. 동일한 `doors` 시나리오와 시작 조건이므로 `equivalent: true`이지만, 세 번째 선택 이후의 포장·귀가와 대기·셀프서비스 과정은 다릅니다. 자동문 하루와 원본은 문 조건이 달라 같은 조건의 친구 비교로 표시하지 않습니다. 실제 친구에게 전송하지 않고 로컬 데이터로만 검증했습니다.

## 7. 남은 범위와 결정 사항

- S01~S13·F01~F05의 **18개 로컬 구현은 완료**이며 각 항목의 자동 검증 근거는 위 표에 있습니다. 구현 보류·미구현 항목은 없습니다. 사람 대상의 사전 설명 없는 플레이 검토와 실물 기기·보조공학 검증은 미실행입니다.
- 실제 장소의 접근성·의료적 판단을 검증하는 기능은 범위 밖입니다. 기존 공식 서비스 출처의 확인일과 한계는 README와 게임 설명서에 보존합니다.
- 친구 비교는 사용자가 확인한 파일이나 텍스트를 직접 전달하는 방식입니다. 자동 전송·게시·초대, 계정·서버·기기 간 자동 동기화는 제공하지 않습니다.
- 12단계 확장은 별도의 배포 요청에 따라 PR #112 병합과 GitHub Pages 공개 확인을 마쳤습니다. 최신 수정의 배포 여부는 해당 수정의 검증·배포 기록과 구분합니다.
- 백업 전체 복원과 실제 사용자 검토는 별도 범위입니다. 알려진 버전 2의 기록 호환은 이번 12단계 확장에 포함합니다.
