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

// Busca todos os usuários com seus emails
async function getUsers() {
  const users = {};
  let page = 1;
  while (true) {
    const { data } = await api.get('/users', {
      params: { page, per_page: 100 },
    });
    for (const user of data.data) {
      users[user.id] = {
        id: user.id,
        name: user.name,
        email: user.contact?.email || null,
      };
    }
    if (!data.links?.next) break;
    page++;
  }
  return users;
}

// Busca categoria de uma organização pelo ID, memoizando no `cache` DA EXECUÇÃO que chamou.
// O cache vem por parâmetro de propósito (CR2-01): não existe mais dicionário de módulo, e
// portanto não existe mais como o resultado de uma rodada atravessar para outra. Quem cria o
// cache é getStaleDeals — ver o comentário na fase de consulta de categorias, lá embaixo.
// O valor guardado continua sendo `string | null`, e a falha continua sendo ENGOLIDA: o
// `null` do catch é a categoria "desconhecida" daquela execução, e só dela.
async function getOrgCategory(orgId, cache) {
  if (!orgId) return null;
  if (cache.has(orgId)) return cache.get(orgId);
  try {
    const { data } = await api.get(`/organizations/${orgId}`);
    const category = data.data?.category?.name || null;
    cache.set(orgId, category);
    return category;
  } catch {
    cache.set(orgId, null);
    return null;
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
  const { data } = await api.get(`/deals/${dealId}`);
  return data.data || null;
}

const INACTIVE_CATEGORY = 'Inativo (sem resposta)';
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
// Por que um helper e não uma segunda cópia do laço: a consulta de tarefas futuras, em
// getDealsWithFutureTasks (neste mesmo arquivo, mais abaixo), precisa
// exatamente da mesma regra, e desde o fail-safe de REL-06 qualquer falha dela ABORTA a rodada
// inteira. Como o cron é diário, um 429 transitório lá custa 24 horas sem nenhuma notificação, em
// silêncio. Duplicar a regra dentro do MESMO módulo e da MESMA borda criaria um segundo lugar
// para ela divergir — o número de tentativas ou o tempo de espera mudaria em um consumidor e não
// no outro, e ninguém perceberia até a rodada sumir.
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

  // Busca todas as páginas restantes em paralelo (batches de 10)
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
  // herdado para servir; e o `null` que o catch de getOrgCategory grava num erro transitório
  // morre junto com a execução que falhou, em vez de decidir quem OUTRA rodada notifica.
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
  const categoriaPorOrg = new Map(
    await Promise.all(
      uniqueOrgIds.map(async (id) => [
        id,
        await getOrgCategory(id, cacheDaExecucao),
      ]),
    ),
  );

  const allDeals = [];
  for (const deal of staleRaw) {
    const updatedAt = new Date(deal.updatedAt);
    const daysSinceUpdate = Math.floor(
      (Date.now() - updatedAt) / (1000 * 60 * 60 * 24),
    );
    const orgCategory = categoriaPorOrg.get(deal.organization?.id) ?? null;

    if (EXCLUDED_CATEGORIES.includes(orgCategory)) continue;
    if (EXCLUDED_OWNERS.includes(deal.owner?.name)) continue;

    // Exclui deals cuja etapa indica encerramento/congelamento
    // Verifica também o status direto do deal (deal_status_id: 2=Ganho, 3=Perdido, 4=Congelado)
    const dealStatusId = deal.dealStatus?.id || deal.status?.id || null;
    if (dealStatusId && dealStatusId !== 1) continue;

    if (isExcludedStage(deal.dealStage?.name)) continue;

    allDeals.push({
      id: deal.id,
      title: deal.title?.trim(),
      ownerId: deal.owner?.id || null,
      ownerName: deal.owner?.name || null,
      authorId: deal.author?.id || null,
      authorName: deal.author?.name || null,
      organization: deal.organization?.name || null,
      orgCategory,
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
  while (true) {
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

  console.log(`[Agendor] ${dealIds.size} deals protegidos por tarefa futura`);
  return dealIds;
}

module.exports = {
  getUsers,
  getStaleDeals,
  getDealById,
  getDealsWithFutureTasks,
  shouldNotifyOwner,
  getDealType,
  isExcludedStage,
};
