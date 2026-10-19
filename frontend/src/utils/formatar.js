// Formatação sempre no fuso de São Paulo, independentemente do fuso do computador.
export const FUSO = 'America/Sao_Paulo';
// São Paulo não tem horário de verão desde 2019; o deslocamento é fixo.
export const DESLOCAMENTO_SP = '-03:00';

const fmtNumero = new Intl.NumberFormat('pt-BR');
const fmtPct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export function formatarNumero(n) {
  return fmtNumero.format(n ?? 0);
}

export function formatarPercentual(n) {
  return `${fmtPct.format(n ?? 0)}%`;
}

/**
 * A API devolve agendamentos em hora LOCAL de São Paulo, sem fuso ("2026-10-20T14:00:00").
 * Recebimentos vêm com fuso. Esta função entende os dois formatos.
 */
export function paraInstante(valor) {
  if (valor instanceof Date) return valor;
  if (typeof valor === 'string' && /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(valor)) {
    return new Date(`${valor}${DESLOCAMENTO_SP}`);
  }
  return new Date(valor);
}

export function formatarData(iso, opcoes = {}) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long', ...opcoes,
  }).format(paraInstante(iso));
}

export function formatarDataCurta(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(paraInstante(iso));
}

export function formatarHora(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO, hour: '2-digit', minute: '2-digit',
  }).format(paraInstante(iso));
}

export function formatarDataHora(iso) {
  if (!iso) return '';
  return `${formatarDataCurta(iso)} às ${formatarHora(iso)}`;
}

/** Partes de data/hora de um instante, vistas em São Paulo. */
export function partesSP(data = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(data);
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  return { ano: p.year, mes: p.month, dia: p.day, hora: p.hour, minuto: p.minute, segundo: p.second };
}

/** 'YYYY-MM-DD' de hoje em São Paulo. */
export function hojeSP() {
  const p = partesSP();
  return `${p.ano}-${p.mes}-${p.dia}`;
}

/** 'YYYY-MM-DD' de hoje + n dias, em São Paulo. */
export function diaSP(deslocamentoDias = 0) {
  const p = partesSP(new Date(Date.now() + deslocamentoDias * 86400000));
  return `${p.ano}-${p.mes}-${p.dia}`;
}

/** 'YYYY-MM' do mês atual em São Paulo. */
export function mesAtualSP() {
  const p = partesSP();
  return `${p.ano}-${p.mes}`;
}

/** Junta data 'YYYY-MM-DD' e hora 'HH:MM' no formato ISO com fuso exigido pela API. */
export function paraIsoComFuso(data, hora) {
  return `${data}T${hora}:00${DESLOCAMENTO_SP}`;
}

/** Valor para <input type="datetime-local"> representando agora em São Paulo. */
export function agoraDatetimeLocalSP() {
  const p = partesSP();
  return `${p.ano}-${p.mes}-${p.dia}T${p.hora}:${p.minuto}`;
}

/** Converte o valor de um datetime-local (interpretado como horário de SP) para ISO com fuso. */
export function datetimeLocalParaIso(valor) {
  return `${valor}:00${DESLOCAMENTO_SP}`;
}

export function primeiroNome(nome = '') {
  return nome.trim().split(/\s+/)[0] ?? '';
}
