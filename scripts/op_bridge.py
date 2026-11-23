#!/usr/bin/env python3
"""op-bridge: use the Mac's 1Password CLI (SSO / desktop-app sign-in) from a headless box.

Mac:  `op-bridge serve user@host` runs a loopback proxy around the real `op`, plus a
      `rex forward new -R` tunnel to host. Ctrl-C stops both and removes the secret.
Host: this same file installed as `op`. It supports only `read`, `inject` and `run`
      and sends them through the tunnel. Anything else is refused.

Auth is a per-run random secret written to ~/.config/op-bridge/secret on the host.
While the bridge runs, any process that can read that file can resolve any reference
your Mac account can read.

shortcut: `op run` does not mask secrets in command output and does not expand $VARS
in env files, and only whole-value `op://` references are resolved. Upgrade when a
Taskfile needs it.
"""
import hmac
import json
import os
import re
import secrets
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_PORT = 17979
SESSION = "op-bridge"
ACCOUNT_RE = re.compile(r"^[A-Za-z0-9._-]+$")
FLAGS = {  # flag -> (dest, takes_value)
    "-n": ("no_newline", 0), "--no-newline": ("no_newline", 0),
    "-o": ("out", 1), "--out-file": ("out", 1),
    "-i": ("infile", 1), "--in-file": ("infile", 1),
    "-f": ("force", 0), "--force": ("force", 0),
    "--file-mode": ("mode", 1), "--account": ("account", 1),
    "--env-file": ("env_files", 1), "--no-masking": ("nomask", 0),
}


def port():
    return int(os.environ.get("OP_BRIDGE_PORT", DEFAULT_PORT))


def secret_file():
    return os.environ.get("OP_BRIDGE_SECRET_FILE", os.path.expanduser("~/.config/op-bridge/secret"))


def die(msg):
    sys.stderr.write(f"op: {msg}\n")
    sys.exit(1)


# ---------------------------------------------------------------- Mac side

def build_argv(path, req):
    """Map a request to a fixed `op` argv. Only read and inject exist."""
    argv = [os.environ.get("OP_BRIDGE_OP", "op")]
    if path == "/read":
        ref = req.get("ref", "")
        if not ref.startswith("op://") or "\n" in ref or "\0" in ref:
            raise ValueError("not an op:// reference")
        argv.append("read")
        tail = [ref] + (["--no-newline"] if req.get("no_newline") else [])
    elif path == "/inject":
        argv.append("inject")
        tail = []
    else:
        raise ValueError("unsupported operation")
    account = req.get("account")
    if account:
        if not ACCOUNT_RE.match(account):
            raise ValueError("bad account")
        tail += ["--account", account]
    return argv + tail


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def reply(self, code, body):
        self.send_response(code)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        if not hmac.compare_digest(self.headers.get("X-Op-Bridge", ""), self.server.secret):
            return self.reply(401, b"bad secret")
        try:
            req = json.loads(body)
            argv = build_argv(self.path, req)
        except ValueError as e:
            return self.reply(400, str(e).encode())
        try:
            p = subprocess.run(argv, input=req.get("stdin", "").encode(), capture_output=True, timeout=120)
        except subprocess.TimeoutExpired:
            return self.reply(504, b"op timed out (approve the prompt on your Mac?)")
        self.reply(200 if p.returncode == 0 else 502, p.stdout if p.returncode == 0 else p.stderr)


def rex(target, *args, **kw):
    return subprocess.run(["rex", "-S", f"ssh://{target}", *args], **kw)


def ensure_session(target):
    # The tunnel is a block in a Rex session, and with several sessions on the host the
    # CLI refuses to pick a default. Own a dedicated session instead of guessing.
    r = rex(target, "session", "ls", "--json", capture_output=True, text=True)
    if r.returncode != 0:
        die("cannot list Rex sessions: " + (r.stderr.strip() or "is Rex reachable on that host?"))
    if not any(x.get("label") == SESSION for x in json.loads(r.stdout).get("sessions", [])):
        r = rex(target, "session", "new", SESSION, "--", "sleep", "infinity", capture_output=True, text=True)
        if r.returncode != 0:
            die("cannot create Rex session: " + r.stderr.strip())


def close_orphans(target):
    # A killed `rex forward new` leaves its block listening, and the next start then
    # fails with "address already in use". Only our own session is touched.
    rex(target, "forward", "close", "-s", SESSION, "--orphaned", capture_output=True)


def serve(args):
    if len(args) != 2 or args[0] != "serve" or "@" not in args[1]:
        die("usage: op-bridge serve user@host")
    target, n = args[1], port()
    secret = secrets.token_urlsafe(32)
    remote = "bash -c 'umask 077; mkdir -p ~/.config/op-bridge; cat > ~/.config/op-bridge/secret'"
    subprocess.run(["ssh", "-o", "BatchMode=yes", target, remote], input=secret.encode(), check=True)
    httpd = ThreadingHTTPServer(("127.0.0.1", n), Handler)
    httpd.secret = secret
    # Closing the Rex block sends SIGHUP; treat it like Ctrl-C so cleanup runs.
    for sig in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, signal.default_int_handler)
    ensure_session(target)
    close_orphans(target)
    tunnel = subprocess.Popen(["rex", "-S", f"ssh://{target}", "forward", "new", "-s", SESSION, "-R", f"127.0.0.1:{n}:127.0.0.1:{n}"])
    try:
        time.sleep(2)
        if tunnel.poll() is not None:
            die("rex forward exited; is Rex reachable on that host?")
        print(f"op-bridge up: {target} -> 127.0.0.1:{n}. Ctrl-C to stop.", flush=True)
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        tunnel.terminate()
        try:
            tunnel.wait(timeout=5)
        except subprocess.TimeoutExpired:
            tunnel.kill()
        close_orphans(target)
        subprocess.run(["ssh", "-o", "BatchMode=yes", target, "rm -f ~/.config/op-bridge/secret"])


# ---------------------------------------------------------------- host side

def call(path, payload):
    try:
        secret = open(secret_file()).read().strip()
    except OSError:
        die("op-bridge is not set up here. On your Mac run: op-bridge serve <user@this-host>")
    req = urllib.request.Request(f"http://127.0.0.1:{port()}{path}", json.dumps(payload).encode(), {"X-Op-Bridge": secret})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))  # never via a corporate proxy
    try:
        return opener.open(req, timeout=130).read()
    except urllib.error.HTTPError as e:
        die(e.read().decode(errors="replace").strip() or f"bridge returned HTTP {e.code}")
    except (urllib.error.URLError, ConnectionError):
        die("op-bridge is not running. On your Mac run: op-bridge serve <user@this-host>")


def parse(args):
    """Return (options, positionals, command-after--)."""
    o, pos, i = {"env_files": []}, [], 0
    while i < len(args):
        a, i = args[i], i + 1
        if a == "--":
            return o, pos, args[i:]
        name, eq, val = a.partition("=") if a.startswith("--") else (a, "", "")
        if name not in FLAGS:
            if a.startswith("-") and a != "-":
                die(f"unsupported flag {a}")
            pos.append(a)
            continue
        dest, takes = FLAGS[name]
        if not takes:
            o[dest] = True
            continue
        if not eq:
            if i >= len(args):
                die(f"{name} needs a value")
            val, i = args[i], i + 1
        if dest == "env_files":
            o[dest].append(val)
        else:
            o[dest] = val
    return o, pos, []


def emit(data, o):
    path = o.get("out")
    if not path:
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()
        return
    if os.path.exists(path) and not o.get("force"):
        die(f"{path} exists; use --force to overwrite")
    mode = int(o.get("mode", "0600"), 8)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
    os.fchmod(fd, mode)
    with os.fdopen(fd, "wb") as f:
        f.write(data)


def read_env_file(path):
    env = {}
    for line in open(path):
        line = line.strip().removeprefix("export ")
        if not line or line.startswith("#"):
            continue
        k, eq, v = line.partition("=")
        if not eq:
            continue
        v = v.strip()
        if len(v) > 1 and v[0] == v[-1] and v[0] in "'\"":
            v = v[1:-1]
        env[k.strip()] = v
    return env


def run_cmd(o, cmd):
    if not cmd:
        die("usage: op run [--env-file FILE] -- COMMAND [ARG...]")
    env = dict(os.environ)
    for f in o["env_files"]:
        env.update(read_env_file(f))
    for k, v in list(env.items()):
        if v.startswith("op://"):
            env[k] = call("/read", {"ref": v, "no_newline": True, "account": o.get("account")}).decode()
    try:
        os.execvpe(cmd[0], cmd, env)
    except OSError as e:
        die(f"cannot run {cmd[0]}: {e.strerror}")


def client(args):
    sub = args[0] if args else ""
    o, pos, cmd = parse(args[1:])
    if sub == "read":
        if len(pos) != 1:
            die("usage: op read <reference>")
        emit(call("/read", {"ref": pos[0], "no_newline": bool(o.get("no_newline")), "account": o.get("account")}), o)
    elif sub == "inject":
        text = open(o["infile"]).read() if o.get("infile") else sys.stdin.read()
        emit(call("/inject", {"stdin": text, "account": o.get("account")}), o)
    elif sub == "run":
        run_cmd(o, cmd)
    else:
        die("only 'read', 'inject' and 'run' are available through op-bridge; use your Mac for the rest")


def main():
    if os.path.basename(sys.argv[0]) == "op-bridge":
        serve(sys.argv[1:])
    else:
        client(sys.argv[1:])


if __name__ == "__main__":
    main()
