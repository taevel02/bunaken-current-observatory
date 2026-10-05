# FES2022b 로컬 atlas와 historical 연구

## 비공개 로컬 설치

`.env`의 `AVISO_USERNAME`, `AVISO_PASSWORD`에 승인받은 AVISO 계정을 등록한다. 이 파일과 `.local/`은 Git에 포함되지 않는다. 원 atlas를 공개 Git, Actions artifact 또는 공개 cache에 올리지 않는다.

```sh
uv sync --project engine --extra providers --locked
uv run --env-file .env --project engine --extra providers --locked \
  python -m bunaken_engine.fes_atlas --output .local/fes2022b-lon-lat \
  --seed "$HOME/Downloads/m2_fes2022.nc.xz" --workers 3
```

공식 `ocean_tide_20241025`의 34개 성분을 받는다. 중단하면 같은 명령으로 재개한다. 완료 atlas는 hash 확인 후 재사용한다. 다른 좌표 범위는 새 출력 경로를 사용한다. 동시 설치는 lock으로 거부한다. 완료 파일은 HTTP 길이를 확인하고 XZ를 끝까지 읽어 CRC를 검사한다. CRC 손상본은 로컬에 격리하고 한 번 다시 받는다. 부분 파일은 서버가 올바른 Range 응답을 반환할 때 이어 받는다. 전체 설치 성공 후에만 `fes2022.yaml`, `atlas-manifest.json`을 생성한다.

진폭 `cm`, 위상 `degrees`를 확인하고, 부나켄 좌표 주변의 원래 1/30° 격자를 잘라 저장한다. 좌표 주변 0.15°는 파일 읽기 범위다. 허용 격자 거리나 현장 geometry 검증 기준이 아니다. 진폭·위상 배열은 `(lon, lat)` 순서로 저장한다. 정사각 격자에서 PyFES가 배열 순서를 잘못 해석하는 문제를 방지한다. manifest의 `layout=longitude_latitude`를 검사한다. manifest에 원본·압축·지역 파일의 SHA-256과 서버 수정 시각을 기록한다.

설치가 끝나면 로컬 `.env`에 다음 값을 등록한다. 경로는 해당 checkout의 절대 경로를 사용한다.

```dotenv
FES_CONFIG_PATH=/absolute/path/to/checkout/.local/fes2022b-lon-lat/fes2022.yaml
FES_ATLAS_UNIT=cm
```

## 독립 참조 비교

참조 구현은 공식 [LIBFES 2.9.7](https://github.com/CNES/aviso-fes/tree/2.9.7), commit `b1d65f7782c32fab57e9ac3d14ca20b883b67331`이다. CMake, C compiler, NetCDF C header/library가 필요하다. source와 binary는 임시 경로나 비공개 로컬 경로에 둔다.

```sh
git clone --depth 1 --branch 2.9.7 https://github.com/CNES/aviso-fes.git /tmp/bunaken-libfes-2.9.7
git -C /tmp/bunaken-libfes-2.9.7 submodule update --init --depth 1
cmake -S /tmp/bunaken-libfes-2.9.7 -B /tmp/bunaken-libfes-build \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DBUILD_SHARED_LIBS=ON \
  -DNETCDF_INCLUDE_DIR=/path/to/netcdf/include -DNETCDF_LIBRARY=/path/to/libnetcdf
cmake --build /tmp/bunaken-libfes-build -j 3
```

실제 NetCDF runtime과 일치하는 header/library를 지정한다. macOS 참조 binary는 `src/libfes.dylib`, Linux는 `src/libfes.so`다. LIBFES의 LGPL 조건은 원본 프로젝트를 따른다. 참조 source/binary를 이 저장소에 복사하지 않는다.

## 환경 분포 수집

```sh
uv run --project engine --extra providers --locked \
  python -m bunaken_engine.fes_research --atlas .local/fes2022b-lon-lat \
  --start 2026-09-01T00:00:00+08:00 --days 30 \
  --reference-library /tmp/bunaken-libfes-build/src/libfes.dylib \
  --output .local/history-2026-09-depth18-next
```

1~31일의 종료된 구간만 허용한다. atlas 구성·각 성분 hash를 확인하고 19개 대표 입수 좌표에서 계산한다. PyFES의 undefined·extrapolated 값은 결측 처리한다. 3시간마다 시각별 새 LIBFES 세션으로 독립 C 참조와 비교하며, 하나라도 유효하지 않거나 차이가 0.001m를 넘으면 scaler 생성을 차단한다. [공식 알고리즘 차이 문서](https://www.aviso.altimetry.fr/fileadmin/documents/data/tools/Note_Pyfes_FES2022_Finite_Element_AVISO_20260320.pdf)에 명시된 LIBFES의 24시간 nodal cache를 비교 시 유지하지 않는다. 이 tolerance는 구현 간 수치 일치 기준이며 현장 예측 정확도 검증이 아니다.

수집 성공 시 `rows.json`, `site-rows.json`, `scaler.json`, `conformance.json`, `manifest.json`을 만든다. Site별 row 범위, source·geometry·feature·코드 hash와 SDK 버전을 보존한다. 출력 디렉터리가 이미 존재하면 덮어쓰지 않는다. 실패한 비교 보고서는 새 출력 경로에 남고 다음 시도는 별도 경로를 사용한다.

현재 연구 수집은 `tide_rate_m_per_hour`, `tide_excursion_m`의 부분 분포다. phase 정의, 벽/외해 방향과 다른 공급원 조건이 확인되지 않은 feature는 null과 비활성 사유를 남긴다. 관측 label·PCI·운영 forecast를 생성하지 않는다. retrieval 시각을 cutoff로 사용하므로 이 자료를 과거에 이미 확보했던 것처럼 검증에 넣을 수 없다.

## 완료된 로컬 검증 (2026-10-01)

34개 실제 성분으로 19개 Site의 2026-09-01~09-30 WITA 분포 27,341행을 생성했다. 독립 참조 비교 4,560건 통과, 거부값 0건, 최대 차이 0.000843149m다. 활성 feature 2개, 비활성 feature 19개다. manifest SHA-256은 `35e2f7dde21fbac3eff3e5b35ccc8e063539cc1b3065d386f3a21d6e5c67a575`다. 실제 확보 시각은 `2026-10-01T12:44:19.124938Z`이며 과거 D+1 forecast로 사용하지 않는다.

연구 성공 후 로컬 `.env`에 증거 manifest의 절대 경로를 등록한다.

```dotenv
FES_VALIDATION_MANIFEST_PATH=/absolute/path/to/checkout/.local/history-2026-09-depth18/manifest.json
```

adapter는 동일 evaluator를 사용하며 atlas·코드·SDK·보고서 hash와 Site 좌표가 일치해야 검증 flag를 해제한다. 실제 adapter에서 19개 Site, 조석값 57개를 추가 확인했다. 좌표 확인만으로 FES 계산이 가능하지만 수심·방향·Zone geometry가 확인된 것으로 처리하지 않는다. 원본 atlas·분포·scaler·참조 binary와 `.env`는 공개 Git에 포함되지 않는다.

## geometry 변경 후 재검증 (2026-10-03)

19 Site의 대표 수심 18m와 geometry 1.2 반영 후 `.local/history-2026-09-depth18`에 새 결과를 생성했다. 이전 디렉터리는 보존했다. 비교 4,560건·거부 0건·최대 차이 0.000843149m를 다시 확인했고 현재 atlas·코드·geometry에서 19 Site의 provenance가 일치한다. manifest hash는 `58ba7b3c2e555771af0e63d6051be44db7fe8ba2abc7a3efc7e5b07cf36139e3`, 실제 확보 cutoff는 `2026-10-02T23:35:08.822933Z`다. 18m가 모든 Site에서 일정하므로 depth IQR이 0인 feature는 비활성이다.

좌표·geometry·계산 코드가 바뀌면 새 output에서 참조 비교를 다시 수행하고 `.env`의 증거 경로를 갱신한다. 오래된 hash 증거를 그대로 재사용하지 않는다. 위 실행 예시의 `-next`는 재시도용 새 디렉터리이며 검증 성공 후에는 실제 생성한 경로를 등록한다.

## 운영 연결

Actions 원격 설치·예약 실행은 P7 운영 연결 범위다. hosted runner의 로컬 atlas는 job 종료 후 사라지므로 저장 방식·라이선스·전송 시간·cutoff를 확인하고 연결해야 한다. 로컬 `.env`는 GitHub Secrets에 자동 등록되지 않는다.

일반 hosted workflow는 원 atlas 대신 hash가 코드에 고정된 조석 파생값을 재사용한다. 로컬의 검증된 atlas로 `fes_cache prepare`를 실행하고 `config/fes-derived.json`을 등록한다. data에는 허용된 조석값·provenance만 저장하며 원 NetCDF는 저장하지 않는다. 좌표·계산 코드 변경이나 준비 기간 만료 시 새 파생값이 필요하다. [Actions 운영 설치 절차](actions-operations.ko.md)의 실제 실행 검수를 완료해야 운영 연결 완료로 판단한다.
