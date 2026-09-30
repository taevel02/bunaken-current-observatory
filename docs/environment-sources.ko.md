# 환경 자료와 geometry

registry 정본은 `config/source-registry.json`, geometry 정본은 `config/geometry.json`이다. `packages/contracts/data/sites.json`의 stable ID 19개와 geometry Site 목록은 일치해야 한다. 현재 실제 좌표·벽/외해 방향·기준 수심·허용 격자 거리는 확인되지 않았으며 모두 null/unverified다. 이 상태로 Site별 numeric 예측이나 임의 공통 좌표 수집을 시작하지 않는다.

## 공급 metadata 확인

확인일: 2026-09-30. API 응답 시간 간격을 원자료 해상도로 사용하지 않는다.

| 공급 | dataset/model | 확인된 원해상도 | 공개 보존 |
|---|---|---|---|
| FES | FES2022b elevation atlas | 1/30° harmonic atlas. 날짜별 예보가 아닌 정적 조화상수 | 지점 조석 계산 파생값만. 원 atlas 제외 |
| Copernicus | `cmems_mod_glo_phy-cur_anfc_0.083deg_PT6H-i` | 0.083°, uo/vo 6시간, 50 layer. 실제 depth 축은 수집 시 기록 | 라이선스 원문 확인 전 차단 |
| Copernicus | `cmems_mod_glo_phy-thetao_anfc_0.083deg_PT6H-i` | 0.083°, thetao 6시간, 실제 depth 축 기록 | 동일 |
| Copernicus | `cmems_mod_glo_phy-so_anfc_0.083deg_PT6H-i` | 0.083°, so 6시간, 실제 depth 축 기록 | 동일 |
| Open-Meteo | `ecmwf_ifs025` | 0.25°, 갱신 6시간. 시간별 native step은 실제 run metadata 없으면 unknown | CC BY 4.0 attribution 포함 파생값 |
| Open-Meteo | `meteofrance_wave` | 0.08°, 3시간, 갱신 12시간. API hourly는 보간 출력 | 동일 |

Copernicus 표는 [공식 dataset 목록](https://data.marine.copernicus.eu/product/GLOBAL_ANALYSISFORECAST_PHY_001_024/services)과 [제품 metadata](https://data.marine.copernicus.eu/product/GLOBAL_ANALYSISFORECAST_PHY_001_024/description)에 근거한다. 제품 이름만으로 surface hourly와 depth-resolved 자료를 동일 취급하지 않는다. 카탈로그의 dataset version과 실제 depth 좌표는 runtime에서 취득해야 하며 현재 registry에서 만들지 않는다.

FES는 [공식 handbook](https://www.aviso.altimetry.fr/fileadmin/documents/data/tools/hdbk_FES2022.pdf)과 [AVISO License](https://www.aviso.altimetry.fr/fileadmin/documents/data/License_Aviso.pdf)를 참조한다. 원자료 대량 재배포와 계산 파생값 공유 조건을 구분한다. FES2022b 높이 계산은 제공자가 권장한 [LIBFES 2.9.7](https://github.com/CNES/aviso-fes/tree/2.9.7) 환경을 사용한다. 높이와 변화율은 조석이며 현장 해류나 PCI가 아니다.

Open-Meteo는 [weather docs](https://open-meteo.com/en/docs), [marine docs](https://open-meteo.com/en/docs/marine-weather-api), [이용조건](https://open-meteo.com/en/terms)을 따른다. 무료 API는 비상업적 사용으로 한정된다. 상업 운영이면 customer endpoint와 해당 계정이 필요하다. 호출 한도·원자료 모델은 배포 전에 다시 확인한다. 서버가 issued time을 제공하지 않으면 retrieved time을 대신 넣지 않고 null로 보존한다.

## 실제 연결 전 필요한 값

- Site/Zone: GPS·공식 현장 지도 등 확인 가능한 evidence, true-north bearing, 기준 수심, 바다 셀 및 허용 거리 검토. 없는 Zone을 생성하지 않는다.
- FES: AVISO 계정으로 허용된 FES2022b atlas를 수집 runner의 비공개 임시/캐시 영역에 설치. atlas 파일·인증정보는 Git 제외.
- Copernicus: 계정, 실제 dataset version, depth 축, 업데이트 시각, 현재 라이선스 원문. 확인 후 registry 공개 variable allowlist를 수정한다.
- Open-Meteo: 운영의 비상업/상업 구분. API key는 workflow secret으로만 전달한다.

검증은 `uv run --project engine --python 3.14.7 python -m unittest discover -s engine/tests`를 사용한다. credential 없이 실행하는 fixture 검증과 실제 공급 자료를 수집한 검증은 별개다.
