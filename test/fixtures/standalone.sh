#!/bin/sh
# Resources with NO relation to compose. Touchstone for the 1.0 decision
# "focused compose manager": these must not show up in the compose views.
set -eu

# Container without a compose label, with a port mapping.
if ! docker ps -a --format '{{.Names}}' | grep -qx standalone; then
    docker run -d --name standalone -p 127.0.0.1:8099:80 \
        busybox sleep infinity >/dev/null
fi

# Volume without a compose label.
docker volume inspect orphan-data >/dev/null 2>&1 || \
    docker volume create orphan-data >/dev/null

# Unused image for the cleanup path.
docker image inspect busybox:musl >/dev/null 2>&1 || \
    docker pull -q busybox:musl >/dev/null
