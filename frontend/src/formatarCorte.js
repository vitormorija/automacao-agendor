// Rótulo do recorte de negócios monitorados.
//
// Existia como o texto fixo "Criados em 2026", digitado à mão em três telas. Duas coisas
// erradas nisso: o rótulo podia divergir do filtro sem ninguém perceber, e em 2027 a frase
// continuaria dizendo 2026 — correta e incompreensível ao mesmo tempo. Agora o corte vem do
// backend (campo `dealsSince`, o mesmo valor que o filtro usa) e a frase é derivada dele.
export function rotuloDoCorte(dealsSince) {
  if (!dealsSince) return 'Criados no período monitorado';
  const d = new Date(`${dealsSince}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 'Criados no período monitorado';
  return `Criados a partir de ${d.toLocaleDateString('pt-BR')}`;
}
