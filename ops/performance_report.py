"""Summarize supplied successful-write measurements without recording credentials/IPs."""
import argparse
import json
from pathlib import Path
import math


def report(data):
    allowed={'storage_ms','reflection_ms','mobile_lcp_ms','source_age_hours','usage'}
    if set(data)-allowed: raise ValueError('unknown_measurement_field')
    targets={'storage_ms':10000,'reflection_ms':300000,'mobile_lcp_ms':2500}
    result={}
    for name,target in targets.items():
        values=data.get(name,[])
        if not isinstance(values,list) or any(isinstance(v,bool) or not isinstance(v,(float,int)) or not math.isfinite(v) or v<0 for v in values):
            raise ValueError('invalid_measurement')
        value=sorted(values)[max(0,math.ceil(.95*len(values))-1)] if values else None
        result[name]={'target':target,'p95':value,'samples':len(values),'passed':value<=target if value is not None else None}
    result['sufficient_sample_count']=all(result[name]['samples']>=20 for name in targets)
    result['measurement_source']='operator_supplied_not_independently_verified'
    # Do not invent a source-age or quota threshold independent of provider policy.
    source=data.get('source_age_hours')
    if source is not None:
        import re
        if not isinstance(source,dict) or any(not re.fullmatch('[a-z0-9-]{1,64}',k) or (v is not None and (isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or v<0)) for k,v in source.items()):
            raise ValueError('invalid_source_age')
    usage=data.get('usage')
    if usage is not None and (not isinstance(usage,dict) or set(usage)-{'actions_minutes','transfer_bytes','git_bytes'} or any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or v<0 for v in usage.values())):
        raise ValueError('invalid_usage')
    result['source_age_hours']=source;result['usage']=usage
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--input',type=Path,required=True)
    args=parser.parse_args();print(json.dumps(report(json.loads(args.input.read_bytes())),sort_keys=True))
