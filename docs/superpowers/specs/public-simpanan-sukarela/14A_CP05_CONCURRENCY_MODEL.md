# 14A — Reproducible isolated concurrency analysis model

22 Oktober 2026. C05-MODEL1. **Executed abstract experiment, not production/source-equivalent integration proof.** Python standard library only; no network, environment loading, application imports, DB, file mutation by model, credentials or provider calls. The temporary executed script SHA-256 is `123ff69db32eaa1d6d0f18f3f3bb73acf72a269a011428854a68ea7e3c5e3b5d`.

This deliberately models audited handler statements without unverified external guards, transactions or triggers. PUBLIC precheck is a proposed design element, not an existing deployed endpoint. Initial state is a synthetic PUBLIC request, amount100; amount200 is an unauthorised edit. Processing reads, master update, member update and header update are separate steps, as observed C05-ORDER1. It does not prove the absence of all runtime wrappers/controls.

Every schedule preserves each command's statement order and exhausts their interleavings. Single-action commands include serial extremes. For cancel/reject races, both commands execute with no state/actor guard: the oracle flags config effects despite a competing rejection/cancel that should either be denied or win atomically. Double-approve counts repeated application even if the final amount happens to be identical; it does not claim double ledger deductions occurred. The reference assumes one indivisible, authenticated, state/version-checked command that **all writers obey**; this is the required property, not a working implementation discovered by the experiment.

| Experiment | Schedules | Counterexamples / violations |
|---|---|---|
| PUBLIC precheck vs MOBILE create |3|2 duplicate rows|
| MOBILE edit PUBLIC vs CI2 approve |5|5 immutable consent body changes|
| MOBILE cancel PUBLIC vs CI2 approve |5|5 unauthorised/unguarded transition combinations|
| CI2 reject vs approve |5|5 rejection/approval combination without single-winner state gate|
| CI2 approve vs repeated approve |70|70 repeated config applications|
| Shared atomic reference, five operation pairs |10|0 under all-writer atomic assumption|
| Same-token serialized reference retries |2|0 under shared token-lock assumption|

Actual assertions passed: unsafe counterexample counts `[2,5,5,5,70]`; reference12 schedules0 violations; late-header-only rejection leaves synthetic config100 with header OPEN. **87/88 is schedule enumeration, not probability, production incident count or a test of the proposed DB mechanism.** The reference demonstrates no race only because indivisibility/authorization is an assumption. It cannot close P0-05 or replace XC-01..10.

Reproduce by saving the fenced code to a temporary `.py` file and executing `python3 <temporary-model.py>`. No application code or production service is involved. Scope limits: two commands at a time, synthetic business key, no deadlocks/isolation/privileges/trigger implementation/storage/provider/recovery simulation; no exhaustive real-system proof. Future actual integration acceptance is defined in [16](16_CROSS_CHANNEL_CONSISTENCY_STRATEGY.md).

```python
"""CP0.5 analysis experiment. Synthetic state only; no imports from applications or DB."""
from itertools import combinations, permutations
from copy import deepcopy
import json, hashlib

def schedules(left, right):
    for slots in combinations(range(len(left)+len(right)), len(left)):
        slots=set(slots); a=iter(left); b=iter(right)
        yield [next(a) if i in slots else next(b) for i in range(len(left)+len(right))]

results=[]
def check(name,left,right,step,bad):
    traces=[]; total=0
    for seq in schedules(left,right):
        s={'rows':0,'eligible':False,'amount':100,'snapshot':100,'status':'OPEN','master':0,'member':0,'applied':0,'read':{}}
        for op in seq: step(s,op)
        total+=1
        if bad(s): traces.append(seq)
    results.append({'case':name,'schedules':total,'violations':len(traces),'first_counterexample':traces[0] if traces else None})

def intake(s,op):
    if op=='public.check': s['eligible']=s['rows']==0
    elif op=='public.insert': s['rows']+=int(s['eligible'])
    elif op=='mobile.insert': s['rows']+=1
check('existing_public_precheck_vs_mobile_create',['public.check','public.insert'],['mobile.insert'],intake,lambda s:s['rows']>1)

def legacy(s,op):
    who,action=op.split('.')
    if action=='read': s['read'][who]=s['amount']
    elif action=='master': s['master']=s['read'][who];s['applied']+=1
    elif action=='member': s['member']=s['read'][who]
    elif action=='status': s['status']='APPROVED'
    elif action=='edit': s['amount']=200
    elif action in ('cancel','reject'): s['status']='REJECTED'
A=['a.read','a.master','a.member','a.status']
check('existing_mobile_edit_vs_approve',A,['m.edit'],legacy,lambda s:s['amount']!=s['snapshot'])
check('existing_mobile_cancel_vs_approve',A,['m.cancel'],legacy,lambda s:s['applied']>0)
check('existing_ci2_reject_vs_approve',A,['b.reject'],legacy,lambda s:s['applied']>0)
check('existing_double_approve',A,['b.read','b.master','b.member','b.status'],legacy,lambda s:s['applied']>1)

# Reference specification ONLY: all writers participate in one atomic conditional command.
# The chosen synthetic conflict key below is not an approved business duplicate policy.
reference=[]
for pair in [('create','create'),('unauthorized_edit','approve'),('unauthorized_cancel','approve'),('approve','reject'),('approve','approve')]:
    for order in permutations(range(2)):
        s={'exists':False,'status':'OPEN','amount':100,'snapshot':100,'config':0,'version':0,'applied':0,'denied':0}
        for i in order:
            op=pair[i]
            if op=='create':
                if s['exists']:s['denied']+=1
                else:s['exists']=True
            elif op.startswith('unauthorized_'):s['denied']+=1
            elif s['version']!=0 or s['status']!='OPEN':s['denied']+=1
            else:
                if op=='approve':s['config']=s['amount'];s['applied']+=1
                s['status']='APPROVED' if op=='approve' else 'REJECTED';s['version']+=1
        assert s['amount']==s['snapshot'] and s['applied']<=1
        assert (s['status']!='REJECTED' or s['config']==0)
        assert s['denied']==1
        reference.append({'pair':pair,'order':order})
# A late request-only guard cannot roll back already committed config statements.
late={'master':100,'member':100,'status':'OPEN'}
assert late['master']==100 and late['status']=='OPEN'
# Token lock reference serializes two exact same-link retries; unrelated mobile does not share this lock.
for order in permutations(('request1','request2')):
    consumed=False; rows=0
    for _ in order:
        if not consumed:rows+=1;consumed=True
    assert rows==1
assert [r['violations'] for r in results]==[2,5,5,5,70]
out={'evidenceId':'C05-MODEL1','kind':'abstract_interleaving_model_NOT_runtime_proof','existing':results,'reference_atomic_all_writer_assumption':{'schedules':len(reference),'violations':0},'reference_same_token_lock':{'schedules':2,'violations':0},'late_header_only_guard_counterexample':late}
print(json.dumps(out,indent=2))
```
