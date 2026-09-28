# 관측 저장 재시도 처리

관측 저장은 공개 Git `data` branch의 ref 갱신이 확인된 뒤에만 성공을 반환한다. 클라이언트는 저장 시작 때 만든 `Idempotency-Key`와 요청 본문을 결과가 확정될 때까지 보존한다.

- timeout, 연결 끊김, `retryable=true` 응답: 폼 값을 유지하고 같은 본문과 같은 key로 재요청한다. 새 key를 만들지 않는다.
- `storage_auth_failed` 또는 `storage_permission_denied`: 입력값은 유지하되 자동 재요청하지 않는다. 운영자가 PAT 만료·Contents 쓰기 권한·대상 저장소 설정을 확인해야 한다.
- `storage_unavailable` + `retryable=true`: 같은 key로 재시도한다. `Retry-After`가 있으면 그 시간만큼 기다린다.
- `branch_conflict` (`409`, retryable): 같은 key와 본문으로 다시 확인한다. 서버는 최신 branch head에서 revision과 ledger를 재검사한다.
- `idempotency_conflict` 또는 `revision_conflict` (`409`, retryable=false): 자동 재시도하지 않는다. 본문/key 불일치 또는 다른 수정과 충돌했으므로 현재 기록을 다시 읽고 해결한다.
- 성공 응답: 저장 완료를 표시하고 임시 입력을 정리한다. `saved_to_public_repository`만 저장 완료를 뜻하며 enrichment나 홈페이지 cache 갱신과 구분한다.

인증 토큰, raw key, 개인 메모는 응답이나 공개 ledger에 포함하지 않는다. WAF의 로그인 `429`는 공개 관측 저장 retry 상태와 별도다.
