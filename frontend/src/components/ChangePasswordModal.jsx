import { useState } from 'react'
import { Lock, Eye, EyeOff, X, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ChangePasswordModal({ username, onClose }) {
  const [current, setCurrent] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!current) { toast.error('Informe sua senha atual.'); return }
    if (newPass.length < 6) { toast.error('A nova senha deve ter pelo menos 6 caracteres.'); return }
    if (newPass !== confirm) { toast.error('As senhas não coincidem.'); return }
    if (newPass === current) { toast.error('A nova senha deve ser diferente da atual.'); return }

    setLoading(true)
    try {
      const r = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: newPass }),
      })
      const data = await r.json()
      if (data.ok) {
        toast.success('Senha alterada com sucesso!')
        onClose()
      } else {
        toast.error(data.message || 'Erro ao alterar senha.')
      }
    } catch {
      toast.error('Erro ao conectar com o servidor.')
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Lock size={15} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Alterar senha</h2>
              <p className="text-xs text-gray-400">{username}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Senha atual</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showPass ? 'text' : 'password'}
                value={current}
                onChange={e => setCurrent(e.target.value)}
                placeholder="Sua senha atual"
                autoFocus
                className="w-full pl-9 pr-10 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
              <button type="button" onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Nova senha</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showPass ? 'text' : 'password'}
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Confirmar nova senha</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showPass ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repita a nova senha"
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>
          </div>

          {/* Força da senha */}
          {newPass && (
            <div>
              <div className="flex gap-1 mb-1">
                {[1,2,3,4].map(i => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                    newPass.length >= i * 3
                      ? i <= 1 ? 'bg-red-400' : i <= 2 ? 'bg-amber-400' : i <= 3 ? 'bg-yellow-400' : 'bg-green-500'
                      : 'bg-gray-200'
                  }`} />
                ))}
              </div>
              <p className="text-xs text-gray-400">
                {newPass.length < 6 ? 'Muito curta' : newPass.length < 9 ? 'Razoável' : newPass.length < 12 ? 'Boa' : 'Forte'}
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
              {loading ? <span className="animate-pulse">Salvando...</span> : <><CheckCircle size={15} /> Salvar</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
