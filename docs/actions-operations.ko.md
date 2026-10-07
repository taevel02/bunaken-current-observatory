# GitHub Actions 환경 수집 운영

## 준비된 실행 경로

main의 `.github/workflows/environment.yml`은 UTC 23:17/11:17에 수집, UTC 12:17에 seal을 실행한다. WITA 기준 07:17/19:17, 20:17이다. 예약은 기본 branch에 설치된 뒤 동작하며 GitHub 지연으로 시작이 늦어질 수 있다. seal cutoff는 기존 WITA 20:00을 유지한다. [GitHub 예약 실행 문서](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule).

```text
main schedule 또는 data observations push
  → 고정 코드 checkout·main 이력 확인
  → 코드에 고정한 hash의 FES 조석 파생값 검증·재사용
  → 실제 환경 수집·data 관측/환경으로 모델 구성
  → snapshot·receipt·confirmation 저장
  → 패키지 검증·새 release·latest 원자적 저장
```

수집 job은 repository 범위에서 직렬화하고 seal은 별도 concurrency group을 사용한다. 새 push가 겹치면 GitHub는 대기 실행을 최신 요청으로 교체할 수 있다. 관측 자체의 Git 저장은 취소하지 않으며 실행 시 최신 data head를 읽는다. branch 경쟁은 엔진의 non-force 저장 조건으로 처리한다. 이 concurrency를 웹 저장 동시성 제어로 설명하지 않는다.

## 보호 환경과 설정

GitHub 저장소 `taevel02/bunaken-current-observatory`에서 Settings → Environments → New environment로 `environmental-data`를 생성한다. Deployment branches and tags는 custom 정책으로 `main`, `data` branch만 허용한다. fork/preview/tag는 허용하지 않는다. 환경 Secret은 해당 environment job에서 읽으며 [reusable workflow의 environment Secret 규칙](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations)을 따른다. 원격 설치 완료 전에는 owner required reviewer로 이전 workflow의 실행을 막고, 아래 실제 검수 후 자동 실행 정책을 적용한다.

| 종류 | 이름 | 입력 근거 |
|---|---|---|
| Environment Secret | DATA_WRITE_TOKEN | 기존 웹 저장용 fine-grained PAT. 선택 저장소 Contents 쓰기. workflow 설치용 권한과 분리 |
| Environment Secret | COPERNICUSMARINE_SERVICE_USERNAME / COPERNICUSMARINE_SERVICE_PASSWORD | 로컬 `.env`의 실제 계정 |
| Environment variable | OPEN_METEO_USAGE_MODE | `noncommercial`. API 키 미등록 |
| Environment variable | MODEL_OBSERVER_ID / MODEL_RUBRIC_VERSION | 실제 공개 관측의 observer/rubric. 로그인 ID 사용 금지 |

`DATA_WRITE_TOKEN`은 실행 시 `GITHUB_WRITE_TOKEN` 환경변수로 전달한다. GitHub Secret 이름은 `GITHUB_`로 시작할 수 없다. 비밀번호 Secret은 정상 이름을 우선 사용하고 현재 등록된 `COPERNICUSMARINE__SERVICE_PASSWORD`도 호환한다.

Secrets는 CLI stdin 또는 설정 화면으로 등록한다. 평문을 명령 인자·문서·로그에 넣지 않는다. `.env`와 웹 `.env.local`은 자동 전달되지 않는다. 로컬 FES 경로도 runner에 전달하지 않는다. 상업 모드로 바꿀 때만 별도 API 키가 필요하다.

main은 PR/CI, force push·삭제 차단을 적용한다. data는 Contents 쓰기를 유지하면서 force push·삭제를 차단한다. PAT 소유자가 관리자 bypass 권한을 갖는 경우 그 권한까지 차단됐다고 주장하지 않는다. 일반 저장용 PAT에 Workflows·Administration·Secrets 쓰기를 추가하지 않는다. 환경/branch/workflow 설치는 별도 운영 권한으로 수행한다.

## FES 실행 환경

일반 hosted 수집 job은 원 atlas를 다운로드하지 않는다. `config/fes-derived.json`에 고정한 manifest·압축 자료 hash를 사용해 data branch의 `tides/ephemerides/{manifest hash}/`에서 조석 파생값만 읽는다. 두 파일은 같은 data head에서 읽고 geometry·source·생성 코드·수치 비교 증거를 검사한다. 파생값은 현장 유속이 아닌 조석 높이다.

파생값 준비는 승인된 로컬 atlas와 기존 LIBFES 비교 증거를 사용한다. 기본 60일, 30분마다 직접 계산하며 양끝 2시간을 추가한다. 생성 시각·atlas/config/code hash·SDK 버전·독립 비교 결과와 attribution을 보존한다. 일반 수집에서 생성 시각을 현재 시각으로 바꾸거나 issued time을 만들지 않는다. 새 동적 Copernicus·기상 자료와 함께 새 snapshot을 만든다.

기간 밖, hash·좌표·코드 불일치, 결측은 fail closed다. 기존 파생값을 수정하지 않고 새 버전으로 재생성한 뒤 코드 pin을 검토·갱신한다. 기간 만료 전에 같은 준비 절차로 갱신한다. 원 NetCDF·atlas·참조 binary는 Git/cache/artifact에 올리지 않는다. AVISO Secrets는 일반 hosted job에 필요하지 않다.

```sh
uv run --env-file .env --project engine --extra providers --locked \
  python -m bunaken_engine.fes_cache prepare \
  --start 2026-10-06T00:00:00+08:00 --days 60 --output .local/fes-derived-next
```

출력 `pin.json`을 검토해 `config/fes-derived.json`으로 등록하고 코드 변경을 commit한다. 검증 후 아래 명령은 허용된 파생 자료만 data에 non-force 저장한다. 기존 경로의 다른 내용을 덮어쓰지 않는다.

```sh
uv run --env-file .env --env-file apps/web/.env.local --project engine --locked \
  python -m bunaken_engine.fes_cache publish --directory .local/fes-derived-next
```

## 설치와 최초 실행

1. 검증된 코드 커밋을 main에 반영하고 두 CI job의 성공을 확인한다. main push는 연결된 Vercel 배포를 유발할 수 있다.
2. `environmental-data` 보호 환경과 위 설정을 등록한다. 처음에는 required reviewer를 유지한다.
3. `ops/workflows/data-entrypoint.yml`을 data의 `.github/workflows/data-entrypoint.yml`에 설치한다. 다른 파일·관측을 변경하지 않는 non-force commit을 사용한다. `uses`와 `code_commit`은 `fe95cd8e8f014ec500e38f25fe2f459f206cf37f`로 일치한다. 이 SHA가 원격 main 이력에 있어야 한다. `@main`으로 바꾸지 않는다.
4. Actions → Trusted environmental pipeline → Run workflow. main을 선택하고 `operation=collect`, `code_commit=fe95cd8e8f014ec500e38f25fe2f459f206cf37f`, date는 비워 WITA 내일을 수집한다. 새 snapshot·release를 공개 저장하는 실행이다.
5. FES 파생값 hash·참조 증거 검증 성공, 19 Site 필수 소스·freshness, 저장 receipt/confirmation, release hash/schema, 공개 status를 실제로 확인한다. 학습 환경이 아직 data에 없으면 numeric label 결합이 부족할 수 있다. 로컬 backfill은 원격 모델에 자동 전달되지 않는다. 초기 역사 환경 연결은 별도 실제 데이터 작업으로 확인한다.
6. 검수 후 required reviewer를 해제해 main/data branch 정책 아래 예약·관측 push 실행을 자동화한다. 두 예약 수집, 관측 push, seal 결과를 각각 확인해야 P7-04/05를 완료로 표시한다.

Actions 자체가 비용·소스 요청 제한·전송 시간을 면제하지 않는다. hosted runner에서 아직 측정하지 않은 전체 실행 시간과 Linux 참조 빌드 성공을 로컬 테스트 결과로 대체하지 않는다.

## 실패와 복구

같은 Actions run을 재실행하면 repository/run ID로 결정한 snapshot UUID를 재사용한다. 저장된 동일 snapshot은 다시 수집해서 변경하지 않는다. 새 입력을 다시 계산하려면 새 run으로 실행한다. 공개 latest는 검증된 새 release를 원자적으로 저장한 후에 바뀐다. 실패 시 기존 자료를 유지한다. 영구적인 과거 forecast를 늦은 실행으로 복구하거나 공식 cutoff 이전에 저장한 것으로 기록하지 않는다.

코드 rollback은 이전 검토 SHA를 새 entrypoint commit에 고정하고 예약 workflow를 disable하는 방식이다. data 이력·snapshot·관측을 삭제하거나 force push하지 않는다. Secrets 유출은 토큰 철회/회전과 별도 세션·배포 절차로 처리한다.

## 현재 검수 상태 (2026-10-05)

- 로컬 코드: 예약·독립 참조·고정 SHA·private 원본 정리 구현. engine 86개, provider 12개 테스트와 actionlint 1.7.12 통과. 조건부 Security 검토 신규 finding 없음.
- 로컬 실제 FES: 현재 코드로 하루 참조 증거 재생성, 19 Site atlas/conformance provenance 일치. `.env`의 증거 경로 갱신.
- GitHub 읽기 확인: 계정 `taevel02`, repository ADMIN, 기본 branch main. 환경·Secrets·variables·ruleset 미등록, main/data 보호 미설정.
- 원격 실행: 코드 push와 CI 성공은 확인했으나 entrypoint·Secrets·보호 환경·Actions dispatch·실제 forecast 발행은 별도 검수 대상이다. 보호 설정은 원격 적용 후 다시 읽어 검증한다.

### FES 재사용 전환 확인

2026-10-05 검증된 파생 조석을 data commit `4e3ae9aff4bb89c774677ae5921ce9922e70247e`에 불변 저장하고 원격 재조회 검증을 통과했다. 원 atlas와 AVISO credential은 hosted 수집에 필요 없다. 현재 entrypoint template의 전달 secret은 reusable workflow 선언과 일치한다. 실제 원격 설치·dispatch는 아직 수행하지 않았다. 7일 수집의 유효 target date 종료는 2026-11-28이므로 11월 중순 새 파생 기간을 준비한다.
