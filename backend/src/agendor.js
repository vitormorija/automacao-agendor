// Convenção (WR2-06): comentário referencia outro trecho por âncora nomeada — função, identificador,
// arquivo ou caso de teste —, nunca por número de linha, que se desloca no próprio commit que o escreve.
const axios = require('axios');
const logger = require('./logger');

const BASE_URL = 'https://api.agendor.com.br/v3';
const TOKEN = process.env.AGENDOR_TOKEN;

// Teto de tempo de TODA chamada à API Agendor (REL-01 / Decisão D-01). Sem `timeout` o
// axios espera indefinidamente: uma API lenta — não caída, lenta — trava o cron das 8h e o
// sistema para de notificar em silêncio. 15s é generoso para uma API que responde em menos
// de 1s no caminho normal, mas corta o travamento antes de comer a janela da rodada.
// Rejeitados 30s (o pior caso da execução completa cresce demais: são várias páginas mais
// uma chamada por organização única) e 10s (risco de desistir de respostas que chegariam em
// horário de pico).
//
// O timeout NÃO entra na política de retry de 429 da borda (fetchWithRetry, abaixo) e isso é
// deliberado: um erro de timeout não traz `err.response`, então a condição
// `err.response?.status === 429` é falsa e o erro já sai pelo `throw err`. Retentar timeouts
// faria o pior caso de uma única requisição saltar para ~60s, anulando o motivo de existir
// deste limite.
const api = axios.create({
  baseURL: BASE_URL,
  headers: { Authorization: `Token ${TOKEN}` },
  timeout: 15000,
});

// Teto de páginas das paginações que encerram por condição vinda da RESPOSTA (WR3-06):
// 200 páginas de 100 registros são 20.000 por borda, ordens de magnitude acima do uso real.
// Ele NÃO existe para limitar volume — existe para transformar uma não-terminação silenciosa
// numa falha legível em segundos. Exportado para que o teste (agendor.paginacao.test.js)
// DERIVE o número em vez de duplicar o literal, que continuaria verde se a constante mudasse.
const MAX_PAGES = 200;

// Teto de CONCORRÊNCIA da consulta de categoria por organização (WR4-04) — a única borda do
// módulo cujo NÚMERO de requisições é proporcional ao volume de dados. Ele NÃO reduz o total de
// requisições (cada organização única continua sendo consultada exatamente uma vez): reduz quantas
// estão EM VOO ao mesmo tempo. O valor é o dobro do `batchSize` da paginação de negócios porque
// uma consulta por id é muito mais barata que uma página de cem registros. Exportado para que o
// teste (agendor.loteDeOrganizacoes.test.js) DERIVE o número em vez de duplicar o literal.
const LOTE_DE_ORGS = 10;

// Busca todos os usuários com seus emails
async function getUsers() {
  const users = {};
  let page = 1;
  while (page <= MAX_PAGES) {
    const { data } = await fetchWithRetry(() =>
      api.get('/users', { params: { page, per_page: 100 } }),
    );
    // Guarda de envelope (WR4-05). Das três paginações do módulo esta era a ÚNICA sem fallback:
    // uma resposta bem-sucedida no envelope mas sem a chave `data` produzia um TypeError que não
    // é capturado em lugar nenhum desta função e subia pelo Promise.all de runCheck, abortando a
    // rodada ANTES do laço de envio. Resolver com o que a borda entregou é o desfecho certo —
    // sem `data` também não há `links.next`, então o laço encerra no `break` da mesma volta.
    for (const user of data.data || []) {
      users[user.id] = {
        id: user.id,
        name: user.name,
        email: user.contact?.email || null,
      };
    }
    if (!data.links?.next) break;
    page++;
  }
  // O caminho normal sai pelo `break` acima, com `page` ainda dentro do teto — só a
  // não-terminação chega aqui. A forma importa: um `break` no lugar deste `throw` devolveria
  // um dicionário PARCIAL, e um responsável ausente dele perde o e-mail em silêncio.
  //
  // Por que getStaleDeals TAMBÉM recebe teto (WR4-01): a redação anterior deste parágrafo dizia
  // que ela era limitada por construção, porque percorre um `for` sobre um array finito de
  // páginas. O array é finito, mas o seu COMPRIMENTO é derivado de `meta.totalCount`, um valor
  // que vem da RESPOSTA da borda — do mesmo lado da fronteira de onde vêm as condições de parada
  // das outras duas paginações. A premissa de regressão de terceiro que sustenta este teto cobre
  // igualmente aquele laço, e por isso a terceira borda passou a usar a MESMA constante.
  if (page > MAX_PAGES) {
    throw new Error(
      `[Agendor] paginação de /users excedeu ${MAX_PAGES} páginas — a borda pode estar ignorando o parâmetro page`,
    );
  }
  return users;
}

// Busca categoria de uma organização pelo ID, memoizando no `cache` DA EXECUÇÃO que chamou.
// O cache vem por parâmetro de propósito (CR2-01): não existe mais dicionário de módulo, e
// portanto não existe mais como o resultado de uma rodada atravessar para outra. Quem cria o
// cache é getStaleDeals — ver o comentário na fase de consulta de categorias, lá embaixo.
// O valor guardado continua sendo `string | null` — ver a sentinela CATEGORIA_INDECIDIVEL,
// declarada mais abaixo, que é uma string justamente para não mudar essa forma.
//
// A consulta passa pela política ÚNICA de retry da borda (fetchWithRetry, mais abaixo neste
// mesmo arquivo). Ela é declarada DEPOIS daqui e isso é intencional: `async function` é içada,
// e reordenar o módulo produziria um diff enorme sobre um arquivo que é oráculo de meia dúzia
// de testes.
//
// Por que o catch deixou de devolver `null` (CR3-01): dos cinco filtros de elegibilidade de
// getStaleDeals, quatro decidem pelo payload do próprio negócio e não podem falhar. Só a
// exclusão por categoria depende de uma segunda chamada HTTP — esta — e ela falhava na direção
// INSEGURA: `EXCLUDED_CATEGORIES.includes(null)` é `false`, então um 429 transitório fazia uma
// organização 'Parceiro' ser notificada, com a rodada reportando sucesso e sem vestígio nenhum.
// A decisão do usuário (2026-08-05) é retry primeiro e, persistindo a falha, negócio
// INDECIDÍVEL — fora do envio, dentro do painel. Abortar a rodada inteira por uma organização
// inatingível foi explicitamente REJEITADO.
//
// A guarda `!orgId` continua devolvendo `null`, e não a sentinela: negócio sem organização não
// tem consulta a falhar — é sem categoria, não indecidível. Oráculo dos dois caminhos:
// backend/test/agendor.categoriaIndecidivel.test.js.
async function getOrgCategory(orgId, cache) {
  if (!orgId) return null;
  if (cache.has(orgId)) return cache.get(orgId);
  try {
    const { data } = await fetchWithRetry(() =>
      api.get(`/organizations/${orgId}`),
    );
    const category = data.data?.category?.name || null;
    cache.set(orgId, category);
    return category;
  } catch {
    cache.set(orgId, CATEGORIA_INDECIDIVEL);
    return CATEGORIA_INDECIDIVEL;
  }
}

// Busca um negócio pelo ID, devolvendo o conteúdo já desembrulhado do envelope da Agendor.
//
// Existe para que routes/notifications.js não conheça a borda HTTP: até o 04-03 a rota
// GET /api/notifications/resolved montava a url absoluta e o header `Authorization` na mão
// (um `axios.get` cru), o que a deixava FORA desta instância — e portanto sem o timeout de
// 15s acima. Centralizar a chamada aqui é o que impede esse ponto órfão de reaparecer: quem
// quiser consultar um deal usa getDealById e herda baseURL, header e teto de tempo de graça.
//
// Diferente de getOrgCategory, logo acima, NÃO engole a falha: quem absorve é o catch por item
// do Promise.all da rota, que já existe. Engolir aqui devolveria null e faria a rota tratar
// "não consegui consultar" como "não mudou nada" — sem nenhum sinal de que a consulta falhou.
async function getDealById(id) {
  // Guarda de tipo ANTES de qualquer requisição (WR-03). O chamador de produção lê o id de
  // `notification_log.deal_id`, coluna com afinidade `INTEGER` mas em tabela SEM `STRICT` —
  // texto sobrevive nela — e um dos escritores dessa coluna é o CORPO de uma requisição
  // autenticada (`POST /api/notifications/test-card`). Sem esta guarda, um valor como
  // `'../users'` compõe o path relativo e faz a consulta sair para OUTRO recurso da Agendor,
  // com o token de serviço no header. `Number()` (e não `parseInt`) porque a normalização tem
  // de aceitar a string numérica que o SQLite devolve e recusar `'101abc'`; o path abaixo
  // interpola o número já convertido, nunca o argumento cru.
  const dealId = Number(id);
  if (!Number.isInteger(dealId) || dealId <= 0) {
    throw new Error(`[Agendor] id de negócio inválido: ${String(id)}`);
  }
  const { data } = await fetchWithRetry(() => api.get(`/deals/${dealId}`));
  return data.data || null;
}

const INACTIVE_CATEGORY = 'Inativo (sem resposta)';

// Sentinela de categoria INDECIDÍVEL (CR3-01): o valor que getOrgCategory devolve quando a
// consulta falhou mesmo depois do retry — "não sei", que é diferente de "não tem categoria".
// É uma STRING, e não um Symbol ou um objeto, pelo mesmo motivo estrutural de D-05: o valor
// guardado no cache da execução continua sendo `string | null`, então nenhum leitor daquele
// Map muda de forma. O par de sublinhados nas pontas torna a colisão com uma categoria real
// cadastrada no Agendor uma impossibilidade prática. Exportada para que os testes a citem sem
// duplicar o literal (agendor.categoriaIndecidivel.test.js).
const CATEGORIA_INDECIDIVEL = '__categoria_indecidivel__';

const EXCLUDED_CATEGORIES = [
  'Inativo (sem resposta)',
  'Parceiro',
  'Fornecedor',
];
const NEGOCIO_CATEGORIES = ['Cliente', 'Cliente Ouro', 'Cliente Bronze'];
const EXCLUDED_OWNERS = ['Maria Lobato'];

// Funis cujos cards aparecem nos relatórios/dashboard, mas NÃO disparam
// notificações para o responsável do card. A Beefor é uma empresa do grupo Cadmus
// com produto próprio — o vendedor da Cadmus pode ser dono da organização sem ser
// responsável por acompanhar oportunidades no funil Beefor.
const NO_OWNER_NOTIFY_FUNNELS = ['beefor'];

function shouldNotifyOwner(deal) {
  const funnel = (deal?.funnel || '').trim().toLowerCase();
  return !NO_OWNER_NOTIFY_FUNNELS.includes(funnel);
}

// Prefixos/palavras que indicam que o deal foi encerrado/congelado.
// Usamos correspondência parcial para cobrir variações de gênero e composições:
// perdido, perdida, oportunidade perdida, ganho, ganha, congelado, congelada, etc.
const EXCLUDED_STAGE_WORDS = [
  'perd',
  'ganh',
  'congelad',
  'suspenso',
  'suspend',
  'arquivad',
  'encerrad',
  'cancelad',
];

// Retorna true se o nome da etapa indica encerramento/congelamento.
// Extraído sem alterar a lógica: correspondência parcial (substring) sobre o
// nome normalizado (minúsculo, sem acentos). O regex de marcas de combinação
// (U+0300–U+036F) é copiado byte-a-byte do trecho inline original — NÃO reescrever.
function isExcludedStage(rawStageName) {
  const stageName = (rawStageName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return EXCLUDED_STAGE_WORDS.some((w) => stageName.includes(w));
}

function getDealType(orgCategory) {
  if (!orgCategory || orgCategory === 'Lead') return 'Lead';
  if (NEGOCIO_CATEGORIES.includes(orgCategory)) return 'Negócio';
  return 'Lead'; // Concorrente, ExCliente, Referência Linkedin, Indefinido → Lead
}

// Política ÚNICA de retry da borda Agendor (WR-02). Só HTTP 429 é retentado, porque é o único
// erro que a API sinaliza como "tente de novo"; um erro sem `err.response` — timeout de client,
// D-01 — não entra aqui de propósito, e retentá-lo levaria o pior caso de uma requisição de ~15s
// para ~60s, comendo a janela do cron.
//
// ÚNICA porque TODAS as chamadas HTTP do módulo passam por aqui — não porque é o único laço de
// retry escrito. A distinção não é retórica: enquanto este bloco dizia apenas "única", o helper
// cobria DUAS das cinco chamadas, e ninguém foi procurar as que faltavam (WR3-01). Daí a lista,
// que é o que torna a afirmação conferível — cada borda abaixo tem exatamente um ponto de
// chamada neste arquivo:
//
//   1. `/deals`             — paginação de negócios, em fetchDealsPage           (WR-02)
//   2. `/tasks`             — paginação de tarefas futuras, em getDealsWithFutureTasks (WR-02)
//   3. `/organizations/:id` — categoria da organização, em getOrgCategory        (CR3-01)
//   4. `/users`             — paginação de usuários, em getUsers                 (WR3-01)
//   5. `/deals/:id`         — consulta de um negócio por id, em getDealById      (WR3-01)
//
// Quem acrescentar uma sexta borda ao módulo acrescenta uma linha aqui, ou deixa esta lista
// mentindo do mesmo jeito que a palavra "única" mentiu.
//
// Por que um helper e não uma cópia do laço por borda: as cinco precisam exatamente da mesma
// regra, e três delas — `/deals`, `/tasks` e `/users` — saem no MESMO `Promise.all` de runCheck
// (scheduler.js), o que torna o 429 provável justamente ali. Desde o fail-safe de REL-06,
// qualquer falha de `/tasks` ou de `/users` ABORTA a rodada inteira antes do laço de envio.
// Como o cron é diário, um 429 transitório em qualquer uma delas custa 24 horas sem nenhuma
// notificação, em silêncio. Duplicar a regra dentro do MESMO módulo e da MESMA borda criaria um
// segundo lugar para ela divergir — o número de tentativas ou o tempo de espera mudaria em um
// consumidor e não no outro, e ninguém perceberia até a rodada sumir.
//
// Das cinco bordas acima, `/organizations/:id` é a ÚNICA cujo NÚMERO de chamadas é proporcional ao
// volume de dados — uma por organização única dos negócios parados —, e por isso é a única em que
// retentar em massa prolonga a própria janela de rate limit que causou a falha. É dela, e só dela,
// o teto de concorrência declarado junto da fase de categorias em getStaleDeals (LOTE_DE_ORGS).
//
// O que passar por aqui NÃO ganha: validação. A guarda de tipo do id em getDealById fica ACIMA
// da chamada, fora do callback, de propósito (WR-03 / D-WR3-01-b) — movê-la para dentro faria um
// id hostil sair três vezes pela instância compartilhada, com o token no header, em vez de
// nenhuma. Oráculos: agendor.retry429.test.js casos (5) a (8) e dealId.validation.test.js.
async function fetchWithRetry(fn, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err.response?.status === 429 && attempt < retries - 1) {
        const wait = (attempt + 1) * 5000;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
}

async function fetchDealsPage(page, perPage, retries = 3) {
  const { data } = await fetchWithRetry(
    () =>
      api.get('/deals', {
        params: { page, per_page: perPage, deal_status_id: 1 },
      }),
    retries,
  );
  return data;
}

// Busca negócios criados a partir de 2026, em andamento, com paginação paralela
async function getStaleDeals(staleDays = 15) {
  const cutoffDate = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
  const startOf2026 = new Date('2026-01-01T00:00:00.000Z');
  const perPage = 100;

  // Busca página 1 para saber o total
  const firstPage = await fetchDealsPage(1, perPage);
  const totalCount = firstPage.meta?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / perPage);

  // Teto da TERCEIRA paginação (WR4-01). O array de páginas é finito, mas o seu COMPRIMENTO vem
  // de `meta.totalCount`, um valor da RESPOSTA: a mesma premissa de regressão de borda que
  // sustenta o teto das outras duas paginações cobre igualmente esta. A verificação vem ANTES do
  // `Array.from` de propósito — um total anunciado grande aloca o array inteiro antes de qualquer
  // requisição, e essa alocação sozinha já é um modo de falha contra o `max_memory_restart` do
  // ecosystem.config.js. E a forma é `throw`, nunca `Math.min(totalPages, MAX_PAGES)`: truncar
  // trocaria a não-terminação por um resultado PARCIAL silencioso — a mesma direção de falha,
  // só que mais difícil de perceber.
  if (totalPages > MAX_PAGES) {
    throw new Error(
      `[Agendor] /deals anunciou ${totalPages} páginas (> ${MAX_PAGES}) — meta.totalCount não parece corresponder ao filtro enviado`,
    );
  }

  // Busca todas as páginas restantes em paralelo, em lotes de `batchSize`. O número deixou de ser
  // ESCRITO aqui (WR4-04 / IN4-01): a frase anterior citava o valor do OUTRO lote do módulo, e com
  // dois lotes no mesmo arquivo um comentário que atribui a um o valor do outro torna os dois
  // indistinguíveis para o próximo leitor. Quem quiser o número lê o identificador logo abaixo.
  const allRawDeals = [...(firstPage.data || [])];
  const remainingPages = Array.from(
    { length: totalPages - 1 },
    (_, i) => i + 2,
  );
  const batchSize = 5;
  for (let i = 0; i < remainingPages.length; i += batchSize) {
    const batch = remainingPages.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((p) => fetchDealsPage(p, perPage)),
    );
    results.forEach((r) => allRawDeals.push(...(r.data || [])));
    if (i + batchSize < remainingPages.length)
      await new Promise((r) => setTimeout(r, 1000));
  }

  // Filtra stale deals
  const staleRaw = allRawDeals.filter((deal) => {
    const createdAt = new Date(deal.createdAt);
    const updatedAt = new Date(deal.updatedAt);
    return createdAt >= startOf2026 && updatedAt < cutoffDate;
  });

  // Busca categorias de todas as orgs únicas em paralelo
  const uniqueOrgIds = [
    ...new Set(staleRaw.map((d) => d.organization?.id).filter(Boolean)),
  ];
  // Cache de categorias POR EXECUÇÃO (REL-04 / Decisão D-05 / CR2-01). Ele nasce aqui dentro
  // e morre com a rodada que o criou. É isso que entrega REL-04: uma organização
  // recategorizada no Agendor vale já na execução seguinte, porque a seguinte não tem nada
  // herdado para servir; e a sentinela CATEGORIA_INDECIDIVEL que o catch de getOrgCategory
  // grava num erro transitório morre junto com a execução que falhou, em vez de decidir quem
  // OUTRA rodada notifica. (Até CR3-01 o valor gravado ali era `null`, e o problema não era o
  // isolamento — era a direção da falha: `null` atravessava EXCLUDED_CATEGORIES.)
  //
  // NÃO existe mais limpeza na entrada desta função porque não existe mais estado
  // compartilhado para limpar. Enquanto o cache era um dicionário de módulo, a limpeza podia
  // ser VENCIDA por uma escrita tardia: uma execução ainda em voo gravava sua categoria (ou
  // o `null` do seu erro) DEPOIS de a rodada vizinha ter limpado, a vizinha lia esse valor
  // sem consultar a API, `EXCLUDED_CATEGORIES.includes(null)` dava `false` e uma organização
  // 'Parceiro' era notificada por uma rodada que não falhou em nada (CR2-01). Agora o
  // refetch entre execuções é estrutural, e não uma corrida que dá para perder. As duas
  // direções do entrelaçamento estão pinadas por backend/test/agendor.cacheConcurrency.test.js,
  // e o refetch entre rodadas sequenciais por backend/test/agendor.cacheInvalidation.test.js.
  //
  // A eficiência dentro da rodada não muda: o Promise.all abaixo percorre `uniqueOrgIds`, que
  // já deduplicou as organizações antes de qualquer consulta — uma chamada por organização
  // única, nunca uma por deal.
  const cacheDaExecucao = new Map();

  // Teto de CONCORRÊNCIA desta fase (WR4-04 / LOTE_DE_ORGS). A concorrência é limitada AQUI e não
  // nas outras bordas porque esta é a única do módulo cujo número de requisições cresce com o dado:
  // uma chamada por organização única, e não um número fixo de páginas. Desde CR3-01 cada uma
  // dessas chamadas passa por fetchWithRetry, então sob HTTP 429 cada requisição vira três — e o
  // erro retentado é justamente o pedido da API por menos tráfego, de modo que um fan-out sem teto
  // PROLONGA a própria janela de rate limit que o causou. Some-se que getStaleDeals é também o
  // caminho de LEITURA do painel (routes/deals.js, routes/reports.js e runCheckOnly), então esse
  // custo aparecia a cada atualização de tela, não só na rodada das 8 h. O oráculo do teto é
  // agendor.loteDeOrganizacoes.test.js, que mede CONCORRÊNCIA EM VOO: uma "otimização" que volte ao
  // Promise.all único sobre uniqueOrgIds fica vermelha lá.
  const categoriaPorOrg = new Map();
  for (let i = 0; i < uniqueOrgIds.length; i += LOTE_DE_ORGS) {
    const lote = uniqueOrgIds.slice(i, i + LOTE_DE_ORGS);
    const pares = await Promise.all(
      lote.map(async (id) => [id, await getOrgCategory(id, cacheDaExecucao)]),
    );
    for (const [id, categoria] of pares) categoriaPorOrg.set(id, categoria);
  }

  const allDeals = [];
  for (const deal of staleRaw) {
    const updatedAt = new Date(deal.updatedAt);
    const daysSinceUpdate = Math.floor(
      (Date.now() - updatedAt) / (1000 * 60 * 60 * 24),
    );
    // Tradução da sentinela (CR3-01). A informação nova viaja num campo NOVO em vez de num
    // valor especial de `orgCategory` porque os agrupamentos de routes/reports.js e de
    // runWeeklySummary leem `d.orgCategory || 'Indefinido'`: mudar a semântica daquele campo
    // reescreveria relatórios que este conserto não quer tocar. Reduzido a `null`, o campo
    // antigo entrega exatamente os tipos de hoje a EXCLUDED_CATEGORIES e a getDealType.
    const categoriaBruta = categoriaPorOrg.get(deal.organization?.id) ?? null;
    const categoriaIndecidivel = categoriaBruta === CATEGORIA_INDECIDIVEL;
    const orgCategory = categoriaIndecidivel ? null : categoriaBruta;

    if (EXCLUDED_CATEGORIES.includes(orgCategory)) continue;
    if (EXCLUDED_OWNERS.includes(deal.owner?.name)) continue;

    // Exclui deals cuja etapa indica encerramento/congelamento
    // Verifica também o status direto do deal (deal_status_id: 2=Ganho, 3=Perdido, 4=Congelado)
    const dealStatusId = deal.dealStatus?.id || deal.status?.id || null;
    if (dealStatusId && dealStatusId !== 1) continue;

    if (isExcludedStage(deal.dealStage?.name)) continue;

    // Único vestígio operacional da falha de categoria — o defeito de CR3-01 era justamente
    // não deixar nenhum. Loga NOME e id da organização e o id do negócio; NUNCA o objeto de
    // erro do axios, que carrega `config.headers` com o AGENDOR_TOKEN (mesma regra de CR-02).
    // Mora aqui, e não em getOrgCategory, porque quem conhece o nome da organização é o laço
    // de enriquecimento — getOrgCategory só recebe o id. E vem depois dos demais filtros para
    // que só negócios que de fato entram na lista gerem uma linha de log.
    if (categoriaIndecidivel) {
      logger.warn(
        `[Agendor] Categoria indecidível: a organização "${deal.organization?.name}" (id ${deal.organization?.id}) não pôde ser consultada. O negócio ${deal.id} fica FORA do envio e permanece no painel.`,
      );
    }

    allDeals.push({
      id: deal.id,
      title: deal.title?.trim(),
      ownerId: deal.owner?.id || null,
      ownerName: deal.owner?.name || null,
      authorId: deal.author?.id || null,
      authorName: deal.author?.name || null,
      organization: deal.organization?.name || null,
      orgCategory,
      categoriaIndecidivel,
      dealType: getDealType(orgCategory),
      stage: deal.dealStage?.name || null,
      funnel: deal.dealStage?.funnel?.name || null,
      createdAt: deal.createdAt,
      updatedAt: deal.updatedAt,
      daysSinceUpdate,
      webUrl: deal._webUrl,
    });
  }

  return allDeals;
}

// Busca IDs de deals que possuem tarefas abertas com prazo futuro
// Esses deals devem ser ignorados nas notificações de "negócio parado"
async function getDealsWithFutureTasks() {
  const now = new Date();
  const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const dealIds = new Set();

  let page = 1;
  while (page <= MAX_PAGES) {
    try {
      const { data } = await fetchWithRetry(() =>
        api.get('/tasks', {
          params: { dueDateGt: yesterday, per_page: 100, page },
        }),
      );
      const tasks = data.data || [];
      if (!tasks.length) break;

      for (const t of tasks) {
        // Apenas tarefas não finalizadas com prazo estritamente no futuro
        if (!t.finishedAt && t.deal?.id && new Date(t.dueDate) > now) {
          dealIds.add(t.deal.id);
        }
      }

      if (tasks.length < 100) break;
      page++;
      // Contrato desta função: o Set é COMPLETO ou a chamada FALHA — nunca parcial.
      // O motivo é que runCheck, em scheduler.js, usa este Set como decisão de quem NÃO recebe
      // notificação (`staleDeals.filter((d) => !futureTasks.has(d.id))`). Engolir o erro
      // e devolver o que já foi coletado (o antigo `break`) faz deals que TÊM tarefa
      // futura agendada serem notificados indevidamente — e ninguém percebe, porque a
      // rodada termina "com sucesso". Falha explícita é preferível a proteção parcial:
      // a rejeição sobe até o catch externo de runCheck (scheduler.js), que registra em
      // results.error; o finally daquele mesmo try libera o lock `isRunning`, e a rodada
      // seguinte executa normalmente.
      // Só a mensagem é logada: o objeto de erro do axios carrega `config.headers`
      // com `Authorization: Token <AGENDOR_TOKEN>` (REL-06 / Decisão Q2).
      //
      // A partir do WR-02 a requisição acima passa pela política de retry da borda: um HTTP 429
      // é retentado ANTES de a falha virar explícita, e só a EXAUSTÃO das tentativas aborta a
      // rodada. Isso não afrouxa o contrato — retentar não é engolir: o Set continua saindo
      // completo ou não saindo.
    } catch (err) {
      logger.error('[Agendor] Erro ao buscar tarefas futuras:', err.message);
      throw err;
    }
  }

  // FORA do try acima de propósito (WR3-06): o catch existe para logar e relançar erros da
  // borda, e esta mensagem já é explícita — passar por ele só duplicaria a linha de log.
  // Propagar é coerente com o contrato desta função ("Set completo ou falha explícita",
  // Decisão Q2): a rejeição sobe ao catch EXTERNO de runCheck (scheduler.js), cujo `finally`
  // libera o lock `isRunning` — que é exatamente o que a não-terminação impedia de acontecer.
  if (page > MAX_PAGES) {
    throw new Error(
      `[Agendor] paginação de /tasks excedeu ${MAX_PAGES} páginas — a borda pode estar ignorando o parâmetro page`,
    );
  }

  console.log(`[Agendor] ${dealIds.size} deals protegidos por tarefa futura`);
  return dealIds;
}

module.exports = {
  CATEGORIA_INDECIDIVEL,
  MAX_PAGES,
  LOTE_DE_ORGS,
  getUsers,
  getStaleDeals,
  getDealById,
  getDealsWithFutureTasks,
  shouldNotifyOwner,
  getDealType,
  isExcludedStage,
};
