"""Cross-platform arithmetic comparison, never for hashes, config or source identities."""
import math

ABS_TOLERANCE=1e-12
REL_TOLERANCE=1e-12


def replay_equal(expected,actual):
    if isinstance(expected,bool) or isinstance(actual,bool):return type(expected) is type(actual) and expected==actual
    if isinstance(expected,(int,float)) and isinstance(actual,(int,float)):
        if isinstance(expected,int) and isinstance(actual,int):return expected==actual
        return math.isfinite(expected) and math.isfinite(actual) and math.isclose(expected,actual,abs_tol=ABS_TOLERANCE,rel_tol=REL_TOLERANCE)
    if isinstance(expected,dict) and isinstance(actual,dict):
        return expected.keys()==actual.keys() and all(replay_equal(expected[key],actual[key]) for key in expected)
    if isinstance(expected,list) and isinstance(actual,list):
        return len(expected)==len(actual) and all(replay_equal(a,b) for a,b in zip(expected,actual))
    return type(expected) is type(actual) and expected==actual
