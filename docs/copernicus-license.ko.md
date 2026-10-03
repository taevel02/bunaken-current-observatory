# Copernicus 공개 파생자료 정책

2026-10-04 확인. 사용자가 제공한 `Service Commitments and License _ CMEMS.pdf`의 16–17페이지 §2.2는 파생자료 생성·배포와 원자료 재배포를 허용한다. §2.4는 출처·DOI 표시, §2.6은 사용 이력 보존을 요구한다.

- 원문 URL: https://marine.copernicus.eu/user-corner/service-commitments-and-licence
- 제공 PDF SHA-256: `af05e45ab412104b3525d5a6bfba2b7aa354b618015aaa2b3c9cb027c95f6097`
- 제품: `GLOBAL_ANALYSISFORECAST_PHY_001_024`, DOI https://doi.org/10.48670/moi-00016
- 공개 허용: 버전·시각·격자·수심 근거를 보존한 포인트 `uo`, `vo`, `thetao`, `so` 파생 샘플.
- 제품 표시 문구: `Generated using E.U. Copernicus Marine Service Information; https://doi.org/10.48670/moi-00016`.
- 저장소 정책상 원 NetCDF·자격증명·라이선스 PDF는 공개 Git에 저장하지 않는다. 라이선스가 허용하는 범위보다 좁은 저장 정책이다.

공개 허용은 현장 대표성 검증과 별개다. 18m 대표 수심과 입수 좌표는 확인되었으나 허용 격자 거리·벽/외해 방향·Zone geometry는 미확정이다. 해당 조건이 필요한 환경 feature와 숫자 PCI는 계속 차단한다. 지역 모델 유속은 현장 실측으로 표시하지 않는다.
