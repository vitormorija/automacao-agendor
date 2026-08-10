// Piso de tamanho de senha, espelhando `MIN_SENHA` de backend/src/routes/auth.js.
//
// Existia como o número 6 digitado à mão em cinco lugares de duas telas. Quando o backend
// subiu para 12, os cinco continuaram dizendo 6 — e o efeito é pior do que uma validação
// ausente: o campo AFIRMAVA que 8 caracteres bastavam, o usuário obedecia, e o servidor
// recusava contradizendo o rótulo que ele acabara de seguir. Um teste no backend confere
// que o número aqui não volta a divergir.
export const MIN_SENHA = 12;
