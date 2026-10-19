export function emailValido(email = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function apenasDigitos(texto = '') {
  return texto.replace(/\D/g, '');
}

export function telefoneValido(telefone = '') {
  const d = apenasDigitos(telefone);
  return d.length === 10 || d.length === 11;
}

/** Máscara (11) 98765-4321 / (11) 3456-7890 aplicada enquanto a pessoa digita. */
export function mascararTelefone(valor = '') {
  const d = apenasDigitos(valor).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Quantidade inteira positiva até o limite. Recusa frações em vez de arredondar (contrato, seção 1). */
export function quantidadeValida(valor, max = 9999) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1 && n <= max;
}

export const SENHA_MINIMO = 8;

export function gerarSenhaProvisoria() {
  // Sem caracteres ambíguos (0/O, 1/l/I), para ditar por telefone com segurança.
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const valores = new Uint32Array(10);
  crypto.getRandomValues(valores);
  return Array.from(valores, (v) => letras[v % letras.length]).join('');
}

/** UUID v4 para chave_operacao; crypto.randomUUID exige contexto seguro (https ou 127.0.0.1). */
export function gerarUuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
