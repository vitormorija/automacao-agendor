import { useState, useEffect } from 'react'
import { RefreshCw, ExternalLink, AlertTriangle, Search } from 'lucide-react'

export default function DealsList() {
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [staleDays, setStaleDays] = useState(15)
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchDeals()
  }, [])

  async function fetchDeals() {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/deals/stale')
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setDeals(d.deals || [])
      setStaleDays(d.staleDays)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const filtered = deals.filter(d =>
    !search ||
    d.title?.toLowerCase().includes(search.toLowerCase()) ||
    d.ownerName?.toLowerCase().includes(search.toLowerCase()) ||
    d.organization?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Negócios parados</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Criados em 2026 • sem atualização há mais de {staleDays} dias • em andamento
            </p>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
              />
            </div>
            <button
              onClick={fetchDeals}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Atualizar
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
            {search ? 'Nenhum resultado para a busca.' : '🎉 Nenhum negócio parado encontrado!'}
          </div>
        ) : (
          <>
            <div className="text-xs text-gray-500 mb-3">{filtered.length} negócio(s) encontrado(s)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="text-left py-2 pr-4 font-medium">Negócio</th>
                    <th className="text-left py-2 pr-4 font-medium">Empresa</th>
                    <th className="text-left py-2 pr-4 font-medium">Responsável</th>
                    <th className="text-left py-2 pr-4 font-medium">Etapa</th>
                    <th className="text-left py-2 pr-4 font-medium">Parado há</th>
                    <th className="text-left py-2 font-medium">Última atualização</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(deal => (
                    <DealRow key={deal.id} deal={deal} staleDays={staleDays} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function DealRow({ deal, staleDays }) {
  const urgency = deal.daysSinceUpdate >= staleDays * 2
    ? 'text-red-600 bg-red-50'
    : deal.daysSinceUpdate >= staleDays * 1.5
    ? 'text-amber-600 bg-amber-50'
    : 'text-yellow-600 bg-yellow-50'

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="py-3 pr-4">
        <div className="font-medium text-gray-800 max-w-xs truncate">{deal.title}</div>
        <div className="text-xs text-gray-400">{deal.funnel}</div>
      </td>
      <td className="py-3 pr-4 text-gray-600">{deal.organization || '—'}</td>
      <td className="py-3 pr-4">
        <div className="text-gray-700">{deal.ownerName || '—'}</div>
        {deal.ownerEmail && (
          <div className="text-xs text-gray-400">{deal.ownerEmail}</div>
        )}
      </td>
      <td className="py-3 pr-4 text-gray-600 text-xs">{deal.stage || '—'}</td>
      <td className="py-3 pr-4">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${urgency}`}>
          <AlertTriangle size={11} />
          {deal.daysSinceUpdate}d
        </span>
      </td>
      <td className="py-3 pr-4 text-gray-500 text-xs whitespace-nowrap">
        {new Date(deal.updatedAt).toLocaleDateString('pt-BR')}
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
  )
}
