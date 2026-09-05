#!/bin/bash
# Загружает сборки страниц на api.kege2.ru и публикует их.
# Запускать после tools/build-bundles.py, перед git push.
set -euo pipefail
KEY=${KEY:-$HOME/.ssh/kege2_backup}
HOST=${HOST:-ubuntuuser@195.209.212.226}
SRC="$(cd "$(dirname "$0")/.." && pwd)/_bundles/"

[ -d "$SRC" ] || { echo "нет каталога $SRC — сначала запустите build-bundles.py" >&2; exit 1; }

echo "Загрузка сборок на $HOST"
rsync -az --delete -e "ssh -i $KEY -o BatchMode=yes" "$SRC" "$HOST:/srv/kege2/bundles/"
ssh -i "$KEY" -o BatchMode=yes "$HOST" '/srv/kege2/bin/publish.sh'
