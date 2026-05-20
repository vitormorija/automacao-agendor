#!/bin/bash
# ──────────────────────────────────────────────────────────────────
# Backup automático do banco de dados SQLite — Automação Agendor
# Instalar no crontab: 0 3 * * * /opt/agendor/deploy/backup.sh
# ──────────────────────────────────────────────────────────────────

APP_DIR="/opt/agendor"
DB_FILE="$APP_DIR/backend/agendor.db"
BACKUP_DIR="$APP_DIR/backups"
MAX_BACKUPS=30   # mantém os últimos 30 dias

# Cria pasta de backup se não existir
mkdir -p "$BACKUP_DIR"

# Nome do arquivo com data e hora
DATE=$(date +"%Y-%m-%d_%H-%M")
BACKUP_FILE="$BACKUP_DIR/agendor_$DATE.db"

# Copia o banco (SQLite é seguro para cópia direta quando não está em escrita)
cp "$DB_FILE" "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "[$(date)] Backup criado: $BACKUP_FILE"
    # Remove backups mais antigos que MAX_BACKUPS arquivos
    ls -t "$BACKUP_DIR"/agendor_*.db | tail -n +$((MAX_BACKUPS + 1)) | xargs -r rm
    echo "[$(date)] Backups mantidos: $(ls "$BACKUP_DIR"/agendor_*.db | wc -l)"
else
    echo "[$(date)] ERRO: Falha ao criar backup!" >&2
    exit 1
fi
