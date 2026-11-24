"""Rebuild the bracket through the freecad-mcp server and record the full session.

Every JSON-RPC frame (both directions) is written to logs/mcp_call_<ts>.jsonl,
so the MCP usage can be audited afterwards - this is the evidence file for the
competition submission.
"""
import hashlib
import json
import os
import subprocess
import sys
import time

PY = r"D:\mcp-cup\.venv\Scripts\python.exe"
LAUNCHER = r"D:\mcp-cup\tools\freecad_mcp_launcher.py"
BUILD = r"D:\mcp-cup\project\bracket\build_bracket.py"
PARAMS = r"D:\mcp-cup\project\bracket\params.json"
LOG_DIR = r"D:\mcp-cup\logs"
os.makedirs(LOG_DIR, exist_ok=True)


def main():
    stamp = time.strftime("%Y%m%d_%H%M%S")
    log_path = os.path.join(LOG_DIR, "mcp_call_%s.jsonl" % stamp)
    summary_path = os.path.join(LOG_DIR, "mcp_call_%s.summary.json" % stamp)

    proc = subprocess.Popen(
        [PY, LAUNCHER],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    log = open(log_path, "w", encoding="utf-8")
    events = []

    def record(direction, msg):
        row = {"ts": round(time.time(), 3), "dir": direction, "msg": msg}
        log.write(json.dumps(row, ensure_ascii=False) + "\n")
        log.flush()
        events.append(row)

    def send(method, params=None, notify=False, rid=None):
        msg = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            msg["params"] = params
        if not notify:
            msg["id"] = rid
        proc.stdin.write((json.dumps(msg, ensure_ascii=False) + "\n").encode("utf-8"))
        proc.stdin.flush()
        record("out", msg)

    def read_until(rid, timeout=300):
        deadline = time.time() + timeout
        while time.time() < deadline:
            line = proc.stdout.readline()
            if not line:
                raise SystemExit("server closed stdout")
            text = line.decode("utf-8", "replace").strip()
            if not text:
                continue
            msg = json.loads(text)
            record("in", msg)
            if msg.get("id") == rid:
                return msg
        raise SystemExit("timeout waiting for id %s" % rid)

    send("initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                        "clientInfo": {"name": "tianxi-build-runner", "version": "1.0"}}, rid=1)
    init = read_until(1)["result"]
    send("notifications/initialized", notify=True)

    send("tools/list", {}, rid=2)
    tools = read_until(2)["result"]["tools"]
    names = [t["name"] for t in tools]
    if "execute_code_headless" not in names:
        raise SystemExit("execute_code_headless missing: %s" % names)

    with open(PARAMS, "r", encoding="utf-8") as fh:
        params_doc = json.load(fh)

    code = (
        'PARAMS_PATH = r"%s"\n'
        'exec(open(r"%s", encoding="utf-8").read())\n'
    ) % (PARAMS, BUILD)

    send("tools/call", {"name": "execute_code_headless", "arguments": {"code": code}}, rid=3)
    call = read_until(3)
    result = call.get("result", {})
    stdout = "".join(c.get("text", "") for c in result.get("content", []) if c.get("type") == "text")

    parsed = None
    for line in stdout.splitlines():
        if line.startswith("RESULT_JSON "):
            parsed = json.loads(line[len("RESULT_JSON "):])

    summary = {
        "timestamp": stamp,
        "serverInfo": init.get("serverInfo"),
        "protocolVersion": init.get("protocolVersion"),
        "toolCount": len(tools),
        "toolNames": names,
        "toolCalled": "execute_code_headless",
        "isError": result.get("isError"),
        "params": params_doc,
        "buildCodeSha256": hashlib.sha256(code.encode("utf-8")).hexdigest(),
        "buildScriptSha256": hashlib.sha256(open(BUILD, "rb").read()).hexdigest(),
        "result": parsed,
        "logFile": log_path,
        "messageCount": len(events),
    }
    with open(summary_path, "w", encoding="utf-8") as fh:
        json.dump(summary, fh, ensure_ascii=False, indent=2)

    proc.stdin.close()
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
    log.close()

    print("SERVER", init.get("serverInfo"))
    print("TOOLS", len(tools))
    print("IS_ERROR", result.get("isError"))
    if parsed:
        print("VOLUME_MM3", parsed["volume_mm3"])
        print("VALID", parsed["valid"], "SOLIDS", parsed["solids"], "FACES", parsed["faces"])
        print("STL", parsed["files"]["stl"]["path"], parsed["files"]["stl"]["bytes"], "bytes")
    else:
        print(stdout[:2000])
    print("LOG", log_path)
    print("SUMMARY", summary_path)
    return 0 if parsed and parsed.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
