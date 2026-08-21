#!/bin/sh
# Ressourcen OHNE Compose-Bezug. Pruefstein fuer die 1.0-Entscheidung
# "fokussierter Compose-Manager": Diese duerfen in den Compose-Ansichten
# nicht auftauchen.
set -eu

# Container ohne Compose-Label, mit Portmapping.
if ! docker ps -a --format '{{.Names}}' | grep -qx standalone; then
    docker run -d --name standalone -p 127.0.0.1:8099:80 \
        busybox sleep infinity >/dev/null
fi

# Volume ohne Compose-Label.
docker volume inspect orphan-data >/dev/null 2>&1 || \
    docker volume create orphan-data >/dev/null

# Ungenutztes Image fuer den Cleanup-Pfad.
docker image inspect busybox:musl >/dev/null 2>&1 || \
    docker pull -q busybox:musl >/dev/null
