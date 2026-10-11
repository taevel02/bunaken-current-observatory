"""Stage liveness and timings on stderr; stdout remains the CLI JSON result."""
from contextlib import contextmanager
import json
import sys
from time import perf_counter


@contextmanager
def stage(name):
    start=perf_counter()
    print(json.dumps(dict(stage=name,event='started')),file=sys.stderr,flush=True)
    try:
        yield
    except BaseException:
        print(json.dumps(dict(stage=name,event='failed',elapsed_seconds=round(perf_counter()-start,3))),file=sys.stderr,flush=True)
        raise
    else:
        print(json.dumps(dict(stage=name,event='finished',elapsed_seconds=round(perf_counter()-start,3))),file=sys.stderr,flush=True)
