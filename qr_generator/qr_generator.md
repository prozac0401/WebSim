# QR Generator
[블로그 글]
https://prozac0401.tistory.com/53

입력한 문자열을 기반으로 QR 코드를 생성하는 도구입니다.

## Script Functions
- `addEvent(el, event, handler)` - IE8 호환성을 고려한 이벤트 등록 도우미입니다.
- `$()` - `getElementById`를 간단히 호출하는 헬퍼입니다.
- `showModal(msg)` / `closeModal(confirmed)` - 경고 모달을 표시하고 닫습니다.
- `showLoading(stage)` - QR 코드 생성 단계별 로딩 메시지를 보여 줍니다.
- `showProgressBar()` / `hideProgressBar()` - 진행 바 애니메이션을 제어합니다.
- `limitTextLength(text, max)` - 입력 텍스트 길이를 제한합니다.
- `updateCharCounter()` - 현재 입력 길이를 화면에 표시합니다.
- `checkTextLimit(level, cb)` - 오류 보정 수준 변경 시 길이 제한을 확인합니다.
- `generateQRCodeDelayed()` - 입력 변경 시 약간의 지연 후 QR 생성을 트리거합니다.
- `generateQRCode()` - 실제 QR 코드를 생성하고 화면에 표시합니다.
- `downloadQRCode()` - 생성된 QR 코드를 이미지로 저장합니다.
- `init()` - 페이지 로드시 이벤트 바인딩과 기본 QR 생성을 수행합니다.
