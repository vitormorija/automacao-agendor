const nodemailer = require('nodemailer');
const { getConfig } = require('./db');

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

function dealEmailHtml({ deal, ownerName, isAdmin, adminEmail }) {
  const updatedDate = new Date(deal.updatedAt).toLocaleDateString('pt-BR');
  const createdDate = new Date(deal.createdAt).toLocaleDateString('pt-BR');
  const greeting = isAdmin
    ? `<p>Olá, Administrador!</p><p>O seguinte negócio está parado e requer atenção:</p>`
    : `<p>Olá, <strong>${ownerName}</strong>!</p><p>Um dos seus negócios no Agendor está sem atualização há mais de ${deal.daysSinceUpdate} dias:</p>`;

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #1a56db; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">⚠️ Negócio sem atualização</h2>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        ${greeting}
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <h3 style="margin: 0 0 12px 0; color: #1a56db;">${deal.title}</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 4px 8px; color: #6b7280; width: 40%;">Responsável:</td><td style="padding: 4px 8px;"><strong>${deal.ownerName || 'Não definido'}</strong></td></tr>
            <tr><td style="padding: 4px 8px; color: #6b7280;">Empresa:</td><td style="padding: 4px 8px;">${deal.organization || '-'}</td></tr>
            <tr><td style="padding: 4px 8px; color: #6b7280;">Funil:</td><td style="padding: 4px 8px;">${deal.funnel || '-'}</td></tr>
            <tr><td style="padding: 4px 8px; color: #6b7280;">Etapa:</td><td style="padding: 4px 8px;">${deal.stage || '-'}</td></tr>
            <tr><td style="padding: 4px 8px; color: #6b7280;">Criado em:</td><td style="padding: 4px 8px;">${createdDate}</td></tr>
            <tr><td style="padding: 4px 8px; color: #6b7280;">Última atualização:</td><td style="padding: 4px 8px;"><strong style="color: #dc2626;">${updatedDate} (${deal.daysSinceUpdate} dias atrás)</strong></td></tr>
          </table>
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${deal.webUrl}" style="background: #1a56db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Abrir no Agendor →
          </a>
        </div>
        <p style="color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 16px;">
          Este email foi enviado automaticamente pelo sistema de monitoramento do Agendor.<br>
          Negócios criados em 2026 sem atualização há mais de ${deal.daysSinceUpdate} dias são monitorados diariamente.
        </p>
      </div>
    </body>
    </html>
  `;
}

async function sendStaleNotification({ deal, ownerEmail, adminEmail }) {
  const transporter = createTransporter();
  const from = getConfig('smtp_from') || getConfig('smtp_user');
  const subject = `⚠️ Negócio parado há ${deal.daysSinceUpdate} dias: ${deal.title}`;

  const results = [];

  // Email para o dono do card
  if (ownerEmail) {
    try {
      await transporter.sendMail({
        from,
        to: ownerEmail,
        subject,
        html: dealEmailHtml({ deal, ownerName: deal.ownerName, isAdmin: false }),
      });
      results.push({ to: ownerEmail, success: true });
    } catch (err) {
      results.push({ to: ownerEmail, success: false, error: err.message });
    }
  }

  // Email para o administrador (se diferente do dono)
  if (adminEmail && adminEmail !== ownerEmail) {
    try {
      await transporter.sendMail({
        from,
        to: adminEmail,
        subject,
        html: dealEmailHtml({ deal, ownerName: deal.ownerName, isAdmin: true, adminEmail }),
      });
      results.push({ to: adminEmail, success: true });
    } catch (err) {
      results.push({ to: adminEmail, success: false, error: err.message });
    }
  }

  return results;
}

async function verifySmtp() {
  const transporter = createTransporter();
  return transporter.verify();
}

module.exports = { sendStaleNotification, verifySmtp };
