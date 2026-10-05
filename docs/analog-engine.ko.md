# P5 Weighted Analog 실행과 검증

## 입력과 예측

`config/model.json`의 초기 weight는 실험 설정이다. 모델은 동일 observer/rubric의 cutoff 당시 최신 유효 revision을 사용한다. `use_for_model=false`, 철회, legacy PCI, 대표 수심 없는 기록은 numeric 학습에서 제외한다. Site 대표 수심 18m를 관측의 미입력 수심으로 대입하지 않는다. Peak PCI는 overall PCI와 합치지 않는다.

관측의 실제 입수·출수 구간으로 환경을 결합한다. 출수 시각 없으면 60분 proxy와 0.8 quality를 적용한다. EnvironmentLink는 관측 revision·원 snapshot·추출 feature의 SHA-256, geometry version, 실제/proxy 구간, snapshot/backfill 출처를 보존한다. 현재 입력에는 추정 수심 여부가 없으므로 추정 여부를 자동 생성하지 않는다.

목표 feature mask를 한 번 정하고 모든 이웃에 적용한다. sin/cos는 한 feature다. 비활성 feature도 coverage의 원래 분모에 남는다. Tide·Ocean 필수, 전체 coverage 0.8 이상이다. label-free 과거 환경의 median/IQR만 사용하며 미래 valid/retrieved/issued/실제 저장 시각을 제외한다. zero IQR은 비활성 처리한다.

환경 유사도 0.2 이상에서 거리·ID 순으로 최대 20개를 선택한 뒤 Site·quality·provenance weight를 적용한다. 3개 numeric label·3개 날짜·3개 analog·N_eff 2 이상·동일 Site 자료가 모두 필요하다. PCI는 1.0 초과를 허용한다. 숫자 gate 실패 시 `null`이며 결측을 0으로 채우지 않는다.

수직 evidence는 numeric PCI와 별도 집합으로 계산한다. unknown 제외, none은 알려진 음성 사례다. mixed에서 확인되지 않은 방향을 추정하지 않는다. 개수·날짜·N_eff 조건을 통과한 근거 상태만 제공하며 확률을 생성하지 않는다. 현재 large-error 기준과 High MAE 한계는 `null`이다. Medium/High는 승격하지 않는다.

## 로컬 명령

프로젝트 루트에서 실행한다. 입력 관측은 공개 revision schema의 배열이며 실제 기록과 합성 fixture를 섞지 않는다.

```sh
uv run --project engine --locked python -m bunaken_engine model \
  --observations .local/observations.json \
  --snapshot .local/training-snapshot/manifest.json \
  --observer "$PUBLIC_OBSERVER_ID" --rubric "$MODEL_RUBRIC_VERSION" \
  --cutoff "$MODEL_CUTOFF" --output .local/model-context.json

uv run --project engine --locked python -m bunaken_engine collect \
  --date "$TARGET_DATE" --code-commit "$CODE_COMMIT" \
  --model .local/model-context.json --output .local/model-forecast

uv run --project engine --locked python -m bunaken_engine validate-model \
  --observations .local/observations.json \
  --snapshot .local/training-snapshot/manifest.json \
  --observer "$PUBLIC_OBSERVER_ID" --rubric "$MODEL_RUBRIC_VERSION" \
  --mode forward --output .local/forward-validation.json
```

`--snapshot`은 여러 번 지정할 수 있다. 입력 파일은 이전 immutable bundle의 manifest와 인접한 gzip 두 파일이어야 한다. `collect`은 정확한 코드 SHA와 깨끗한 작업 트리를 요구한다. `--publish`를 지정할 때만 외부에 쓴다.

`collect --model-from-data --observer ... --rubric ...`는 같은 data head에서 revision 이력·Git 보존이 확인된 환경 bundle을 읽는다. 모델에는 cutoff 이하 revision 전체를 남겨 각 fold에서 당시 revision을 복원한다. workflow의 `MODEL_OBSERVER_ID`, `MODEL_RUBRIC_VERSION` repository variables가 모두 있으면 이 경로를 사용한다. 로그인 ID를 모델 observer로 쓰지 않는다. 공개 발행은 cutoff 이전 실제 Git revision 전체와 입력을 대조하여 철회·수정 누락을 거부한다. 로컬 `--model` 입력도 환경의 실제 Git 보존 시각이 cutoff 이하여야 한다.

## 검증 보고서

- `forward`: 같은 WITA 날짜를 한 fold에 두고 과거 날짜만 학습한다. 날짜가 수정된 동일 관측 ID의 모든 revision도 test와 분리한다.
- `--operational`: 실제 Git receipt·confirmation과 전날 WITA 20:00 이전 보존을 확인한다. 하루 전체 coverage가 있는 가장 늦게 보존된 run을 사용한다. backfill 성능을 D+1 운영 성능으로 보고하지 않는다.
- `leave_one_day_out`: 미래 날짜가 학습에 들어가는 별도 진단이다. 운영 성능이 아니다.
- 보고 항목: 전체/Site median baseline, 같은 제공 표본에서 MAE·large error, 제공 건수·날짜·coverage·abstention. threshold 미설정이면 large-error 수치는 `null`이다.
- scaler·고정 feature 선택·weight는 fold cutoff에서만 사용한다. 수온 bias는 미적용이며 튜닝이나 GAM 자동 승격은 없다.

## 불변 결과와 설정

snapshot 1.2는 model context와 SHA-256, scaler SHA-256을 추가한다. context에 공개 관측 revision, 환경 입력·dataset version·hash, model/feature/geometry/source/Site 설정을 보존한다. 저장·공개 전에 원자료부터 예측을 다시 계산하여 결과 변조를 거부한다. 기존 snapshot 1.1의 null 예측은 계속 읽을 수 있다.

과거 설정은 trusted code의 `config/model-configurations/<canonical SHA-256>.json`과 정확히 일치해야 한다. 외부 data의 임의 설정이나 hash 재계산만으로 gate·geometry·license를 바꿀 수 없다. 설정을 변경할 때는 이전 전체 설정을 해당 경로에 보존하고 모델/feature/geometry version을 갱신한다. 원 설정으로 replay하되 현재 재배포 금지는 계속 적용한다. 학습 입력에서는 과거 모델 context를 제거한 환경 투영과 원 manifest hash를 사용한다.

현재 context는 입력을 자체 보존하므로 관측·환경 이력에 따라 크기가 늘어난다. 운영 확대 시 content-addressed 입력 참조로 전환하고 Git blob·API 한도를 측정해야 한다. 이를 실제 운영 규모 검증 완료로 주장하지 않는다.

## 남은 현장·운영 조건

입수 좌표와 Site 대표 수심 18m, 허용 격자 거리 6km를 사용한다. 지도 화살표 기본값은 `reference_geometry`로 저장하며 독립된 진행/외해 축에 투영한다. target 또는 선택 analog가 근사 geometry이면 `experimental / very_low`로 제한한다. 실측 벽 방향 검증과 Zone 위치 특정은 추후 진행한다. 실제 관측의 대표 수심과 관측일별 numeric label·환경 연결도 필요하다. source freshness·FES conformance가 확인되지 않으면 숫자를 발행하지 않는다. 실제 예측력·Medium/High 기준은 아직 검증되지 않았다. 배포, workflow 설치·예약 및 공개 발행은 P7에서 별도 확인한다.

## 실제 데이터 통합 확인 (2026-10-05)

원격 data head `43be7a66d8ba0fe9aef9789bac582472a7f4c46b`의 현재 관측 18개를 다시 읽어 로컬 입력과 일치함을 확인했다. 사용자 승인 대표 수심 18m와 동일 observer/rubric의 Overall label 18개·7일을 사용했다. 후보 적격과 숫자 예측 가능 여부는 별도다.

2026-10-06의 19 Site·304개 60분 예측 슬롯을 재계산했다. 전체 PCI는 null이며 환경 coverage는 0.4625 또는 0.55로 0.8 gate에 미달했다. 일부 슬롯은 analog·날짜·N_eff·동일 Site 조건도 부족했다. Copernicus 수온은 공급 갱신 시각이 오래되어 제외했고, Open-Meteo 파고는 공급 나이 미확인, 바람은 6km 격자 거리 조건 실패로 제외했다. 미확정 조석 phase와 고정 18m의 zero IQR feature도 원래 coverage 분모에 남는다. 자료를 0으로 보충하거나 gate·weight를 바꾸지 않았다.

forward와 Leave-One-Day-Out은 각각 7개 날짜 fold·18개 test 관측에서 숫자 제공 0/18, abstention 18, MAE와 baseline 비교 MAE null이다. forward의 과거 cutoff 이전에는 이번 정정 revision과 환경 backfill이 없으므로 학습 후보·scaler 입력이 0개다. LODO는 held-out 날짜를 제외한 15–17개 후보를 사용하지만 미래 날짜를 포함하는 진단이며 D+1 운영 성능이 아니다.

snapshot과 공개 release를 같은 고정 입력·UUID·생성 시각으로 재생성하여 전체 파일 바이트 일치를 확인했다. 메모리상의 합성 revision으로 PCI 정정, 철회, 학습 제외 반영을 확인했고 실제 관측은 변경하지 않았다. 날짜별 test/training ID 분리와 forward 미래 날짜 배제도 확인했다. 상세 결과는 로컬 `.local/p3-integration-2026-10-05/integration.json`, `forward.json`, `lodo.json`에 보관한다. 원격 발행·배포·공식 D+1 seal은 수행하지 않았다.

다음 검토는 소스 freshness 근거와 feature coverage 정책이다. 대표 수심 18m를 유지하므로 수심 변동을 만들지 않는다. 조석 phase 정의·coverage 분모·weight 변경이 필요하면 계약과 모델 버전을 함께 검토하고 재검증한다. 실제 숫자가 제공되지 않은 상태에서 예측 오차나 검증된 성능을 주장하지 않는다.
