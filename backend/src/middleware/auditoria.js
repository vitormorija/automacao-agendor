const { logAudit } = require('../db');
const logger = require('../logger');

// Trilha de auditoria das ações sensíveis.
//
// O parecer de segurança pediu papéis E trilha de auditoria no MESMO item, e a razão é que
// um sem o outro é meia medida: o controle de acesso diz quem PODE agir, e só a trilha diz
// quem AGIU. Sem ela, "mudaram o agendamento" e "dispararam e-mail para a base inteira" são
// perguntas sem resposta possível depois do fato.
//
// POR QUE MIDDLEWARE, E NÃO UMA CHAMADA DENTRO DE CADA HANDLER. São onze rotas a cobrir, e
// registrar dentro do handler falha por esquecimento — inclusive numa rota acrescentada
// depois. Aqui a auditoria fica ao lado do `requireAdmin` na declaração da rota: quem
// adiciona uma rota administrativa vê os dois juntos e dificilmente copia só um.
//
// POR QUE `res.on('finish')`. O registro sai DEPOIS que a resposta foi enviada, então grava
// o desfecho REAL — inclusive o código de status. Registrar antes gravaria a intenção, e
// intenção não é evidência: uma rodada que falhou no meio apareceria como se tivesse dado
// certo.
function auditar(acao) {
  return (req, res, next) => {
    res.on('finish', () => {
      try {
        logAudit({
          username: req.user?.username ?? null,
          acao,
          // O handler pode enriquecer com o QUE mudou (ver PUT /api/config, que grava a
          // lista de chaves alteradas). Continua opcional: uma rota sem detalhe ainda
          // registra quem, o quê e quando.
          detalhe: req.auditDetalhe ?? null,
          status: res.statusCode,
          ip: req.ip,
        });
      } catch (err) {
        // A auditoria NUNCA pode derrubar a requisição que ela observa: neste ponto a
        // resposta já foi enviada, e lançar aqui só produziria um unhandled error no
        // processo. Falhar em registrar é ruim; falhar em registrar E derrubar o servidor
        // é pior. A falha vira log de erro, que é o sinal de que a trilha tem um buraco.
        logger.error('[Auditoria] Falha ao registrar ação:', err.message);
      }
    });
    next();
  };
}

module.exports = { auditar };
