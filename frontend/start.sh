#!/bin/bash
# Inicia o servidor de desenvolvimento do frontend (Vite).
# Caminho do node resolvido do ambiente; se você usa um node fora do PATH,
# exporte-o antes de chamar este script (ex.: export PATH="$HOME/bin:$PATH").
cd "$(dirname "$0")"
exec node node_modules/.bin/vite
