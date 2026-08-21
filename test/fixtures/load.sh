#!/bin/sh
# Laedt alle Fixtures. Idempotent: mehrfacher Aufruf dupliziert nichts.
#
#   load.sh            laden (vorhandenes bleibt)
#   load.sh --reset    alles entfernen und neu laden
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)

if [ "${1:-}" = "--reset" ]; then
    for p in simple multifile stopped manyservices; do
        docker compose -p "$p" down --volumes >/dev/null 2>&1 || true
    done
    docker rm -f standalone >/dev/null 2>&1 || true
    docker volume rm orphan-data >/dev/null 2>&1 || true
fi

docker image inspect busybox >/dev/null 2>&1 || docker pull -q busybox >/dev/null

# -p setzt den Projektnamen unabhaengig vom Verzeichnisnamen, damit die
# Projekte stabil heissen (nicht "01-simple" o.ae.).
docker compose -p simple       -f "$HERE/01-simple/compose.yaml"        up -d >/dev/null
docker compose -p multifile    -f "$HERE/02-multifile/compose.yaml" \
                               -f "$HERE/02-multifile/compose.override.yaml" up -d >/dev/null
docker compose -p manyservices -f "$HERE/04-many-services/compose.yaml" up -d >/dev/null

# Gestopptes Projekt: erst hoch, dann stoppen.
docker compose -p stopped -f "$HERE/03-stopped/compose.yaml" up -d >/dev/null
docker compose -p stopped -f "$HERE/03-stopped/compose.yaml" stop >/dev/null

sh "$HERE/standalone.sh"
