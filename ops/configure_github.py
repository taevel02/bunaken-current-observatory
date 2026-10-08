"""Apply explicit P7 branch/environment policies after operator gh reauthentication."""
import argparse
import json
import subprocess

REPOSITORY='taevel02/bunaken-current-observatory'


def api(method,path,data=None):
    args=['gh','api','--method',method,'repos/'+REPOSITORY+'/'+path]
    if data is not None: args+=['--input','-']
    result=subprocess.run(args,input=json.dumps(data) if data is not None else None,capture_output=True,text=True)
    if result.returncode: raise RuntimeError(result.stderr.splitlines()[0])
    return json.loads(result.stdout) if result.stdout.strip() else None


def rules(name,branch,main=False):
    entries=[{'type':'deletion'},{'type':'non_fast_forward'}]
    if main:
        entries += [{'type':'required_status_checks','parameters':{'strict_required_status_checks_policy':True,'required_status_checks':[{'context':'web-and-contracts'},{'context':'engine-contracts'}]}},
                    {'type':'pull_request','parameters':{'required_approving_review_count':0,'dismiss_stale_reviews_on_push':True,'require_code_owner_review':False,'require_last_push_approval':False,'required_review_thread_resolution':True}}]
    return dict(name=name,target='branch',enforcement='active',bypass_actors=[],conditions={'ref_name':{'include':['refs/heads/'+branch],'exclude':[]}},rules=entries)


def configure(apply=False):
    policies=[rules('bunaken-main','main',True),rules('bunaken-data','data')]
    if not apply:return {'apply':False,'rulesets':policies,'environment_branches':['main','data']}
    existing=api('GET','rulesets')
    for policy in policies:
        found=next((item for item in existing if item['name']==policy['name']),None)
        path='rulesets/'+str(found['id']) if found else 'rulesets'
        api('PUT' if found else 'POST',path,policy)
    # Preserve existing reviewers/wait timer/secrets while restricting branch selection.
    env=api('GET','environments/environmental-data')
    data={'deployment_branch_policy':{'protected_branches':False,'custom_branch_policies':True}}
    for rule in env.get('protection_rules',[]):
        if rule['type']=='required_reviewers': data.update(reviewers=[{'type':item['type'],'id':item.get('id') or item['reviewer']['id']} for item in rule['reviewers']],prevent_self_review=rule.get('prevent_self_review',False))
        elif rule['type']=='wait_timer':data['wait_timer']=rule['wait_timer']
    api('PUT','environments/environmental-data',data)
    listing=api('GET','environments/environmental-data/deployment-branch-policies')['branch_policies']
    for branch in ['main','data']:
        if not any(item['name']==branch and item.get('type','branch')=='branch' for item in listing):
            api('POST','environments/environmental-data/deployment-branch-policies',dict(name=branch,type='branch'))
    unexpected=[item['name'] for item in listing if item['name'] not in {'main','data'} or item.get('type','branch')!='branch']
    # Do not silently delete pre-existing operator policies.
    return {'applied':True,'remaining_unexpected_environment_policies':unexpected,'rulesets':[{key:item[key] for key in ['name','enforcement']} for item in api('GET','rulesets')]}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    print(json.dumps(configure(args.apply),indent=2))
