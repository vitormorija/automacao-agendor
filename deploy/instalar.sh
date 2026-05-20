#!/bin/bash
# ══════════════════════════════════════════════════════════════════
#  Script de instalação — Automação Agendor
#  Testado em: Ubuntu 20.04 / 22.04 / Debian 11+
#  Uso: sudo bash instalar.sh
# ══════════════════════════════════════════════════════════════════

set -e  # Para em qualquer erro

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✔]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✘]${NC} $1"; exit 1; }

APP_DIR="/opt/agendor"
GITHUB_REPO="https://github.com/vitormorija/automacao-agendor.git"
NODE_VERSION="22"

echo ""
echo "══════════════════════════════════════════════"
echo "  Instalação — Automação Agendor (Cadmus)"
echo "══════════════════════════════════════════════"
echo ""

# ── 1. Dependências do sistema ────────────────────────────────────
log "Atualizando pacotes..."
apt-get update -qq

log "Instalando curl, git, nginx..."
apt-get install -y -qq curl git nginx

# ── 2. Node.js ────────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -v)" != v${NODE_VERSION}* ]]; then
    log "Instalando Node.js $NODE_VERSION..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y -qq nodejs
else
    log "Node.js já instalado: $(node -v)"
fi

# ── 3. PM2 ────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
    log "Instalando PM2..."
    npm install -g pm2 --quiet
else
    log "PM2 já instalado: $(pm2 -v)"
fi

# ── 4. Clonar / atualizar repositório ─────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
    log "Atualizando código..."
    git -C "$APP_DIR" pull
else
    log "Clonando repositório..."
    git clone "$GITHUB_REPO" "$APP_DIR"
fi

cd "$APP_DIR"

# ── 5. Arquivo .env ───────────────────────────────────────────────
if [ ! -f "$APP_DIR/backend/.env" ]; then
    warn "Arquivo .env não encontrado! Criando a partir do exemplo..."
    cp "$APP_DIR/backend/.env.example" "$APP_DIR/backend/.env"
    echo ""
    warn "⚠️  ATENÇÃO: Edite o arquivo $APP_DIR/backend/.env com as configurações reais:"
    warn "   - AGENDOR_TOKEN"
    warn "   - SMTP_HOST, SMTP_USER, SMTP_PASS"
    warn "   - ADMIN_EMAIL"
    warn "   - ALLOWED_ORIGINS (ex: http://agendor.cadmus.com.br)"
    echo ""
    read -p "Pressione ENTER após editar o .env para continuar..." _
fi

# Garante NODE_ENV=production no .env
grep -q "^NODE_ENV=" "$APP_DIR/backend/.env" \
    && sed -i 's/^NODE_ENV=.*/NODE_ENV=production/' "$APP_DIR/backend/.env" \
    || echo "NODE_ENV=production" >> "$APP_DIR/backend/.env"

# ── 6. Instalar dependências do backend ───────────────────────────
log "Instalando dependências do backend..."
npm install --prefix "$APP_DIR/backend" --omit=dev --quiet

# ── 7. Build do frontend ──────────────────────────────────────────
log "Instalando dependências do frontend..."
npm install --prefix "$APP_DIR/frontend" --quiet

log "Gerando build do frontend..."
npm run build --prefix "$APP_DIR/frontend"

# ── 8. Pastas de logs e backups ───────────────────────────────────
mkdir -p "$APP_DIR/logs" "$APP_DIR/backups"
chmod 755 "$APP_DIR/logs" "$APP_DIR/backups"

# ── 9. Configurar Nginx ───────────────────────────────────────────
log "Configurando Nginx..."
cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/agendor
ln -sf /etc/nginx/sites-available/agendor /etc/nginx/sites-enabled/agendor
rm -f /etc/nginx/sites-enabled/default   # remove site padrão

nginx -t && systemctl reload nginx
log "Nginx configurado!"

# ── 10. Iniciar com PM2 ───────────────────────────────────────────
log "Iniciando aplicação com PM2..."
pm2 delete agendor-backend 2>/dev/null || true
pm2 start "$APP_DIR/ecosystem.config.js"
pm2 save

# Configura PM2 para iniciar automaticamente com o sistema
pm2 startup | tail -1 | bash || true
log "PM2 configurado para iniciar no boot!"

# ── 11. Backup automático (crontab) ───────────────────────────────
chmod +x "$APP_DIR/deploy/backup.sh"
(crontab -l 2>/dev/null | grep -v "backup.sh"; echo "0 3 * * * $APP_DIR/deploy/backup.sh >> $APP_DIR/logs/backup.log 2>&1") | crontab -
log "Backup automático agendado para todo dia às 3h!"

# ── Fim ───────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════"
log "Instalação concluída!"
echo ""
echo "  Status: pm2 status"
echo "  Logs:   pm2 logs agendor-backend"
echo "  Nginx:  systemctl status nginx"
echo ""
warn "Não esqueça de configurar o domínio no nginx.conf!"
warn "Arquivo: /etc/nginx/sites-available/agendor"
echo "══════════════════════════════════════════════"
echo ""
