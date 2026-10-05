# 환경 자료의 로컬 연구 수집

19 Site의 대표 입수 좌표·예측 기준 수심 18m는 사용자 확인값이다. 대표 관측 수심은 신규 필수값이며 사용자 지정 기본 18m를 확인·수정한다. 허용 격자 거리는 6km, 지도 진행축·외해축은 reference_geometry다. Zone은 미등록이며 근사축을 사용하는 숫자 예측은 experimental/very_low로 제한한다.

## 실행

저장소 루트의 ignored `.env`에 Copernicus 자격증명을 등록한다. 비상업 Open-Meteo는 계정·API key 없이 사용할 수 있다. `OPEN_METEO_USAGE_MODE=noncommercial`을 사용한다. 자격증명은 명령 인자나 Git에 넣지 않는다.

```sh
uv sync --project engine --extra providers --locked
uv run --env-file .env --project engine --extra providers --locked \
  python -m bunaken_engine.provider_research \
  --start 2026-09-01T00:00:00+08:00 --days 30 \
  --output .local/providers-2026-09-depth18-next
```

종료된 1–31일만 요청할 수 있다. output은 새 경로여야 하며 기존 결과를 덮어쓰지 않는다. 기간은 WITA로 입력하고 저장 시각은 UTC로 보존한다. 날짜 단위 API 응답의 UTC 양쪽 여유 구간은 입력 기간과 구분한다.

CLI는 Copernicus 3개 dataset의 metadata·원해상도 수심·시간 좌표와 wet mask/bathymetry를 확인하고 제한된 영역의 NetCDF를 로컬에 저장한다. Open-Meteo 고정 모델 wind/wave 응답도 로컬에 저장한다. `.local/`의 원파일을 공개 Git에 올리지 않는다. 결과 manifest는 bathymetry·mask·격자 검토표를 포함한 파일 hash, geometry/source registry/code hash, runtime 버전, 실제 조회 시각과 비적격 사유를 기록한다.

## 2026-10-03 당시 결과

| 자료 | 확인 결과 | 미확정 사항 |
|---|---|---|
| Copernicus currents | u/v, 122개 시간 좌표, 실제 update 시각 확보 | 벽/외해 투영, 허용 격자 거리, 공개 재배포 |
| Copernicus temperature | 122개 시간 좌표, degrees_C, 실제 update 시각 | 현장 수온과 별개, bias 보정 미적용 |
| Copernicus salinity | 122개 시간 좌표, 1e-3, 실제 update 시각 | 공개 재배포·feature 활성 조건 |
| Open-Meteo wind | 고정 ECMWF IFS 0.25 모델, raw 시간 좌표 744개 | 발행/갱신 age 미확인 |
| Open-Meteo wave | 고정 Meteo-France 모델, raw 시간 좌표 744개 | 바다 격자 대표성·age 미확인 |

744개는 날짜 단위 API의 UTC 경계 여유 구간을 포함한 raw 응답이다. 30일 WITA 구간의 독립 관측 744건이나 1시간 원자료 해상도라고 해석하지 않는다.

18m는 실제 native depth 15.810070m와 18.495560m 사이에 있다. 19 입수점의 최근접 wet 후보는 2개 셀로 모이며 거리는 2.60–5.34km다. 해저 수심은 18m보다 깊지만, 이 검사만으로 벽의 현장 조류를 대표한다고 확정할 수 없다. 당시 검사에서는 모든 후보를 accepted=false로 남겼다. 현재 6km 정책·좌표·근사축 반영 결과와 구분한다.

5개 provider 수집 성공과 운영 적격은 별개다. 원본 라이선스 확인·격자 검토·source age·geometry를 충족하기 전에는 이 자료로 숫자 예측이나 운영 scaler를 승격하지 않는다. 성공 manifest는 `.local/providers-2026-09-depth18-v4/manifest.json`이다.

## Site별 바다 셀 후보 검토표

좌표는 표시용 소수 6자리, 원래 격자 값과 거리 계산 근거는 로컬 `grid-review.json`에 보존한다. 2026-10-03 당시 미승인 후보이며 현재 추출 결과가 아니다. 각 Site의 입수 좌표를 변경하지 않는다.

| Site | 후보 lat, lon | 거리 km | 해저 수심 m |
|---|---|---:|---:|
| Lekuan 1 | 1.583336, 124.750000 | 2.68 | 55.8 |
| Lekuan 2 | 1.583336, 124.750000 | 2.60 | 55.8 |
| Lekuan 3 | 1.583336, 124.750000 | 3.08 | 55.8 |
| Celah Celah | 1.583336, 124.750000 | 3.74 | 55.8 |
| Alung Banua | 1.583336, 124.750000 | 3.72 | 55.8 |
| Johnson's Wall | 1.583336, 124.750000 | 3.33 | 55.8 |
| Fukui | 1.583336, 124.750000 | 3.41 | 55.8 |
| Ron's Point | 1.583336, 124.750000 | 3.41 | 55.8 |
| Mandolin | 1.583336, 124.750000 | 3.75 | 55.8 |
| Tengah | 1.583336, 124.750000 | 4.41 | 55.8 |
| Raymond's Point | 1.666672, 124.750000 | 4.49 | 34.4 |
| Mike's Point | 1.666672, 124.750000 | 3.51 | 34.4 |
| Tanjung Parigi | 1.666672, 124.750000 | 4.62 | 34.4 |
| Sachiko's Point | 1.666672, 124.750000 | 4.76 | 34.4 |
| Pahepa | 1.666672, 124.750000 | 5.34 | 34.4 |
| Bunaken Timur 1 | 1.583336, 124.750000 | 5.08 | 55.8 |
| Bunaken Timur 2 | 1.583336, 124.750000 | 4.42 | 55.8 |
| Pangalisang | 1.583336, 124.750000 | 4.27 | 55.8 |
| Muka Kampung | 1.583336, 124.750000 | 3.41 | 55.8 |

## P3 후속 실제 검증 (2026-10-05)

- Copernicus 배치 수집: 19 Site, 1,140 sample, 24.15초. dataset·catalogue·bathymetry 읽기를 run 내부에서 재사용한다. worker당 120초, retry 1회로 지연을 제한하며 종료 시 자식 프로세스를 정리한다.
- 현재 코드와 atlas의 FES 독립 참조 비교: 912건, 거부 0건, 최대 차이 0.000664071m, 허용 0.001m 통과. 현장 예측 정확도 검증과는 별개다.
- 9/29–10/4 실제 환경 backfill: 28,101 sample. FES·Copernicus currents/temperature/salinity·Open-Meteo wave 성공. 바람은 grid_too_far로 제외했다. 필수 소스가 유효하므로 전체 run은 succeeded다.
- 이미 dive_overall로 저장된 9/19 관측 구간도 별도 backfill 5,301 sample로 복원했다. 현재 모델 입력은 후보 18개 중 Overall numeric label 18개(7일), EnvironmentLink 18개, scaler 2,128행·활성 feature 16개다. scaler 행은 겹치는 환경 구간이며 독립 관측 건수가 아니다. 모든 후보는 원본에 이미 저장된 dive_overall label_scope를 보존한다. 문서의 의미 미확인 legacy 기준 사건을 임의로 전환한 결과가 아니다. 출수가 없는 과거 기록은 60분 proxy·품질 감소로 결합하며 원문 시각을 보충하지 않는다.
- 기존 관측 18개는 사용자 승인 대표 수심 18m로 개별 정정했다. 과거 revision·나머지 입력 필드 보존을 원격에서 확인했다. 원파일과 분석 산출물은 ignored `.local/`에 유지한다.

`enrich`는 frozen data head의 실제 관측을 읽고 부족한 다이빙 구간을 수집한다. actual depth·입출수 구간을 기준으로 EnvironmentLink, scaler, model context와 제외 사유를 새 경로에 저장한다. 이미 수집한 immutable manifest는 `--snapshot`으로 재사용한다. 명령·옵션은 [README](../README.md)에 있다. 원본 관측·과거 snapshot을 덮어쓰거나 공개 발행하지 않는다.

## 남은 검토와 운영 연결

1. 근사 진행축·외해축과 실제 현장 조류의 대응을 축적 관측으로 비교한다. Zone/GPS는 추후 확장이며 현재 Site 수준 계산의 선행 조건이 아니다.
2. Open-Meteo 바람의 거친 격자와 현재 6km 정책을 별도로 검토한다. 실패 값을 0으로 채우거나 허용 거리를 임의로 늘리지 않는다. source age와 marine 격자 대표성도 별도 근거가 필요하다.
3. 확보한 6일 분포를 장기간으로 확장하고 날짜 순서 검증을 실행한다. 지금 확보한 backfill을 당시 운영 예측 성능으로 표시하지 않는다.
4. GitHub Actions의 비공개 atlas 실행 환경·secret/variable·trusted code SHA·자동 갱신 chain을 실제로 연결한다. 로컬 성공을 예약 운영 성공으로 간주하지 않는다.

공식 참고: [Open-Meteo 이용 조건](https://open-meteo.com/en/terms), [Copernicus 이용 조건](https://marine.copernicus.eu/user-corner/service-commitments-and-licence), [Copernicus 출처 표기](https://help.marine.copernicus.eu/en/articles/4444611-citing-copernicus-marine-products-and-services).
