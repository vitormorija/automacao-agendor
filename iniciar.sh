#!/bin/bash

# ============================================================
#   AUTOMAÇÃO AGENDOR — Script de Inicialização
# ============================================================

export PATH="$HOME/bin:$PATH"
PROJETO="$HOME/Automacao_agendor"

echo ""
echo "============================================"
echo "  Automação Agendor — Iniciando..."
echo "============================================"
echo ""

# Verifica se o Node está disponível
if ! command -v node &> /dev/null; then
  echo "❌ ERRO: Node.js não encontrado em ~/bin/node"
  echo "   Entre em contato com o suporte."
  exit 1
fi

echo "✅ Node.js: $(node --version)"
echo ""

# Para processos anteriores nas mesmas portas (se houver)
lsof -ti:3001 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null
sleep 1

# Inicia o Backend
echo "🔧 Iniciando backend (porta 3001)..."
cd "$PROJETO/backend"
node src/index.js > /tmp/agendor-backend.log 2>&1 &
BACKEND_PID=$!

# Aguarda o backend subir
sleep 3

# Verifica se o backend subiu
if curl -s http://localhost:3001/api/health > /dev/null; then
  echo "✅ Backend rodando!"
else
  echo "❌ Backend não iniciou. Veja o log: /tmp/agendor-backend.log"
  exit 1
fi

# Inicia o Frontend
echo "🌐 Iniciando frontend (porta 5173)..."
cd "$PROJETO/frontend"
node node_modules/.bin/vite > /tmp/agendor-frontend.log 2>&1 &
FRONTEND_PID=$!

sleep 3

echo ""
echo "============================================"
echo "  ✅ TUDO PRONTO!"
echo "============================================"
echo ""
echo "  Abra no navegador:"
echo "  👉  http://localhost:5173"
echo ""
echo "  Para parar tudo, pressione CTRL+C"
echo "============================================"
echo ""

# Mantém o script rodando; ao pressionar CTRL+C, para tudo
trap "echo ''; echo 'Parando serviços...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Encerrado!'; exit 0" INT TERM

wait
