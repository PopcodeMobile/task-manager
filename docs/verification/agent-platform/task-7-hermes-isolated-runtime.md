# Task 7: isolated Hermes runtime verification

2026-10-20. **PASS: 5 focused tests**. Independent runtime verification used only a new owned remote TEMP root and this local report. Production receiver was not activated. Main/Lili services were not restarted; live configuration, DB, env and auth were not copied.

## Results

- Existing vendor authority test: storage rejection is retryable, auth rejection makes no admission, accepted input commits, duplicate has one admission/inference.
- Existing vendor finalization tests: replacement owner finalizes settled input, compressed route retains logical finalization, duplicate settles without rescheduling.
- New synthetic test: GenericV2 timestamp/raw-body HMAC, X-Request-ID, first 202 and duplicate 200; eight concurrent same-ID requests yield one 202 and seven 200; one admission/model invocation per distinct event ID.
- Invalid HMAC returns 401 with zero rows/inferences. A temporary SQLite BEFORE INSERT trigger returns 503 with zero rows/inferences; removal permits the valid attempt.
- Actual gateway OS process replacement, same synthetic home/DB: PID and authority epoch change; identical body/ID with freshly signed later timestamp returns duplicate 200. Two distinct IDs retain two terminal admissions and two total model invocations across restart.

### Exact result evidence

```json
{
  "first_pid": 1001426,
  "first_epoch": 1,
  "invalid_hmac_status": 401,
  "admission_failure_status": 503,
  "first_status": 202,
  "duplicate_status": 200,
  "concurrent_statuses": [200, 200, 200, 200, 200, 200, 200, 202],
  "before_restart_rows": [
    ["concurrent", "terminal"],
    ["first", "terminal"]
  ],
  "before_restart_inferences": 2,
  "restart_pid": 1001553,
  "restart_epoch": 2,
  "restart_duplicate_status": 200,
  "fresh_signature_timestamp": true,
  "final_rows": [
    ["concurrent", "terminal"],
    ["first", "terminal"]
  ],
  "final_inferences": 2
}
```

```text
4 passed in 12.72s
1 passed in 17.65s
```

## Provisioning and execution

Read first: task-7-hermes-activation-safety.md and both earlier dedup reports. Official package metadata was opened before provisioning: [pytest 9.1.1](https://pypi.org/pypi/pytest/9.1.1/json) and [pytest-asyncio 1.3.0](https://pypi.org/pypi/pytest-asyncio/1.3.0/json). Both exist, advertise Python 3.11 compatibility, and pytest-asyncio requires pytest>=8.2,<10.

The owned root was `/tmp/task7-hermes-runtime-3hmfsb44`. All SSH calls used `ssh -o BatchMode=yes -o ConnectTimeout=10 root@72.62.15.30 python3 -B -` with a stdlib driver supplied on stdin. The driver made source/user/state/tmp/cache/runtime/artifacts directories inside that one root and captured command output only there.

Exact subprocess commands, with R meaning that TEMP root:

```text
git -C /usr/local/lib/hermes-agent archive --format=tar 493208879a3248c6a4b844981d2c31c78ae00929
/usr/local/lib/hermes-agent/venv/bin/python -m venv --copies R/venv
R/venv/bin/python -m pip install --cache-dir R/cache/pip pytest==9.1.1 pytest-asyncio==1.3.0
R/venv/bin/python -B -m pytest -p pytest_asyncio.plugin -o cache_dir=R/cache/pytest --basetemp R/tmp/pytest tests/gateway/test_webhook_authority.py tests/gateway/test_webhook_finalization_recovery.py -q --tb=short
R/venv/bin/python -B -m pytest -p pytest_asyncio.plugin -o cache_dir=R/cache/pytest --basetemp R/tmp/synthetic tests/gateway/test_task7_isolated.py -q -s --tb=short
```

Archive extraction rejected absolute/escaping members and external link targets; no .git/.hermes/venv/.venv members were accepted. No working-tree or live-home copy was made. A plain `.pth` line in TEMP venv points at `/usr/local/lib/hermes-agent/venv/lib/python3.11/site-packages`; production `.pth` files were not executed by this reference. Pip installed pytest, pytest-asyncio, iniconfig 2.3.1 and pluggy 1.7.0 only into TEMP. Existing borrowed dependencies remained read-only.

Package import check passed: pytest/pytest_asyncio resolved under TEMP venv, aiohttp/openai/yaml under legacy site-packages. GatewayRunner import passed: gateway.run and hermes_bootstrap resolved under R/source; install-state path resolved under R/state/installs/0aaf4c97e2b35dcd; runtime store resolved under R/runtime; sys.prefix was R/venv.

Every initial process used an explicit environment allowlist: PATH=R/venv/bin:/usr/bin:/bin; HOME and USERPROFILE=R/user; HERMES_HOME=R/state; HERMES_RUNTIME_DIR=R/runtime; TMPDIR/TMP/TEMP=R/tmp; XDG cache/config/data under R; PYTHONDONTWRITEBYTECODE=1; HERMES_DISABLE_LAZY_INSTALLS=1; HERMES_TEST_ISOLATION=R/state; PYTEST_CURRENT_TEST=task7_isolated_probe; PYTHONPATH=R/source; PYTEST_DISABLE_PLUGIN_AUTOLOAD=1; LANG=C.UTF-8; TZ=UTC; PIP_CONFIG_FILE=/dev/null; PIP_DISABLE_PIP_VERSION_CHECK=1. No provider or activated-install environment was inherited.

Vendor documented guards were preserved before imports: `_early_recovery._pytest_owns_live_checkout` suppresses own-checkout repair when PYTEST_CURRENT_TEST exists; `venv_sync.prepare_launch` honors the lazy-install kill switch; archive has no .git; isolated PM state has no production selection. No bootstrap implementation was monkeypatched.

The synthetic fixture rebuilt its gateway child env from the saved allowlist, then set only its nested TEMP HOME/HERMES_HOME/isolation marker, unbuffered mode and synthetic loopback provider key/URL. It called the vendor `daemon(..., barrier=False)` helper, which launches `R/venv/bin/python -m gateway.run`. It did not call `child_env()`, so guards were not stripped. No vendor recovery harness was modified. The only source addition was the synthetic test inside TEMP; its source is preserved below with the synthetic provider credential replaced by a placeholder.

## Limits and cleanup

This establishes the pinned code's immediate-agent durable admission behavior under synthetic state and a deterministic loopback model. It does not prove production OAuth/MCP grants, DNS/TLS/proxy behavior, live plugin registry, external-task side effects, pruning/deletion replay, route-change conflict behavior or older-release behavior. It is not exactly-once external side effects.

Legacy Python 3.11 emitted nonfatal warnings: snowballstemmer was absent, so tool-search assembly was skipped; truststore was absent, so TLS used OpenSSL defaults. No dependency chase or shared repair was performed. Targeted admission/inference/restart tests passed, but full Python 3.14 dependency parity and tool/TLS features were not verified. No model tool calls were requested.

A real unclean shutdown is intentional: vendor daemon context kills only its recorded test process. The restarted TEMP gateway reported its previous test life uncleanly exited and cleaned stale synthetic sessions.json entries. This is expected crash/restart evidence, not a production incident.

Cleanup evidence: {"known_gateway_pids": [1001426, 1001553], "known_pids_alive_after_tests": [], "additional_processes_with_cwd_under_owned_root": [], "remaining_owned_processes": [], "source_pyc_count": 0, "legacy_pytest_after": {"pytest": false, "pytest_asyncio": false}, "shared_head_after": "493208879a3248c6a4b844981d2c31c78ae00929", "owned_temp_removed": true}.
No known gateway PID remained after tests. Cleanup scanned only process cwd metadata for the owned TEMP tree, found no extra owned processes, and removed only that root with shutil.rmtree. No test credential value is included in this report. The recorded assertions and exit codes are the completion evidence; broader production no-write syscall auditing was not performed. Stop condition reached: report, focused proof and owned-resource cleanup; live activation remains separate.

## Preserved synthetic test source

SHA-256: `7ffbc8334951ab70a92497a6ebb906254dcd7e84b01dbfc89290b59395a5be1f`. Digest is of the executed source before redaction. The generated HMAC secret was never printed; the synthetic provider credential is replaced below by a placeholder.

```python
"""Owned synthetic GenericV2 ingress/restart proof, TEMP copy only."""
import asyncio
from contextlib import closing
from http.server import ThreadingHTTPServer
import hashlib,hmac,json,os,secrets,socket,sqlite3,threading,time
from pathlib import Path
import aiohttp
from tests.gateway.fixtures.local_recovery_probe import daemon
from tests.gateway.fixtures.shared_authority_peer import ModelPeer
from tests.waiting import async_wait_until

def test_generic_v2_durable_restart(tmp_path):
    root=Path(__file__).resolve().parents[2]
    home,user=tmp_path/'state',tmp_path/'user'
    home.mkdir(mode=0o700); user.mkdir(mode=0o700)
    peer=ThreadingHTTPServer(('127.0.0.1',0),ModelPeer)
    peer.requests=[];peer.metadata_requests=[]
    peer.blocked,peer.release=threading.Event(),threading.Event()
    threading.Thread(target=peer.serve_forever,daemon=True).start()
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{peer.server_port}/v1'
    key=secrets.token_hex(32)
    cfg={'model':{'provider':'custom','default':'local-wire-stub','base_url':base},
      'gateway':{'multiplex_profiles':False},'plugins':{'enabled':[]},
      'platforms':{'webhook':{'enabled':True,'extra':{'host':'127.0.0.1','port':port,'secret':key,
         'routes':{'fixture':{'prompt':'{text}','deliver':'log'}}}}},
      'auxiliary':{'title_generation':{'enabled':False}},'streaming':{'enabled':False},'terminal':{'cwd':str(home)}}
    (home/'config.yaml').write_text(json.dumps(cfg))
    env=json.loads((root.parent/'environment.json').read_text())
    env.update(HOME=str(user),USERPROFILE=str(user),HERMES_HOME=str(home),
       HERMES_TEST_ISOLATION=str(home),OPENAI_API_KEY='<synthetic-provider-key-redacted>',OPENAI_BASE_URL=base,PYTHONUNBUFFERED='1')
    def rows():
        with closing(sqlite3.connect(f'file:{home/"state.db"}?mode=ro',uri=True)) as db:
            return list(db.execute('SELECT request_id,status FROM session_admissions ORDER BY request_id'))
    def mutate(sql):
        with closing(sqlite3.connect(home/'state.db')) as db:db.execute(sql);db.commit()
    body=json.dumps({'text':'TASK7_SYNTHETIC_INPUT'},sort_keys=True).encode()
    stamps=[]
    async def send(identity,bad=False):
        ts=str(int(time.time()));stamps.append(ts)
        signature=hmac.new(key.encode(),ts.encode()+b'.'+body,hashlib.sha256).hexdigest()
        if bad:signature='0'*64
        headers={'X-Request-ID':identity,'X-Webhook-Timestamp':ts,'X-Webhook-Signature-V2':signature}
        async with aiohttp.ClientSession() as client:
            async with client.post(f'http://127.0.0.1:{port}/webhooks/fixture',data=body,headers=headers) as response:
                status=response.status;data=await response.json()
                return status,data.get('status')
    async def settle(count):
        await async_wait_until(lambda:len(rows())==count and all(x[1]=='terminal' for x in rows()),
           timeout=35,interval=.05,what='synthetic webhook rows to terminalize')
        assert len(peer.requests)==count
    evidence={}
    try:
        with daemon(root,home,env,barrier=False) as (proc,desc):
            evidence['first_pid']=proc.pid;evidence['first_epoch']=desc['authority_epoch']
            denied=asyncio.run(send('invalid',True));assert denied[0]==401 and rows()==[] and not peer.requests
            evidence['invalid_hmac_status']=denied[0]
            mutate("CREATE TRIGGER task7_fail BEFORE INSERT ON session_admissions BEGIN SELECT RAISE(ABORT, 'owned failure'); END")
            failed=asyncio.run(send('storage-failure'));assert failed[0]==503 and rows()==[] and not peer.requests
            evidence['admission_failure_status']=failed[0]
            mutate('DROP TRIGGER task7_fail')
            first=asyncio.run(send('first'));assert first==(202,'accepted')
            asyncio.run(settle(1))
            duplicate=asyncio.run(send('first'));assert duplicate==(200,'duplicate')
            assert len(rows())==1 and len(peer.requests)==1
            evidence['first_status']=first[0];evidence['duplicate_status']=duplicate[0]
            async def concurrent():return await asyncio.gather(*(send('concurrent') for _ in range(8)))
            concurrent_results=asyncio.run(concurrent())
            assert sorted(x[0] for x in concurrent_results)==[200]*7+[202]
            asyncio.run(settle(2))
            evidence['concurrent_statuses']=sorted(x[0] for x in concurrent_results)
            evidence['before_restart_rows']=rows();evidence['before_restart_inferences']=len(peer.requests)
            prior_timestamp=stamps[-1]
        while str(int(time.time()))==prior_timestamp:time.sleep(.1)
        with daemon(root,home,env,barrier=False) as (proc,desc):
            evidence['restart_pid']=proc.pid;evidence['restart_epoch']=desc['authority_epoch']
            assert evidence['restart_pid']!=evidence['first_pid']
            replay=asyncio.run(send('first'));assert replay==(200,'duplicate')
            assert stamps[-1]!=prior_timestamp
            asyncio.run(settle(2));time.sleep(1)
            assert len(rows())==2 and len(peer.requests)==2
            evidence['restart_duplicate_status']=replay[0];evidence['fresh_signature_timestamp']=True
            evidence['final_rows']=rows();evidence['final_inferences']=len(peer.requests)
        (root.parent/'artifacts/synthetic-evidence.json').write_text(json.dumps(evidence))
        print(json.dumps(evidence))
    finally:
        peer.release.set();peer.shutdown();peer.server_close()
```
