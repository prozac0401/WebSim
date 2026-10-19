# 블록 밀기 삭제와 끌기 이동 검증

2026-10-19, Windows / Node v24.13.1. 기존 회귀·독립 탐색은 Chromium 145.0.7632.6, 최종 제스처 전체 검사는 설치된 Chrome 155.0.8059.82에서 실행했다. 최신 원격 main `fe0545d3325352646614256e6eb3c0084159edb5`에서 분리한 `feat/routinebot-swipe-delete`에서 작업했다. 원래 작업 폴더의 사용자 변경·첨부는 보존했다. 기존 game-verification/game-playtest 스킬을 읽고 제스처 절차를 확장하여 실제 사용했으며 두 스킬 형식 검사도 PASS다.

## 동작

- 블록 본문은 왼쪽·오른쪽 어느 쪽으로도 밀 수 있다. 가로 이동이 세로의 1.6배를 넘고, 카드 폭에 따른 64–96px 임계값을 넘은 상태에서 놓아야 삭제한다. ‘더 밀기 → 놓으면 삭제’ 피드백을 표시한다. 짧은 이동·세로 스크롤·취소된 포인터는 삭제하지 않는다.
- 별도 ⠿ 손잡이는 끌기용이다. 반복 헤더(접힌 상태 포함), 가지의 추가 영역, 형제 앞뒤, 시작/F1/F2 탭을 목적지로 사용한다. 놓을 위치와 유효 여부를 강조하고 화면·데스크톱 편집 영역 가장자리에서 자동 스크롤한다. 손잡이의 키보드 활성화는 선택으로 연결하며 기존 이동·삭제 버튼을 사용할 수 있다.
- 이동·삭제는 기존 편집 검증·저장·실행 취소를 거친다. 이동은 ID와 안쪽 명령을 보존하고, 부모 삭제는 하위 명령을 함께 지운다. 자기 하위 가지에는 제거 전에 거부하고, 깊이/호출 순환 위반은 원래 프로그램으로 되돌린다. 기존 한도 초과 저장도 개수가 늘지 않는 이동·부분 삭제를 허용한다.
- 모바일 지도는 일반 스크롤로 올라가며 편집기와 드롭 위치를 덮지 않는다. 게임 지도·규칙·레벨 ID·기록 버전·엔진은 변경하지 않았다.

## 결과

증거 경로 시작은 `output/playwright/routine-bot/gestures/`이다. 원본 JSON·PNG·입력 로그·실패 기록은 관리 worktree의 Git 제외 산출물 폴더에 보존한다.

| 검사 | 결과 | 범위와 증거 |
| --- | --- | --- |
| 자동 회귀 | PASS | 중간/최종 각각 155/155. `early/unit-tests.txt`, `final/unit-tests.txt` |
| 기존 트리 편집 | PASS | 중간·최종 각 26항목. `early/tree/`, `final/tree/`; 가지·접기·횟수·키보드·실제 성공 |
| 기존 초반 플레이·저장 오류 | PASS | 15항목. `final/browser/browser-report.json`; 1–3 실제 진행, 터치320/390, 저장 복구·거부 |
| 기존 한도·저장 이전 | PASS | 21항목. `final/budgets-retest/budget-report.json`; 코드 유지·부분 수리·실제 성공 |
| 기존 다중지도·취소·안전·키보드 | PASS | 13항목. `final/safety/safety-report.json` |
| 제스처 집중 UI · Chrome 155 | PASS | 40/40, 데스크톱1440×900·터치320×740/390×844, 358입력, 오류 0. `final/swipe-retest/swipe-report.json`; 41회 드래그 중 7회는 가장자리 자동 스크롤을 사용(21회 이동). 두 이전 저장의 수정→실제 성공 포함 |
| 구형 검사 Chromium 145 · 빠른 첫 탭 | FAIL | `final/swipe/`: 제스처 33그룹은 통과했으나 모바일 실행 탭 3회가 클릭으로 이어지지 않음. 변경 전 JS로도 같은 현상 재현. 아래 진단에 범위·한계를 기록하며 전체 PASS로 바꾸지 않음 |
| 협동 편집·튜토리얼·기록 회귀 | PASS | 57항목, 474회 클릭/탭, 오류 0. `final/cooperation/cooperation-report.json` |
| 독립 실제 제스처 탐색 | PASS | [별도 보고](GESTURE_PLAYTEST.md), `blind/`; 데스크톱1440×900, 터치320×740/390×844, 정답/구현 코드 미열람 |
| 기본 게임 클라이언트 | PASS | `final/client/`; 실제 팔레트 입력·Canvas/상태 캡처 확인. 완료 플레이와 구별 |
| 실제 Android/iOS | NOT RUN | 브라우저 터치 에뮬레이션과 구별 |
| 사람 대상 재미·이해도 연구 | NOT RUN | 에이전트 탐색을 인간 평가로 표현하지 않음 |

## 발견 → 수정 → 재확인

1. 실제 터치는 누른 버튼에 암묵적으로 포인터를 캡처한다. 이를 편집기로 옮길 때 기존 버튼에서 올라온 `lostpointercapture`를 전체 취소로 오인하여 밀기/끌기가 멈췄다. 실제 편집기의 캡처 상실만 취소하도록 고쳤다. 네이티브 브라우저 터치 스트림으로 양방향 밀기를 재확인했다.
2. 모바일 고정 지도가 펼친 반복문과 드롭 위치를 가렸다. 모든 모바일 스테이지를 일반 흐름에 두고, 지도 설명·실행 명령 스크롤 여백도 맞췄다. 320/390의 같은 화면에서 트리·지도를 각각 스크롤해 조작할 수 있음을 확인했다.
3. 끌기 시작 시 삽입 줄이 레이아웃을 밀어 반복 헤더에 놓으려던 블록이 형제가 됐다. 표시를 기존 간격 위에 겹쳐 배치해 위치를 유지했다. 펼친/접힌 헤더 중앙에 놓는 같은 동작을 데스크톱과 터치에서 재확인했다.
4. 새 삭제 안내가 기존 ‘블록 제한 안에 들어왔다’는 수리 완료 안내를 덮었다. 두 안내를 함께 표시하고 한도 초과 이동에는 남은 제한 안내도 유지했다. 기존 한도 시험의 동일 assertion을 유지한 재실행 21/21 PASS.
5. 소스 검토에서 도움말·쉬기·DOM 제거 후 자동 스크롤이 남을 수 있음을 찾아 프레임에서도 잠금과 연결을 확인해 취소한다. 추가 소스 검토에서 차단 결함 없음.
6. 제스처 뒤의 합성 클릭 차단은 명령 트리로 한정하여 다른 실행·취소 버튼까지 차단하지 않도록 했다. 별도의 Chromium 145 자동 터치 실패에서는 실행 버튼에 pointer/touch 이벤트가 도달했지만 마우스·클릭 이벤트가 생성되지 않았다. CDP 재연결·다른 네이티브 탭 경로·진단용 `touch-action:manipulation`도 해결하지 못했다. 속도 중복 선택 생략 후 한 번의 성공도 반복 실패했으므로 해결로 보지 않았다. 마지막 새로고침에 JS만 `fe0545d` 원본으로 제공하고 HTML/CSS는 유지한 진단에서도 같은 좌표·증상이 재현됐다(`output/playwright/routine-bot/swipe/diagnostic-baseline-reload-4/`). 새 제스처 리스너가 없어도 발생함을 확인한 것이며 구버전 브라우저 내부 원인까지 확정한 것은 아니다. 설치된 Chrome 155는 같은 장면 3회와 전체 40항목을 통과했다. 제품 우회 처리·재클릭·강제 클릭·DOM 이벤트 주입 없이 브라우저 버전을 명시해 최종 검증했다. 구형 검사 환경의 실패 기록은 보존한다.

제스처 시험의 좌표가 자동 스크롤 영역 또는 일부만 보이는 목적지에 놓였던 실패도 `output/playwright/routine-bot/swipe/early*`에 보존했다. 터치 진단은 같은 폴더의 `diagnostic-*`, 최초 최종 실행 실패는 `gestures/final/swipe/`에 남긴다. 실제 히트 대상과 화면 내부 목적지를 확인하도록 입력 도우미를 고쳤으며 코드 보존·순서·중첩 assertion을 약화하지 않았다. 기존 UI 시험은 새 카드 래퍼와 모바일 일반 스크롤에 맞춰 선택자·가시성 기준을 갱신했다.

## 재현과 게시

```powershell
$env:PORT='8124'
node tests/routine-bot-server.cjs
# 다른 터미널, 각 재실행마다 WEBSIM_EVIDENCE를 새 폴더로 지정
$env:WEBSIM_URL='http://127.0.0.1:8124/WebSim/'
node --test routine_bot/*.test.cjs tests/routine-bot-server.test.cjs
$env:WEBSIM_BROWSER_CHANNEL='chrome' # 설치된 Chrome 155에서 최종 전체 검증
node tests/routine-bot-swipe.browser.cjs
node tests/routine-bot-tree.browser.cjs
node tests/routine-bot.browser.cjs early
node tests/routine-bot-budgets.browser.cjs
node tests/routine-bot-safety.browser.cjs
node tests/routine-bot-cooperation.browser.cjs final
```

main 병합 커밋, Pages 실행, 공개 파일 일치 및 운영 주소의 제스처 검증 결과는 해당 PR의 게시 기록에 남긴다.
