# GitHub Actions 환경 수집 운영

## 준비된 실행 경로

main의 `.github/workflows/environment.yml`은 UTC 23:17/11:17에 수집, UTC 12:17에 seal을 실행한다. WITA 기준 07:17/19:17, 20:17이다. 예약은 기본 branch에 설치된 뒤 동작하며 GitHub 지연으로 시작이 늦어질 수 있다. seal cutoff는 기존 WITA 20:00을 유지한다. [GitHub 예약 실행 문서](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule).

```text
main schedule 또는 data observations push
  → 고정 코드 checkout·main 이력 확인
  → private FES 설치·LIBFES 독립 참조 검증
  → 실제 환경 수집·data 관측/환경으로 모델 구성
  → snapshot·receipt·confirmation 저장
  → 패키지 검증·새 release·latest 원자적 저장
```

수집 job은 repository 범위에서 직렬화하고 seal은 별도 concurrency group을 사용한다. 새 push가 겹치면 GitHub는 대기 실행을 최신 요청으로 교체할 수 있다. 관측 자체의 Git 저장은 취소하지 않으며 실행 시 최신 data head를 읽는다. branch 경쟁은 엔진의 non-force 저장 조건으로 처리한다. 이 concurrency를 웹 저장 동시성 제어로 설명하지 않는다.

## 보호 환경과 설정

GitHub 저장소 `taevel02/bunaken-current-observatory`에서 Settings → Environments → New environment로 `environmental-data`를 생성한다. Deployment branches and tags는 custom 정책으로 `main`, `data` branch만 허용한다. fork/preview/tag는 허용하지 않는다. 환경 Secret은 해당 environment job에서 읽으며 [reusable workflow의 environment Secret 규칙](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations)을 따른다. 원격 설치 완료 전에는 owner required reviewer로 이전 workflow의 실행을 막고, 아래 실제 검수 후 자동 실행 정책을 적용한다.

| 종류 | 이름 | 입력 근거 |
|---|---|---|
| Environment Secret | GITHUB_WRITE_TOKEN | 기존 웹 저장용 fine-grained PAT. 선택 저장소 Contents 쓰기. workflow 설치용 권한과 분리 |
| Environment Secret | COPERNICUSMARINE_SERVICE_USERNAME / COPERNICUSMARINE_SERVICE_PASSWORD | 로컬 `.env`의 실제 계정 |
| Environment Secret | AVISO_USERNAME / AVISO_PASSWORD | 로컬 `.env`의 승인 계정. atlas 설치에 사용 |
| Environment variable | OPEN_METEO_USAGE_MODE | `noncommercial`. API 키 미등록 |
| Environment variable | MODEL_OBSERVER_ID / MODEL_RUBRIC_VERSION | 실제 공개 관측의 observer/rubric. 로그인 ID 사용 금지 |

Secrets는 CLI stdin 또는 설정 화면으로 등록한다. 평문을 명령 인자·문서·로그에 넣지 않는다. `.env`와 웹 `.env.local`은 자동 전달되지 않는다. 로컬 FES 경로도 runner에 전달하지 않는다. 상업 모드로 바꿀 때만 별도 API 키가 필요하다.

main은 PR/CI, force push·삭제 차단을 적용한다. data는 Contents 쓰기를 유지하면서 force push·삭제를 차단한다. PAT 소유자가 관리자 bypass 권한을 갖는 경우 그 권한까지 차단됐다고 주장하지 않는다. 일반 저장용 PAT에 Workflows·Administration·Secrets 쓰기를 추가하지 않는다. 환경/branch/workflow 설치는 별도 운영 권한으로 수행한다.

## FES 실행 환경

hosted Ubuntu runner는 승인된 AVISO 계정으로 34개 성분을 내려받는다. 원본 다운로드는 약 5.3GB이며 실행마다 발생한다. 검증된 지역 파일 추출 후 `--discard-originals`로 해당 원본만 정리한다. 지역 atlas·hash는 유지한다. 이 옵션을 생략한 로컬 설치는 원본을 보관한다. atlas·NetCDF·참조 binary는 공개 Git, cache, artifact에 저장하지 않는다. 공급 장애·다운로드 지연은 job 실패로 남기며 cutoff를 늦추지 않는다.

LIBFES 2.9.7 source는 `b1d65f7782c32fab57e9ac3d14ca20b883b67331`에 고정해 NetCDF C library로 빌드한다. 전날 WITA 하루의 19 Site에서 독립 비교 152건을 수행한다. 유효한 참조 결과·오차 0.001m 이하·현재 atlas/SDK/코드 hash가 일치해야 FES adapter의 미검증 flag를 해제한다. 실패하면 새 forecast 발행 전에 중단한다. 과거 reference 구간은 당시 확보된 forecast가 아니다.

## 설치와 최초 실행

1. 검증된 코드 커밋을 main에 반영하고 두 CI job의 성공을 확인한다. main push는 연결된 Vercel 배포를 유발할 수 있다.
2. `environmental-data` 보호 환경과 위 설정을 등록한다. 처음에는 required reviewer를 유지한다.
3. `ops/workflows/data-entrypoint.yml`을 data의 `.github/workflows/data-entrypoint.yml`에 설치한다. 다른 파일·관측을 변경하지 않는 non-force commit을 사용한다. `uses`와 `code_commit`은 `dce16626986762650b089a692c770eeab97ea659`로 일치한다. 이 SHA가 원격 main 이력에 있어야 한다. `@main`으로 바꾸지 않는다.
4. Actions → Trusted environmental pipeline → Run workflow. main을 선택하고 `operation=collect`, `code_commit=dce16626986762650b089a692c770eeab97ea659`, date는 비워 WITA 내일을 수집한다. 새 snapshot·release를 공개 저장하는 실행이다.
5. FES 참조 성공, 19 Site 필수 소스·freshness, 저장 receipt/confirmation, release hash/schema, 공개 status를 실제로 확인한다. 학습 환경이 아직 data에 없으면 numeric label 결합이 부족할 수 있다. 로컬 backfill은 원격 모델에 자동 전달되지 않는다. 초기 역사 환경 연결은 별도 실제 데이터 작업으로 확인한다.
6. 검수 후 required reviewer를 해제해 main/data branch 정책 아래 예약·관측 push 실행을 자동화한다. 두 예약 수집, 관측 push, seal 결과를 각각 확인해야 P7-04/05를 완료로 표시한다.

Actions 자체가 비용·소스 요청 제한·전송 시간을 면제하지 않는다. hosted runner에서 아직 측정하지 않은 전체 실행 시간과 Linux 참조 빌드 성공을 로컬 테스트 결과로 대체하지 않는다.

## 실패와 복구

같은 Actions run을 재실행하면 repository/run ID로 결정한 snapshot UUID를 재사용한다. 저장된 동일 snapshot은 다시 수집해서 변경하지 않는다. 새 입력을 다시 계산하려면 새 run으로 실행한다. 공개 latest는 검증된 새 release를 원자적으로 저장한 후에 바뀐다. 실패 시 기존 자료를 유지한다. 영구적인 과거 forecast를 늦은 실행으로 복구하거나 공식 cutoff 이전에 저장한 것으로 기록하지 않는다.

코드 rollback은 이전 검토 SHA를 새 entrypoint commit에 고정하고 예약 workflow를 disable하는 방식이다. data 이력·snapshot·관측을 삭제하거나 force push하지 않는다. Secrets 유출은 토큰 철회/회전과 별도 세션·배포 절차로 처리한다.

## 현재 검수 상태 (2026-10-05)

- 로컬 코드: 예약·독립 참조·고정 SHA·private 원본 정리 구현. engine 86개, provider 12개 테스트와 actionlint 1.7.12 통과. 조건부 Security 검토 신규 finding 없음.
- 로컬 실제 FES: 현재 코드로 하루 참조 증거 재생성, 19 Site atlas/conformance provenance 일치. `.env`의 증거 경로 갱신.
- GitHub 읽기 확인: 계정 `taevel02`, repository ADMIN, 기본 branch main. 환경·Secrets·variables·ruleset 미등록, main/data 보호 미설정.
- 원격 실행: 이번 변경 아직 push·entrypoint 설치·Secrets 등록·Actions dispatch·발행 미실행. 보호 설정은 원격 적용 후 다시 읽어 검증한다.
