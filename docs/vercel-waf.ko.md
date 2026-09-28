# 관리자 로그인 Vercel WAF 제한

## 목표 규칙

| 항목 | 값 |
|---|---|
| 이름 | `admin-login-ip-rate-limit` |
| 조건 | Path equals `/api/auth/login` AND Method equals `POST` |
| 집계 키 | 요청 원본 IP |
| 제한 | IP당 5분 동안 10회 |
| 제한 초과 동작 | HTTP `429` |

로그인 실패 응답만 세는 앱 코드 카운터가 아니다. WAF에서 해당 경로의 POST 요청 전체를 IP별로 제한한다. 임계치 미만의 요청은 로그인 API의 CSRF 검사와 자격 증명 검증을 계속 통과해야 한다.

## Dashboard 설정

1. Vercel Dashboard에서 production project를 열고 **Firewall → Configure → Add New → Rule**로 이동한다.
2. 조건을 Path equals `/api/auth/login`, Method equals `POST`로 설정하고 두 조건을 AND로 결합한다.
3. Rate Limit을 선택한다. 기준을 IP, 제한을 10 requests, 기간을 5 minutes로 둔다.
4. 제한 초과 후속 동작을 `Return 429`로 설정한다. `Log`만 설정한 규칙은 요청을 제한하지 않는다.
5. 처음에는 규칙을 관찰 모드로 검수한다. 실제 로그인 요청 경로·method와 IP 그룹이 의도대로 잡히는지 Firewall traffic view에서 확인한다.
6. 규칙을 저장한 뒤 **Review Changes → Publish**를 실행한다. 실제 배포에서 threshold 전후 요청을 보내고 11번째 요청의 `429`와 정상 요청의 성공/인증 응답을 확인한다.
7. 테스트 후 임계치, 기간, 조건, action을 기록한다. 실사용 IP를 반복 요청 테스트에 쓰지 말고 승인된 테스트 IP를 사용한다.

Dashboard 메뉴 및 plan별 WAF 기능 가용성은 계정에서 다시 확인한다. 로컬 테스트나 이 문서만으로 production rule이 적용됐다고 간주하지 않는다. 변경 사항은 Vercel Firewall에서 즉시 적용되는 설정이며 애플리케이션 재배포와 별도다.

## 로컬 mock과 실제 검증 경계

`apps/web/test/waf-login-rate-limit.test.mjs`는 고정 창의 조건 매칭, IP별 독립 카운터, 11번째 요청의 429 결과를 합성 요청으로 확인한다. 이 테스트는 Vercel 요청 집계, 실제 client IP 판정, dashboard 설정, production publish 여부를 검증하지 않는다.

실제 배포 검수는 Dashboard에 게시된 규칙과 제한 전후의 production 응답을 확인해야 한다. 결과에는 project/deployment, 확인 시각(WITA), 설정값, HTTP 상태를 기록하고 토큰·실제 비밀번호·IP 주소는 저장하지 않는다. 현재 저장소에는 Vercel 계정 연결이나 production 규칙을 읽는 자격 증명이 없어 실배포 검증은 수행되지 않았다.

앱 서버의 메모리 카운터는 serverless instance/region 사이에서 공유되지 않으므로 전역 로그인 제한으로 대체하지 않는다. WAF의 IP별 제한은 비밀번호 오류별 계정 잠금이나 세션 철회를 대신하지 않는다.
