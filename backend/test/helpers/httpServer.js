// Helper de teste (NÃO define testes) — sobe o app Express real numa porta efêmera e
// devolve um cliente HTTP mínimo sobre o `fetch` global.
//
// POR QUE HTTP DE VERDADE, e não a invocação direta do handler que o resto da suíte usa:
// os seams existentes (`staleHandler`, `resolvedHandler`, `testCardHandler`) pulam a cadeia
// de middlewares — e é exatamente na cadeia que mora o que este helper precisa medir: quem
// passa pelo gate de autenticação, quem é barrado por papel, e em que ORDEM. Um seam de
// handler não consegue reprovar uma rota pública esquecida no PUBLIC_PATHS, porque nunca
// chega a executar o middleware que a barra.
//
// POR QUE SEM supertest: o `fetch` global existe desde o Node 18 (o package.json exige >= 20)
// e o Express já sabe escutar na porta 0. Uma dependência a mais na árvore de um projeto que
// está sendo auditado por vulnerabilidade de dependência precisa se pagar; esta não se pagaria.
const { once } = require('node:events');
const jwt = require('jsonwebtoken');

// Sobe o app numa porta efêmera. Devolve `{ request, close, port }`.
//
// O require de '../../src/app' é feito aqui dentro, e não no topo do arquivo, para que o
// require('./setup') do arquivo de teste sempre vença — em especial LOG_DIR e DB_PATH, que
// o app consome no load.
async function startServer() {
  const app = require('../../src/app');
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address();

  // request('/api/config', { method: 'PUT', token, body })
  // Devolve { status, body } — `body` já desserializado quando a resposta é JSON.
  async function request(routePath, options = {}) {
    const { method = 'GET', token = null, body = undefined } = options;

    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(`http://127.0.0.1:${port}${routePath}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // Sem isto o fetch segue o 302 de /api/track/click até a Agendor de verdade —
      // rede real dentro da suíte. O teste quer medir o redirecionamento, não segui-lo.
      redirect: 'manual',
    });

    const raw = await res.text();
    let parsed = raw;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      /* resposta não-JSON (redirect, html) — devolve o texto cru */
    }
    return { status: res.status, body: parsed, headers: res.headers };
  }

  async function close() {
    server.close();
    await once(server, 'close');
  }

  return { request, close, port };
}

// Token válido para `username`. Usa o mesmo JWT_SECRET que o setup.js injeta, então
// o token produzido aqui é aceito pelo middleware real — não é um stub.
function tokenFor(username) {
  return jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

module.exports = { startServer, tokenFor };
