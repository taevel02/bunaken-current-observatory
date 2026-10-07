# P7 이전 실제 데이터 검증 — 2026-10-08

코드: `f972f350756e22d270490504fcf519e56ebac782`. 최신 관측 확인 기준 head: `5933e32bf10f87d60c84e71d4be34b98c40d46bf`. 2026-10-07 신규 Ron’s Point/Lekuan 1 포함 26건·10일, 모두 환경 결합 후 Overall numeric 학습 후보다. 서버 저장의 과거 train_eligible 필드를 강제 변경하지 않았다.

## 환경 자료 실제 저장

| run | 구간 | sample | data 저장 commit |
|---|---|---:|---|
| 20bd9265-93bd-4f37-a247-59e9f2e47ffc | 9/29–10/4 | 33611 | b6baeecb7d96edf67b5cf21f3eef89228264be2d |
| eda4cb43-313c-426b-a89a-c03e39c24cbf | 9/19 | 6251 | 5e12f8ed30563282b93e2bbe407559665f131aeb |
| 88159840-413e-4d67-94c3-3f8d6467d255 | 10/5–10/6 | 11571 | 8be0ef745bf5174e8d2032ad87d0a9b2125ef292 |
| c716589f-c432-41fd-afcc-2f63ab09954d | 10/7 | 6251 | f8298c5b6be37ba8673d63c7dc98d46d7678d083 |

4개 모두 저장 bytes hash·receipt·branch confirmation 확인. 10/7 공급 샘플은 기존 실제 10/7 forecast 자료를 재사용하여 새 backfill로 기록했다. 원 retrieved_at 2026-10-06T23:30:01Z를 보존했고, backfill 실제 확인은 2026-10-07T15:19:29Z다. 당시 저장된 forecast로 가장하지 않는다. atlas/원 NetCDF·비밀정보는 공개하지 않았다.

## 신규 수집 및 발행

[실제 collect 실행](https://github.com/taevel02/bunaken-current-observatory/actions/runs/37643279296): 성공. 6개 소스·39,083 sample. snapshot `f9ee4ff9-b838-574b-ae92-ee4a7c4f9ce0`, 저장 commit `f515c6dd863251c8bba81ba926560d159cf8decd`.

release `97755bc3-b7eb-4549-b9e0-7c79c458ac42`, 발행 commit `e1a03f856086d337005cff2c1d9170df35af5e2c`, source data commit `d7a12a8be30f3fa1eec493ee4952dc566cd6cb1f`. 19 Site/26관측/2,128슬롯. 기본 숫자 1,099개, 전이 실험 숫자 2,124개. 모두 experimental/very_low, 미검증. 숫자 제공을 성능 검증으로 해석하지 않는다.

## 공식 seal

[실제 seal 실행](https://github.com/taevel02/bunaken-current-observatory/actions/runs/37644104431): 성공. `seals/target-2026-10-08.json` 원격 재조회 결과:

- cutoff: 2026-10-07T12:00:00Z, WITA 20:00.
- 선택 run: a1e67d63-8470-56d4-8642-ac054663c69b.
- 선택 storage commit: 74f3d864636adeca0d317f0502deb623421a2dd8.
- 선택 manifest hash: 7df692548ff28751d4143286310d543373a6f8037b82e9dfca34c3c8bfe336e8.
- 선택 run 확인: 2026-10-07T09:54:58Z, WITA 17:54:58.
- 신규 run 확인: 2026-10-07T15:37:51Z, WITA 23:37:51, cutoff 이후.

신규 관측의 기록 시각도 WITA 22:43/22:44로 cutoff 이후다. 최신 실험 화면과 이전 공식 D+1 seal의 데이터 범위는 다르다. 공식 기록은 소급 교체하지 않았다.

## 화면·검증·제한

실제 공개 package reader 통과. Chrome 1920×1080/360×1080 × ko/en 4개 조합 통과. 관측 수 정렬·19 Site·Site 선택별 graph oracle·baseline/transfer·언어 상태·유속/조석 전환·상세 페이지·8px hint·가로 넘침을 검사했다. 앱 runtime error 없음. optional favicon.ico 404만 별도 기록했다. 공통 12:00 비교표의 u/v는 공급 원시각과 불일치하여 null이며 실제 6시간 공급 그래프는 유지된다.

engine 114/provider 12/계약 10개, lint/actionlint, production build 통과. gzip 신규 저장 기대를 구 코드에서 실패 재현 후 신규 코드 통과 확인. 4개 관점의 독립 read-only 코드 리뷰에서 신규 차단 결함 없음.

브라우저 재현: `apps/web/test/public-dashboard.browser.integration.mjs`. BUNAKEN_PLAYWRIGHT_MODULE, BUNAKEN_BROWSER_EXECUTABLE, BUNAKEN_DASHBOARD_URL, BUNAKEN_PUBLIC_RELEASE_DIR, BUNAKEN_DASHBOARD_DAY를 실제 환경에 설정하고 `node --conditions=react-server --test apps/web/test/public-dashboard.browser.integration.mjs` 실행. 설정 없으면 skip하며 통과로 간주하지 않는다. release_id가 실제 package와 다르면 실패한다.

production Vercel/WAF/실기기·예약 연결·backup·장기 사용량 검증은 미완료다. 전체 역사 내장 모델 context는 규모 증가에 따라 참조/범위 방식 개선 필요. 연구 v1.0.1 frozen 결과는 변경하지 않았다. 후속 한 달 전향 관측과 정확도 평가는 앞으로의 작업이다.
