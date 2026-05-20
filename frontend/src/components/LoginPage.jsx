import { useState, useEffect } from 'react'
import { Lock, User, Eye, EyeOff, LogIn, ArrowLeft, Mail, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'

// ── Tela de redefinição de senha (via link do e-mail) ────────────
function ResetPasswordForm({ token }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < 6) { toast.error('A senha deve ter pelo menos 6 caracteres.'); return }
    if (password !== confirm) { toast.error('As senhas não coincidem.'); return }
    setLoading(true)
    try {
      const r = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      })
      const data = await r.json()
      if (data.ok) { setDone(true); toast.success(data.message) }
      else toast.error(data.message || 'Link inválido ou expirado.')
    } catch { toast.error('Erro ao conectar com o servidor.') }
    setLoading(false)
  }

  if (done) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500 rounded-2xl mb-4 shadow-lg">
          <CheckCircle size={28} className="text-white" />
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Senha redefinida!</h1>
        <p className="text-sm text-gray-500 mb-6">Sua senha foi alterada com sucesso.</p>
        <a href="/" className="inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          <LogIn size={15} /> Ir para o login
        </a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <Lock size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Nova senha</h1>
          <p className="text-sm text-gray-500 mt-1">Escolha uma nova senha para sua conta</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nova senha</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoFocus
                  className="w-full pl-9 pr-10 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirmar senha</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repita a nova senha"
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
              {loading ? <span className="animate-pulse">Salvando...</span> : <><CheckCircle size={16} /> Salvar nova senha</>}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Tela "Esqueci minha senha" ────────────────────────────────────
function ForgotPasswordForm({ onBack }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email) { toast.error('Informe seu e-mail.'); return }
    setLoading(true)
    try {
      const r = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: email }),
      })
      const data = await r.json()
      if (data.ok) setSent(true)
      else toast.error(data.message || 'Erro ao processar.')
    } catch { toast.error('Erro ao conectar com o servidor.') }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <Mail size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Esqueci minha senha</h1>
          <p className="text-sm text-gray-500 mt-1">Enviaremos um link para redefinir sua senha</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          {sent ? (
            <div className="text-center py-2">
              <CheckCircle size={40} className="text-green-500 mx-auto mb-3" />
              <p className="text-sm text-gray-700 font-medium mb-1">E-mail enviado!</p>
              <p className="text-sm text-gray-500">
                Se este e-mail estiver cadastrado, você receberá as instruções em instantes.
              </p>
              <button onClick={onBack}
                className="mt-5 text-sm text-blue-600 hover:underline flex items-center gap-1 mx-auto">
                <ArrowLeft size={14} /> Voltar ao login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Seu e-mail de acesso</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="seu@email.com.br"
                    autoFocus
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                {loading ? <span className="animate-pulse">Enviando...</span> : <><Mail size={16} /> Enviar link de redefinição</>}
              </button>
              <button type="button" onClick={onBack}
                className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                <ArrowLeft size={14} /> Voltar ao login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tela de login principal ───────────────────────────────────────
export default function LoginPage({ onLogin }) {
  const [screen, setScreen] = useState('login') // login | forgot
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)

  // Detecta token de reset na URL
  const resetToken = new URLSearchParams(window.location.search).get('reset_token')
  if (resetToken) return <ResetPasswordForm token={resetToken} />

  if (screen === 'forgot') return <ForgotPasswordForm onBack={() => setScreen('login')} />

  async function handleSubmit(e) {
    e.preventDefault()
    if (!username || !password) { toast.error('Preencha usuário e senha.'); return }
    setLoading(true)
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await r.json()
      if (r.status === 429) { toast.error(data.message); setLoading(false); return }
      if (data.ok && data.token) {
        localStorage.setItem('auth_token', data.token)
        localStorage.setItem('auth_user', data.username)
        toast.success(`Bem-vindo!`)
        onLogin(data.token, data.username)
      } else {
        toast.error(data.message || 'Usuário ou senha incorretos.')
      }
    } catch { toast.error('Erro ao conectar com o servidor.') }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <Lock size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Automação Agendor</h1>
          <p className="text-sm text-gray-500 mt-1">Faça login para continuar</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">E-mail</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="seu@email.com.br"
                  autoComplete="username"
                  autoFocus
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700">Senha</label>
                <button type="button" onClick={() => setScreen('forgot')}
                  className="text-xs text-blue-600 hover:underline">
                  Esqueci minha senha
                </button>
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  autoComplete="current-password"
                  className="w-full pl-9 pr-10 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
              {loading ? <span className="animate-pulse">Entrando...</span> : <><LogIn size={16} /> Entrar</>}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Cadmus · Sistema interno · Acesso restrito
        </p>
      </div>
    </div>
  )
}
