"""Authenticated FES2022b installation. Atlas files remain in private local storage."""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import lzma
import math
import os
from pathlib import Path
import shutil
from uuid import uuid4
from urllib.request import Request, urlopen

BASE = "https://tds-odatis.aviso.altimetry.fr/thredds/fileServer/dataset-auxiliary-fes-tide-model/fes2022b/ocean_tide_20241025/"
WAVES = "2N2 Eps2 J1 K1 K2 L2 Lambda2 M2 M3 M4 M6 M8 Mf MKS2 Mm MN4 MS4 MSf Msqm Mtm Mu2 N2 N4 Nu2 O1 P1 Q1 R2 S1 S2 S4 Sa Ssa T2".split()


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def install(output: Path, sites: list[dict], *, seed: Path | None = None, workers: int = 3):
    import fcntl
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (output / ".install.lock").open("a") as lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("atlas_install_busy") from None
        return _install(output, sites, seed=seed, workers=workers)


def _install(output: Path, sites: list[dict], *, seed: Path | None = None, workers: int = 3):
    if not 1 <= workers <= 6:
        raise ValueError("atlas_workers_out_of_range")
    if not sites or any(not all(isinstance(site.get(key), (int, float)) and not isinstance(site[key], bool)
                                     and math.isfinite(site[key]) for key in ("lat", "lon"))
                        or not (-90 <= site["lat"] <= 90 and -180 <= site["lon"] <= 180) for site in sites):
        raise ValueError("atlas_coordinates_invalid")
    username, password = os.environ.get("AVISO_USERNAME"), os.environ.get("AVISO_PASSWORD")
    if not username or not password:
        raise ValueError("aviso_credentials_missing")
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    output.chmod(0o700)
    raw = output / "original"
    regional = output / "regional"
    raw.mkdir(exist_ok=True)
    regional.mkdir(exist_ok=True)
    authorization = "Basic " + base64.b64encode(f"{username}:{password}".encode()).decode()
    # A file-read extent with several native cells of halo, not a model grid-distance policy.
    bounds = [min(s["lon"] for s in sites)-.15, min(s["lat"] for s in sites)-.15,
              max(s["lon"] for s in sites)+.15, max(s["lat"] for s in sites)+.15]
    existing_manifest = output / "atlas-manifest.json"
    if existing_manifest.exists():
        existing = json.loads(existing_manifest.read_text())
        if existing.get("layout") != "longitude_latitude":
            raise ValueError("atlas_layout_unverified")
        if existing.get("bounds") != bounds:
            raise ValueError("atlas_installed_bounds_differ")
        config_path = output / "fes2022.yaml"
        pending_config = output / "fes2022.yaml.part"
        check_config = config_path if config_path.exists() else pending_config
        if not check_config.is_file():
            raise ValueError("atlas_incomplete_publication")
        if sha256(check_config) != existing["config_sha256"] or len(existing["files"]) != len(WAVES) or {item["wave"] for item in existing["files"]} != set(WAVES):
            raise ValueError("atlas_installed_integrity_invalid")
        for item in existing["files"]:
            if item["file"] != item["wave"].lower()+"_fes2022.nc" or sha256(regional/item["file"]) != item["regional_sha256"]:
                raise ValueError("atlas_installed_integrity_invalid")
        if not config_path.exists():
            pending_config.replace(config_path)
        return existing
    if (output / "fes2022.yaml").exists():
        raise ValueError("atlas_incomplete_publication")
    if seed and seed.is_file() and not (raw / "m2_fes2022.nc.xz").exists():
        shutil.copyfile(seed, raw / "m2_fes2022.nc.xz")

    def download(wave):
        name = wave.lower() + "_fes2022.nc"
        packed, unpacked, subset = raw / (name + ".xz"), raw / name, regional / name
        request = Request(BASE + name + ".xz", method="HEAD", headers={"Authorization": authorization})
        with urlopen(request, timeout=60) as response:
            length = int(response.headers["Content-Length"])
            modified = response.headers.get("Last-Modified")
        if not packed.exists() or packed.stat().st_size != length:
            partial = packed.with_suffix(".xz.part")
            offset = partial.stat().st_size if partial.exists() else 0
            headers = {"Authorization": authorization}
            if 0 < offset < length:
                headers["Range"] = f"bytes={offset}-"
            else:
                offset = 0
            request = Request(BASE + name + ".xz", headers=headers)
            with urlopen(request, timeout=120) as response:
                resumed = offset > 0 and response.status == 206
                if resumed and not response.headers.get("Content-Range", "").startswith(f"bytes {offset}-"):
                    raise ValueError("atlas_range_invalid")
                with partial.open("ab" if resumed else "wb") as handle:
                    shutil.copyfileobj(response, handle, 1024*1024)
            if partial.stat().st_size != length:
                raise ValueError("atlas_download_incomplete")
            partial.replace(packed)
        return wave, name, packed, unpacked, subset, length, modified

    def crop(downloaded, retry=True):
        import xarray as xr
        wave, name, packed, unpacked, subset, length, modified = downloaded
        # Reading to EOF verifies the XZ checksum, including reused seed files.
        try:
            with lzma.open(packed) as source, unpacked.open("wb") as target:
                shutil.copyfileobj(source, target, 1024*1024)
        except (lzma.LZMAError, EOFError):
            packed.replace(packed.with_name(packed.name+".invalid-"+uuid4().hex))
            if retry:
                return crop(download(wave), retry=False)
            raise ValueError("atlas_crc_invalid") from None
        with xr.open_dataset(unpacked) as data:
            if data.amplitude.attrs.get("units") != "cm" or data.phase.attrs.get("units") != "degrees":
                raise ValueError("atlas_units_invalid")
            cropped = data.sel(lon=slice(bounds[0],bounds[2]),lat=slice(bounds[1],bounds[3])).load()
            if cropped.sizes.get("lat",0) < 4 or cropped.sizes.get("lon",0) < 4:
                raise ValueError("atlas_subset_empty")
            # PyFES infers longitude-major from axis lengths. A square lat/lon
            # crop is ambiguous, so store harmonic arrays longitude-first.
            for variable in ("amplitude", "phase"):
                cropped[variable] = cropped[variable].transpose("lon", "lat")
            cropped.to_netcdf(subset)
        return dict(wave=wave, file=name, compressed_bytes=length, source_modified=modified,
                    compressed_sha256=sha256(packed), native_sha256=sha256(unpacked), regional_sha256=sha256(subset))

    entries = []
    # NetCDF/HDF5 handles are not thread-safe in every runtime; crop sequentially.
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(download, wave) for wave in WAVES]
        for future in as_completed(futures):
            entries.append(crop(future.result()))
            print(json.dumps({"atlas_completed":len(entries),"atlas_total":len(WAVES),"wave":entries[-1]["wave"]}),flush=True)
    entries.sort(key=lambda entry: WAVES.index(entry["wave"]))
    config = {"tide":{"cartesian":{"amplitude":"amplitude","phase":"phase","latitude":"lat","longitude":"lon",
                                    "dynamic":["A5"],"paths":{wave:str((regional / (wave.lower()+"_fes2022.nc")).resolve()) for wave in WAVES}}}}
    config_temp = output / "fes2022.yaml.part"
    config_temp.write_text(json.dumps(config,indent=2)+"\n")
    from datetime import datetime, timezone
    manifest = dict(layout="longitude_latitude",dataset="FES2022b",atlas_release="ocean_tide_20241025",retrieved_at=datetime.now(timezone.utc).isoformat(),
                    bounds=bounds,files=entries,config_sha256=sha256(config_temp),unit="cm")
    manifest_temp = output / "atlas-manifest.json.part"
    manifest_temp.write_text(json.dumps(manifest,indent=2)+"\n")
    # The config is the provider entry point: expose it only after all atlas checks.
    manifest_temp.replace(output / "atlas-manifest.json")
    config_temp.replace(output / "fes2022.yaml")
    return manifest


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--sites",type=Path,default=Path("packages/contracts/data/sites.json"))
    parser.add_argument("--seed",type=Path)
    parser.add_argument("--workers",type=int,choices=range(1,7),default=3)
    args=parser.parse_args()
    try:
        manifest=install(args.output,json.loads(args.sites.read_text()),seed=args.seed,workers=args.workers)
        print(json.dumps({"status":"installed","files":len(manifest["files"])}))
    except Exception as error:
        # HTTP/SDK exception strings can contain sensitive details.
        print(json.dumps({"status":"failed","error_type":type(error).__name__}))
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
