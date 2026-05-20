#!/bin/bash
export PATH="/Users/vitormorija/bin:$PATH"
cd "$(dirname "$0")"
exec node node_modules/.bin/vite
