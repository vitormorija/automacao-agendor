// Controle de acesso por papel — ADMIN.
//
// Nasceu como função local de routes/auth.js, protegendo só as quatro rotas de gestão de
// usuário. Saiu de lá por dois motivos, nesta ordem de importância:
//
// (1) FALHAVA ABERTO. A versão anterior tinha `if (!ADMIN_USERS.length) return next()` — ou
//     seja, ambiente sem a variável configurada tratava TODO usuário autenticado como
//     administrador. O fail-fast de config.js torna isso impossível em produção (ADMIN_USERS
//     é obrigatória e o boot aborta sem ela), mas só quando NODE_ENV=production de fato
//     chega ao processo. Fora daí a ausência virava permissão total em silêncio. Agora nega:
//     um controle de acesso que não sabe quem é administrador não pode concluir que todos são.
//
// (2) A SUPERFÍCIE PROTEGIDA ESTAVA ERRADA. Gestão de usuário exigia papel, enquanto mudar
//     SMTP/agendamento (PUT /api/config) e disparar e-mail em massa
//     (POST /api/notifications/run e irmãs) não exigiam nada além de estar logado. Para
//     alcançar routes/config.js e routes/notifications.js o middleware precisa morar aqui.
//
// FORMATO DA RESPOSTA: `{ ok: false, message }`, e não o `{ error }` de middleware/auth.js.
// A escolha preserva exatamente o que as quatro rotas de auth.js já devolviam antes da
// extração (nenhuma regressão de contrato para o painel) e coincide com o formato dominante
// de routes/config.js, o novo consumidor.

// Lido a cada chamada, e não uma vez no load do módulo, para que um teste possa ajustar
// process.env.ADMIN_USERS entre casos sem precisar reimportar o módulo. O custo é dividir
// uma string curta por requisição, numa aplicação interna com um punhado de usuários.
function listaDeAdmins() {
  return (process.env.ADMIN_USERS || '')
    .split(',')
    .map((u) => u.trim().toLowerCase())
    .filter(Boolean);
}

// Predicado exportado para o painel: /api/auth/login e /verify devolvem `isAdmin` para que
// o frontend não exiba controles que o backend vai recusar. É informação de exibição — a
// decisão de acesso continua sendo tomada aqui, no servidor, a cada requisição.
function isAdmin(username) {
  const admins = listaDeAdmins();
  if (!admins.length) return false;
  return admins.includes(String(username || '').toLowerCase());
}

function requireAdmin(req, res, next) {
  if (isAdmin(req.user?.username)) return next();
  return res
    .status(403)
    .json({ ok: false, message: 'Acesso restrito a administradores.' });
}

module.exports = { requireAdmin, isAdmin };
