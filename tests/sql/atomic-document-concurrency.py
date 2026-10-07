"""Exercise real concurrent PostgreSQL sessions in the disposable CI database."""
import os
import subprocess
import time

def sql(statement, app="portal-test"):
    env = dict(os.environ, PGAPPNAME=app)
    return subprocess.check_output(
        ["psql", "-X", "-qAt", "--set", "ON_ERROR_STOP=on", "-c", statement],
        env=env, text=True, timeout=25,
    ).strip()

if sql("SELECT current_database()") != "portal_security_test":
    raise SystemExit("Refusing to run outside portal_security_test")

doc = "22222222-2222-4222-8222-222222222222"
owner = "11111111-1111-4111-8111-111111111111"
old = owner + "/old.pdf"
replace = (
    "SET ROLE service_role; SELECT public.replace_document_file_atomic("
    f"'{doc}', '{owner}', '{old}', '{owner}/new.pdf', 'new.pdf', 20, 'application/pdf');"
)

def wait_for(condition, processes):
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        if sql(condition) == "t":
            return
        if any(p.poll() is not None for p in processes):
            raise AssertionError("A concurrent session ended before its lock was observed")
        time.sleep(0.1)
    raise AssertionError("Expected PostgreSQL lock was not observed")

def race(name, mutation):
    holder = subprocess.Popen(
        ["psql", "-X", "-qAt", "--set", "ON_ERROR_STOP=on", "-c",
         "BEGIN; " + mutation + " SELECT pg_sleep(10); COMMIT;"],
        env=dict(os.environ, PGAPPNAME="holder-" + name),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    replacement = None
    try:
        wait_for(
            f"SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name = 'holder-{name}' AND wait_event = 'PgSleep')",
            [holder],
        )
        replacement = subprocess.Popen(
            ["psql", "-X", "-qAt", "--set", "ON_ERROR_STOP=on", "-c", replace],
            env=dict(os.environ, PGAPPNAME="replacement-" + name),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        wait_for(
            f"SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name = 'replacement-{name}' AND wait_event_type = 'Lock')",
            [holder, replacement],
        )
        _, holder_error = holder.communicate(timeout=20)
        result, error = replacement.communicate(timeout=20)
        assert holder.returncode == 0, holder_error
        assert replacement.returncode == 0, error
        assert result.strip() == "f", "Replacement succeeded after concurrent " + name
        assert sql(f"SELECT storage_path FROM public.documents WHERE id = '{doc}'") == old
        assert sql(f"SELECT file_name FROM public.documents WHERE id = '{doc}'") == "old.pdf"
        print("Concurrent " + name + " blocked replacement and preserved the old file link")
    finally:
        for proc in [holder, replacement]:
            if proc is not None and proc.poll() is None:
                proc.terminate()
                proc.communicate(timeout=5)

race("status-change", f"UPDATE public.documents SET status = 'concluido' WHERE id = '{doc}';")
sql(f"UPDATE public.documents SET status = 'recebido' WHERE id = '{doc}'")
race("certificate-insert",
     f"INSERT INTO public.certificates VALUES ('99999999-9999-4999-8999-999999999999', '{doc}');")
print("Concurrent document replacement checks passed")
