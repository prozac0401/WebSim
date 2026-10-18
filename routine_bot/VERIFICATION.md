# 루틴봇 검증 기록

2026-10-18, Windows / Node v24.13.1에서 수행했습니다. 로컬 HTTP 서버는 실제 Pages 형태의 `/WebSim/` 접두 경로를 사용합니다. 검증 스킬은 `.agents/skills/game-verification/SKILL.md`를 직접 읽고 초기 3레벨 단계와 전체 구현 단계에 적용했습니다. 새로 만든 스킬의 기존 세션 내 자동 등록은 확인하지 않았습니다. 자동 등록·전역 설치를 했다고 보고하지 않습니다.

## 논리·저장·통합 결과

| 분류 | 결과 | 확인한 내용 및 증거 |
| --- | --- | --- |
| 초기 3레벨 검증 | PASS | 독립 예상 좌표/회전/충돌 및 기준해답 1~3, 7/7. `output/playwright/routine-bot/early/engine-tests.txt` |
| 초기 저장·서버 | PASS | 저장 13 + 접두 경로 서버 3 = 16/16. `early/storage-server-tests.txt` |
| 초기 렌더링 조작 재생 | PASS | Chromium 145.0.7632.6, 12/12. 초기 1~3 순차 해결·충돌 수정·저장·좁은 화면 조작. `early/browser-report.json` |
| 전체 렌더링 조작 재생 | PASS | 30/30, 콘솔/페이지 오류 0. 데스크톱 1~15 순차 해결과 마지막 화면, 320×740/390×844 실제 터치 에뮬레이션 편집·반복/조건/함수·다중지도, 저장 실패/손상/복구. `final/browser-report.json` |
| 독립 UI 안전성 재시험 | PASS | 12/12, 콘솔/페이지 오류 0. 다중지도 전환 중 멈춤/초기화/레벨 전환·화면 위치, 순환호출/중첩/블록/실행 한도, 음소거와 재방문 자동재생 방지. 후반 접근만 fixture를 사용한 안전성 재생. `final/safety/safety-report.json`, `safety-trace.zip`, PNG 8개 |
| 전체 엔진·레벨·저장·서버 | PASS | 56/56. 엔진 40, 저장 13, 서버 3. `output/playwright/routine-bot/final/unit-tests.txt` |
| 전 레벨 해결 가능성 | PASS | 15레벨·18지도, 각 레벨마다 동일 기준 프로그램을 게임의 실제 실행기로 수행. 레벨별 저장/실행 한도 통과. `engine.test.cjs`의 reference level 1~15 및 `LEVELS.md` |
| 독립적인 엔진 기대값 | PASS | 수작업 기대 좌표·방향·반복 순서·함수 복귀·조건 양쪽 분기·정확한 한도 경계와 비교. 기준해답을 자기 검증한 것과 구분 |
| 저장·복원 | PASS | 정상 왕복, 독립 복사, JSON/버전 손상, 부분 구조 손상, 과대/깊은 데이터, 순환 구조, 저장 접근 차단, 쓰기/보조 저장 실패, 이전 정상 코드 복구 |
| 실제 접두 경로 HTTP 통합 | PASS | 메뉴 진입, 게임 파일/MIME, 상대 복귀 링크, 게임/메뉴의 로컬 자원, 기존 HTML 59개 링크 HTTP 200. `early/deployment.json`, `final/deployment.json` |
| 기존 주말 게임 브라우저 회귀 | PASS | `weekend-season2.browser.cjs` 17개 장면: 1년 완주·저장/복원·기존 플래너·390px 터치·키보드·오류 0건. `final/regression-weekend.txt`, `final/regression-weekend/result.json` |
| 기존 플래너 연결 브라우저 회귀 | PASS | `weekend-season2-planner-bridge.browser.cjs` 6개 장면: 새 30개 메뉴·키보드 진입·365/366일 완료 전송·원본 보존·모바일·손상 거절. `final/regression-bridge.txt`, `final/regression-bridge/result.json` |
| 기존 Node 전체 회귀(82파일) | 최초 FAIL 1 / PASS 764; 해당 파일 재시험 PASS | 765개 검사, 약 361초. 유일한 실패는 Windows checkout 줄바꿈으로 모델 바이트가 2개 늘어난 문제. HEAD 원본 바이트 복원 후 해당 파일 11/11 PASS. 전체 765개를 다시 실행한 것은 아님. 아래 원인 확인 참조. |
| 프로젝트 스킬 형식 | PASS | 공식 `skill-creator/scripts/quick_validate.py` 두 파일 검사. `early/skill-verification-format.txt`, `early/skill-playtest-format.txt` |
| 기존 develop-web-game 기본 클라이언트 | PASS | 기본 캡처/텍스트 smoke 실행 종료 0, 화면·텍스트 검토. `final/safety/original-client/shot-0.png`, `state-0.json`. 실제 레벨 플레이 범위는 위 브라우저 재생/독립 탐색과 구분 |
| 실제 Android 기기 | NOT RUN | 브라우저 터치 에뮬레이션과 실제 기기 검증은 별개 |
| 실제 스피커 음색·음량 청취 | NOT RUN | Web Audio 생성·사용자 조작 후 활성화·음소거는 관찰용 API 계측으로 확인 |
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

기존 Node 회귀는 새 게임 시험과 구분해 기존 `*.test.cjs` 82파일을 모두 실행했습니다.

```powershell
$legacyTests = @(rg --files -g '*.test.cjs' -g '!node_modules/**' -g '!output/**' -g '!dist/**' | Where-Object { $_ -notmatch '^(routine_bot[\\/]|tests[\\/]routine-bot)' })
node --test @legacyTests
```

### 기존 회귀 실패의 원인 확인

`evolving_vehicles_2/supra-model.test.cjs:48`은 `supra-runtime.js`의 전체 바이트 수와 메타데이터의 `runtimeBytes`를 엄격 비교합니다. Windows 작업 사본은 6,234,273바이트, 메타데이터와 기준 커밋 `5cce2489a8c8f40b5e8cec5646b7b15d136e5f38`의 Git 원본은 6,234,271바이트입니다. 작업 사본의 CRLF가 2개이고 이를 LF로 정규화하면 Git 원본과 완전히 같습니다. 이 모델·메타데이터·시험 파일의 기준 커밋 대비 diff는 모두 비어 있습니다.

최초 단독 `node --test evolving_vehicles_2/supra-model.test.cjs` 재실행도 같은 위치에서 10 PASS / 1 FAIL이었습니다. 근거는 `final/regression-supra-repeat.txt`, `final/regression-baseline-supra.json`에 보존했습니다. 이후 작업 경로를 검증하고 이 파일 하나만 `git show HEAD:evolving_vehicles_2/assets/models/supra-runtime.js`의 원본 바이트로 복원했습니다. 복원 파일은 HEAD와 byte-identical이고 SHA-256은 `5155e06f2c64f9535601869750880f718800f2c67f1c62dfb672c8dbd5627158`이며 Git diff는 없습니다. 소스/시험 로직이나 바이트 단언을 변경하거나 시험을 제외하지 않았습니다.

원본 바이트 복원 후 같은 Supra 파일 재시험은 **11/11 PASS**입니다. `final/regression-supra-byte-restoration.json`에 복원 경로·전후 크기·일치/해시를, `final/regression-supra-restored.txt`에 결과를 기록했습니다. 전체 회귀의 첫 결과는 764 PASS / 1 FAIL이며, 원인을 제거한 해당 파일의 재시험만 수행했습니다. 전체 765개를 다시 실행해 전부 통과했다고 주장하지 않습니다.

## 발견과 수정

1. **부분 저장 손상이 조용히 사라질 수 있음**: JSON 자체는 정상이나 한 레벨의 반복 횟수/명령 구조가 깨졌을 때 초기 sanitizer가 그 레벨 코드를 버리고 정상 로드로 보고했습니다. `repaired` 상태를 추가하고 손상된 레벨만 이전 정상 보조 저장에서 복구하도록 수정했습니다. 정상 레벨의 최신 코드는 유지하고 손상된 primary로 정상 backup을 덮어쓰지 않습니다. 같은 장면을 재현하는 회귀 2개가 PASS입니다.
2. **저장 복구 안내가 초기 저장 성공에 가려질 수 있음**: UI 초기 `loadLevel()`이 저장하면서 초기 손상/복구 안내를 지우는 경로를 수정했습니다. 최종 브라우저 시험에서 `corrupt`, `unavailable`, `write-failure`, `recovered`, `repaired` 상황 모두 안내를 확인하고 실제 버튼으로 한 레벨을 해결했습니다. `final/browser-report.json`의 저장 5개 장면 PASS입니다.
3. **초반 충돌 안내가 아직 열리지 않은 조건을 언급함**: 독립 탐색에서 발견한 문구를 초기 레벨은 방향·이동 횟수 안내로 수정했습니다. `early collision guidance does not mention locked conditional blocks` 회귀 시험 PASS입니다.
4. **초기 스킬 증거 경로의 phase 누락**: 스킬 작성자와 다른 검토 에이전트가 문서 명령과 실제 스크립트를 대조해 배포 검사의 인수 생략 시 초기 실행 증거가 기본 `final` 폴더에 기록될 수 있음을 발견했습니다. 스킬에 `early`/`final` 인수를 명시하고 실제 CLI·경로와 두 스킬 형식을 재검사했습니다.

## 실행·게시 상태 구분

로컬 정적 실행과 위 논리/HTTP 검증, 원격 push·PR·main 병합·GitHub Pages 운영 배포를 각각 확인했습니다. 공개 사이트는 별도 새 브라우저 문맥에서 다시 검사했습니다.

| 작업 | 현재 기록 |
| --- | --- |
| 코드 및 로컬 정적 실행 | PASS |
| 원격 push | PASS — `feat/routinebot-home-code`, 초기 커밋 `089ab8bd1862c5745cc81c544a02ab8a04d29c8e` |
| PR 생성 | PASS — [PR #103](https://github.com/prozac0401/WebSim/pull/103), 생성·현재 작업에 연결·검토 완료 |
| main 병합 | PASS — `8bbdae1518c7355850725bedc8d4e8ce5987fde3`, 2026-10-18 13:45:41 UTC |
| 운영 Pages 배포 | PASS — [배포 39132962649](https://github.com/prozac0401/WebSim/actions/runs/39132962649), main/root 기존 구성, build/deploy 모두 success |
| 공개 파일 일치 | PASS — 목록·공통 메뉴·게임 HTML/CSS/JS·엔진·레벨·저장·안내9개 파일이 위 병합 커밋과 SHA-256 일치. `public/public-bytes.json` |
| 공개 URL 브라우저 smoke | PASS — Chromium 145.0.7632.6,15개 검사, 오류0. 실제 목록→1–3 플레이/수정/중단/저장,320·390px 터치. 공개59개 기존 HTML 링크도200. `public/browser-report.json`, `public/deployment.json` |

공개 게임: https://prozac0401.github.io/WebSim/routine_bot/routine_bot.html . 공개 브라우저 smoke는 2026-10-18 13:47:52–13:48:31 UTC에 수행했습니다. 데스크톱 첫 화면/성공과 두 모바일 성공 PNG를 직접 확인했습니다. 운영 사이트에서 전체15레벨을 다시 푼 것은 아니며, 전체 진행은 동일한 런타임 파일의 로컬 검증 결과입니다.

공개 경로 재시험은 다음과 같습니다. 브라우저는 별도 임시 프로필에서 실행하며 실제 사용자의 저장 데이터를 건드리지 않습니다.

```powershell
$env:WEBSIM_URL='https://prozac0401.github.io/WebSim/'
$env:WEBSIM_EVIDENCE='output/playwright/routine-bot/public'
node tests/routine-bot-deployment.cjs public
node tests/routine-bot.browser.cjs early
```

## 최종 수정의 추가 확인

- 독립 코드 검토에서 지도 전환 뒤 이전 지도 애니메이션 좌표가 남는 경로를 발견했다. 다음 지도 시작 시 애니메이션을 초기화하고 실제 한 단계 입력으로 전환한 캡처와 렌더 좌표를 재확인했다. safety12개 중 해당 전환·취소·같은 프로그램 성공 항목 PASS.
- 로봇 아래 별이 가려지는 관찰 문제는 별 테두리와 현재 타일 배지로 수정했다. 독립 탐색의 같은 실패 장면 재시험 PASS. 상세 전후 증거는 PLAYTEST.md에 있다.
- 독립 키보드 검토에서 블록 삽입 뒤 포커스 소실을 재현해 수정했다. 별도 `node tests/routine-bot-safety.browser.cjs --keyboard-only` 1/1 PASS. 원래 safety12/12와 별도 실행이며 한 번에13개를 실행했다고 합치지 않는다. 수정 뒤 초기 플레이·모바일·저장 장애15개 장면 재시험 PASS(`final/keyboard-retest/browser-report.json`).
- 최종 UI 기준해답 진행은 전체15레벨30개 브라우저 검사 PASS, 정답 미열람 탐색은 실제 본편1–12 PASS. 응용13–15의 독립 블라인드 탐색과 실제 Android/iOS 하드웨어·사람의 만족도 조사는 NOT RUN이다.

## 2026-10-19 · 펼치기/접기 트리 편집 후 검증

앞의 게시 표는 최초 출시(PR #103)의 기록이다. 이번 변경은 명령 엔진과 저장 구조를 유지하면서 반복·조건을 같은 트리 안에서 펼치고 접도록 바꾼 후속 수정이다. 두 프로젝트 스킬을 직접 다시 읽고 절차를 적용했다. 기존 세션에 자동 등록됐다고 주장하지 않는다. 새 UI 검사는 프로그램이나 성공 상태를 주입하지 않으며, 후반 접근 fixture 사용 여부를 보고서에 구분한다.

| 분류 | 결과 | 새 증거 |
| --- | --- | --- |
| 엔진·레벨·저장·서버 | PASS 56/56 | `output/playwright/routine-bot/tree/unit-tests.txt` |
| 접두 경로·기존 목록 | PASS | 게임/자원/복귀 및 기존 HTML 59개 링크. `tree/deployment.json` |
| 전체 15레벨 UI 진행 | PASS 30/30 | 실제 블록 입력과 타이머 실행, 320/390px 터치, 손상/실패 저장. `tree/progression/browser-report.json` |
| 키보드 포함 UI 안전성 | PASS 13/13 | 단일 실행에서 키보드·지도 전환 취소·함수 순환·중첩/블록/실행 한도·소리 설정. `tree/safety/safety-report.json` |
| 최종 트리 전용 회귀 | PASS 26/26 | 데스크톱·320×740/390×844 터치에서 중첩/양분기/접힘/숨은 삽입 방지/수정·취소/새로고침/반복 해결/한도 거절 뒤 횟수 변경/4단계 활성 명령 가시성, 키보드 반복 편집·성공. `tree/final-regression/tree-report.json` |
| 독립 정답 미열람 탐색 | PASS 6/6 | 새 저장에서 세 viewport 각각 1–4레벨, 193개 실제 조작. 코드/성공 주입·해제 fixture·정답 파일 열람 없음. 오류 0건, 모바일 활성 명령 재시험 포함. `output/playwright/routine-bot/tree-review/review.json` |
| 브라우저 오류 | PASS — 0건 | 위 세 UI 보고서의 `errors: []` |
| 프로젝트 스킬 갱신·직접 적용 | PASS | 트리 검사 명령·선택자·증거 범위 반영, 두 형식 검사 PASS. `tree/skill-verification-format.txt`, `tree/skill-playtest-format.txt` |
| 실제 Android/iOS 및 사람의 만족도 | NOT RUN | 기존 실제 기기·사용자 연구 한계를 유지 |

전체 진행 UI는 UTC 2026-10-18 21:34:56.444–21:41:46.269, 안전성 UI는 21:36:21.931–21:40:37.351에 실행했다. 진행 검사 중 활성 명령 스크롤 개선이 추가됐으므로 그 개선의 최종 근거는 별도의 트리 전용 재시험이다. 최신 소스 고정 뒤 UTC 21:42:18.612–21:43:13.141에 단독 실행한 트리 검사의 revision은 `inline-tree-active-leaf-v2`다. 이 실행은 한도 거절 뒤 횟수 수정 회귀와 **접어 둔 4단계 반복에서 실행 중인 명령을 자동 펼치고 화면 안에 표시하는 검사**를 모두 포함한다. 데스크톱은 편집기 내부 잘림과 viewport 경계를, 모바일은 viewport 경계와 고정 지도 하단을 함께 검사했다.

중간 트리 재시험은 조작 14개 그룹 PASS 뒤 Playwright trace 내보내기 오류(`file data stream has unexpected number of bytes`)로 끝나 전체 FAIL로 남겼다. `tree/intermediate-trace-failure.txt/json`을 보존했다. 최종 검사는 기존 zip을 재사용하지 않는 새 `tree/final-regression/` 경로에서 동일 단언과 추가 가시성 단언을 실행해 trace 저장까지 정상 종료했다. 중간 실패를 지우거나 단언을 완화하지 않았다.

재실행(서버를 먼저 켜고 저장소 루트의 PowerShell에서):

```powershell
$env:WEBSIM_EVIDENCE='output/playwright/routine-bot/tree/progression'
node tests/routine-bot.browser.cjs final
$env:WEBSIM_EVIDENCE='output/playwright/routine-bot/tree/safety'
node tests/routine-bot-safety.browser.cjs
$env:WEBSIM_EVIDENCE='output/playwright/routine-bot/tree/final-regression'
node tests/routine-bot-tree.browser.cjs
```

UI suite는 충분한 브라우저 자원이 있는 환경에서 순차 실행하면 trace 수집 경쟁을 줄일 수 있다. `WEBSIM_EVIDENCE`를 생략하면 트리 전용 검사는 `output/playwright/routine-bot/tree/`에 쓴다. 발견한 좁은 화면 조건 이름 줄바꿈, 거절된 편집 뒤 횟수 변경, 활성 명령이 화면을 벗어나던 장면과 수정 후 실제 캡처 검토는 [PLAYTEST.md](PLAYTEST.md)의 같은 날짜 절에 기록했다. 이번 후속 수정의 원격 PR/병합/운영 반영은 별도 게시 확인으로 갱신한다.

## 2026-10-19 · 기준해답 저장 블록 제한

`feat/routinebot-answer-budgets`의 후속 변경이다. 1~15레벨의 필수 저장 블록 제한은 `3, 5, 6, 2, 5, 7, 4, 4, 6, 11, 9, 6, 9, 10, 9`개다. 시작·반복·조건 양쪽·F1/F2를 모두 합산하며 실제 실행 횟수와 구분한다. 기준해답의 수와 일치하는 상한이지 증명된 최솟값이나 명령 종류별 할당량은 아니다. 12레벨은 기준 6개보다 적은 4개짜리 다른 프로그램도 같은 두 지도에서 통과함을 따로 검증했다.

새 한도만 넘는 이전 코드는 보존하고, 구조·명령 해제·깊이·순환·전역 크기 검증은 유지했다. 제한을 넘는 실행과 추가는 거부한다. 아직 초과 상태인 부분 삭제·같은 개수의 횟수 수정·재배치·실행 취소는 보존하며 다시 불러올 수 있다. 기존 완료 기록은 삭제하지 않지만 모든 새 실행은 현재 제한을 따른다. 독립 코드 검토에서 부분 삭제 뒤 상단 초과 수치가 오래된 채 남는 문제를 찾아 갱신했고, 세 화면에서 같은 수리 장면을 다시 시험했다.

| 분류 | 결과 | 증거 |
| --- | --- | --- |
| 엔진·15레벨·18지도·저장·서버 | PASS 73/73 | `output/playwright/routine-bot/budgets/unit-tests.txt`: 엔진57, 저장13, 서버3. 각 기준해답 수=제한 및 1블록 초과 15건 실행 전 거부 포함 |
| 실제 접두 경로·목록·기존 HTML | PASS | `budgets/deployment.json`, 자원/복귀와 기존 59개 링크 |
| 기존 초과 저장 보존·수리 | PASS 21/21 | `budgets/migration/budget-report.json`, desktop1440×900·320×740/390×844 터치, 5→4→3 삭제·취소·복원·실행/추가 거절·수리 후 실제 성공 |
| 중첩 트리·키보드·모바일 | PASS 26/26 | `budgets/tree/tree-report.json`, revision `inline-tree-answer-budgets-v3` |
| 중단·복수 지도·순환·한도·소리 | PASS 13/13 | `budgets/safety/safety-report.json`, 기존 150단계 실행 한도와 깊이4 경계 유지 |
| 독립 실제 조작 검토 | PASS 7/7 | `output/playwright/routine-bot/budget-review/review.json`, 191행동. 새 저장1–4 세 화면과 별도 legacy/F1F2 fixture를 분리 |
| 전체 15레벨 UI 진행 | PASS 30/30 | `budgets/full/browser-report.json`, 실제 블록 입력으로15레벨·최종 클리어,320/390터치·복원/손상/저장 실패, 화면 제한 수와 독립 기대 수열 일치 |
| 기본 develop-web-game 클라이언트 | PASS — 입력·렌더 smoke | `budgets/client/shot-0.png`, `state-0.json`: 종료0, 저장2·실행0·ready를 캡처/상태로 확인. 실제 실행·승리 증거는 전체 UI 검사와 구분 |
| 프로젝트 스킬 직접 재적용·형식 | PASS | 두 스킬에 hard cap/migration 명령·판정·증거 분류 추가 후 직접 실행. `budgets/skill-verification-format.txt`, `skill-playtest-format.txt` |
| 브라우저 오류 | PASS — 0건 | migration/tree/safety/full 및 독립 검토 보고서 |
| 실제 Android/iOS·사람의 만족도 | NOT RUN | 브라우저 에뮬레이션과 에이전트 조작만 수행 |
| 블록 제한 변경의 원격 push·PR·main 병합·운영 배포 | PASS | [PR #105](https://github.com/prozac0401/WebSim/pull/105) 병합 `e208fdca9fdde348807a61dfe13c52bc901805a9`, Pages 실행 `39170862616` 성공. 공개 자원9개가 병합 SHA와 동일(`budgets/public/public-bytes.json`), 공개 저장 migration 21/21 PASS(`budgets/public/migration/budget-report.json`) |

Chromium 145.0.7632.6을 사용했다. migration은 UTC 2026-10-18 21:56:33.441–21:56:58.638, tree는 21:57:06.313–21:58:06.361, safety는 21:58:16.389–21:59:51.016에 각각 순차 실행해 trace까지 정상 저장했다. migration의 세 화면 모두 부분 삭제 후 최신 초과 수치와 제한 충족 안내를 단언한다. 독립 검토의 브라우저 실행은 그 안내 수정 전이며 최종 migration이 해당 수정을 재검증했다. 정답 파일을 읽는 전체 진행 재생과 정답 파일 미열람 독립 조작 회귀, 저장 fixture, 후반 접근 fixture는 서로 다른 증거다.

전체 UI 검사는 UTC 22:00:21.315–22:04:49.505에 실행해 exit0으로 종료했다. 데스크톱은 새 저장에서 15레벨·18지도를 실제로 진행했고 최종 클리어를 확인했다. 모바일은 초반과 별도 접근 fixture를 통한 후반 편집/복수 지도 범위다. 기본 클라이언트는 버튼 입력과 텍스트/Canvas 캡처 smoke로 따로 실행했고, PNG와 상태 JSON을 직접 검토했다. 모든 브라우저 검사는 종료 후 닫았다.

트리 fixture는 기존 9블록 구조/10번째 삽입 검사를 수행할 수 있는 14레벨로 옮겼고, 깊이4 실행 가시성은 6레벨에서 유지했다. 4레벨의 rollback 검사는 반복+앞으로 2블록 뒤 세 번째 추가를 거절한다. 전역128개·중첩·실행 제한 독립 시험을 유지했으며 더 작은 레벨 예산에 맞추느라 검증 항목을 삭제하거나 실패를 숨기지 않았다. 초기·이전 릴리스의 실패 기록은 앞 절과 원래 증거 경로에 그대로 남아 있다.

재실행(정적 서버를 켜고 저장소 루트 PowerShell에서):

```powershell
node --test routine_bot/engine.test.cjs routine_bot/storage.test.cjs tests/routine-bot-server.test.cjs
$env:WEBSIM_EVIDENCE='output/playwright/routine-bot/budgets'
node tests/routine-bot-deployment.cjs budgets
$env:WEBSIM_EVIDENCE='output/playwright/routine-bot/budgets/migration'
node tests/routine-bot-budgets.browser.cjs
$env:WEBSIM_EVIDENCE='output/playwright/routine-bot/budgets/tree'
node tests/routine-bot-tree.browser.cjs
$env:WEBSIM_EVIDENCE='output/playwright/routine-bot/budgets/safety'
node tests/routine-bot-safety.browser.cjs
$env:WEBSIM_EVIDENCE='output/playwright/routine-bot/budgets/full'
node tests/routine-bot.browser.cjs final
```

이미 존재하는 증거를 보존하려면 `WEBSIM_EVIDENCE`를 새 폴더로 바꿔 재실행한다. 다른 게임 코드를 바꾸지 않아 이전 전체 저장소765건과 다른 게임 브라우저 회귀는 이번에 다시 실행하지 않았으며, 앞 절의 과거 결과와 구분한다. 변경 범위의 엔진·저장·전체 루틴봇 UI 및 실제 HTTP 기존 링크를 검증한다.

## 2026-10-19 · 기다리기와 시간 위험 검증

`feat/routinebot-timed-hazards`는 위 PR #105 배포본에 이어지는 변경이다. 위험칸은 5·8·12·15레벨의 7지도, 총13칸에만 배치했다. `wait`를 5레벨부터 공개하고 새 기준해답에 맞춰 저장 제한을 `3, 5, 6, 2, 6, 7, 4, 5, 6, 11, 9, 7, 9, 10, 11`개로 갱신했다. 각 레벨의 기준해답과 상한이 일치하고 18지도 모두 같은 레벨의 동일 프로그램으로 해결된다. 12레벨의 다른5블록 프로그램도 두 지도를 통과하므로 기준7블록 구조를 강제하지 않는다.

논리시간은 성공한 이동뿐 아니라 회전·기다리기·충돌 시도에도1씩 증가한다. 반복·조건·호출·복귀는 시간을 보내지 않는다. 벽 충돌은 충돌로 종료하고, 정상 행동 뒤에는 현재 칸의 위험을 집 도착보다 먼저 검사한다. 시작 시간0 위험과 제자리 위험도 독립 시험에 포함한다. 일시정지·벽시계 지연·속도는 논리시간에 영향을 주지 않으며 새 지도는0부터 시작한다. 저장 스키마 버전은 유지하고 기다리기 노드의 왕복·보조 저장·거부 저장을 검증했다.

| 분류 | 결과 | 증거와 범위 |
| --- | --- | --- |
| 엔진·18지도·위험 설계·저장·서버 | PASS 94/94 | `output/playwright/routine-bot/hazards/unit-tests.txt`: 엔진69, 저장14, 위험 레벨8, 서버3. 손으로 계산한 위험 좌표·시간, 기다림 제거/한 박자/출발만 지연 실패 및 기준해답 성공 비교 |
| 접두 경로·기존 목록·자원 | PASS | `hazards/deployment.json`, `deployment.txt`: `/WebSim/` 진입/복귀/MIME 및 기존 HTML59개 링크 |
| 시간 위험 실제 UI 회귀 | PASS 25/25 | `hazards/focused-retest/hazard-report.json`: 세 화면에서 실패·기다리기 삽입·재생/저장, 제자리 활성 실패, 속도 변경 시 그림 유지, 별·함수·복수 지도 시간0 |
| 중단·복수 지도·함수/실행 한도·키보드·소리 | PASS 13/13 | `hazards/safety/safety-report.json`: 새 기다리기 프로그램 두 지도 실행합76, 전환 취소·시간0·150단계 중단 유지 |
| 기존 트리·터치·키보드 회귀 | PASS 26/26 | `hazards/tree/tree-report.json`: 중첩/양분기/펼침/삽입/실행 취소/rollback/깊이4 활성 명령 가시성, 세 화면과 키보드 |
| 이전 초과 저장 수리 회귀 | PASS 21/21 | `hazards/budgets/budget-report.json`: desktop/320/390에서 기존5블록 보존·실행/추가 차단·부분 삭제·취소·재열기·3블록 수리 후 실제 성공 |
| 정답 미열람 독립 조작 회귀 | PASS 7/7 | `output/playwright/routine-bot/hazard-review/review.json`: 122행동, desktop 새 저장1–5, 모바일5/8 접근 fixture, 이전 경로 지식 있음. 오류/가로 넘침0 |
| 전체15레벨 UI·최종 클리어 | PASS 30/30 | `hazards/full/browser-report.json`: 새 저장에서 실제 블록 입력으로15레벨·18지도·마지막 클리어. 320/390터치 후반 편집/복수 지도와 손상·읽기/쓰기 실패·보조/부분 복원도 통과, 오류0 |
| 기본 develop-web-game 클라이언트 | PASS — 실제1레벨 성공 | `hazards/client/shot-0.png`, `state-0.json`: 버튼/Enter로앞으로3개 → 지도클릭 → Space실행. 저장3·실행3·시간3·집(4,1)·success, 종료0. Canvas 캡처와 JSON을 직접 확인 |
| 프로젝트 스킬 직접 적용·형식 | PASS | 두 파일을 읽고 시간 규칙·UI 수정 재시험·새 명령/증거 절차 적용. `hazards/skill-verification-format.txt`, `skill-playtest-format.txt` |
| 실제 Android/iOS·사람의 만족도·물리 음향 | NOT RUN | Chromium 터치 에뮬레이션/에이전트 조작 및 Web Audio 관찰과 구분 |
| 시간 위험 변경의 push·PR·main·Pages | NOT RUN — 로컬 검증 기록 시점 | 실제 게시 결과는 해당 PR와 최종 보고 및 별도 공개 검증 증거에 기록. 위 PR #105의 확정 배포 기록과 구분 |

Chromium145.0.7632.6, Windows/Node24.13.1, 1440×900 데스크톱과320×740·390×844 터치를 사용했다. focused 최종 실행은 UTC2026-10-18 22:24:47.850–22:25:54.847, safety는22:23:29.502–22:24:32.696이다. 실패 강조, 수정된 모바일 칸 이름, 데스크톱 열린 시간표, 두 번째 지도 시간0과 두 지도 성공 PNG를 직접 열어 확인했다. 전체 페이지 PNG는 sticky 요소를 전체 문서 안에 그리므로 실제 viewport 동시 노출은 별도의 좌표 단언으로 판정한다.

### 발견·수정 및 실패 증거 보존

- 완료된4× 애니메이션 뒤0.5× 변경이 로봇/위험 시각을 되감던 경로를 고쳤다. 생성 당시 지속 시간을 저장하며 세 viewport에서 같은 입력과 시각 비교를 재시험했다.
- 320px A/B/C가 지나치게 작았던 문제를 키운 글꼴로 고쳤다. 독립 검토가 같은 시간4 제자리 실패 화면을 다시 확인했다.
- desktop 열린 시간표에서 실패 메시지 아래끝923.8px가900px 화면을 벗어나는 실제 FAIL을 `hazards/open-guide-repro/`에 남겼다. 지도 높이 수정 뒤 같은 장면은869.8px 이내이며 실행·단계도 함께 보인다. 자세한 전후는 PLAYTEST.md에 있다.
- 초기 focused는20개 그룹을 통과한 뒤 8레벨에서 반복 제어 이벤트를 예상 순서에 빠뜨려 FAIL이었다(`hazards/focused/hazard-report.json`). 게임 동작을 바꾸지 않고 명시된 반복→조건 순서를 시험에 추가했다. `focused-final/`과 `open-guide-repro/`의 열린 시간표 실패도 보존했다. 마지막 `focused-retest/`는 수정된 기대 순서와 엄격한 viewport 단언을 모두 유지해25개를 통과했다. 예외를 숨기거나 판정을 약화하지 않았다.

재실행은 서버 `node tests/routine-bot-server.cjs`를 켜고 다음 순서로 한다. 증거가 이미 있으면 새 폴더를 지정한다. 브라우저/trace는 순차 실행한다.

```powershell
node --test routine_bot/engine.test.cjs routine_bot/storage.test.cjs routine_bot/hazards.test.cjs tests/routine-bot-server.test.cjs
$env:WEBSIM_EVIDENCE='output/playwright/routine-bot/hazards'
node tests/routine-bot-deployment.cjs hazards
$env:WEBSIM_EVIDENCE='output/playwright/routine-bot/hazards/focused-retest'
node tests/routine-bot-hazards.browser.cjs
$env:WEBSIM_EVIDENCE='output/playwright/routine-bot/hazards/safety'
node tests/routine-bot-safety.browser.cjs
$env:WEBSIM_EVIDENCE='output/playwright/routine-bot/hazards/tree'
node tests/routine-bot-tree.browser.cjs
$env:WEBSIM_EVIDENCE='output/playwright/routine-bot/hazards/budgets'
node tests/routine-bot-budgets.browser.cjs
$env:WEBSIM_EVIDENCE='output/playwright/routine-bot/hazards/full'
node tests/routine-bot.browser.cjs final
```

이번 변경에서 다른 게임의 상호작용과 전체 저장소765건을 다시 실행하지 않았다. 위 과거 회귀 결과, 이번 실제 기존 링크 HTTP 검증, 루틴봇의 전체 기능 검증을 각각 구분한다. 실제 사용자 연구와 실기기만 남은 확인으로 특정하며 자동 조작을 사람의 재미 검증으로 표현하지 않는다.

전체 UI 최종 실행은 UTC2026-10-18 22:28:07.420–22:32:17.802에 종료0으로 끝났다. 15레벨은 저장11/제한11, 지도3개와 실행합422로 성공했으며 최종 클리어 PNG를 직접 확인했다. 기본 클라이언트는 전체 UI 종료 뒤 단독 실행했다. 팔레트 초기 클릭, Enter 두 번, Canvas 클릭, Space,100프레임 대기만으로 첫 레벨을 해결했고 성공 상태를 주입하지 않았다. 실행기 시간 진행 훅은 기본 클라이언트의 애니메이션 진행 용도로만 사용했다. 원래 클라이언트의 외부 package.json 모듈 형식 경고는 있었으나 종료0이며 해당 전역 파일은 수정하지 않았다.

