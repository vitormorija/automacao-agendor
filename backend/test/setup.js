// Setup compartilhado dos testes.
//
// Este arquivo existe SOMENTE para neutralizar os efeitos colaterais de import
// dos módulos do backend antes que qualquer um deles seja carregado: secret.js
// falha no boot sem JWT_SECRET, db.js abre o SQLite no load, e agendor.js lê o
// token da Agendor. NÃO define nenhum teste (node:test descobre este arquivo,
// mas sem test() ele é um no-op inofensivo).
//
// NUNCA deve ler o backend/.env de produção: os valores aqui são descartáveis e
// sem significado em produção. Cada atribuição é guardada para só definir quando
// a variável estiver ausente — assim um teste individual pode sobrescrever antes
// (ex.: um DB_PATH em arquivo temporário para testar dedup) e vencer este preset.

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdef';
}

if (!process.env.DB_PATH) {
  process.env.DB_PATH = ':memory:';
}

if (!process.env.AGENDOR_TOKEN) {
  process.env.AGENDOR_TOKEN = 'test';
}
