# 루틴봇 검증 기록

2026-10-18, Windows / Node v24.13.1에서 수행했습니다. 로컬 HTTP 서버는 실제 Pages 형태의 `/WebSim/` 접두 경로를 사용합니다. 검증 스킬은 `.agents/skills/game-verification/SKILL.md`를 직접 읽고 초기 3레벨 단계와 전체 구현 단계에 적용했습니다. 새로 만든 스킬의 기존 세션 내 자동 등록은 확인하지 않았습니다. 자동 등록·전역 설치를 했다고 보고하지 않습니다.

## 논리·저장·통합 결과

| 분류 | 결과 | 확인한 내용 및 증거 |
| --- | --- | --- |
| 초기 3레벨 검증 | PASS | 독립 예상 좌표/회전/충돌 및 기준해답 1~3, 7/7. `output/playwright/routine-bot/early/engine-tests.txt` |
| 초기 저장·서버 | PASS | 저장 13 + 접두 경로 서버 3 = 16/16. `early/storage-server-tests.txt` |
| 전체 엔진·레벨·저장·서버 | PASS | 55/55. 엔진 39, 저장 13, 서버 3. `output/playwright/routine-bot/final/unit-tests.txt` |
| 전 레벨 해결 가능성 | PASS | 15레벨·18지도, 각 레벨마다 동일 기준 프로그램을 게임의 실제 실행기로 수행. 레벨별 저장/실행 한도 통과. `engine.test.cjs`의 reference level 1~15 및 `LEVELS.md` |
| 독립적인 엔진 기대값 | PASS | 수작업 기대 좌표·방향·반복 순서·함수 복귀·조건 양쪽 분기·정확한 한도 경계와 비교. 기준해답을 자기 검증한 것과 구분 |
| 저장·복원 | PASS | 정상 왕복, 독립 복사, JSON/버전 손상, 부분 구조 손상, 과대/깊은 데이터, 순환 구조, 저장 접근 차단, 쓰기/보조 저장 실패, 이전 정상 코드 복구 |
| 실제 접두 경로 HTTP 통합 | PASS | 메뉴 진입, 게임 파일/MIME, 상대 복귀 링크, 게임/메뉴의 로컬 자원, 기존 HTML 59개 링크 HTTP 200. `early/deployment.json`, `final/deployment.json` |
| 기존 주말 게임 브라우저 회귀 | PASS | `weekend-season2.browser.cjs` 17개 장면: 1년 완주·저장/복원·기존 플래너·390px 터치·키보드·오류 0건. `final/regression-weekend.txt`, `final/regression-weekend/result.json` |
| 기존 플래너 연결 브라우저 회귀 | PASS | `weekend-season2-planner-bridge.browser.cjs` 6개 장면: 새 30개 메뉴·키보드 진입·365/366일 완료 전송·원본 보존·모바일·손상 거절. `final/regression-bridge.txt`, `final/regression-bridge/result.json` |
| 프로젝트 스킬 형식 | PASS | 공식 `skill-creator/scripts/quick_validate.py` 두 파일 검사. `early/skill-verification-format.txt`, `early/skill-playtest-format.txt` |
| 실제 Android 기기 | NOT RUN | 브라우저 터치 에뮬레이션과 실제 기기 검증은 별개 |
| 실제 사람의 재미·만족도 | NOT RUN | 자동화·에이전트 관찰은 사용자 반응 연구를 대신하지 않음 |

취소된 실행기에서 여러 번 `step()`을 호출해도 상태가 변하지 않음을 엔진 단위 시험에서 확인했습니다. 예약 프레임/애니메이션의 UI 취소, 렌더링된 편집, 실제 순차 진행, 화면 크기별 터치는 브라우저 시험 결과와 [PLAYTEST.md](PLAYTEST.md)에 별도 기록합니다. 기존 59개 HTML 링크 확인은 기존 모든 게임의 상호작용 재시험을 의미하지 않습니다.

## 재실행한 명령

초기 3레벨만 대상으로 하는 엔진 검증:

```sh
node --test --test-name-pattern="reference level [123]:|coordinates|turns|wall collision|early collision" routine_bot/engine.test.cjs
node --test routine_bot/storage.test.cjs tests/routine-bot-server.test.cjs
```

전체 구현 후:

```sh
node --test routine_bot/engine.test.cjs routine_bot/storage.test.cjs tests/routine-bot-server.test.cjs
node tests/routine-bot-server.cjs
node tests/routine-bot-deployment.cjs final
node tests/routine-bot.browser.cjs early
node tests/routine-bot.browser.cjs final
node tests/routine-bot-safety.browser.cjs
```

서버 명령은 별도 터미널에서 계속 실행합니다. 브라우저 스크립트는 실제 클릭/탭·키 입력으로 프로그램을 구성해야 하며 내부 엔진 호출만으로 통과시킨 결과를 플레이 검증으로 세지 않습니다. 기준해답을 읽는 단위 검증과 정답을 읽지 않는 독립 탐색 플레이를 분리합니다.

기존 게임 브라우저 회귀도 같은 실제 접두 경로에서 실행했습니다(PowerShell):

```powershell
$env:WEBSIM_URL='http://127.0.0.1:8123/WebSim/'
$env:WEBSIM_EVIDENCE='output/playwright/routine-bot/final/regression-weekend'
node tests/weekend-season2.browser.cjs
$env:WEBSIM_EVIDENCE='output/playwright/routine-bot/final/regression-bridge'
node tests/weekend-season2-planner-bridge.browser.cjs
```

## 발견과 수정

1. **부분 저장 손상이 조용히 사라질 수 있음**: JSON 자체는 정상이나 한 레벨의 반복 횟수/명령 구조가 깨졌을 때 초기 sanitizer가 그 레벨 코드를 버리고 정상 로드로 보고했습니다. `repaired` 상태를 추가하고 손상된 레벨만 이전 정상 보조 저장에서 복구하도록 수정했습니다. 정상 레벨의 최신 코드는 유지하고 손상된 primary로 정상 backup을 덮어쓰지 않습니다. 같은 장면을 재현하는 회귀 2개가 PASS입니다.
2. **저장 복구 안내가 초기 저장 성공에 가려질 수 있음**: UI 초기 `loadLevel()`이 저장하면서 초기 손상/복구 안내를 지우는 경로를 발견해 UI 구현 담당에게 전달했습니다. 실제 화면 재시험 결과는 PLAYTEST의 저장 안내 항목에 기록합니다.
3. **초반 충돌 안내가 아직 열리지 않은 조건을 언급함**: 독립 탐색에서 발견한 문구를 초기 레벨은 방향·이동 횟수 안내로 수정했습니다. `early collision guidance does not mention locked conditional blocks` 회귀 시험 PASS입니다.
4. **초기 스킬 증거 경로의 phase 누락**: 스킬 작성자와 다른 검토 에이전트가 문서 명령과 실제 스크립트를 대조해 배포 검사의 인수 생략 시 초기 실행 증거가 기본 `final` 폴더에 기록될 수 있음을 발견했습니다. 스킬에 `early`/`final` 인수를 명시하고 실제 CLI·경로와 두 스킬 형식을 재검사했습니다.

## 실행·게시 상태 구분

로컬 정적 실행과 위 논리/HTTP 검증은 PASS입니다. 원격 push·PR·main 병합·GitHub Pages 운영 배포는 별도의 GitHub/공개 URL 결과를 확인한 후 이 표를 갱신합니다. 여기의 localhost 테스트를 운영 배포 성공으로 간주하지 않습니다.

| 작업 | 현재 기록 |
| --- | --- |
| 코드 및 로컬 정적 실행 | PASS |
| 원격 push | NOT RUN — 게시 담당의 최종 결과 확인 전 |
| PR 생성 | NOT RUN — 게시 담당의 최종 결과 확인 전 |
| main 병합 | NOT RUN — 게시 담당의 최종 결과 확인 전 |
| 운영 Pages 배포 및 공개 URL smoke | NOT RUN — 게시 담당의 최종 결과 확인 전 |
