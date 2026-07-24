const nodemailer = require('nodemailer');
const { getConfig } = require('./db');
const { shouldNotifyOwner } = require('./agendor');

function createTransporter() {
  return nodemailer.createTransport({
    host: getConfig('smtp_host'),
    port: parseInt(getConfig('smtp_port')),
    secure: parseInt(getConfig('smtp_port')) === 465,
    auth: {
      user: getConfig('smtp_user'),
      pass: getConfig('smtp_pass'),
    },
  });
}

function urgencyColor(days) {
  if (days >= 45) return '#dc2626';
  if (days >= 30) return '#d97706';
  return '#ca8a04';
}

// Retorna a BASE_URL pública do backend quando configurada e acessível externamente.
// Se não houver BASE_URL ou ela apontar para localhost/127.0.0.1, retorna null —
// nesse caso os emails usam o link direto do Agendor (sem tracking de cliques),
// para não enviar URLs quebradas para usuários em outras máquinas/celulares.
function getPublicBaseUrl() {
  const raw = (process.env.BASE_URL || '').trim();
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host.endsWith('.local')
    ) {
      return null;
    }
    return raw.replace(/\/+$/, '');
  } catch (_) {
    return null;
  }
}

function dealEmailHtml({ deal, ownerName, role, logId }) {
  const publicBase = getPublicBaseUrl();
  // Usa tracking apenas quando temos BASE_URL pública E logId — caso contrário,
  // link direto para o card no Agendor (garante que sempre abre, sem depender do nosso servidor).
  // O parâmetro `u` serve de fallback se o log_id for perdido (DB resetado, log antigo).
  const trackUrl =
    publicBase && logId && deal.webUrl
      ? `${publicBase}/api/track/click?log_id=${logId}&u=${encodeURIComponent(deal.webUrl)}`
      : deal.webUrl;
  const updatedDate = new Date(deal.updatedAt).toLocaleDateString('pt-BR');
  const createdDate = new Date(deal.createdAt).toLocaleDateString('pt-BR');
  const color = urgencyColor(deal.daysSinceUpdate);

  const tipoLabel = deal.dealType === 'Lead' ? 'lead' : 'negócio';
  const greeting =
    role === 'author'
      ? `Olá, <strong>${ownerName}</strong>! Um ${tipoLabel} que você criou está sem atualização há <strong style="color:${color};">${deal.daysSinceUpdate} dias</strong>.`
      : `Olá, <strong>${ownerName}</strong>! Um ${tipoLabel} sob sua responsabilidade está sem atualização há <strong style="color:${color};">${deal.daysSinceUpdate} dias</strong>.`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#1a56db;border-radius:10px 10px 0 0;padding:24px 28px;">
          <p style="margin:0;color:rgba(255,255,255,0.75);font-size:12px;letter-spacing:1px;text-transform:uppercase;">Automação Agendor · Monitor de Negócios</p>
          <h1 style="margin:8px 0 0 0;color:#fff;font-size:20px;">⚠️ ${deal.dealType === 'Lead' ? 'Lead' : 'Negócio'} parado há ${deal.daysSinceUpdate} dias</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;padding:28px;">

          <p style="margin:0 0 20px 0;font-size:15px;color:#374151;line-height:1.5;">${greeting}</p>

          <!-- Deal card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <span style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">${deal.dealType === 'Lead' ? 'Lead' : 'Negócio'}</span>
                <span style="display:inline-block;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700;
                  background:${deal.dealType === 'Lead' ? '#eff6ff' : '#f0fdf4'};
                  color:${deal.dealType === 'Lead' ? '#1d4ed8' : '#15803d'};
                  border:1px solid ${deal.dealType === 'Lead' ? '#bfdbfe' : '#bbf7d0'};">
                  ${deal.dealType === 'Lead' ? '🔵 Lead' : '🟢 Negócio'}
                </span>
              </div>
              <p style="margin:0;font-size:17px;font-weight:700;color:#111827;">${deal.title}</p>
            </td></tr>
            <tr><td style="padding:16px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="50%" style="padding-bottom:12px;vertical-align:top;">
                    <p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;">Empresa</p>
                    <p style="margin:3px 0 0 0;font-size:14px;color:#374151;">${deal.organization || '—'}</p>
                  </td>
                  <td width="50%" style="padding-bottom:12px;vertical-align:top;">
                    <p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;">Categoria</p>
                    <p style="margin:3px 0 0 0;font-size:14px;color:#374151;">${deal.orgCategory || 'Indefinido'}</p>
                  </td>
                </tr>
                <tr>
                  <td width="50%" style="padding-bottom:12px;vertical-align:top;">
                    <p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;">Funil</p>
                    <p style="margin:3px 0 0 0;font-size:14px;color:#374151;">${deal.funnel || '—'}</p>
                  </td>
                  <td width="50%" style="padding-bottom:12px;vertical-align:top;">
                    <p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;">Etapa atual</p>
                    <p style="margin:3px 0 0 0;font-size:14px;color:#374151;">${deal.stage || '—'}</p>
                  </td>
                </tr>
                <tr>
                  <td width="50%" style="vertical-align:top;">
                    <p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;">Criado em</p>
                    <p style="margin:3px 0 0 0;font-size:14px;color:#374151;">${createdDate}</p>
                  </td>
                  <td width="50%" style="vertical-align:top;">
                    <p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;">Última atualização</p>
                    <p style="margin:3px 0 0 0;font-size:14px;font-weight:700;color:${color};">${updatedDate} · ${deal.daysSinceUpdate} dias atrás</p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>

          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td align="center">
              <a href="${trackUrl}"
                style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:13px 32px;border-radius:7px;font-size:15px;font-weight:700;">
                Abrir card no Agendor →
              </a>
            </td></tr>
            <tr><td align="center" style="padding-top:8px;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">Ou copie o link: <a href="${deal.webUrl}" style="color:#1a56db;">${deal.webUrl}</a></p>
            </td></tr>
          </table>

          <!-- Dica -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-left:3px solid #1a56db;border-radius:4px;margin-bottom:20px;">
            <tr><td style="padding:12px 16px;">
              <p style="margin:0;font-size:12px;color:#1e40af;line-height:1.5;">
                <strong>O que conta como atualização?</strong> Qualquer ação dentro do card: comentário, mudança de etapa, nova tarefa ou alteração de campos.
              </p>
            </td></tr>
          </table>

          <!-- Footer -->
          <p style="margin:0;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:16px;line-height:1.6;">
            Este email foi enviado automaticamente pelo sistema de monitoramento do Agendor.<br>
            Negócios criados em 2026 sem movimentação há mais de ${getConfig('stale_days') || 15} dias são monitorados diariamente.
          </p>

        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Envia um e-mail com retry automático em caso de falha de rede (ECONNRESET, Timeout)
async function sendMailWithRetry(transporter, mailOptions, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await transporter.sendMail(mailOptions);
      return { success: true };
    } catch (err) {
      const isNetworkError =
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT' ||
        err.message?.toLowerCase().includes('timeout') ||
        err.message?.toLowerCase().includes('econnreset');

      if (isNetworkError && attempt < retries) {
        const wait = attempt * 3000; // 3s, 6s entre tentativas
        console.warn(
          `[Emailer] Tentativa ${attempt} falhou (${err.message}). Aguardando ${wait / 1000}s antes de retentar...`,
        );
        await new Promise((r) => setTimeout(r, wait));
        // Cria novo transporter para limpar a conexão antiga
        transporter = createTransporter();
        continue;
      }
      return { success: false, error: err.message };
    }
  }
}

async function sendStaleNotification({ deal, ownerEmail, authorEmail, logId }) {
  let transporter = createTransporter();
  const from = getConfig('smtp_from') || getConfig('smtp_user');
  const tipoSubject = deal.dealType === 'Lead' ? 'Lead' : 'Negócio';
  const subject = `⚠️ ${tipoSubject} parado há ${deal.daysSinceUpdate} dias: ${deal.title}`;
  const results = [];

  // Email para o dono do card
  if (ownerEmail) {
    const result = await sendMailWithRetry(transporter, {
      from,
      to: ownerEmail,
      subject,
      html: dealEmailHtml({
        deal,
        ownerName: deal.ownerName,
        role: 'owner',
        logId,
      }),
    });
    results.push({ to: ownerEmail, ...result });
  }

  // Email para o criador (se diferente do dono)
  if (authorEmail && authorEmail !== ownerEmail) {
    const result = await sendMailWithRetry(transporter, {
      from,
      to: authorEmail,
      subject,
      html: dealEmailHtml({
        deal,
        ownerName: deal.authorName,
        role: 'author',
        logId,
      }),
    });
    results.push({ to: authorEmail, ...result });
  }

  return results;
}

function buildOwnerBlocks(deals) {
  const byOwner = {};
  for (const d of deals) {
    const name = d.ownerName || 'Sem responsável';
    if (!byOwner[name]) byOwner[name] = [];
    byOwner[name].push(d);
  }
  return Object.entries(byOwner)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([owner, ownerDeals]) => {
      const rows = ownerDeals
        .map(
          (d) => `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;">${d.title}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;">${d.organization || '—'}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;">${d.funnel || '—'}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;text-align:center;">
            <span style="background:${d.daysSinceUpdate >= 45 ? '#fef2f2' : d.daysSinceUpdate >= 30 ? '#fff7ed' : '#fefce8'};
                         color:${d.daysSinceUpdate >= 45 ? '#dc2626' : d.daysSinceUpdate >= 30 ? '#d97706' : '#ca8a04'};
                         padding:2px 8px;border-radius:99px;font-size:12px;font-weight:600;">
              ${d.daysSinceUpdate}d
            </span>
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;text-align:center;">
            <a href="${d.webUrl}" style="color:#1a56db;text-decoration:none;font-size:12px;">Abrir →</a>
          </td>
        </tr>
      `,
        )
        .join('');
      return `
        <div style="margin-bottom:20px;">
          <div style="background:#f8fafc;border-left:3px solid #1a56db;padding:8px 14px;margin-bottom:8px;">
            <strong style="color:#1e3a5f;">${owner}</strong>
            <span style="color:#64748b;font-size:13px;margin-left:8px;">${ownerDeals.length} item(s)</span>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="background:#f1f5f9;color:#64748b;">
                <th style="padding:8px 10px;text-align:left;font-weight:600;">Nome</th>
                <th style="padding:8px 10px;text-align:left;font-weight:600;">Empresa</th>
                <th style="padding:8px 10px;text-align:left;font-weight:600;">Funil</th>
                <th style="padding:8px 10px;text-align:center;font-weight:600;">Parado há</th>
                <th style="padding:8px 10px;text-align:center;font-weight:600;">Link</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    })
    .join('');
}

function weeklySummaryHtml({ deals, weekLabel }) {
  const leads = deals.filter((d) => d.dealType === 'Lead');
  const negocios = deals.filter((d) => d.dealType === 'Negócio');
  const total = deals.length;
  const avgDays = total
    ? Math.round(deals.reduce((s, d) => s + d.daysSinceUpdate, 0) / total)
    : 0;
  const maxDays = total ? Math.max(...deals.map((d) => d.daysSinceUpdate)) : 0;

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family:Arial,sans-serif;color:#333;max-width:700px;margin:0 auto;padding:20px;">
      <div style="background:#1a56db;color:white;padding:24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0 0 4px 0;">📊 Resumo Semanal — Parados sem atualização</h2>
        <p style="margin:0;opacity:0.85;font-size:14px;">${weekLabel}</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">

        <!-- Cards de resumo -->
        <div style="display:flex;gap:12px;margin-bottom:24px;">
          <div style="flex:1;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:#dc2626;">${total}</div>
            <div style="font-size:12px;color:#dc2626;margin-top:2px;">Total parados</div>
          </div>
          <div style="flex:1;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:#1d4ed8;">${leads.length}</div>
            <div style="font-size:12px;color:#1d4ed8;margin-top:2px;">🔵 Leads</div>
          </div>
          <div style="flex:1;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:#15803d;">${negocios.length}</div>
            <div style="font-size:12px;color:#15803d;margin-top:2px;">🟢 Negócios</div>
          </div>
          <div style="flex:1;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:#d97706;">${avgDays}d</div>
            <div style="font-size:12px;color:#d97706;margin-top:2px;">Média de dias</div>
          </div>
          <div style="flex:1;background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:16px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#ca8a04;">${maxDays}d</div>
            <div style="font-size:12px;color:#ca8a04;margin-top:2px;">Máximo de dias</div>
          </div>
        </div>

        <!-- Seção Leads -->
        ${
          leads.length > 0
            ? `
        <div style="margin-bottom:28px;">
          <div style="display:flex;align-items:center;gap:10px;border-bottom:2px solid #bfdbfe;padding-bottom:10px;margin-bottom:16px;">
            <span style="background:#1d4ed8;color:white;padding:3px 12px;border-radius:99px;font-size:13px;font-weight:700;">🔵 Leads parados — ${leads.length}</span>
          </div>
          ${buildOwnerBlocks(leads)}
        </div>`
            : ''
        }

        <!-- Seção Negócios -->
        ${
          negocios.length > 0
            ? `
        <div style="margin-bottom:28px;">
          <div style="display:flex;align-items:center;gap:10px;border-bottom:2px solid #bbf7d0;padding-bottom:10px;margin-bottom:16px;">
            <span style="background:#15803d;color:white;padding:3px 12px;border-radius:99px;font-size:13px;font-weight:700;">🟢 Negócios parados — ${negocios.length}</span>
          </div>
          ${buildOwnerBlocks(negocios)}
        </div>`
            : ''
        }

        <p style="color:#94a3b8;font-size:12px;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:8px;">
          Este resumo é enviado automaticamente toda sexta-feira às 11h pelo sistema de monitoramento do Agendor.<br>
          Inclui negócios criados em 2026 sem atualização há mais de ${getConfig('stale_days') || 15} dias.
        </p>
      </div>
    </body>
    </html>
  `;
}

async function sendWeeklySummary({ deals, adminEmails }) {
  if (!adminEmails.length || !deals.length) return [];
  const transporter = createTransporter();
  const from = getConfig('smtp_from') || getConfig('smtp_user');
  const now = new Date();
  const weekLabel = `Semana de ${now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`;
  const subject = `📊 Resumo Semanal Agendor — ${deals.length} negócio(s) parado(s)`;
  const html = weeklySummaryHtml({ deals, weekLabel });
  const results = [];

  for (const adminMail of adminEmails) {
    if (!adminMail) continue;
    try {
      await transporter.sendMail({ from, to: adminMail, subject, html });
      results.push({ to: adminMail, success: true });
    } catch (err) {
      results.push({ to: adminMail, success: false, error: err.message });
    }
  }
  return results;
}

async function verifySmtp() {
  const transporter = createTransporter();
  return transporter.verify();
}

async function sendResetPasswordEmail({ to, resetUrl }) {
  const transporter = createTransporter();
  const from = getConfig('smtp_from') || getConfig('smtp_user');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

        <tr><td style="background:#1a56db;border-radius:10px 10px 0 0;padding:24px 28px;">
          <p style="margin:0;color:rgba(255,255,255,0.75);font-size:12px;letter-spacing:1px;text-transform:uppercase;">Automação Agendor · Segurança</p>
          <h1 style="margin:8px 0 0 0;color:#fff;font-size:20px;">🔑 Redefinição de senha</h1>
        </td></tr>

        <tr><td style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;padding:28px;">
          <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.5;">
            Recebemos uma solicitação para redefinir a senha da sua conta no sistema <strong>Automação Agendor</strong>.
          </p>
          <p style="margin:0 0 24px 0;font-size:14px;color:#6b7280;line-height:1.5;">
            Clique no botão abaixo para criar uma nova senha. Este link é válido por <strong>1 hora</strong>.
          </p>

          <div style="text-align:center;margin-bottom:24px;">
            <a href="${resetUrl}" style="display:inline-block;background:#1a56db;color:#fff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;">
              Redefinir minha senha
            </a>
          </div>

          <p style="margin:0 0 8px 0;font-size:13px;color:#9ca3af;line-height:1.5;">
            Se você não solicitou a redefinição, ignore este e-mail. Sua senha permanece a mesma.
          </p>
          <p style="margin:0;font-size:12px;color:#d1d5db;">
            Link: <a href="${resetUrl}" style="color:#1a56db;">${resetUrl}</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from,
    to,
    subject: '🔑 Redefinição de senha — Automação Agendor',
    html,
  });
}

// ─── Relatório semanal personalizado por comercial ───────────────

function ownerWeeklyHtml({ ownerName, deals, weekLabel, staleDays }) {
  const leads = deals.filter((d) => d.dealType === 'Lead');
  const negocios = deals.filter((d) => d.dealType !== 'Lead');
  const total = deals.length;
  const avgDays = total
    ? Math.round(deals.reduce((s, d) => s + d.daysSinceUpdate, 0) / total)
    : 0;
  const critical = deals.filter((d) => d.daysSinceUpdate >= 45).length;
  const warning = deals.filter(
    (d) => d.daysSinceUpdate >= 30 && d.daysSinceUpdate < 45,
  ).length;

  function urgBg(days) {
    return days >= 45 ? '#fef2f2' : days >= 30 ? '#fff7ed' : '#fefce8';
  }
  function urgColor(days) {
    return days >= 45 ? '#dc2626' : days >= 30 ? '#d97706' : '#ca8a04';
  }
  function urgLabel(days) {
    return days >= 45 ? '🔴 Crítico' : days >= 30 ? '🟠 Urgente' : '🟡 Atenção';
  }

  function buildDealRows(list) {
    return list
      .map(
        (d) => `
      <tr>
        <td style="padding:12px 14px;border-bottom:1px solid #f1f5f9;vertical-align:top;">
          <a href="${d.webUrl}" style="font-size:14px;font-weight:700;color:#1e3a5f;text-decoration:none;">${d.title}</a>
          <div style="font-size:12px;color:#64748b;margin-top:3px;">${d.organization || '—'} · ${d.funnel || '—'} · ${d.stage || '—'}</div>
        </td>
        <td style="padding:12px 14px;border-bottom:1px solid #f1f5f9;vertical-align:top;text-align:center;white-space:nowrap;">
          <span style="display:inline-block;padding:4px 12px;border-radius:99px;font-size:13px;font-weight:700;
            background:${urgBg(d.daysSinceUpdate)};color:${urgColor(d.daysSinceUpdate)};">
            ${d.daysSinceUpdate} dias
          </span>
          <div style="font-size:11px;color:${urgColor(d.daysSinceUpdate)};margin-top:4px;">${urgLabel(d.daysSinceUpdate)}</div>
        </td>
        <td style="padding:12px 14px;border-bottom:1px solid #f1f5f9;vertical-align:top;text-align:center;">
          <a href="${d.webUrl}"
            style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;
                   padding:7px 18px;border-radius:6px;font-size:12px;font-weight:700;white-space:nowrap;">
            Abrir →
          </a>
        </td>
      </tr>
    `,
      )
      .join('');
  }

  const firstName = ownerName.split(' ')[0];

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:28px 12px;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;">

  <!-- HEADER -->
  <tr><td style="background:#0b1f3a;border-radius:12px 12px 0 0;padding:28px 32px;">
    <p style="margin:0 0 6px 0;color:#3ab54a;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">
      ◆ Cadmus · Automação Agendor
    </p>
    <h1 style="margin:0 0 6px 0;color:#ffffff;font-size:22px;font-weight:700;line-height:1.3;">
      📋 Seu relatório semanal de cards parados
    </h1>
    <p style="margin:0;color:#94a3b8;font-size:13px;">${weekLabel}</p>
  </td></tr>

  <!-- SAUDAÇÃO -->
  <tr><td style="background:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;padding:24px 32px 0 32px;">
    <p style="margin:0;font-size:15px;color:#334155;line-height:1.6;">
      Olá, <strong>${firstName}</strong>! 👋
    </p>
    <p style="margin:10px 0 0 0;font-size:14px;color:#475569;line-height:1.6;">
      ${
        total === 0
          ? 'Ótimas notícias! 🎉 Você não tem nenhum card parado no momento. Continue assim!'
          : `Você tem <strong style="color:#dc2626;">${total} card${total > 1 ? 's' : ''} sem atualização</strong> há mais de ${staleDays} dias.
           Dá uma olhada abaixo e atualiza o que tiver andamento — isso ajuda muito o time!`
      }
    </p>
  </td></tr>

  ${
    total > 0
      ? `
  <!-- RESUMO EM CARDS -->
  <tr><td style="background:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;padding:20px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td width="25%" style="padding:4px;">
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#dc2626;">${total}</div>
            <div style="font-size:11px;color:#dc2626;margin-top:2px;">Total parados</div>
          </div>
        </td>
        <td width="25%" style="padding:4px;">
          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#d97706;">${avgDays}d</div>
            <div style="font-size:11px;color:#d97706;margin-top:2px;">Média de dias</div>
          </div>
        </td>
        <td width="25%" style="padding:4px;">
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#dc2626;">${critical}</div>
            <div style="font-size:11px;color:#dc2626;margin-top:2px;">🔴 Críticos</div>
          </div>
        </td>
        <td width="25%" style="padding:4px;">
          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#d97706;">${warning}</div>
            <div style="font-size:11px;color:#d97706;margin-top:2px;">🟠 Urgentes</div>
          </div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- LEGENDA -->
  <tr><td style="background:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;padding:0 32px 16px 32px;">
    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:6px 12px;background:#fef2f2;border-radius:6px;margin-right:8px;">
          <span style="font-size:12px;color:#dc2626;font-weight:600;">🔴 Crítico = 45+ dias</span>
        </td>
        <td width="8"></td>
        <td style="padding:6px 12px;background:#fff7ed;border-radius:6px;margin-right:8px;">
          <span style="font-size:12px;color:#d97706;font-weight:600;">🟠 Urgente = 30–44 dias</span>
        </td>
        <td width="8"></td>
        <td style="padding:6px 12px;background:#fefce8;border-radius:6px;">
          <span style="font-size:12px;color:#ca8a04;font-weight:600;">🟡 Atenção = 15–29 dias</span>
        </td>
      </tr>
    </table>
  </td></tr>

  ${
    negocios.length > 0
      ? `
  <!-- NEGÓCIOS -->
  <tr><td style="background:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;padding:0 32px 8px 32px;">
    <div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:4px;padding:10px 14px;margin-bottom:12px;">
      <strong style="color:#15803d;font-size:14px;">🟢 Negócios — ${negocios.length} parado${negocios.length > 1 ? 's' : ''}</strong>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:10px 14px;text-align:left;font-size:12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Nome do negócio</th>
          <th style="padding:10px 14px;text-align:center;font-size:12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Status</th>
          <th style="padding:10px 14px;text-align:center;font-size:12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Ação</th>
        </tr>
      </thead>
      <tbody>${buildDealRows(negocios.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate))}</tbody>
    </table>
  </td></tr>`
      : ''
  }

  ${
    leads.length > 0
      ? `
  <!-- LEADS -->
  <tr><td style="background:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;padding:16px 32px 8px 32px;">
    <div style="background:#eff6ff;border-left:4px solid #1d4ed8;border-radius:4px;padding:10px 14px;margin-bottom:12px;">
      <strong style="color:#1d4ed8;font-size:14px;">🔵 Leads — ${leads.length} parado${leads.length > 1 ? 's' : ''}</strong>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:10px 14px;text-align:left;font-size:12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Nome do lead</th>
          <th style="padding:10px 14px;text-align:center;font-size:12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Status</th>
          <th style="padding:10px 14px;text-align:center;font-size:12px;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0;">Ação</th>
        </tr>
      </thead>
      <tbody>${buildDealRows(leads.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate))}</tbody>
    </table>
  </td></tr>`
      : ''
  }

  <!-- DICA -->
  <tr><td style="background:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;padding:20px 32px;">
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 18px;">
      <p style="margin:0;font-size:13px;color:#1e40af;line-height:1.6;">
        💡 <strong>O que atualiza um card?</strong> Qualquer ação dentro do Agendor conta: comentário, mudança de etapa, nova tarefa ou alteração de campos.
        Basta entrar no card e registrar o andamento!
      </p>
    </div>
  </td></tr>
  `
      : ''
  }

  <!-- FOOTER -->
  <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:20px 32px;">
    <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.7;">
      Este relatório é enviado automaticamente toda sexta-feira às 11h.<br>
      Mostra apenas os cards <strong>sob sua responsabilidade</strong> sem atualização há mais de ${staleDays} dias.<br>
      <span style="color:#cbd5e1;">◆ Cadmus · Automação Agendor</span>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

async function sendOwnerWeeklySummary({ deals, users }) {
  // Filtra funis sem notificação ao responsável (ex.: Beefor) — os cards ainda
  // aparecem no relatório admin, mas não no e-mail individual do comercial.
  const notifiable = deals.filter(shouldNotifyOwner);
  const skippedByFunnel = deals.length - notifiable.length;
  if (skippedByFunnel > 0) {
    console.log(
      `[Emailer] Relatório semanal: ${skippedByFunnel} card(s) ignorado(s) por funil sem notificação ao responsável`,
    );
  }
  if (!notifiable.length) return [];

  const transporter = createTransporter();
  const from = getConfig('smtp_from') || getConfig('smtp_user');
  const staleDays = parseInt(getConfig('stale_days')) || 15;
  const now = new Date();
  const weekLabel = `Semana de ${now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`;
  const results = [];

  // Agrupa deals por dono
  const byOwner = {};
  for (const d of notifiable) {
    const owner = users[d.ownerId];
    if (!owner?.email) continue;
    if (!byOwner[owner.email])
      byOwner[owner.email] = { name: d.ownerName, deals: [] };
    byOwner[owner.email].deals.push(d);
  }

  for (const [email, { name, deals: ownerDeals }] of Object.entries(byOwner)) {
    const subject = `📋 Seus ${ownerDeals.length} card${ownerDeals.length > 1 ? 's' : ''} parado${ownerDeals.length > 1 ? 's' : ''} — Relatório semanal`;
    const html = ownerWeeklyHtml({
      ownerName: name,
      deals: ownerDeals,
      weekLabel,
      staleDays,
    });
    try {
      await transporter.sendMail({ from, to: email, subject, html });
      console.log(
        `[Emailer] Relatório semanal enviado para ${name} <${email}> — ${ownerDeals.length} card(s)`,
      );
      results.push({
        to: email,
        name,
        count: ownerDeals.length,
        success: true,
      });
    } catch (err) {
      console.error(`[Emailer] Erro ao enviar para ${email}:`, err.message);
      results.push({ to: email, name, success: false, error: err.message });
    }
  }

  return results;
}

module.exports = {
  sendStaleNotification,
  sendWeeklySummary,
  sendOwnerWeeklySummary,
  verifySmtp,
  sendResetPasswordEmail,
};
