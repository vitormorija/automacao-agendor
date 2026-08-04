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
// O timeout NÃO entra no retry de 429 de fetchDealsPage (:101-117) e isso é deliberado: um
// erro de timeout não traz `err.response`, então a condição `err.response?.status === 429`
// é falsa e o erro já sai pelo `throw err`. Retentar timeouts faria o pior caso de uma única
// página saltar para ~60s, anulando o motivo de existir deste limite.
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

// Busca categoria de uma organização pelo ID (com cache)
const orgCategoryCache = {};
async function getOrgCategory(orgId) {
  if (!orgId) return null;
  if (orgCategoryCache[orgId] !== undefined) return orgCategoryCache[orgId];
  try {
    const { data } = await api.get(`/organizations/${orgId}`);
    const category = data.data?.category?.name || null;
    orgCategoryCache[orgId] = category;
    return category;
  } catch {
    orgCategoryCache[orgId] = null;
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
// Diferente de getOrgCategory (:35-47), NÃO engole a falha: quem absorve é o catch por item
// do Promise.all da rota, que já existe. Engolir aqui devolveria null e faria a rota tratar
// "não consegui consultar" como "não mudou nada" — sem nenhum sinal de que a consulta falhou.
async function getDealById(id) {
  const { data } = await api.get(`/deals/${id}`);
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

async function fetchDealsPage(page, perPage, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const { data } = await api.get('/deals', {
        params: { page, per_page: perPage, deal_status_id: 1 },
      });
      return data;
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
  await Promise.all(uniqueOrgIds.map((id) => getOrgCategory(id)));

  const allDeals = [];
  for (const deal of staleRaw) {
    const updatedAt = new Date(deal.updatedAt);
    const daysSinceUpdate = Math.floor(
      (Date.now() - updatedAt) / (1000 * 60 * 60 * 24),
    );
    const orgCategory = orgCategoryCache[deal.organization?.id] ?? null;

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
      const { data } = await api.get('/tasks', {
        params: { dueDateGt: yesterday, per_page: 100, page },
      });
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
      // O motivo é que scheduler.js:61 usa este Set como decisão de quem NÃO recebe
      // notificação (`staleDeals.filter((d) => !futureTasks.has(d.id))`). Engolir o erro
      // e devolver o que já foi coletado (o antigo `break`) faz deals que TÊM tarefa
      // futura agendada serem notificados indevidamente — e ninguém percebe, porque a
      // rodada termina "com sucesso". Falha explícita é preferível a proteção parcial:
      // a rejeição sobe até o catch de scheduler.js:171, que registra em results.error,
      // o finally de :174 libera o lock, e a rodada seguinte executa normalmente.
      // Só a mensagem é logada: o objeto de erro do axios carrega `config.headers`
      // com `Authorization: Token <AGENDOR_TOKEN>` (REL-06 / Decisão Q2).
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
