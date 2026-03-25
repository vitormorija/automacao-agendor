import { useState, useEffect } from 'react'
import { AlertTriangle, RefreshCw, Clock, CheckCircle, XCircle, Play } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Dashboard({ onTabChange }) {
  const [status, setStatus] = useState(null)
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState([])
  const [loadingLogs, setLoadingLogs] = useState(true)

  useEffect(() => {
    fetchStatus()
    fetchLogs()
  }, [])

  async function fetchStatus() {
    try {
      const r = await fetch('/api/notifications/status')
      setStatus(await r.json())
    } catch {}
  }

  async function fetchLogs() {
    setLoadingLogs(true)
    try {
      const r = await fetch('/api/notifications?limit=5')
      const d = await r.json()
      setLogs(d.logs || [])
    } catch {}
    setLoadingLogs(false)
  }

  async function runNow() {
    setRunning(true)
    const toastId = toast.loading('Verificando negócios parados...')
    try {
      const r = await fetch('/api/notifications/run', { method: 'POST' })
      const result = await r.json()
      if (result.skipped) {
        toast.error(result.reason, { id: toastId })
      } else {
        toast.success(
          `${result.stale} negócios parados — ${result.notified} notificações enviadas`,
          { id: toastId, duration: 5000 }
        )
      }
      fetchStatus()
      fetchLogs()
    } catch (err) {
      toast.error('Erro ao executar verificação', { id: toastId })
    }
    setRunning(false)
  }

  const lastRun = status?.lastRunResult

  return (
    <div className="space-y-6">
      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={<AlertTriangle className="text-amber-500" size={22} />}
          label="Negócios parados"
          value={lastRun?.stale ?? '—'}
          bg="bg-amber-50"
          border="border-amber-200"
        />
        <StatCard
          icon={<CheckCircle className="text-green-500" size={22} />}
          label="Notificações enviadas"
          value={lastRun?.notified ?? '—'}
          bg="bg-green-50"
          border="border-green-200"
        />
        <StatCard
          icon={<Clock className="text-blue-500" size={22} />}
          label="Última verificação"
          value={lastRun?.ranAt ? new Date(lastRun.ranAt).toLocaleString('pt-BR') : '—'}
          bg="bg-blue-50"
          border="border-blue-200"
          small
        />
      </div>

      {/* Status do scheduler */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Status do Agendador</h2>
          <button
            onClick={fetchStatus}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Atualizar"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <span className="text-gray-500">Status: </span>
            {status?.notificationsEnabled ? (
              <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" />
                Ativo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-gray-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                Pausado
              </span>
            )}
          </div>
          <div>
            <span className="text-gray-500">Agendamento: </span>
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{status?.schedule || '—'}</code>
          </div>
          {status?.isRunning && (
            <div className="text-amber-600 font-medium flex items-center gap-1">
              <RefreshCw size={14} className="animate-spin" /> Verificação em andamento...
            </div>
          )}
        </div>

        {lastRun?.errors?.length > 0 && (
          <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
            <strong>Erros na última execução:</strong>
            <ul className="mt-1 list-disc list-inside">{lastRun.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        )}
      </div>

      {/* Botão executar agora */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Executar verificação manual</h2>
        <p className="text-sm text-gray-500 mb-4">
          Verifica agora todos os negócios criados em 2026 sem atualização recente e envia os emails de aviso.
        </p>
        <button
          onClick={runNow}
          disabled={running}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors"
        >
          {running ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
          {running ? 'Verificando...' : 'Verificar Agora'}
        </button>
      </div>

      {/* Últimas notificações */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Últimas notificações</h2>
          <button
            onClick={() => onTabChange('history')}
            className="text-sm text-blue-600 hover:underline"
          >
            Ver todas →
          </button>
        </div>

        {loadingLogs ? (
          <div className="text-sm text-gray-400 py-4 text-center">Carregando...</div>
        ) : logs.length === 0 ? (
          <div className="text-sm text-gray-400 py-4 text-center">Nenhuma notificação enviada ainda.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {logs.map(log => (
              <NotificationRow key={log.id} log={log} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, bg, border, small }) {
  return (
    <div className={`rounded-xl border ${border} ${bg} p-4 flex items-start gap-3`}>
      <div className="mt-0.5">{icon}</div>
      <div>
        <div className="text-xs text-gray-500 mb-0.5">{label}</div>
        <div className={`font-bold text-gray-800 ${small ? 'text-sm' : 'text-2xl'}`}>{value}</div>
      </div>
    </div>
  )
}

function NotificationRow({ log }) {
  return (
    <div className="py-3 flex items-start gap-3 text-sm">
      {log.status === 'sent'
        ? <CheckCircle size={16} className="text-green-500 mt-0.5 shrink-0" />
        : <XCircle size={16} className="text-red-500 mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <div className="font-medium text-gray-800 truncate">{log.deal_title}</div>
        <div className="text-gray-500 text-xs mt-0.5">
          {log.owner_name} · {log.days_stale} dias parado · {new Date(log.sent_at).toLocaleString('pt-BR')}
        </div>
        {log.error && <div className="text-red-500 text-xs mt-0.5">{log.error}</div>}
      </div>
    </div>
  )
}
