"""Check role revocation against a queued administrator in disposable PostgreSQL."""
import os
import subprocess
import time

def sql(statement):
    return subprocess.check_output(
        ["psql","-X","-qAt","--set","ON_ERROR_STOP=on","-c",statement],
        text=True, timeout=20).strip()

if sql("SELECT current_database()") != "portal_security_test":
    raise SystemExit("Refusing to run outside portal_security_test")
first = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
second = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
sql(f"SELECT set_config('request.jwt.claim.sub','{first}',false); SELECT public.admin_set_account_role('{second}','admin',false)")
holder = subprocess.Popen(
    ["psql","-X","-qAt","--set","ON_ERROR_STOP=on","-c",
     f"BEGIN; SELECT set_config('request.jwt.claim.sub','{first}',true); SELECT public.admin_set_account_role('{second}','cliente',true); SELECT pg_sleep(10); COMMIT;"],
    env=dict(os.environ, PGAPPNAME="access-holder"), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
waiting = None

def wait_for(condition, processes):
    end = time.monotonic() + 8
    while time.monotonic() < end:
        if sql(condition) == "t": return
        if any(p.poll() is not None for p in processes): raise AssertionError("Session ended before lock was observed")
        time.sleep(0.1)
    raise AssertionError("Expected advisory lock was not observed")

try:
    wait_for("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='access-holder' AND wait_event='PgSleep')",[holder])
    waiting = subprocess.Popen(
        ["psql","-X","-qAt","--set","ON_ERROR_STOP=on","-c",
         f"SELECT set_config('request.jwt.claim.sub','{second}',false); SELECT public.admin_set_account_role('{first}','cliente',true);"],
        env=dict(os.environ, PGAPPNAME="access-waiting"), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    wait_for("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='access-waiting' AND wait_event_type='Lock')",[holder,waiting])
    _, holder_error = holder.communicate(timeout=20)
    _, waiting_error = waiting.communicate(timeout=20)
    assert holder.returncode == 0, holder_error
    assert waiting.returncode != 0 and "Acesso restrito a administradores." in waiting_error, waiting_error
    assert sql("SELECT count(*) FROM public.user_roles WHERE role='admin'") == "1"
    assert sql(f"SELECT public.has_role('{first}','admin')") == "t"
    assert sql(f"SELECT public.has_role('{second}','admin')") == "f"
    assert sql("SELECT count(*) FROM public.admin_access_events WHERE action='role_changed'") == "2"
    print("Concurrent administrator revocation preserved the remaining administrator and refused the queued request")
finally:
    for process in [holder, waiting]:
        if process is not None and process.poll() is None:
            process.terminate()
            process.communicate(timeout=5)
