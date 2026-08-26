#!/usr/bin/env bash
# Backup diario de la base de Chanchito (Supabase, proyecto LHStudio).
#
# Corre por cron de root en el VPS (04:00 AR = 07:00 UTC; el crontab del VPS va
# en UTC). Este archivo se versiona acá y se deploya por scp a
# /opt/chanchito-backup/chanchito-backup.sh — ver el README de este directorio.
#
# Diseño (sesión 2026-08-26):
# - pg_dump con la imagen docker de postgres (nada instalado en el host),
#   contra el pooler IPv4 de Supabase (el host directo db.<ref> es IPv6-only).
# - Formato custom comprimido (-Fc), schemas public + auth + supabase_migrations:
#   datos, usuarios y registro de migraciones.
# - Un dump sólo se conserva si pasó `pg_restore --list` y el piso de tamaño:
#   el archivo verificado ES el latido — el vigía de Panchito (vigia.mjs, cada
#   30 min) reclama si el más nuevo pasa las 26 h. Acá no hay aviso propio:
#   fallar es no dejar archivo.
# - Retención de 14 diarios, atada a la promesa de borrado de /privacidad:
#   quien borra su cuenta desaparece de las copias en ≤14 días.
set -euo pipefail

ENV_FILE=${ENV_FILE:-/opt/chanchito-backup/.env}
# set -a: exporta lo sourceado — PGPASSWORD tiene que viajar al contenedor
# por `-e`, nunca como argumento (quedaría visible en `ps`).
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${PGHOST:?falta PGHOST en $ENV_FILE}"
: "${PGUSER:?falta PGUSER en $ENV_FILE}"
: "${PGPASSWORD:?falta PGPASSWORD en $ENV_FILE}"
PGPORT=${PGPORT:-5432}
PGDATABASE=${PGDATABASE:-postgres}
DEST=${DEST:-/root/backups/chanchito}
RETENCION=${RETENCION:-14}
# Piso de tamaño: un dump truncado o vacío no cuenta como backup. La base real
# dumpea cómodamente por encima de esto; calibrado en la primera corrida.
MIN_BYTES=${MIN_BYTES:-51200}
IMAGEN=${IMAGEN:-postgres:17-alpine}

STAMP=$(date -u +%Y%m%d-%H%M%S)
TMP_NAME=".tmp-chanchito-$STAMP.dump"
FINAL_NAME="chanchito-$STAMP.dump"

log() { echo "[$(date -u +%FT%TZ)] $*"; }

mkdir -p "$DEST"
# 755 y no 700: el vigía de Panchito lee este directorio desde su contenedor
# como usuario sin privilegios — necesita listar nombres y mtimes. Los dumps
# en sí van con 600: el contenido sólo lo lee root.
chmod 755 "$DEST"
# Si algo falla a mitad de camino, el temporal no queda: un .tmp huérfano no
# engaña a la rotación ni al vigía (que sólo mira chanchito-*.dump).
trap 'rm -f "$DEST/$TMP_NAME"' EXIT

log "dump de $PGDATABASE@$PGHOST:$PGPORT → $FINAL_NAME"
docker run --rm -e PGPASSWORD -v "$DEST":/out "$IMAGEN" \
  pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
    --schema=public --schema=auth --schema=supabase_migrations \
    -Fc -f "/out/$TMP_NAME"

# Verificación inmediata: que pg_restore pueda leer el índice del archivo.
# Un dump cortado por red se detecta acá, no el día que se lo necesita.
ITEMS=$(docker run --rm -v "$DEST":/out "$IMAGEN" \
  pg_restore --list "/out/$TMP_NAME" | grep -cv '^;' || true)
SIZE=$(stat -c%s "$DEST/$TMP_NAME")
if [ "$SIZE" -lt "$MIN_BYTES" ]; then
  log "ERROR: el dump pesa $SIZE bytes (piso: $MIN_BYTES) — descartado"
  exit 1
fi

mv "$DEST/$TMP_NAME" "$DEST/$FINAL_NAME"
chmod 600 "$DEST/$FINAL_NAME"

# Retención: quedan los $RETENCION más nuevos. Los nombres los controla este
# script (chanchito-YYYYMMDD-HHMMSS.dump), así que ls -t es seguro.
VIEJOS=$(ls -1t "$DEST"/chanchito-*.dump 2>/dev/null | tail -n +"$((RETENCION + 1))" || true)
if [ -n "$VIEJOS" ]; then
  echo "$VIEJOS" | while IFS= read -r f; do
    log "rotación: borro $(basename "$f")"
    rm -f "$f"
  done
fi

TOTAL=$(ls -1 "$DEST"/chanchito-*.dump | wc -l)
log "OK: $FINAL_NAME ($SIZE bytes, $ITEMS objetos, $TOTAL dumps retenidos)"
