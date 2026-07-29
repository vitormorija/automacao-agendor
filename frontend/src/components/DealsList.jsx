import { useState, useEffect, useRef } from 'react';
import {
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Search,
  MousePointerClick,
  Bell,
  CalendarClock,
  Download,
  Timer,
} from 'lucide-react';

const AUTO_REFRESH_SECONDS = 300; // 5 minutos

export default function DealsList() {
  const [deals, setDeals] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('deals_cache') || '[]');
    } catch {
      return [];
    }
  });
  const [notifiedMap, setNotifiedMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [staleDays, setStaleDays] = useState(15);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('todos');
  const [ownerFilter, setOwnerFilter] = useState('todos');
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(
    () => localStorage.getItem('deals_cache_time') || null,
  );
  const [timeToRefresh, setTimeToRefresh] = useState(null);
  const [sortBy, setSortBy] = useState('days_desc'); // days_desc | days_asc | name_asc

  const countdownRef = useRef(null);
  const fetchDealsRef = useRef(null);

  useEffect(() => {
    fetchNotifiedMap();
    if (localStorage.getItem('deals_cache_time')) startCountdown();
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  function startCountdown() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    let t = AUTO_REFRESH_SECONDS;
    setTimeToRefresh(t);
    countdownRef.current = setInterval(() => {
      t -= 1;
      setTimeToRefresh(t);
      if (t <= 0) {
        clearInterval(countdownRef.current);
        if (fetchDealsRef.current) fetchDealsRef.current();
      }
    }, 1000);
  }

  async function fetchNotifiedMap() {
    try {
      const r = await fetch('/api/notifications/notified-deals');
      const d = await r.json();
      setNotifiedMap(d || {});
    } catch {}
  }

  async function fetchDeals() {
    setLoading(true);
    setError(null);
    try {
      const [dealsRes, notifiedRes] = await Promise.all([
        fetch('/api/deals/stale'),
        fetch('/api/notifications/notified-deals'),
      ]);
      const d = await dealsRes.json();
      const n = await notifiedRes.json();
      if (d.error) throw new Error(d.error);
      setDeals(d.deals || []);
      setStaleDays(d.staleDays);
      setNotifiedMap(n || {});
      const now = new Date().toISOString();
      setLastUpdated(now);
      localStorage.setItem('deals_cache', JSON.stringify(d.deals || []));
      localStorage.setItem('deals_cache_time', now);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
    startCountdown();
  }

  // Mantém referência atualizada de fetchDeals para o countdown
  fetchDealsRef.current = fetchDeals;

  function exportCSV() {
    const headers = [
      'Negócio',
      'Empresa',
      'Responsável',
      'Email',
      'Etapa',
      'Funil',
      'Parado há (dias)',
      'Última atualização',
      'Tipo',
      'Link',
    ];
    const rows = filtered.map((d) => [
      d.title,
      d.organization || '',
      d.ownerName || '',
      d.ownerEmail || '',
      d.stage || '',
      d.funnel || '',
      d.daysSinceUpdate,
      new Date(d.updatedAt).toLocaleDateString('pt-BR'),
      d.dealType || '',
      d.webUrl || '',
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'),
      )
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `negocios-parados-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatCountdown(s) {
    if (s === null) return null;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  const owners = [
    ...new Set(deals.map((d) => d.ownerName).filter(Boolean)),
  ].sort();

  const filtered = deals
    .filter((d) => {
      if (
        search &&
        !d.title?.toLowerCase().includes(search.toLowerCase()) &&
        !d.ownerName?.toLowerCase().includes(search.toLowerCase()) &&
        !d.organization?.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      if (typeFilter !== 'todos' && d.dealType !== typeFilter) return false;
      if (ownerFilter !== 'todos' && d.ownerName !== ownerFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'days_desc') return b.daysSinceUpdate - a.daysSinceUpdate;
      if (sortBy === 'days_asc') return a.daysSinceUpdate - b.daysSinceUpdate;
      if (sortBy === 'name_asc') return a.title.localeCompare(b.title);
      return 0;
    });

  const futureTasks = filtered.filter((d) => d.hasFutureTask).length;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              Negócios parados
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Criados em 2026 • sem atualização há mais de {staleDays} dias • em
              andamento
            </p>
            {lastUpdated ? (
              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
                Atualizado às{' '}
                {new Date(lastUpdated).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {timeToRefresh !== null && !loading && (
                  <span className="inline-flex items-center gap-1 text-blue-500">
                    <Timer size={11} />
                    próxima atualização em {formatCountdown(timeToRefresh)}
                  </span>
                )}
              </p>
            ) : (
              <p className="text-xs text-amber-500 mt-0.5">
                Clique em "Atualizar" para carregar os dados
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Busca */}
            <div className="relative">
              <Search
                size={15}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
              />
            </div>
            {/* Filtro tipo */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="todos">Todos os tipos</option>
              <option value="Lead">🔵 Lead</option>
              <option value="Negócio">🟢 Negócio</option>
            </select>
            {/* Filtro responsável */}
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white max-w-44"
            >
              <option value="todos">Todos os responsáveis</option>
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            {/* Ordenar */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="days_desc">Mais parados primeiro</option>
              <option value="days_asc">Menos parados primeiro</option>
              <option value="name_asc">Nome A→Z</option>
            </select>
            {/* Exportar CSV */}
            {deals.length > 0 && (
              <button
                onClick={exportCSV}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                title="Exportar para Excel/CSV"
              >
                <Download size={14} /> Exportar
              </button>
            )}
            <button
              onClick={fetchDeals}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
            Buscando negócios no Agendor...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            {deals.length === 0 ? (
              <span>
                Clique em <strong>Atualizar</strong> para carregar os dados
              </span>
            ) : search ? (
              'Nenhum resultado para a busca.'
            ) : (
              '🎉 Nenhum negócio parado encontrado!'
            )}
          </div>
        ) : (
          <>
            <div className="text-xs text-gray-500 mb-3 flex flex-wrap items-center gap-3">
              <span className="font-medium">
                {filtered.length} negócio(s) encontrado(s)
              </span>
              {futureTasks > 0 && (
                <span className="inline-flex items-center gap-1 text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                  <CalendarClock size={11} /> {futureTasks} com tarefa agendada
                  (sem notificação)
                </span>
              )}
              {filtered.length !== deals.length && (
                <span className="text-gray-400">({deals.length} no total)</span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="text-left py-2 pr-4 font-medium">Negócio</th>
                    <th className="text-left py-2 pr-4 font-medium">Empresa</th>
                    <th className="text-left py-2 pr-4 font-medium">
                      Responsável
                    </th>
                    <th className="text-left py-2 pr-4 font-medium">Etapa</th>
                    <th className="text-left py-2 pr-4 font-medium">
                      Parado há
                    </th>
                    <th className="text-left py-2 pr-4 font-medium">
                      Última atualização
                    </th>
                    <th className="text-left py-2 pr-4 font-medium">
                      Notificação
                    </th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((deal) => (
                    <DealRow
                      key={deal.id}
                      deal={deal}
                      staleDays={staleDays}
                      notified={notifiedMap[deal.id]}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DealRow({ deal, staleDays, notified }) {
  const urgency =
    deal.daysSinceUpdate >= staleDays * 2
      ? 'text-red-600 bg-red-50'
      : deal.daysSinceUpdate >= staleDays * 1.5
        ? 'text-amber-600 bg-amber-50'
        : 'text-yellow-600 bg-yellow-50';

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="py-3 pr-4">
        <div className="font-medium text-gray-800 max-w-xs truncate">
          {deal.title}
        </div>
        <div className="text-xs text-gray-400">{deal.funnel}</div>
      </td>
      <td className="py-3 pr-4">
        <div className="text-gray-600">{deal.organization || '—'}</div>
        <span
          className={`inline-block mt-0.5 text-xs px-1.5 py-0.5 rounded-full font-medium ${
            deal.dealType === 'Lead'
              ? 'bg-blue-50 text-blue-600'
              : 'bg-green-50 text-green-700'
          }`}
        >
          {deal.dealType === 'Lead' ? '🔵 Lead' : '🟢 Negócio'}
        </span>
      </td>
      <td className="py-3 pr-4">
        <div className="text-gray-700">{deal.ownerName || '—'}</div>
        {deal.ownerEmail && (
          <div className="text-xs text-gray-400">{deal.ownerEmail}</div>
        )}
        {deal.authorName && deal.authorName !== deal.ownerName && (
          <div className="text-xs text-gray-400 mt-0.5">
            <span className="text-gray-300">criador: </span>
            {deal.authorName}
          </div>
        )}
      </td>
      <td className="py-3 pr-4 text-gray-600 text-xs">{deal.stage || '—'}</td>
      <td className="py-3 pr-4">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${urgency}`}
        >
          <AlertTriangle size={11} />
          {deal.daysSinceUpdate}d
        </span>
      </td>
      <td className="py-3 pr-4 text-gray-500 text-xs whitespace-nowrap">
        {new Date(deal.updatedAt).toLocaleDateString('pt-BR')}
      </td>
      <td className="py-3 pr-4">
        {deal.hasFutureTask ? (
          <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
            <CalendarClock size={11} /> Tarefa agendada
          </span>
        ) : notified ? (
          notified.clicked ? (
            <span className="inline-flex items-center gap-1 text-xs text-purple-600 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
              <MousePointerClick size={11} /> Notificado · clicou
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
              <Bell size={11} /> Notificado
            </span>
          )
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>
      <td className="py-3">
        <a
          href={deal.webUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-700 transition-colors"
          title="Abrir no Agendor"
        >
          <ExternalLink size={15} />
        </a>
      </td>
    </tr>
  );
}
