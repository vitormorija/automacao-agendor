import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import {
  LayoutDashboard,
  AlertTriangle,
  Bell,
  Settings,
  BarChart2,
  LogOut,
  KeyRound,
} from 'lucide-react';
import Dashboard from './components/Dashboard';
import DealsList from './components/DealsList';
import NotificationHistory from './components/NotificationHistory';
import ConfigPanel from './components/ConfigPanel';
import ReportPanel from './components/ReportPanel';
import LoginPage from './components/LoginPage';
import ChangePasswordModal from './components/ChangePasswordModal';

// `adminOnly` esconde a aba de quem não é administrador. É ESCONDER, não proteger: quem
// decide o acesso é o servidor, em requireAdmin, a cada requisição. Sem isto o usuário
// comum veria o formulário de configuração e só descobriria a recusa ao clicar em salvar.
const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'deals', label: 'Negócios parados', icon: AlertTriangle },
  { id: 'report', label: 'Relatório', icon: BarChart2 },
  { id: 'history', label: 'Histórico', icon: Bell },
  { id: 'config', label: 'Configurações', icon: Settings, adminOnly: true },
];

// O monkey-patch de window.fetch que injetava `Authorization: Bearer` em toda chamada saiu
// daqui junto com o token do localStorage. Não há substituto e não é preciso: a sessão vive
// num cookie HttpOnly, que o navegador anexa sozinho a cada requisição de mesma origem — e
// mesma origem é o caso tanto em produção (o backend serve o dist) quanto em
// desenvolvimento (o Vite faz proxy de /api). Nenhuma chamada existente precisou mudar.

// Chaves de dado de NEGÓCIO no localStorage. A credencial não está mais entre elas: o que
// resta é cache de tela, e ele é limpo no logout porque guarda nome e e-mail de
// responsáveis vindos do CRM — num computador compartilhado, deixá-los para trás entrega ao
// próximo usuário exatamente o que sair deveria ter tirado.
const CACHES_LOCAIS = [
  'deals_cache',
  'deals_cache_time',
  'report_cache',
  'report_cache_time',
  'resolved_cache',
  'dashboard_check_cache',
];

export default function App() {
  const [tab, setTab] = useState('dashboard');
  // Três estados, e não dois: com o token invisível ao JavaScript, a única forma de saber se
  // há sessão é PERGUNTAR ao servidor. 'verificando' é o intervalo entre a montagem e a
  // resposta do /verify — sem ele, a tela de login pisca para quem já está logado.
  const [sessao, setSessao] = useState({
    estado: 'verificando',
    username: '',
    isAdmin: false,
  });
  const [showChangePass, setShowChangePass] = useState(false);

  const autenticado = sessao.estado === 'autenticado';
  const { username, isAdmin } = sessao;

  useEffect(() => {
    fetch('/api/auth/verify', { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok)
          return setSessao({ estado: 'anonimo', username: '', isAdmin: false });
        setSessao({
          estado: 'autenticado',
          username: d.username || '',
          isAdmin: d.isAdmin === true,
        });
      })
      .catch(() =>
        setSessao({ estado: 'anonimo', username: '', isAdmin: false }),
      );
  }, []);

  function handleLogin(newUsername, newIsAdmin) {
    setSessao({
      estado: 'autenticado',
      username: newUsername || '',
      isAdmin: newIsAdmin === true,
    });
  }

  async function handleLogout() {
    // Quem apaga a credencial agora é o SERVIDOR: o cookie é HttpOnly e não existe
    // `removeItem` que o alcance. O estado local só é derrubado depois, e mesmo que a
    // chamada falhe — uma sessão que não pôde ser encerrada no servidor não é motivo para
    // manter a tela aberta na máquina de quem pediu para sair.
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* rede indisponível — o estado local vai embora do mesmo jeito */
    }
    for (const chave of CACHES_LOCAIS) localStorage.removeItem(chave);
    setSessao({ estado: 'anonimo', username: '', isAdmin: false });
  }

  // Enquanto o /verify não responde não dá para saber qual das duas telas é a certa. Um
  // retângulo neutro evita que quem já está logado veja a tela de login piscar a cada carga.
  if (sessao.estado === 'verificando') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Carregando…</p>
      </div>
    );
  }

  if (!autenticado) {
    return (
      <>
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        <LoginPage onLogin={handleLogin} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Bell size={16} className="text-white" />
              </div>
              <div>
                <span className="font-semibold text-gray-900 text-sm">
                  Automação Agendor
                </span>
                <span className="text-xs text-gray-400 ml-2 hidden sm:inline">
                  Monitor de negócios parados
                </span>
              </div>
            </div>

            {/* Usuário + Ações */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 hidden sm:block">
                Logado como{' '}
                <strong className="text-gray-700">{username}</strong>
              </span>
              <button
                onClick={() => setShowChangePass(true)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-200 px-2.5 py-1.5 rounded-lg transition-colors"
                title="Alterar senha"
              >
                <KeyRound size={13} />
                <span className="hidden sm:inline">Alterar senha</span>
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200 px-2.5 py-1.5 rounded-lg transition-colors"
                title="Sair"
              >
                <LogOut size={13} />
                Sair
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Nav tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <nav className="flex gap-1 overflow-x-auto">
            {TABS.filter(({ adminOnly }) => !adminOnly || isAdmin).map(
              ({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    tab === id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ),
            )}
          </nav>
        </div>
      </div>

      {/* Modal de troca de senha */}
      {showChangePass && (
        <ChangePasswordModal
          username={username}
          onClose={() => setShowChangePass(false)}
        />
      )}

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {tab === 'dashboard' && (
          <Dashboard onTabChange={setTab} isAdmin={isAdmin} />
        )}
        {tab === 'deals' && <DealsList />}
        {tab === 'report' && <ReportPanel />}
        {tab === 'history' && <NotificationHistory />}
        {/* A checagem de papel se repete aqui de propósito: esconder a aba tira o caminho
            óbvio, mas `tab` sobrevive a um /verify que rebaixe o usuário entre cargas. */}
        {tab === 'config' && isAdmin && <ConfigPanel />}
      </main>
    </div>
  );
}
