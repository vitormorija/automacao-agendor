import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  Play,
  Search,
  Mail,
  MousePointerClick,
  Users,
  TrendingUp,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function Dashboard({ onTabChange }) {
  const [status, setStatus] = useState(null);
  const [running, setRunning] = useState(false);
  const [sending, setSending] = useState(false);
  const [checkResult, setCheckResult] = useState(() => {
    try {
      const cached = JSON.parse(
        localStorage.getItem('dashboard_check_cache') || 'null',
      );
      if (cached && typeof cached.total === 'number') return cached;
      return null;
    } catch {
      return null;
    }
  });
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  useEffect(() => {
    fetchStatus();
    fetchLogs();
    // Auto-refresh status e logs a cada 2 minutos
    const interval = setInterval(() => {
      fetchStatus();
      fetchLogs();
    }, 120000);
    return () => clearInterval(interval);
  }, []);

  async function fetchStatus() {
    try {
      const r = await fetch('/api/notifications/status');
      setStatus(await r.json());
    } catch {}
  }

  async function fetchLogs() {
    setLoadingLogs(true);
    try {
      const r = await fetch('/api/notifications?limit=5');
      const d = await r.json();
      setLogs(d.logs || []);
    } catch {}
    setLoadingLogs(false);
  }

  async function checkOnly() {
    setRunning(true);
    setCheckResult(null);
    const toastId = toast.loading('Verificando negócios parados...');
    try {
      const r = await fetch('/api/notifications/check', { method: 'POST' });
      const result = await r.json();
      if (typeof result.total === 'number') {
        setCheckResult(result);
        localStorage.setItem('dashboard_check_cache', JSON.stringify(result));
      }
      toast.success(`${result.total} negócio(s) parado(s) encontrado(s)`, {
        id: toastId,
        duration: 4000,
      });
    } catch {
      toast.error('Erro ao verificar', { id: toastId });
    }
    setRunning(false);
  }

  async function sendNow() {
    setSending(true);
    const toastId = toast.loading('Enviando notificações...');
    try {
      const r = await fetch('/api/notifications/run', { method: 'POST' });
      const result = await r.json();
      if (result.skipped) {
        toast.error(result.reason, { id: toastId });
      } else {
        toast.success(
          `${result.notified} notificação(ões) enviada(s) de ${result.stale} negócio(s) parado(s)`,
          { id: toastId, duration: 5000 },
        );
      }
      setCheckResult(null);
      localStorage.removeItem('dashboard_check_cache');
      fetchStatus();
      fetchLogs();
    } catch {
      toast.error('Erro ao enviar notificações', { id: toastId });
    }
    setSending(false);
  }

  const lastRun = status?.lastRunResult;
  const staleCount = checkResult?.total ?? lastRun?.stale ?? '—';
  // Quantos vão de fato RECEBER. A rota de verificação responde "quem vai receber", e é este
  // número que o rótulo do botão de envio escreve — o card logo abaixo continua contando negócios
  // parados, que é outra pergunta. Quem marca cada negócio é runCheckOnly, em
  // backend/src/scheduler.js. O fallback para o total existe porque a resposta anterior é
  // restaurada de `dashboard_check_cache` ao montar o componente e pode ter vindo de um backend
  // sem o campo; sem ele o botão diria zero logo após o deploy e o operador concluiria, errado,
  // que não há ninguém a notificar.
  const aNotificarCount = !checkResult
    ? 0
    : checkResult.deals?.some((d) => d.seraNotificado !== undefined)
      ? checkResult.deals.filter((d) => d.seraNotificado).length
      : checkResult.total;
  const notifiedCount = status?.totalSent ?? '—';
  const lastRunAt = status?.lastSentAt ?? lastRun?.ranAt ?? null;

  return (
    <div className="space-y-6">
      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          icon={<AlertTriangle className="text-amber-500" size={22} />}
          label="Negócios parados"
          value={staleCount}
          bg="bg-amber-50"
          border="border-amber-200"
        />
        <StatCard
          icon={<CheckCircle className="text-green-500" size={22} />}
          label="Notificações enviadas"
          value={notifiedCount}
          bg="bg-green-50"
          border="border-green-200"
        />
        <StatCard
          icon={<MousePointerClick className="text-purple-500" size={22} />}
          label="Links clicados"
          value={
            status?.totalClicked != null
              ? `${status.totalClicked} (${status.clickRate}%)`
              : '—'
          }
          bg="bg-purple-50"
          border="border-purple-200"
          small
        />
        <StatCard
          icon={<Clock className="text-blue-500" size={22} />}
          label="Último email enviado"
          value={lastRunAt ? new Date(lastRunAt).toLocaleString('pt-BR') : '—'}
          bg="bg-blue-50"
          border="border-blue-200"
          small
        />
      </div>

      {/* Status do scheduler */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">
            Status do Agendador
          </h2>
          <button
            onClick={() => {
              fetchStatus();
              fetchLogs();
            }}
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
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">
              {status?.schedule || '—'}
            </code>
          </div>
          {status?.isRunning && (
            <div className="text-amber-600 font-medium flex items-center gap-1">
              <RefreshCw size={14} className="animate-spin" /> Verificação em
              andamento...
            </div>
          )}
        </div>
        {lastRun?.errors?.length > 0 && (
          <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
            <strong>Erros na última execução:</strong>
            <ul className="mt-1 list-disc list-inside">
              {lastRun.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Botões de ação */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-1">
          Controle manual
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Verifique primeiro quais negócios estão parados, e só depois envie as
          notificações se quiser.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={checkOnly}
            disabled={running || sending}
            className="inline-flex items-center gap-2 border border-blue-600 text-blue-600 hover:bg-blue-50 disabled:opacity-60 px-5 py-2.5 rounded-lg font-medium text-sm transition-colors"
          >
            {running ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <Search size={16} />
            )}
            {running ? 'Verificando...' : 'Verificar negócios parados'}
          </button>
          {checkResult && (
            <button
              onClick={sendNow}
              disabled={sending || running}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors"
            >
              {sending ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Mail size={16} />
              )}
              {sending
                ? 'Enviando...'
                : `Enviar notificações (${aNotificarCount} a notificar)`}
            </button>
          )}
        </div>

        {/* Resultado da verificação */}
        {checkResult && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm font-medium text-amber-800 mb-2">
              {checkResult.total} negócio(s) parado(s) encontrado(s)
            </p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {checkResult.deals?.map((deal) => (
                <div
                  key={deal.id}
                  className="text-xs text-amber-700 flex items-center justify-between gap-2"
                >
                  <span className="truncate">{deal.title}</span>
                  <span className="shrink-0 font-semibold">
                    {deal.daysSinceUpdate}d · {deal.ownerName || '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Ranking por responsável */}
      {checkResult?.deals?.length > 0 && (
        <OwnerRanking
          deals={checkResult.deals}
          onViewAll={() => onTabChange('deals')}
        />
      )}

      {/* Últimas notificações */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">
            Últimas notificações
          </h2>
          <button
            onClick={() => onTabChange('history')}
            className="text-sm text-blue-600 hover:underline"
          >
            Ver todas →
          </button>
        </div>
        {loadingLogs ? (
          <div className="text-sm text-gray-400 py-4 text-center">
            Carregando...
          </div>
        ) : logs.length === 0 ? (
          <div className="text-sm text-gray-400 py-4 text-center">
            Nenhuma notificação enviada ainda.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {logs.map((log) => (
              <NotificationRow key={log.id} log={log} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Ranking por responsável ──────────────────────────────────────
function OwnerRanking({ deals, onViewAll }) {
  const byOwner = {};
  deals.forEach((d) => {
    const name = d.ownerName || 'Sem responsável';
    if (!byOwner[name]) byOwner[name] = { count: 0, maxDays: 0, totalDays: 0 };
    byOwner[name].count++;
    byOwner[name].totalDays += d.daysSinceUpdate;
    byOwner[name].maxDays = Math.max(byOwner[name].maxDays, d.daysSinceUpdate);
  });

  const sorted = Object.entries(byOwner).sort(
    (a, b) => b[1].count - a[1].count,
  );
  const maxCount = sorted[0]?.[1].count || 1;

  const urgencyColor = (maxDays) => {
    if (maxDays >= 60) return 'bg-red-400';
    if (maxDays >= 30) return 'bg-amber-400';
    return 'bg-yellow-300';
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-gray-500" />
          <h2 className="text-base font-semibold text-gray-800">
            Negócios parados por responsável
          </h2>
        </div>
        <button
          onClick={onViewAll}
          className="text-sm text-blue-600 hover:underline"
        >
          Ver lista completa →
        </button>
      </div>

      <div className="space-y-3">
        {sorted.map(([name, data], i) => (
          <div key={name} className="flex items-center gap-3">
            {/* Posição */}
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                i === 0
                  ? 'bg-red-100 text-red-600'
                  : i === 1
                    ? 'bg-amber-100 text-amber-600'
                    : i === 2
                      ? 'bg-yellow-100 text-yellow-600'
                      : 'bg-gray-100 text-gray-500'
              }`}
            >
              {i + 1}
            </div>
            {/* Nome + barra */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-700 font-medium truncate">
                  {name}
                </span>
                <div className="shrink-0 ml-2 flex items-center gap-2 text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">
                    {data.count}
                  </span>
                  <span>
                    · máx{' '}
                    <span className="font-medium text-amber-600">
                      {data.maxDays}d
                    </span>
                  </span>
                </div>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${urgencyColor(data.maxDays)}`}
                  style={{ width: `${(data.count / maxCount) * 100}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Resumo rápido */}
      <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-xl font-bold text-gray-800">{sorted.length}</div>
          <div className="text-xs text-gray-500">responsáveis</div>
        </div>
        <div>
          <div className="text-xl font-bold text-amber-600">
            {Math.round(
              deals.reduce((s, d) => s + d.daysSinceUpdate, 0) / deals.length,
            )}
            d
          </div>
          <div className="text-xs text-gray-500">média de dias</div>
        </div>
        <div>
          <div className="text-xl font-bold text-red-600">
            {Math.max(...deals.map((d) => d.daysSinceUpdate))}d
          </div>
          <div className="text-xs text-gray-500">máximo de dias</div>
        </div>
      </div>
    </div>
  );
}

// ── Componentes auxiliares ───────────────────────────────────────
function StatCard({ icon, label, value, bg, border, small }) {
  return (
    <div
      className={`rounded-xl border ${border} ${bg} p-4 flex items-start gap-3`}
    >
      <div className="mt-0.5">{icon}</div>
      <div>
        <div className="text-xs text-gray-500 mb-0.5">{label}</div>
        <div
          className={`font-bold text-gray-800 ${small ? 'text-sm' : 'text-2xl'}`}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function NotificationRow({ log }) {
  return (
    <div className="py-3 flex items-start gap-3 text-sm">
      {log.status === 'sent' ? (
        <CheckCircle size={16} className="text-green-500 mt-0.5 shrink-0" />
      ) : (
        <XCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="font-medium text-gray-800 truncate">
          {log.deal_title}
        </div>
        <div className="text-gray-500 text-xs mt-0.5">
          {log.owner_name} · {log.days_stale} dias parado ·{' '}
          {new Date(log.sent_at).toLocaleString('pt-BR')}
        </div>
        {log.error && (
          <div className="text-red-500 text-xs mt-0.5">{log.error}</div>
        )}
      </div>
      <div className="shrink-0 mt-0.5">
        {log.clicked_at ? (
          <span className="inline-flex items-center gap-1 text-xs text-purple-600 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full font-medium">
            <MousePointerClick size={11} /> Clicou
          </span>
        ) : (
          <span className="text-xs text-gray-300">não clicou</span>
        )}
      </div>
    </div>
  );
}
