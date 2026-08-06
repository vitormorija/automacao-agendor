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

// Intercepta todos os fetch para incluir o token automaticamente
const originalFetch = window.fetch;
window.fetch = function (url, options = {}) {
  const token = localStorage.getItem('auth_token');
  if (token && typeof url === 'string' && url.startsWith('/api/')) {
    options.headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    };
  }
  return originalFetch(url, options);
};

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [token, setToken] = useState(() => localStorage.getItem('auth_token'));
  const [username, setUsername] = useState(
    () => localStorage.getItem('auth_user') || '',
  );
  // Semeado pelo login e RECONFIRMADO pelo /verify a cada carga. O papel não viaja dentro
  // do token de propósito: assim, tirar alguém do ADMIN_USERS passa a valer no próximo
  // carregamento, em vez de só quando a sessão expirasse.
  const [isAdmin, setIsAdmin] = useState(
    () => localStorage.getItem('auth_is_admin') === 'true',
  );
  const [showChangePass, setShowChangePass] = useState(false);

  // Verifica se o token ainda é válido ao carregar
  useEffect(() => {
    if (!token) return;
    fetch('/api/auth/verify', { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) return handleLogout();
        setIsAdmin(d.isAdmin === true);
        localStorage.setItem('auth_is_admin', String(d.isAdmin === true));
      })
      .catch(() => handleLogout());
  }, []);

  function handleLogin(newToken, newUsername, newIsAdmin) {
    setToken(newToken);
    setUsername(newUsername);
    setIsAdmin(newIsAdmin === true);
  }

  function handleLogout() {
    // Sair precisa levar TODO o dado de negócio junto, e não só a credencial. Os caches
    // abaixo guardam nome e e-mail de responsáveis do CRM; num computador compartilhado,
    // deixá-los para trás entrega ao próximo usuário exatamente o que o logout promete tirar.
    for (const chave of [
      'auth_token',
      'auth_user',
      'auth_is_admin',
      'deals_cache',
      'deals_cache_time',
      'report_cache',
      'report_cache_time',
      'resolved_cache',
      'dashboard_check_cache',
    ]) {
      localStorage.removeItem(chave);
    }
    setToken(null);
    setUsername('');
    setIsAdmin(false);
  }

  if (!token) {
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
