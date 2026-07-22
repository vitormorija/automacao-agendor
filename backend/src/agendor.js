const axios = require('axios');

const BASE_URL = 'https://api.agendor.com.br/v3';
const TOKEN = process.env.AGENDOR_TOKEN;

const api = axios.create({
  baseURL: BASE_URL,
  headers: { Authorization: `Token ${TOKEN}` },
});

// Busca todos os usuários com seus emails
async function getUsers() {
  const users = {};
  let page = 1;
  while (true) {
    const { data } = await api.get('/users', { params: { page, per_page: 100 } });
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

const INACTIVE_CATEGORY = 'Inativo (sem resposta)';
const EXCLUDED_CATEGORIES = ['Inativo (sem resposta)', 'Parceiro', 'Fornecedor'];
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
const EXCLUDED_STAGE_WORDS = ['perd', 'ganh', 'congelad', 'suspenso', 'suspend', 'arquivad', 'encerrad', 'cancelad'];

// Retorna true se o nome da etapa indica encerramento/congelamento.
// Extraído sem alterar a lógica: correspondência parcial (substring) sobre o
// nome normalizado (minúsculo, sem acentos). O regex de marcas de combinação
// (U+0300–U+036F) é copiado byte-a-byte do trecho inline original — NÃO reescrever.
function isExcludedStage(rawStageName) {
  const stageName = (rawStageName || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return EXCLUDED_STAGE_WORDS.some(w => stageName.includes(w));
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
        await new Promise(r => setTimeout(r, wait));
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
  const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
  const batchSize = 5;
  for (let i = 0; i < remainingPages.length; i += batchSize) {
    const batch = remainingPages.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(p => fetchDealsPage(p, perPage)));
    results.forEach(r => allRawDeals.push(...(r.data || [])));
    if (i + batchSize < remainingPages.length) await new Promise(r => setTimeout(r, 1000));
  }

  // Filtra stale deals
  const staleRaw = allRawDeals.filter(deal => {
    const createdAt = new Date(deal.createdAt);
    const updatedAt = new Date(deal.updatedAt);
    return createdAt >= startOf2026 && updatedAt < cutoffDate;
  });

  // Busca categorias de todas as orgs únicas em paralelo
  const uniqueOrgIds = [...new Set(staleRaw.map(d => d.organization?.id).filter(Boolean))];
  await Promise.all(uniqueOrgIds.map(id => getOrgCategory(id)));

  const allDeals = [];
  for (const deal of staleRaw) {
    const updatedAt = new Date(deal.updatedAt);
    const daysSinceUpdate = Math.floor((Date.now() - updatedAt) / (1000 * 60 * 60 * 24));
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
    } catch (err) {
      console.error('[Agendor] Erro ao buscar tarefas futuras:', err.message);
      break;
    }
  }

  console.log(`[Agendor] ${dealIds.size} deals protegidos por tarefa futura`);
  return dealIds;
}

module.exports = { getUsers, getStaleDeals, getDealsWithFutureTasks, shouldNotifyOwner, getDealType, isExcludedStage };
