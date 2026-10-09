# 보안 보고와 운영

취약점 보고에 비밀번호·hash·token·cookie·raw 요청 key·IP를 붙이지 않는다. GitHub의 비공개 취약점 보고 기능이 활성화되어 있으면 저장소 Security의 Report a vulnerability를 사용한다. 해당 기능이 보이지 않으면 공개 이슈에는 비밀값 없는 영향·코드 위치만 남기고 비공개 연락 경로를 요청한다. 존재하지 않는 보안 연락처나 지원 보장 기간을 명시하지 않는다.

관리자 설정은 Production 서버 환경변수다. preview는 서버에서도 관리자 접근을 차단한다. [운영 안내](docs/p7-launch.ko.md)와 [WAF 절차](docs/vercel-waf.ko.md)에 따라 실제 제한·Origin·no-store·옛 deployment 차단을 검증한다.

유출 대응은 credential 회전, auth version/session key 변경, production 재배포, 옛 deployment 차단을 포함한다. 환경변수 수정만으로 과거 서버나 개별 세션이 즉시 철회된다고 가정하지 않는다. 공개 Git 이력에서 비밀이 완전히 삭제됐다고 주장하지 않는다.
