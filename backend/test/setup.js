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

// DIFERENTEMENTE dos presets guardados acima, estas duas variáveis são SEMPRE
// sobrescritas (sem guarda). Nenhum teste precisa de valores reais de SMTP_PASS
// ou ADMIN_EMAIL, e um segredo exportado no shell/CI jamais deve vazar para o
// SQLite de teste que o db.js semeia a partir dessas variáveis (db.js:102,106).
// String vazia é o valor inerte pretendido para ambas.
process.env.SMTP_PASS = '';
process.env.ADMIN_EMAIL = '';

// Também SEM guarda, e pelo mesmo motivo de segurança-por-inércia: a suíte tem
// de rodar SEMPRE no ramo de "não-produção". A validação centralizada de
// configuração (src/config.js, D-05) só derruba o processo quando
// NODE_ENV === 'production'; um NODE_ENV=production exportado no shell do
// desenvolvedor ou herdado do CI faria require('../src/config') LANÇAR e quebrar
// testes que nada têm a ver com produção. 'test' é o valor inerte pretendido.
process.env.NODE_ENV = 'test';
