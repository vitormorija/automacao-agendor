import { useState, useEffect } from 'react';
import {
  RefreshCw,
  TrendingUp,
  Users,
  Tag,
  GitBranch,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from 'recharts';

const COLORS = [
  '#1a56db',
  '#0ea5e9',
  '#8b5cf6',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#ec4899',
  '#64748b',
];

const URGENCY_COLORS = {
  '15–20 dias': '#fbbf24',
  '21–30 dias': '#f97316',
  '31–45 dias': '#ef4444',
  '46–60 dias': '#b91c1c',
  '60+ dias': '#7f1d1d',
};

export default function ReportPanel() {
  const [data, setData] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('report_cache') || 'null');
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('todos');
  const [ownerFilter, setOwnerFilter] = useState('todos');
  const [lastUpdated, setLastUpdated] = useState(
    () => localStorage.getItem('report_cache_time') || null,
  );

  async function fetchReport() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/reports/current');
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setData(d);
      const now = new Date().toISOString();
      setLastUpdated(now);
      localStorage.setItem('report_cache', JSON.stringify(d));
      localStorage.setItem('report_cache_time', now);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  if (!data && loading)
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <RefreshCw size={28} className="animate-spin mb-3" />
        <span className="text-sm">
          Carregando relatório... (pode levar alguns segundos)
        </span>
      </div>
    );

  if (!data)
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-4">
        <TrendingUp size={36} className="text-gray-300" />
        <div className="text-center">
          <p className="text-sm font-medium text-gray-600">
            Nenhum dado carregado ainda
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Clique em "Carregar relatório" para buscar os dados
          </p>
        </div>
        <button
          onClick={fetchReport}
          disabled={loading}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Carregar relatório
        </button>
      </div>
    );

  if (error && !data)
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-5">
        {error}
      </div>
    );

  const allDeals = data.deals || [];
  const owners = [
    ...new Set(allDeals.map((d) => d.ownerName).filter(Boolean)),
  ].sort();

  const filteredDeals = allDeals.filter((d) => {
    if (typeFilter !== 'todos' && d.dealType !== typeFilter) return false;
    if (ownerFilter !== 'todos' && d.ownerName !== ownerFilter) return false;
    return true;
  });

  // Recalcula dados com base no filtro
  const buildOwnerData = (deals) => {
    const map = {};
    for (const d of deals) {
      const name = d.ownerName || 'Sem responsável';
      if (!map[name]) map[name] = { name, count: 0, totalDays: 0 };
      map[name].count++;
      map[name].totalDays += d.daysSinceUpdate;
    }
    return Object.values(map)
      .sort((a, b) => b.count - a.count)
      .map((o) => ({ ...o, avgDays: Math.round(o.totalDays / o.count) }));
  };

  const buildCategoryData = (deals) => {
    const map = {};
    for (const d of deals) {
      const c = d.orgCategory || 'Indefinido';
      map[c] = (map[c] || 0) + 1;
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  };

  const buildFunnelData = (deals) => {
    const map = {};
    for (const d of deals) {
      const f = d.funnel || 'Sem funil';
      map[f] = (map[f] || 0) + 1;
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  };

  const buildUrgencyData = (deals) => [
    {
      label: '15–20 dias',
      count: deals.filter(
        (d) => d.daysSinceUpdate >= 15 && d.daysSinceUpdate <= 20,
      ).length,
    },
    {
      label: '21–30 dias',
      count: deals.filter(
        (d) => d.daysSinceUpdate >= 21 && d.daysSinceUpdate <= 30,
      ).length,
    },
    {
      label: '31–45 dias',
      count: deals.filter(
        (d) => d.daysSinceUpdate >= 31 && d.daysSinceUpdate <= 45,
      ).length,
    },
    {
      label: '46–60 dias',
      count: deals.filter(
        (d) => d.daysSinceUpdate >= 46 && d.daysSinceUpdate <= 60,
      ).length,
    },
    {
      label: '60+ dias',
      count: deals.filter((d) => d.daysSinceUpdate > 60).length,
    },
  ];

  const ownerData = buildOwnerData(filteredDeals);
  const categoryData = buildCategoryData(filteredDeals);
  const funnelData = buildFunnelData(filteredDeals);
  const urgencyData = buildUrgencyData(filteredDeals);
  const { weeklyHistory } = data;

  const totalDays = filteredDeals.reduce((s, d) => s + d.daysSinceUpdate, 0);
  const summary = {
    total: filteredDeals.length,
    avgDays: filteredDeals.length
      ? Math.round(totalDays / filteredDeals.length)
      : 0,
    maxDays: filteredDeals.length
      ? Math.max(...filteredDeals.map((d) => d.daysSinceUpdate))
      : 0,
    topOwner: ownerData[0]?.name || '—',
    topOwnerCount: ownerData[0]?.count || 0,
    staleDays: data.summary.staleDays,
    leads: allDeals.filter((d) => d.dealType === 'Lead').length,
    negocios: allDeals.filter((d) => d.dealType === 'Negócio').length,
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">
            Relatório de Negócios Parados
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Threshold: {summary.staleDays} dias • criados em 2026
          </p>
          {lastUpdated && (
            <p className="text-xs text-gray-400 mt-0.5">
              Última atualização:{' '}
              {new Date(lastUpdated).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Filtro tipo */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {[
              ['todos', 'Todos'],
              ['Lead', '🔵 Lead'],
              ['Negócio', '🟢 Negócio'],
            ].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setTypeFilter(val)}
                className={`px-3 py-1.5 transition-colors ${typeFilter === val ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {label}
                {val === 'Lead' && (
                  <span className="ml-1 text-xs opacity-75">
                    ({summary.leads})
                  </span>
                )}
                {val === 'Negócio' && (
                  <span className="ml-1 text-xs opacity-75">
                    ({summary.negocios})
                  </span>
                )}
              </button>
            ))}
          </div>
          {/* Filtro responsável */}
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="py-1.5 px-3 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-44"
          >
            <option value="todos">Todos os responsáveis</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <button
            onClick={fetchReport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={14} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard
          icon={<AlertTriangle size={18} className="text-red-500" />}
          label="Total parados"
          value={summary.total}
          bg="bg-red-50"
          valueColor="text-red-600"
        />
        <SummaryCard
          icon={<Clock size={18} className="text-amber-500" />}
          label="Média de dias"
          value={`${summary.avgDays}d`}
          bg="bg-amber-50"
          valueColor="text-amber-600"
        />
        <SummaryCard
          icon={<TrendingUp size={18} className="text-orange-500" />}
          label="Máximo de dias"
          value={`${summary.maxDays}d`}
          bg="bg-orange-50"
          valueColor="text-orange-600"
        />
        <SummaryCard
          icon={<Users size={18} className="text-blue-500" />}
          label="Mais parados"
          value={summary.topOwnerCount}
          sub={summary.topOwner}
          bg="bg-blue-50"
          valueColor="text-blue-600"
        />
      </div>

      {/* Gráfico por responsável */}
      <ChartCard
        icon={<Users size={16} className="text-blue-600" />}
        title="Negócios parados por responsável"
        subtitle="Quantidade de cards sem atualização por pessoa"
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={ownerData}
            layout="vertical"
            margin={{ left: 10, right: 30 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={130}
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              formatter={(val, _, props) => [
                `${val} negócio(s) • média ${props.payload.avgDays}d`,
                'Parados',
              ]}
              contentStyle={{ fontSize: 13 }}
            />
            <Bar
              dataKey="count"
              fill="#1a56db"
              radius={[0, 4, 4, 0]}
              label={{ position: 'right', fontSize: 12 }}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Gráficos lado a lado: Urgência e Categoria */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Urgência */}
        <ChartCard
          icon={<Clock size={16} className="text-amber-500" />}
          title="Distribuição por urgência"
          subtitle="Faixas de dias sem atualização"
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={urgencyData} margin={{ top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(val) => [`${val} negócio(s)`, 'Parados']}
                contentStyle={{ fontSize: 13 }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {urgencyData.map((entry) => (
                  <Cell
                    key={entry.label}
                    fill={URGENCY_COLORS[entry.label] || '#94a3b8'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Categoria */}
        <ChartCard
          icon={<Tag size={16} className="text-purple-500" />}
          title="Distribuição por categoria"
          subtitle="Categoria da empresa vinculada ao card"
        >
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={categoryData}
                dataKey="count"
                nameKey="name"
                cx="45%"
                cy="50%"
                outerRadius={80}
                label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {categoryData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                formatter={(value, entry) => (
                  <span style={{ fontSize: 12 }}>
                    {value} ({entry.payload.count})
                  </span>
                )}
              />
              <Tooltip
                formatter={(val) => [`${val} negócio(s)`, '']}
                contentStyle={{ fontSize: 13 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Funil */}
      <ChartCard
        icon={<GitBranch size={16} className="text-green-600" />}
        title="Negócios parados por funil"
        subtitle="Qual funil concentra mais negócios sem atualização"
      >
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={funnelData} margin={{ top: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(val) => [`${val} negócio(s)`, 'Parados']}
              contentStyle={{ fontSize: 13 }}
            />
            <Bar
              dataKey="count"
              fill="#10b981"
              radius={[4, 4, 0, 0]}
              label={{ position: 'top', fontSize: 12, fill: '#374151' }}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Histórico semanal */}
      <ChartCard
        icon={<TrendingUp size={16} className="text-indigo-600" />}
        title="Histórico semanal"
        subtitle={
          weeklyHistory.length
            ? `Evolução das últimas ${weeklyHistory.length} semana(s) com resumo enviado`
            : 'Histórico disponível após o primeiro resumo semanal (toda sexta às 11h)'
        }
      >
        {weeklyHistory.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={weeklyHistory} margin={{ top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="week_label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(val, key) => [
                  key === 'total_stale'
                    ? `${val} negócio(s)`
                    : `${Math.round(val)} dias`,
                  key === 'total_stale' ? 'Total parados' : 'Média de dias',
                ]}
                contentStyle={{ fontSize: 13 }}
              />
              <Legend
                formatter={(v) =>
                  v === 'total_stale' ? 'Total parados' : 'Média de dias'
                }
              />
              <Line
                type="monotone"
                dataKey="total_stale"
                stroke="#1a56db"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="avg_days"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 4 }}
                strokeDasharray="5 5"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            O gráfico de histórico será preenchido automaticamente toda
            sexta-feira às 11h.
          </div>
        )}
      </ChartCard>

      {/* Tabela detalhada */}
      <ChartCard
        icon={<AlertTriangle size={16} className="text-red-500" />}
        title="Lista completa de negócios parados"
        subtitle={`${data.deals.length} negócio(s) — ordenado por dias parado`}
      >
        <div className="overflow-x-auto mt-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100">
                <th className="text-left py-2 pr-3 font-medium">Negócio</th>
                <th className="text-left py-2 pr-3 font-medium">
                  Empresa / Categoria
                </th>
                <th className="text-left py-2 pr-3 font-medium">Responsável</th>
                <th className="text-left py-2 pr-3 font-medium">
                  Funil / Etapa
                </th>
                <th className="text-center py-2 font-medium">Parado há</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[...data.deals]
                .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate)
                .map((deal) => (
                  <tr key={deal.id} className="hover:bg-gray-50">
                    <td className="py-2.5 pr-3">
                      <a
                        href={deal.webUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:underline max-w-xs truncate block"
                      >
                        {deal.title}
                      </a>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="text-gray-700 text-xs">
                        {deal.organization || '—'}
                      </div>
                      {deal.orgCategory && (
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full ${deal.orgCategory === 'Lead' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}
                        >
                          {deal.orgCategory}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-gray-700 text-xs">
                      {deal.ownerName || '—'}
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="text-gray-500 text-xs">
                        {deal.funnel || '—'}
                      </div>
                      <div className="text-gray-400 text-xs">
                        {deal.stage || ''}
                      </div>
                    </td>
                    <td className="py-2.5 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                          deal.daysSinceUpdate >= 45
                            ? 'bg-red-100 text-red-700'
                            : deal.daysSinceUpdate >= 30
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {deal.daysSinceUpdate}d
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}

function SummaryCard({ icon, label, value, sub, bg, valueColor }) {
  return (
    <div className={`${bg} rounded-xl border border-gray-100 p-4`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1 truncate">{sub}</div>}
    </div>
  );
}

function ChartCard({ icon, title, subtitle, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-0.5">
        {icon}
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      </div>
      {subtitle && <p className="text-xs text-gray-400 mb-4">{subtitle}</p>}
      {children}
    </div>
  );
}
