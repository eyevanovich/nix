"""Loopback test of scripts/op_bridge.py with a fake `op`; no real 1Password."""
import importlib.util
import os
import signal
import stat
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from http.server import ThreadingHTTPServer

HERE = os.path.dirname(__file__)
SCRIPT = os.path.join(HERE, "..", "scripts", "op_bridge.py")
spec = importlib.util.spec_from_file_location("op_bridge", SCRIPT)
ob = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ob)

FAKE_OP = """#!/bin/sh
# argv: read <ref> [--no-newline] [--account X] | inject [--account X]
case "$1" in
  read) shift; ref=$1; nl=1; for a in "$@"; do [ "$a" = --no-newline ] && nl=0; done
        [ "$ref" = op://v/missing/x ] && { echo "item not found" >&2; exit 1; }
        printf 'S(%s)' "$ref"; if [ $nl = 1 ]; then echo; fi ;;
  inject) cat | sed 's/op:\\/\\/[^ ]*/INJECTED/g' ;;
  *) echo "fake op: unexpected $*" >&2; exit 2 ;;
esac
"""


class Bridge(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        fake = os.path.join(cls.tmp, "fakeop")
        open(fake, "w").write(FAKE_OP)
        os.chmod(fake, os.stat(fake).st_mode | stat.S_IXUSR)
        cls.secret_path = os.path.join(cls.tmp, "secret")
        open(cls.secret_path, "w").write("s3cret")
        os.environ["OP_BRIDGE_OP"] = fake
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), ob.Handler)
        cls.httpd.secret = "s3cret"
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.env = dict(os.environ, OP_BRIDGE_PORT=str(cls.port), OP_BRIDGE_SECRET_FILE=cls.secret_path)

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def op(self, *args, stdin="", env=None):
        return subprocess.run([sys.executable, SCRIPT, *args], input=stdin, text=True,
                              capture_output=True, env=env or self.env)

    def test_read(self):
        r = self.op("read", "op://v/i/f", "--account=lucasfilm.1password.com")
        self.assertEqual((r.returncode, r.stdout), (0, "S(op://v/i/f)\n"))

    def test_read_no_newline_and_out_file(self):
        out = os.path.join(self.tmp, "o.txt")
        r = self.op("read", "-f", "-n", "op://v/i/f", "-o", out)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(open(out).read(), "S(op://v/i/f)")
        self.assertEqual(stat.S_IMODE(os.stat(out).st_mode), 0o600)

    def test_out_file_refuses_overwrite_without_force(self):
        out = os.path.join(self.tmp, "keep.txt")
        open(out, "w").write("x")
        r = self.op("read", "op://v/i/f", "-o", out)
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual(open(out).read(), "x")

    def test_inject_stdin_and_file(self):
        r = self.op("inject", stdin="A=op://v/i/f\n")
        self.assertEqual(r.stdout, "A=INJECTED\n")
        tpl = os.path.join(self.tmp, "t.tpl")
        open(tpl, "w").write("B=op://v/i/g\n")
        r = self.op("inject", "-i", tpl)
        self.assertEqual(r.stdout, "B=INJECTED\n")

    def test_run_resolves_env_and_env_file(self):
        envf = os.path.join(self.tmp, "e.env")
        open(envf, "w").write("# c\nX=op://v/i/x\nPLAIN=ok\nexport Q=\"op://v/i/q\"\n")
        r = self.op("run", f"--env-file={envf}", "--", "sh", "-c", 'echo "$X|$PLAIN|$Q|$Y"',
                    env=dict(self.env, Y="op://v/i/y"))
        self.assertEqual(r.stdout, "S(op://v/i/x)|ok|S(op://v/i/q)|S(op://v/i/y)\n")

    def test_op_error_surfaces(self):
        r = self.op("read", "op://v/missing/x")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("item not found", r.stderr)

    def test_unsupported_commands_and_flags_refused(self):
        for args in (["item", "list"], ["signin"], ["whoami"], ["read", "--evil", "op://v/i/f"]):
            r = self.op(*args)
            self.assertNotEqual(r.returncode, 0, args)
            self.assertEqual(r.stdout, "", args)

    def test_bad_secret_rejected(self):
        bad = os.path.join(self.tmp, "bad")
        open(bad, "w").write("wrong")
        r = self.op("read", "op://v/i/f", env=dict(self.env, OP_BRIDGE_SECRET_FILE=bad))
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("bad secret", r.stderr)

    def test_non_reference_and_bad_account_rejected(self):
        self.assertNotEqual(self.op("read", "not-a-ref").returncode, 0)
        self.assertNotEqual(self.op("read", "op://v/i/f", "--account=a b;rm").returncode, 0)

    def test_bridge_down_message(self):
        r = self.op("read", "op://v/i/f", env=dict(self.env, OP_BRIDGE_PORT="1"))
        self.assertIn("op-bridge is not running", r.stderr)

    def test_no_secret_file_message(self):
        r = self.op("read", "op://v/i/f", env=dict(self.env, OP_BRIDGE_SECRET_FILE="/nonexistent"))
        self.assertIn("not set up", r.stderr)


FAKE_REX = """#!/bin/sh
echo "rex $*" >> "$OP_BRIDGE_TEST_LOG"
case "$*" in *"forward new"*) exec sleep 60 ;; esac
"""
FAKE_SSH = """#!/bin/sh
echo "ssh $*" >> "$OP_BRIDGE_TEST_LOG"
cat > /dev/null 2>&1 || true
"""


class Serve(unittest.TestCase):
    """`serve` must clean up on every way of stopping, or the next start hits a stale tunnel."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.log = os.path.join(self.tmp, "log")
        open(self.log, "w").close()
        for name, body in (("rex", FAKE_REX), ("ssh", FAKE_SSH)):
            path = os.path.join(self.tmp, name)
            open(path, "w").write(body)
            os.chmod(path, 0o755)
        self.env = dict(os.environ, PATH=self.tmp + os.pathsep + os.environ["PATH"],
                        OP_BRIDGE_TEST_LOG=self.log, OP_BRIDGE_PORT="0")

    def lines(self):
        return open(self.log).read().splitlines()

    def stop_with(self, sig):
        link = os.path.join(self.tmp, "op-bridge")  # the script serves only when named op-bridge
        if not os.path.exists(link):
            os.symlink(os.path.abspath(SCRIPT), link)
        p = subprocess.Popen([sys.executable, link, "serve", "u@h"],
                             env=dict(self.env, PYTHONUNBUFFERED="1"), stdout=subprocess.PIPE, text=True)
        self.assertIn("op-bridge up", p.stdout.readline())
        p.send_signal(sig)
        self.assertEqual(p.wait(timeout=15), 0)
        return self.lines()

    def check(self, lines):
        closes = [i for i, l in enumerate(lines) if "forward close --orphaned" in l]
        new = [i for i, l in enumerate(lines) if "forward new" in l]
        self.assertEqual(len(closes), 2, lines)
        self.assertLess(closes[0], new[0], "orphans must be closed before the tunnel starts")
        self.assertGreater(closes[1], new[0], "orphans must be closed after the tunnel stops")
        self.assertIn("rm -f ~/.config/op-bridge/secret", lines[-1])

    def test_cleanup_on_sigint(self):
        self.check(self.stop_with(signal.SIGINT))

    def test_cleanup_on_sigterm(self):
        self.check(self.stop_with(signal.SIGTERM))

    def test_cleanup_on_sighup(self):
        self.check(self.stop_with(signal.SIGHUP))


if __name__ == "__main__":
    unittest.main()
