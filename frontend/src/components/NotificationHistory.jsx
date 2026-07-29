import { useState, useEffect } from 'react';
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  Clock,
  MousePointerClick,
} from 'lucide-react';

const PAGE_SIZE = 20;

function ResolvedSection() {
  const [data, setData] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('resolved_cache')) || null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('resolved');

  async function checkResolved() {
    setLoading(true);
    try {
      const r = await fetch('/api/notifications/resolved');
      const d = await r.json();
      setData(d);
      localStorage.setItem('resolved_cache', JSON.stringify(d));
    } catch {}
    setLoading(false);
  }

  const list = data
    ? activeTab === 'resolved'
      ? data.resolved
      : data.pending
    : [];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-800">
            Resolução de notificações
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Cards notificados que foram atualizados no Agendor
          </p>
        </div>
        <button
          onClick={checkResolved}
          disabled={loading}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Verificar resolvidos
        </button>
      </div>

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-700">
                {data.resolvedCount}
              </div>
              <div className="text-xs text-green-600 mt-0.5">Resolvidos</div>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-amber-700">
                {data.pendingCount}
              </div>
              <div className="text-xs text-amber-600 mt-0.5">Aguardando</div>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-700">
                {data.resolvedRate}%
              </div>
              <div className="text-xs text-blue-600 mt-0.5">
                Taxa de resolucao
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-3 border-b border-gray-100">
            <button
              onClick={() => setActiveTab('resolved')}
              className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'resolved'
                  ? 'border-green-500 text-green-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Resolvidos{' '}
              {data.resolvedCount > 0 && (
                <span className="ml-1 bg-green-100 text-green-700 text-xs px-1.5 py-0.5 rounded-full">
                  {data.resolvedCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'pending'
                  ? 'border-amber-500 text-amber-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Aguardando{' '}
              {data.pendingCount > 0 && (
                <span className="ml-1 bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full">
                  {data.pendingCount}
                </span>
              )}
            </button>
          </div>

          {list.length === 0 ? (
            <div className="py-6 text-center text-gray-400 text-sm">
              {activeTab === 'resolved'
                ? 'Nenhum deal resolvido ainda.'
                : 'Nenhum deal aguardando resolucao.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="text-left py-2 pr-4 font-medium w-6"></th>
                    <th className="text-left py-2 pr-4 font-medium">Negócio</th>
                    <th className="text-left py-2 pr-4 font-medium">
                      Responsável
                    </th>
                    <th className="text-left py-2 pr-4 font-medium">
                      Notificado em
                    </th>
                    <th className="text-left py-2 font-medium">
                      {activeTab === 'resolved'
                        ? 'Resolvido em'
                        : 'Aguardando desde'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {list.map((d) => (
                    <tr key={d.deal_id} className="hover:bg-gray-50">
                      <td className="py-3 pr-4">
                        {d.resolved ? (
                          <CheckCircle size={16} className="text-green-500" />
                        ) : (
                          <Clock size={16} className="text-amber-500" />
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="font-medium text-gray-800 max-w-xs truncate">
                          {d.web_url ? (
                            <a
                              href={d.web_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-blue-600 hover:underline"
                            >
                              {d.deal_title}
                            </a>
                          ) : (
                            d.deal_title
                          )}
                        </div>
                        {d.deal_type && (
                          <span className="text-xs text-gray-400">
                            {d.deal_type}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-gray-600">
                        {d.owner_name || '—'}
                      </td>
                      <td className="py-3 pr-4 text-gray-500 text-xs whitespace-nowrap">
                        {new Date(d.last_notified_at).toLocaleString('pt-BR')}
                        {d.notification_count > 1 && (
                          <div className="text-gray-400">
                            {d.notification_count}x notificado
                          </div>
                        )}
                      </td>
                      <td className="py-3 text-xs whitespace-nowrap">
                        {d.resolved && d.resolved_at ? (
                          <span className="text-green-600">
                            {new Date(d.resolved_at).toLocaleString('pt-BR')}
                          </span>
                        ) : (
                          <span className="text-amber-500">
                            {new Date(d.last_notified_at).toLocaleString(
                              'pt-BR',
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!data && !loading && (
        <div className="py-8 text-center text-gray-400 text-sm">
          Clique em "Verificar resolvidos" para consultar o Agendor.
        </div>
      )}
    </div>
  );
}

export default function NotificationHistory() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, [page]);

  async function fetchLogs() {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/notifications?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
      );
      const d = await r.json();
      setLogs(d.logs || []);
      setTotal(d.total || 0);
    } catch {}
    setLoading(false);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <ResolvedSection />

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              Histórico de notificações
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {total} registro(s) no total
            </p>
          </div>
          <button
            onClick={() => {
              setPage(0);
              fetchLogs();
            }}
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
            Nenhuma notificacao registrada ainda.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="text-left py-2 pr-4 font-medium">Status</th>
                    <th className="text-left py-2 pr-4 font-medium">Negócio</th>
                    <th className="text-left py-2 pr-4 font-medium">
                      Responsável
                    </th>
                    <th className="text-left py-2 pr-4 font-medium">
                      Email enviado para
                    </th>
                    <th className="text-left py-2 pr-4 font-medium">
                      Dias parado
                    </th>
                    <th className="text-left py-2 pr-4 font-medium">
                      Link clicado
                    </th>
                    <th className="text-left py-2 font-medium">Data/hora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="py-3 pr-4">
                        {log.status === 'sent' ? (
                          <CheckCircle size={16} className="text-green-500" />
                        ) : (
                          <XCircle size={16} className="text-red-500" />
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="font-medium text-gray-800 max-w-xs truncate">
                          {log.deal_title}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-gray-600">
                        {log.owner_name || '—'}
                      </td>
                      <td className="py-3 pr-4 text-gray-500 text-xs">
                        <div>{log.owner_email || '—'}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="bg-amber-50 text-amber-700 text-xs px-2 py-0.5 rounded-full font-medium">
                          {log.days_stale}d
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        {log.clicked_at ? (
                          <div className="flex items-center gap-1 text-green-600 text-xs">
                            <MousePointerClick size={13} />
                            <span>
                              {new Date(log.clicked_at).toLocaleString(
                                'pt-BR',
                                {
                                  day: '2-digit',
                                  month: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                },
                              )}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
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
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  Anterior
                </button>
                <span className="text-gray-500">
                  Pagina {page + 1} de {totalPages}
                </span>
                <button
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  Proxima
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
