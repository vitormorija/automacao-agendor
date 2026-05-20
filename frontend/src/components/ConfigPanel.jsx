import { useState, useEffect } from 'react'
import { Save, TestTube, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'

const CRON_PRESETS = [
  { label: 'Todo dia às 8h', value: '0 8 * * *' },
  { label: 'Todo dia às 9h', value: '0 9 * * *' },
  { label: 'Segunda e quinta às 8h', value: '0 8 * * 1,4' },
  { label: 'Todo dia às 7h e 18h', value: '0 7,18 * * *' },
  { label: 'Personalizado', value: 'custom' },
]

export default function ConfigPanel() {
  const [config, setConfig] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [cronPreset, setCronPreset] = useState('0 8 * * *')
  const [customCron, setCustomCron] = useState('')

  useEffect(() => { fetchConfig() }, [])

  async function fetchConfig() {
    setLoading(true)
    try {
      const r = await fetch('/api/config')
      const d = await r.json()
      setConfig(d)
      const preset = CRON_PRESETS.find(p => p.value === d.cron_schedule && p.value !== 'custom')
      setCronPreset(preset ? d.cron_schedule : 'custom')
      setCustomCron(d.cron_schedule || '0 8 * * *')
    } catch {}
    setLoading(false)
  }

  function handleChange(key, value) {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  async function save() {
    setSaving(true)
    try {
      const payload = {
        ...config,
        cron_schedule: cronPreset === 'custom' ? customCron : cronPreset,
      }
      const r = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (r.ok) toast.success('Configurações salvas!')
      else toast.error('Erro ao salvar configurações')
    } catch {
      toast.error('Erro ao salvar configurações')
    }
    setSaving(false)
  }

  async function testSmtp() {
    setTesting(true)
    try {
      const r = await fetch('/api/config/test-smtp', { method: 'POST' })
      const d = await r.json()
      if (d.ok) toast.success(d.message)
      else toast.error(d.message)
    } catch {
      toast.error('Erro ao testar conexão SMTP')
    }
    setTesting(false)
  }

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Carregando configurações...</div>

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Regras de monitoramento */}
      <Section title="Regras de monitoramento">
        <Field label="Dias sem atualização para alertar" help="Negócios criados em 2026 sem atualização por X dias recebem notificação">
          <input
            type="number"
            min="1"
            max="365"
            value={config.stale_days || 15}
            onChange={e => handleChange('stale_days', e.target.value)}
            className="input w-24"
          />
        </Field>

        <Field label="Notificações ativas">
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => handleChange('notifications_enabled', config.notifications_enabled === 'true' ? 'false' : 'true')}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${config.notifications_enabled === 'true' ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${config.notifications_enabled === 'true' ? 'translate-x-6' : 'translate-x-1'}`} />
            </div>
            <span className="text-sm text-gray-700">
              {config.notifications_enabled === 'true' ? 'Ativado' : 'Desativado'}
            </span>
          </label>
        </Field>

        <Field label="Agendamento (cron)" help="Define quando a verificação automática será executada">
          <div className="space-y-2">
            <select
              value={cronPreset}
              onChange={e => setCronPreset(e.target.value)}
              className="input w-full"
            >
              {CRON_PRESETS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            {cronPreset === 'custom' && (
              <input
                type="text"
                value={customCron}
                onChange={e => setCustomCron(e.target.value)}
                placeholder="ex: 0 8 * * *"
                className="input w-full font-mono text-sm"
              />
            )}
          </div>
        </Field>
      </Section>

      {/* Email dos administradores */}
      <Section title="Administradores">
        <Field
          label="Emails dos administradores"
          help="Recebem o resumo semanal toda sexta às 11h. Para mais de um, separe por vírgula."
        >
          <textarea
            rows={3}
            value={config.admin_email || ''}
            onChange={e => handleChange('admin_email', e.target.value)}
            placeholder="admin1@empresa.com.br, admin2@empresa.com.br"
            className="input w-full resize-none"
          />
          {config.admin_email && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {config.admin_email.split(',').map(e => e.trim()).filter(Boolean).map((email, i) => (
                <span key={i} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full border border-blue-200">
                  {email}
                </span>
              ))}
            </div>
          )}
        </Field>

        <Field label="Notificar o criador do card" help="Se ativado, quem criou o negócio também recebe o email (além do responsável)">
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => handleChange('notify_author', config.notify_author === 'true' ? 'false' : 'true')}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${config.notify_author !== 'false' ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${config.notify_author !== 'false' ? 'translate-x-6' : 'translate-x-1'}`} />
            </div>
            <span className="text-sm text-gray-700">
              {config.notify_author !== 'false' ? 'Ativado' : 'Desativado'}
            </span>
          </label>
        </Field>
      </Section>

      {/* Configuração SMTP */}
      <Section title="Configuração de Email (SMTP)">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Servidor SMTP">
            <input
              type="text"
              value={config.smtp_host || ''}
              onChange={e => handleChange('smtp_host', e.target.value)}
              placeholder="smtp.gmail.com"
              className="input w-full"
            />
          </Field>
          <Field label="Porta">
            <input
              type="number"
              value={config.smtp_port || 587}
              onChange={e => handleChange('smtp_port', e.target.value)}
              className="input w-full"
            />
          </Field>
        </div>
        <Field label="Usuário (email)">
          <input
            type="email"
            value={config.smtp_user || ''}
            onChange={e => handleChange('smtp_user', e.target.value)}
            placeholder="seu-email@gmail.com"
            className="input w-full"
          />
        </Field>
        <Field label="Senha / App Password">
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              value={config.smtp_pass || ''}
              onChange={e => handleChange('smtp_pass', e.target.value)}
              placeholder="••••••••"
              className="input w-full pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPass(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </Field>
        <Field label="Remetente (From)" help='Ex: "Automação Agendor" <seu-email@gmail.com>'>
          <input
            type="text"
            value={config.smtp_from || ''}
            onChange={e => handleChange('smtp_from', e.target.value)}
            placeholder="Automação Agendor <noreply@empresa.com.br>"
            className="input w-full"
          />
        </Field>

        <div className="pt-1">
          <button
            onClick={testSmtp}
            disabled={testing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            <TestTube size={15} />
            {testing ? 'Testando...' : 'Testar conexão SMTP'}
          </button>
        </div>
      </Section>

      {/* Salvar */}
      <div className="flex justify-end pt-2">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg font-medium text-sm transition-colors"
        >
          <Save size={16} />
          {saving ? 'Salvando...' : 'Salvar configurações'}
        </button>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h2 className="text-base font-semibold text-gray-800 border-b border-gray-100 pb-3">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, help, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {help && <p className="text-xs text-gray-400 mb-1.5">{help}</p>}
      {children}
    </div>
  )
}
