"""Check the local Docker image and persistence across container recreation.

Set KRAMP_DOCKER_IMAGE to override krampouezh:check. The test creates a uniquely
named container and volume, uses an ephemeral loopback port, and cleans up both.
"""

import json
import os
import subprocess
import time
import urllib.request
import uuid


IMAGE = os.environ.get("KRAMP_DOCKER_IMAGE", "krampouezh:check")
# Keep this test on the local daemon rather than an inherited remote context.
DOCKER_ENV = {
    key: value for key, value in os.environ.items()
    if key not in ("DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS",
                   "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH")
}
DOCKER = ["docker", "--host=unix:///var/run/docker.sock"]


def docker(*args):
    return subprocess.check_output([*DOCKER, *args], env=DOCKER_ENV, text=True).strip()


def request(base_url, path, payload=None):
    req = urllib.request.Request(
        base_url + path,
        data=None if payload is None else json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=3) as response:
        return response.read()


def start(container, volume):
    docker("run", "--detach", "--name", container,
           "--mount", f"type=volume,src={volume},dst=/app/data",
           "-p", "127.0.0.1::8080", IMAGE)
    base_url = "http://" + docker("port", container, "8080/tcp")
    for _ in range(30):
        try:
            request(base_url, "/api/leaderboard")
            return base_url
        except OSError:
            time.sleep(0.5)
    raise RuntimeError(docker("logs", container))


def main():
    container = f"krampouezh-check-{uuid.uuid4().hex[:12]}"
    volume = f"{container}-data"
    docker("volume", "create", volume)
    try:
        base_url = start(container, volume)
        assert docker("exec", container, "id", "-u") != "0"
        assert b"Les meilleures piles" in request(base_url, "/")
        entry = {"id": str(uuid.uuid4()), "name": "Test conteneur", "score": 42}
        saved = json.loads(request(base_url, "/api/leaderboard", entry))
        assert saved["total"] == 1 and saved["rank"] == 1
        docker("stop", container)
        docker("rm", container)
        base_url = start(container, volume)
        restored = json.loads(request(base_url, "/api/leaderboard?id=" + entry["id"]))
        assert restored == saved
        retried = json.loads(request(base_url, "/api/leaderboard", entry))
        assert retried == saved
        print("PASS container: static UI + API + nonroot + persisted rank/score "
              "after recreation + idempotent retry")
    finally:
        subprocess.run([*DOCKER, "rm", "-f", container],
                       env=DOCKER_ENV, capture_output=True)
        docker("volume", "rm", volume)


if __name__ == "__main__":
    main()
