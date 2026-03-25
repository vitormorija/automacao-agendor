#!/bin/bash
export PATH="/Users/vitormorija/bin:/tmp/node-v22.13.1-darwin-arm64/bin:$PATH"
cd "$(dirname "$0")"
exec node node_modules/.bin/vite
