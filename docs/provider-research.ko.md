# 환경 자료의 로컬 연구 수집

19 Site의 대표 입수 좌표·예측 기준 수심 18m는 사용자 확인값이다. 실제 다이빙 수심은 관측 입력으로 보존한다. bearing·Zone·허용 격자 거리는 확인되지 않았으므로 Ocean 투영·학습 적격을 생성하지 않는다.

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

## 2026-10-03 실제 결과

| 자료 | 확인 결과 | 미확정 사항 |
|---|---|---|
| Copernicus currents | u/v, 122개 시간 좌표, 실제 update 시각 확보 | 벽/외해 투영, 허용 격자 거리, 공개 재배포 |
| Copernicus temperature | 122개 시간 좌표, degrees_C, 실제 update 시각 | 현장 수온과 별개, bias 보정 미적용 |
| Copernicus salinity | 122개 시간 좌표, 1e-3, 실제 update 시각 | 공개 재배포·feature 활성 조건 |
| Open-Meteo wind | 고정 ECMWF IFS 0.25 모델, raw 시간 좌표 744개 | 발행/갱신 age 미확인 |
| Open-Meteo wave | 고정 Meteo-France 모델, raw 시간 좌표 744개 | 바다 격자 대표성·age 미확인 |

744개는 날짜 단위 API의 UTC 경계 여유 구간을 포함한 raw 응답이다. 30일 WITA 구간의 독립 관측 744건이나 1시간 원자료 해상도라고 해석하지 않는다.

18m는 실제 native depth 15.810070m와 18.495560m 사이에 있다. 19 입수점의 최근접 wet 후보는 2개 셀로 모이며 거리는 2.60–5.34km다. 해저 수심은 18m보다 깊지만, 이 검사만으로 벽의 현장 조류를 대표한다고 확정할 수 없다. 모든 후보는 accepted=false로 남긴다.

5개 provider 수집 성공과 운영 적격은 별개다. 원본 라이선스 확인·격자 검토·source age·geometry를 충족하기 전에는 이 자료로 숫자 예측이나 운영 scaler를 승격하지 않는다. 성공 manifest는 `.local/providers-2026-09-depth18-v4/manifest.json`이다.

## Site별 바다 셀 후보 검토표

좌표는 표시용 소수 6자리, 원래 격자 값과 거리 계산 근거는 로컬 `grid-review.json`에 보존한다. 전부 미승인 후보이며 각 Site의 입수 좌표를 변경하지 않는다.

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

## 다음 검토

1. 사용자가 Site/Zone의 wall/offshore bearing과 Zone 범위를 확인한다. 좌표·18m를 다시 입력할 필요는 없다.
2. Copernicus 후보 셀의 2.60–5.34km 거리와 실제 다이빙 관측의 대응을 검토한다. 허용 거리와 대안 추출 방식을 연구 설정으로 기록한다.
3. Copernicus 라이선스 원문과 공개 파생 JSON 범위를 확인한다. 원문 접근이 실패한 상태에서 attribution 안내만으로 derived_allowed를 true로 바꾸지 않는다.
4. Open-Meteo source age와 해안 근처 marine 격자 대표성을 확인한다. 계정 가입은 비상업 이용의 선행 조건이 아니다.

공식 참고: [Open-Meteo 이용 조건](https://open-meteo.com/en/terms), [Copernicus 이용 조건](https://marine.copernicus.eu/user-corner/service-commitments-and-licence), [Copernicus 출처 표기](https://help.marine.copernicus.eu/en/articles/4444611-citing-copernicus-marine-products-and-services).
