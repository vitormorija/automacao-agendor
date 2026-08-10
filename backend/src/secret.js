// Segredo de assinatura dos tokens JWT.
//
// Resolvido uma única vez no carregamento do módulo. NÃO há fallback: se a
// variável de ambiente estiver ausente ou for muito curta, o processo falha no
// boot. Isso evita o risco de rodar em produção com um segredo previsível
// (que permitiria forjar tokens de autenticação).
const JWT_SECRET = process.env.JWT_SECRET;

// Piso de 64 caracteres = os 32 bytes que o parecer de segurança exigiu, escritos em
// hexadecimal. Era 16, e um segredo de 16 caracteres tem ordem de grandeza de entropia
// suficiente para ser atacado offline por quem obtenha um único token — e todo token
// emitido carrega a assinatura, então o material de ataque circula por e-mail e por log.
//
// 64 e não "32 bytes medidos": o valor chega aqui como string, e contar bytes de uma string
// arbitrária não distingue um hex aleatório de uma frase digitada do mesmo tamanho. O número
// casa exatamente com `openssl rand -hex 32`, que é o comando que backend/.env.example já
// manda usar — a regra e a instrução dizem a mesma coisa, e a auditoria confere uma coisa só.
//
// ⚠️ ORDEM DE DEPLOY (mesma armadilha de D-13): este piso derruba o boot de qualquer
// ambiente cujo JWT_SECRET seja menor. GERE E PUBLIQUE O SEGREDO NOVO NO SERVIDOR ANTES de
// subir este código. Invertido, o `pm2 restart` seguinte não levanta.
const MIN_SEGREDO = 64;

if (!JWT_SECRET || JWT_SECRET.length < MIN_SEGREDO) {
  throw new Error(
    `JWT_SECRET ausente ou muito curto (mínimo ${MIN_SEGREDO} caracteres). ` +
      'Gere um novo com `openssl rand -hex 32` e defina a variável de ambiente. ' +
      'ATENÇÃO: trocar o segredo invalida todas as sessões ativas — todos precisarão entrar de novo.',
  );
}

module.exports = { JWT_SECRET };
