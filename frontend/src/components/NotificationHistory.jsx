import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, RefreshCw } from 'lucide-react'

const PAGE_SIZE = 20

export default function NotificationHistory() {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLogs()
  }, [page])

  async function fetchLogs() {
    setLoading(true)
    try {
      const r = await fetch(`/api/notifications?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`)
      const d = await r.json()
      setLogs(d.logs || [])
      setTotal(d.total || 0)
    } catch {}
    setLoading(false)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Histórico de notificações</h2>
          <p className="text-sm text-gray-500 mt-0.5">{total} registro(s) no total</p>
        </div>
        <button
          onClick={() => { setPage(0); fetchLogs() }}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400 text-sm">
          <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
          Carregando...
        </div>
      ) : logs.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">
          Nenhuma notificação registrada ainda.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left py-2 pr-4 font-medium">Status</th>
                  <th className="text-left py-2 pr-4 font-medium">Negócio</th>
                  <th className="text-left py-2 pr-4 font-medium">Responsável</th>
                  <th className="text-left py-2 pr-4 font-medium">Email enviado para</th>
                  <th className="text-left py-2 pr-4 font-medium">Dias parado</th>
                  <th className="text-left py-2 font-medium">Data/hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="py-3 pr-4">
                      {log.status === 'sent'
                        ? <CheckCircle size={16} className="text-green-500" />
                        : <XCircle size={16} className="text-red-500" />}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="font-medium text-gray-800 max-w-xs truncate">{log.deal_title}</div>
                    </td>
                    <td className="py-3 pr-4 text-gray-600">{log.owner_name || '—'}</td>
                    <td className="py-3 pr-4 text-gray-500 text-xs">
                      <div>{log.owner_email || '—'}</div>
                      {log.admin_email && log.admin_email !== log.owner_email && (
                        <div className="text-gray-400">{log.admin_email} (adm)</div>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="bg-amber-50 text-amber-700 text-xs px-2 py-0.5 rounded-full font-medium">
                        {log.days_stale}d
                      </span>
                    </td>
                    <td className="py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(log.sent_at).toLocaleString('pt-BR')}
                      {log.error && (
                        <div className="text-red-500 mt-0.5">{log.error}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                ← Anterior
              </button>
              <span className="text-gray-500">Página {page + 1} de {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Próxima →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
