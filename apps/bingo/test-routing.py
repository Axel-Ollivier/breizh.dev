"""Smoke-test the production route rules against local Docker images (no VPS).

Requires images bingo-frontend:check and bingo-backend:check, Docker Compose v2,
and Python 3. Uses an isolated network and removes all containers afterwards.
"""
import base64
import http.client
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile
import time


ROOT = Path(__file__).resolve().parents[2]


def run(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True)


def request(port, host, path, method="GET"):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    connection.request(method, path, headers={"Host": host})
    response = connection.getresponse()
    result = response.status, dict(response.getheaders()), response.read()
    connection.close()
    return result


def websocket(port, host, token):
    # An actual WebSocket upgrade plus SignalR JSON handshake through Traefik.
    with socket.create_connection(("127.0.0.1", port), timeout=5) as stream:
        key = base64.b64encode(os.urandom(16)).decode()
        stream.sendall((f"GET /bingo/hub?id={token} HTTP/1.1\r\nHost: {host}\r\n"
                        "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                        f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        headers = b""
        while b"\r\n\r\n" not in headers:
            data = stream.recv(1)
            assert data, "Connection closed before WebSocket upgrade response"
            headers += data
        assert headers.startswith(b"HTTP/1.1 101"), headers
        payload = b'{"protocol":"json","version":1}\x1e'
        mask = os.urandom(4)
        frame = bytes([0x81, 0x80 | len(payload)]) + mask
        stream.sendall(frame + bytes(value ^ mask[index % 4] for index, value in enumerate(payload)))
        reply = b""
        while b"{}\x1e" not in reply:
            data = stream.recv(4096)
            assert data, "WebSocket closed before SignalR handshake"
            reply += data


def main():
    production = json.loads(run("docker", "compose", "-f", "docker-compose.prod.yml", "config", "--format", "json"))
    with tempfile.TemporaryDirectory(prefix="bingo-routing-") as folder:
        directory = Path(folder)
        routers, services = {}, {}
        for service_name in ("app", "bingo-frontend", "bingo-backend"):
            labels = production["services"][service_name]["labels"]
            route = "breizhdev" if service_name == "app" else service_name
            prefix = f"traefik.http.routers.{route}."
            routers[route] = {
                "rule": labels[prefix + "rule"],
                "priority": int(labels.get(prefix + "priority", 0)),
                "entryPoints": ["test"], "service": route,
            }
            port = labels[f"traefik.http.services.{route}.loadbalancer.server.port"]
            services[route] = {"loadBalancer": {"servers": [{"url": f"http://{service_name}:{port}"}]}}
        # JSON is valid YAML; Traefik's file provider selects its parser by extension.
        (directory / "routes.yaml").write_text(json.dumps({"http": {"routers": routers, "services": services}}))
        (directory / "main.conf").write_text('server { listen 8080; location / { return 200 "site-principal"; } }')
        # Keep inherited egress proxies, while routing this isolated Docker network directly.
        local_hosts = ",localhost,127.0.0.1,app,bingo-frontend,bingo-backend"
        compose = {"services": {
            "proxy": {"image": "traefik:v3.6", "command": ["--entrypoints.test.address=:80", "--providers.file.filename=/config/routes.yaml"],
                      "environment": {"NO_PROXY": os.environ.get("NO_PROXY", "") + local_hosts,
                                      "no_proxy": os.environ.get("no_proxy", "") + local_hosts},
                      "ports": ["127.0.0.1::80"], "volumes": [f"{directory}/routes.yaml:/config/routes.yaml:ro"]},
            "app": {"image": "bingo-frontend:check", "volumes": [f"{directory}/main.conf:/etc/nginx/conf.d/default.conf:ro"]},
            "bingo-frontend": {"image": "bingo-frontend:check"},
            "bingo-backend": {"image": "bingo-backend:check"},
        }}
        config = directory / "compose.json"
        config.write_text(json.dumps(compose))
        command = ("docker", "compose", "-p", f"bingo-routing-{os.getpid()}", "-f", str(config))
        try:
            subprocess.run((*command, "up", "-d", "--wait"), check=True, cwd=ROOT)
            port = int(run(*command, "port", "proxy", "80").strip().rsplit(":", 1)[1])
            for attempt in range(30):
                try:
                    if request(port, "breizh.dev", "/bingo/api/health")[0] == 200:
                        break
                except (OSError, http.client.HTTPException):
                    pass
                time.sleep(0.5)
            for host in ("breizh.dev", "www.breizh.dev"):
                status, _, body = request(port, host, "/")
                assert status == 200 and body == b"site-principal", (status, body[:500])
                assert request(port, host, "/bingo-other")[2] == b"site-principal"
                status, headers, _ = request(port, host, "/bingo")
                assert status == 308 and headers["Location"] == "/bingo/"
                status, _, body = request(port, host, "/bingo/ABC123")
                assert status == 200 and b'<div id="app">' in body
                asset = re.search(rb'src="(/bingo/assets/[^\"]+\.js)"', body)
                assert asset and request(port, host, asset[1].decode())[0] == 200
                assert request(port, host, "/bingo/assets/missing.js")[0] == 404
                status, _, body = request(port, host, "/bingo/api/health")
                assert status == 200 and json.loads(body)
                assert request(port, host, "/bingo/api/missing")[0] == 404
                status, _, body = request(port, host, "/bingo/hub/negotiate?negotiateVersion=1", "POST")
                assert status == 200
                websocket(port, host, json.loads(body)["connectionToken"])
                print(f"OK {host}: main site, strict prefix, SPA, assets, API, SignalR WebSocket")
        except BaseException:
            subprocess.run((*command, "logs", "--tail", "40"), cwd=ROOT)
            raise
        finally:
            subprocess.run((*command, "down", "--volumes", "--remove-orphans"), check=True, cwd=ROOT)


if __name__ == "__main__":
    main()
