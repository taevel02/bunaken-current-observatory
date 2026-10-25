# GitHub Actions 환경 수집 운영

## 일일 실행 기준 (2026-10-25 변경)

main `.github/workflows/environment.yml`은 UTC 23:17(WITA 07:17)에 하루 한 번 수집·PCI 재계산·웹 발행을 실행한다. UTC 12:17(WITA 20:17)에는 공식 D+1 seal과 변경 관측·seal 날짜의 비교를 증분 처리한다. 관측 저장은 즉시 공개 Git에 남지만 수집을 시작하지 않는다. 다음 수집이 시작할 때 최신 data head의 전체 revision을 읽고 철회·적격성·observer/rubric 조건을 적용한다. 즉시 재계산이 필요하면 main에서 `operation=collect`를 수동 실행한다.

```text
main 일일/수동 collect → 고정 코드·FES 검증 → 최신 관측 + 검증된 과거 환경
                     → 새 환경 수집·PCI 계산 → 불변 snapshot 저장 → 웹 release → 공개 status 확인
main 일일 seal       → 20:00 cutoff 기준 seal → 변경 관측·seal 날짜의 D+1 비교
main 수동 match      → 전체 D+1 비교 재검증
관측 저장            → 공개 revision 보존 → 다음 일일 collect / seal에서 반영
```

collect 기본 대상은 실행 시점 WITA 내일부터 7일이다. 숫자 PCI는 기존 적격 label·날짜·환경 gate를 통과할 때만 생성한다. data push가 없어도 일일 실행은 동작한다. collect는 직렬화하고 seal은 별도 concurrency group으로 유지한다. GitHub 예약은 지연되거나 누락될 수 있으므로 정시 실행·무실패 SLA가 아니다. [예약 제약](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [대기 실행 교체](https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency).

## 자료 시각의 의미

- 공급 자료 `issued_at`/`source_updated_at`: 공급자의 원래 발행·갱신 시각. `retrieved_at`: 실제 수집 시각.
- snapshot `created_at`: 수집과 예측을 마친 시각. `valid_start/end`: 자료의 유효 기간.
- receipt `persisted_at` 및 confirmation `confirmed_at`: 실제 Git 저장과 branch 반영 확인 시각. 공식 D+1은 이 저장 증거를 WITA 20:00 cutoff와 비교한다.
- 웹 release `generated_at`: 공개 패키지 생성 시각. 공급 자료 발행 시각이나 예약 시각과 다르다. 최신 manifest만 갱신해서 자료가 새로 수집된 것처럼 만들지 않는다.

## 실패 조사와 검증 경계

2026-10-25 `gh run list --limit 100` 표본은 CI 20/20 성공, Data observation entrypoint 33건 중 성공 20·실패 6·취소 7, Trusted environmental pipeline 47건 중 성공 33·실패 11·취소 3이었다. 취소와 실패는 구분한다.

최근 실패 `40103347539`, `40072118389`, `40065882186`의 annotation은 `The hosted runner lost communication with the server`이며 로그 blob은 404였다. kernel OOM 기록이 없어 중단 원인을 OOM으로 확정하지 않는다. 성공 실행 `39884907742`도 model_inputs 11,335.846초, provider_collection_and_forecast 744.557초, snapshot_storage 4,475.132초였다. 관측 push마다 동일 작업을 추가하면서 대기가 누적됐다.

`model_input.data_inputs`와 `verify_context_storage`는 과거 snapshot의 환경만 필요했지만 과거 모델 참조를 전부 확장하고 이전 PCI까지 반복 재현했다. 현재는 원본 manifest·artifact hash와 receipt confirmation을 확인한 뒤 환경 projection의 schema·source allowlist·코드에 고정된 configuration을 검증한다. 사용하지 않는 과거 training references와 예측값은 학습에 넣지 않고 확장하지 않는다. 이 경로는 과거 예측의 정확성을 인증하지 않는다. 새 예측 발행·공식 seal·D+1 비교·수동 replay는 전체 모델 참조·hash·예측 재현 검증을 유지한다.

동일한 실제 snapshot `c8ec55e5-e020-55fd-8f23-11f61ed0cc5a`를 고정 data commit `68a6aa6046fed94ffae7016df2f3d351ad713026`에서 읽은 로컬 비교: 기존 전체 검증 782.346초·최대 RSS 9,462,349,824 bytes, 환경 projection 검증 12.979초·374,587,392 bytes였다. 약 60배 빠르고 peak memory는 약 96% 줄었다. 서로 다른 검증 목적을 비교한 값이며 전체 수집 완료 시간이나 hosted runner SLA를 뜻하지 않는다.

runner는 `ubuntu-24.04`로 고정해 `ubuntu-latest` 이미지 전환과 코드 변경을 분리한다. 실패를 `continue-on-error`로 성공 처리하지 않는다. provider 누락 시 기존 숫자 gate를 유지하며 저장·발행 실패 시 검증된 기존 latest를 보존한다.

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

## 원격 적용 순서

1. 구현과 회귀 테스트를 통과한 코드 commit을 main에 반영한다. `.github/workflows/environment.yml`의 `code_commit` 기본값과 `CODE_COMMIT`은 같은 검증된 main 이력 SHA로 고정한다. `@main`을 실행 코드 pin으로 사용하지 않는다.
2. data branch의 기존 `.github/workflows/data-entrypoint.yml`을 해당 파일만 삭제하는 non-force commit으로 제거한다. main template 삭제만으로 원격 data workflow가 사라지지 않는다. 이미 대기 중인 이전 실행도 확인한다.
3. main에서 `operation=collect`를 수동 실행하고 snapshot 저장·웹 발행·Vercel 공개 status의 release 일치를 확인한다. 다음 예약 collect와 seal의 실제 성공을 별도로 확인한다.
4. 자료가 없는 날에도 일일 실행되는지, 관측 저장 직후 새 수집 run이 생기지 않는지 확인한다. 원격 적용·실행 전에는 로컬 통과를 운영 성공으로 보고하지 않는다.

기존 `environmental-data` 환경과 Secrets를 사용하며 새 계정·서비스·저장소는 추가하지 않는다. data workflow 제거 후에도 웹의 data 저장 권한은 유지한다.

## 실패와 복구

수집은 성공했지만 웹 발행이 실패했다면 main Run workflow에서 `operation=collect`, 원래 `date_wita`, 기존 `resume_run_id`, 검증된 `code_commit`을 지정한다. 원본 snapshot·receipt·모델 재현을 검증하고 웹 발행을 이어간다. `resume-only` 경로는 provider를 다시 호출하지 않으며 ID가 없으면 `stored_snapshot_missing`으로 실패한다. 같은 Actions run의 재실행도 같은 snapshot UUID를 사용한다.

provider 실패·runner 장애는 Actions 실패 단계와 source 상태를 확인한 뒤 재시도한다. 새 run은 새로운 자료 생성이며 과거 snapshot을 덮어쓰지 않는다. 공식 cutoff를 놓친 자료는 과거 공식 예측으로 소급하지 않는다. seal의 기본 날짜는 현재 WITA 시각에 4시간을 더한 날짜여서 자정 이후 지연 실행도 가장 최근 20:00 cutoff를 가리킨다.

rollback은 이전 검토 코드 SHA를 pin으로 복구하고 필요한 workflow를 새 commit으로 복원한다. 관측·snapshot 이력은 삭제하거나 force push하지 않는다. FES 파생값은 2026-11-28 target까지 유효하므로 11월 중순 새 기간을 준비한다.

아래 dated 기록은 당시 검수 증거이며 현재 실행 절차가 아니다.

## 과거 검수 기록 (2026-10-05)

- 로컬 코드: 예약·독립 참조·고정 SHA·private 원본 정리 구현. engine 86개, provider 12개 테스트와 actionlint 1.7.12 통과. 조건부 Security 검토 신규 finding 없음.
- 로컬 실제 FES: 현재 코드로 하루 참조 증거 재생성, 19 Site atlas/conformance provenance 일치. `.env`의 증거 경로 갱신.
- GitHub 읽기 확인: 계정 `taevel02`, repository ADMIN, 기본 branch main. 환경·Secrets·variables·ruleset 미등록, main/data 보호 미설정.
- 원격 실행: 코드 push와 CI 성공은 확인했으나 entrypoint·Secrets·보호 환경·Actions dispatch·실제 forecast 발행은 별도 검수 대상이다. 보호 설정은 원격 적용 후 다시 읽어 검증한다.

### FES 재사용 전환 확인

2026-10-05 검증된 파생 조석을 data commit `4e3ae9aff4bb89c774677ae5921ce9922e70247e`에 불변 저장하고 원격 재조회 검증을 통과했다. 원 atlas와 AVISO credential은 hosted 수집에 필요 없다. 현재 entrypoint template의 전달 secret은 reusable workflow 선언과 일치한다. 실제 원격 설치·dispatch는 아직 수행하지 않았다. 7일 수집의 유효 target date 종료는 2026-11-28이므로 11월 중순 새 파생 기간을 준비한다.

## 과거 P7 연결 기록 (2026-10-09)

2026-10-09 당시 main 예약과 data entrypoint는 `bf50ec9af2301505886cdd99c71214ad44253721`에 고정했다. 현재 예약 collect는 D+1 비교를 생략하고 예약 seal은 새 seal 날짜만 증분 비교한다. 관측 push도 `validation/d1/checkpoints/`의 가장 최근 성공 run을 기준으로 변경 관측과 seal의 관련 WITA 날짜만 비교한다. 첫 체크포인트는 마지막 기존 비교의 `source_data_commit`에서 시작해 그동안 누락된 push도 복구한다. 기존 비교가 없으면 전체 이력을 재구축한다. 비교 파일과 체크포인트는 한 commit에 저장하며, `validation/d1/`은 observation push filter에 포함하지 않아 재귀 실행하지 않는다. `operation=match` 수동 실행은 전체 이력을 다시 확인한다. 배포·보호 설정과 실제 검수는 [P7 운영 안내](p7-launch.ko.md)를 따른다.


## 지연 실행의 seal 기본 날짜

collect의 기본 대상은 WITA 내일이다. seal은 실행 시점에 가장 최근 지나간 WITA 20:00 cutoff의 대상 날짜를 선택한다. WITA 현재 시각에 4시간을 더한 날짜를 사용해 20:00 이후에는 내일, 자정 이후 지연 실행은 오늘을 선택한다. 명시한 `date_wita`는 유지한다. 이 날짜 복구는 성공한 과거 snapshot만 선택하며 cutoff 이후 수집 자료를 과거 forecast로 만들지 않는다. GitHub 예약 지연으로 실행이 제시간에 성공했다는 뜻은 아니다.
