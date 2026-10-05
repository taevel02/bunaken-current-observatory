"""One bounded regional SDK read per dataset, reusable only within this run."""
import contextlib
import json
import math
import os
import signal
import subprocess
import sys
import tempfile
import time

from bunaken_engine.sources import SourceError, collect_copernicus

REQUEST_SECONDS = 120
MAX_RESPONSE_BYTES = 64 * 1024 * 1024


def point_key(geometry):
    return f"{geometry['site_id']}:{geometry.get('id') or ''}"


class RegionalSDK:
    """Materialize a small region once before per-point numpy access."""
    def __init__(self, sdk, geometries, depths):
        self.sdk, self.catalogues, self.datasets = sdk, {}, {}
        margins = [(g['max_grid_distance_km'] / 110.5,
                    g['max_grid_distance_km'] / 110.5 / max(.01, math.cos(math.radians(g['lat'])))) for g in geometries]
        self.bounds = dict(minimum_latitude=min(g['lat']-m[0] for g,m in zip(geometries,margins)),
                           maximum_latitude=max(g['lat']+m[0] for g,m in zip(geometries,margins)),
                           minimum_longitude=min(g['lon']-m[1] for g,m in zip(geometries,margins)),
                           maximum_longitude=max(g['lon']+m[1] for g,m in zip(geometries,margins)))
        self.depths = depths

    def describe(self, **params):
        key = params['dataset_id']
        if key not in self.catalogues:
            self.catalogues[key] = self.sdk.describe(**params)
        return self.catalogues[key]

    def open_dataset(self, **params):
        params.update(self.bounds)
        if params.get('dataset_part') != 'bathy':
            params.update(minimum_depth=min(self.depths), maximum_depth=max(self.depths))
        key = json.dumps({k:v for k,v in params.items() if k not in {'username','password'}}, sort_keys=True)
        if key not in self.datasets:
            with self.sdk.open_dataset(**params) as dataset:
                self.datasets[key] = dataset.load()
        # Closing one caller's view must not close the run-local cached object.
        return self.datasets[key].copy(deep=False)


def regional_collect(source, geometries, start, end, depths, *, sdk=None):
    if sdk is None:
        import copernicusmarine as sdk
    regional = RegionalSDK(sdk, geometries, depths)
    output = {}
    for geometry in geometries:
        try:
            output[point_key(geometry)] = dict(samples=collect_copernicus(
                source, geometry, start, end, geometry['reference_depth_m'], sdk=regional,
                extraction_depths=depths))
        except SourceError as error:
            if error.retryable:
                raise
            output[point_key(geometry)] = dict(error=error.code, retryable=False)
    return output


def run_worker(payload, *, timeout=REQUEST_SECONDS, command=None):
    """Kill the SDK and its child processes at deadline; never expose SDK logs."""
    with tempfile.TemporaryFile() as response:
        process = subprocess.Popen(command or [sys.executable, '-m', 'bunaken_engine.copernicus_batch'],
                                   stdin=subprocess.PIPE, stdout=response, stderr=subprocess.DEVNULL,
                                   start_new_session=os.name == 'posix')
        try:
            process.communicate(json.dumps(payload).encode(), timeout=timeout)
        except BaseException as error:
            if os.name == 'posix':
                try: os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError: pass
            else:
                process.kill()
            process.wait()
            if isinstance(error, subprocess.TimeoutExpired):
                raise SourceError('provider_request_timeout', True) from None
            raise
        if process.returncode:
            raise SourceError('provider_worker_failed', True)
        response.seek(0)
        raw = response.read(MAX_RESPONSE_BYTES + 1)
        if len(raw) > MAX_RESPONSE_BYTES:
            raise SourceError('provider_response_too_large')
        try:
            result = json.loads(raw)
            if result.get('error'):
                raise SourceError(result['error'], result.get('retryable', False))
            return result['points']
        except (ValueError, KeyError, TypeError, AttributeError):
            raise SourceError('provider_response_invalid') from None


def collect_batch(source, geometries, start, end, *, depths=None, runner=run_worker, sleep=time.sleep):
    if not geometries: return {}
    if not os.environ.get('COPERNICUSMARINE_SERVICE_USERNAME') or not os.environ.get('COPERNICUSMARINE_SERVICE_PASSWORD'):
        raise SourceError('provider_credentials_missing')
    targets = sorted(set(depths or [10, 30] + [g['reference_depth_m'] for g in geometries]))
    payload = dict(source=source, geometries=geometries, start=start, end=end, depths=targets)
    for attempt in range(2):
        try:
            return runner(payload)
        except SourceError as error:
            if not error.retryable or attempt == 1: raise
            sleep(2)


def main():
    payload = json.load(sys.stdin)
    # Official SDK limits each HTTP operation; the parent bounds the entire job.
    os.environ['COPERNICUSMARINE_HTTPS_TIMEOUT'] = '20'
    os.environ['COPERNICUSMARINE_HTTPS_RETRIES'] = '1'
    with open(os.devnull, 'w') as sink, contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
        try:
            points = regional_collect(**payload)
            result = dict(points=points)
        except SourceError as error:
            result = dict(error=error.code, retryable=error.retryable)
        except Exception:
            result = dict(error='provider_read_failed', retryable=True)
    print(json.dumps(result, allow_nan=False))


if __name__ == '__main__': main()
