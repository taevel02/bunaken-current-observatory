# FES2022b 로컬 atlas와 historical 연구

## 비공개 로컬 설치

`.env`의 `AVISO_USERNAME`, `AVISO_PASSWORD`에 승인받은 AVISO 계정을 등록한다. 이 파일과 `.local/`은 Git에 포함되지 않는다. 원 atlas를 공개 Git, Actions artifact 또는 공개 cache에 올리지 않는다.

```sh
uv sync --project engine --extra providers --locked
uv run --env-file .env --project engine --extra providers --locked \
  python -m bunaken_engine.fes_atlas --output .local/fes2022b \
  --seed "$HOME/Downloads/m2_fes2022.nc.xz" --workers 3
```

공식 `ocean_tide_20241025`의 34개 성분을 받는다. 중단하면 같은 명령으로 재개한다. 완료 atlas는 hash 확인 후 재사용한다. 다른 좌표 범위는 새 출력 경로를 사용한다. 동시 설치는 lock으로 거부한다. 완료 파일은 HTTP 길이를 확인하고 XZ를 끝까지 읽어 CRC를 검사한다. CRC 손상본은 로컬에 격리하고 한 번 다시 받는다. 부분 파일은 서버가 올바른 Range 응답을 반환할 때 이어 받는다. 전체 설치 성공 후에만 `fes2022.yaml`, `atlas-manifest.json`을 생성한다.

진폭 `cm`, 위상 `degrees`를 확인하고, 부나켄 좌표 주변의 원래 1/30° 격자를 잘라 저장한다. 좌표 주변 0.15°는 파일 읽기 범위다. 허용 격자 거리나 현장 geometry 검증 기준이 아니다. manifest에 원본·압축·지역 파일의 SHA-256과 서버 수정 시각을 기록한다.

설치가 끝나면 로컬 `.env`에 다음 값을 등록한다. 경로는 해당 checkout의 절대 경로를 사용한다.

```dotenv
FES_CONFIG_PATH=/absolute/path/to/checkout/.local/fes2022b/fes2022.yaml
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
  python -m bunaken_engine.fes_research --atlas .local/fes2022b \
  --start 2026-09-01T00:00:00+08:00 --days 30 \
  --reference-library /tmp/bunaken-libfes-build/src/libfes.dylib \
  --output .local/history-2026-09
```

1~31일의 종료된 구간만 허용한다. atlas 구성·각 성분 hash를 확인하고 19개 대표 입수 좌표에서 계산한다. PyFES의 undefined·extrapolated 값은 결측 처리한다. 3시간마다 시각별 새 LIBFES 세션으로 독립 C 참조와 비교하며, 하나라도 유효하지 않거나 차이가 0.001m를 넘으면 scaler 생성을 차단한다. [공식 알고리즘 차이 문서](https://www.aviso.altimetry.fr/fileadmin/documents/data/tools/Note_Pyfes_FES2022_Finite_Element_AVISO_20260320.pdf)에 명시된 LIBFES의 24시간 nodal cache를 비교 시 유지하지 않는다. 이 tolerance는 구현 간 수치 일치 기준이며 현장 예측 정확도 검증이 아니다.

수집 성공 시 `rows.json`, `site-rows.json`, `scaler.json`, `conformance.json`, `manifest.json`을 만든다. Site별 row 범위, source·geometry·feature·코드 hash와 SDK 버전을 보존한다. 출력 디렉터리가 이미 존재하면 덮어쓰지 않는다. 실패한 비교 보고서는 새 출력 경로에 남고 다음 시도는 별도 경로를 사용한다.

현재 연구 수집은 `tide_rate_m_per_hour`, `tide_excursion_m`의 부분 분포다. phase 정의, 수심·벽/외해 방향과 다른 공급원 조건이 확인되지 않은 feature는 null과 비활성 사유를 남긴다. 관측 label·PCI·운영 forecast를 생성하지 않는다. retrieval 시각을 cutoff로 사용하므로 이 자료를 과거에 이미 확보했던 것처럼 검증에 넣을 수 없다.

Actions 원격 설치·예약 실행은 P7 운영 연결 범위다. hosted runner의 로컬 atlas는 job 종료 후 사라지므로 저장 방식·라이선스·전송 시간·cutoff를 확인하고 연결해야 한다. 로컬 `.env`는 GitHub Secrets에 자동 등록되지 않는다.
