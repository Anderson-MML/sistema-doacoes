// Camada de adaptação para a API 2.0.0 do Anderson (openapi.json).
// As telas usam só este arquivo. Ele traduz o contrato da API para o formato interno do front:
//   - IDs internos sempre como string; ao enviar, id_item/id_agendamento/id_categoria voltam a número
//     e id_necessidade/id_recebimento continuam string (bigint, nunca converter para Number).
//   - Urgência interna sempre como { nivel, nome, cor }.
//   - Totais que a API devolve como string (histórico, relatórios) viram número aqui.
import { requisitar, requisitarCompleto } from './cliente.js';
import { hojeSP, diaSP, mesAtualSP, partesSP, paraInstante } from '../utils/formatar.js';

const admin = { autenticado: true };
const LIMITE = 100; // máximo aceito pela API por página
const txt = (v) => (v === null || v === undefined ? null : String(v));
const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const idNum = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// ---------------------------------------------------------------- categorias de urgência

let categoriasEmCache = null;

/** Lista de urgências (GET /categorias), guardada em memória: muda raramente. */
export async function listarCategorias() {
  if (!categoriasEmCache) {
    const lista = await requisitar('GET', '/categorias');
    categoriasEmCache = [...lista].sort((a, b) => a.nivel_ordem - b.nivel_ordem);
  }
  return categoriasEmCache;
}

async function idCategoriaDoNivel(nivel) {
  const c = (await listarCategorias()).find((x) => x.nivel_ordem === nivel);
  if (!c) throw new Error(`Prioridade ${nivel} não cadastrada.`);
  return c.id_categoria;
}

const urgenciaDe = (c) => (c ? { nivel: c.nivel_ordem, nome: c.nome_categoria, cor: c.cor_indicador } : { nivel: 3, nome: '?', cor: '' });

// ---------------------------------------------------------------- formatos internos

function necessidadePublica(n) {
  return {
    id_necessidade: txt(n.id_necessidade),
    id_item: txt(n.id_item),
    nome_item: n.nome_item,
    unidade_medida: n.unidade_medida,
    categoria_suprimento: n.categoria_suprimento,
    quantidade_meta: num(n.quantidade_meta),
    quantidade_arrecadada: num(n.quantidade_arrecadada),
    quantidade_faltante: num(n.quantidade_faltante),
    percentual_atendimento: num(n.percentual_atendimento),
    percentual_barra: num(n.percentual_barra),
    meta_atingida: Boolean(n.meta_atingida),
    urgencia: { nivel: n.nivel_ordem, nome: n.prioridade, cor: n.cor_indicador },
  };
}

function agendamentoInterno(a, recebidos = new Map()) {
  return {
    id_agendamento: txt(a.id_agendamento),
    data_hora_agendada: a.data_hora_agendada, // hora local de SP, sem fuso (formatar.js entende)
    status_agendamento: a.status_agendamento,
    doador: a.doador ? {
      id_doador: txt(a.doador.id_doador),
      nome: a.doador.nome,
      email: a.doador.email,
      telefone: a.doador.telefone,
      tipo_doador: a.doador.tipo_doador,
    } : null,
    itens: (a.itens ?? []).map((i) => ({
      id_item: txt(i.id_item),
      id_necessidade: txt(i.id_necessidade),
      nome_item: i.nome_item,
      unidade_medida: i.unidade_medida,
      quantidade_prometida: num(i.quantidade_doada),
      quantidade_recebida: recebidos.get(`${a.id_agendamento}|${i.id_item}`) ?? 0,
      status_item: i.status_item,
    })),
  };
}

function recebimentoInterno(r) {
  return {
    id_recebimento: txt(r.id_recebimento ?? r.id_doacao),
    id_agendamento: txt(r.id_agendamento),
    ocorrido_em: r.ocorrido_em,
    status: r.status,
    motivo_estorno: r.motivo_estorno ?? null,
    itens: (r.itens ?? []).map((i) => ({
      id_item: txt(i.id_item),
      id_necessidade: txt(i.id_necessidade),
      nome_item: i.nome_item_registrado,
      unidade_medida: i.unidade_registrada,
      quantidade: num(i.quantidade_recebida),
    })),
  };
}

const usuarioInterno = (u) => (u ? {
  id_usuario: txt(u.id_usuario ?? u.id), nome: u.nome ?? '', email: u.email ?? '', cargo: u.cargo ?? 'Administrador',
} : null);

// ================================================================ PÚBLICO

export const verificarSaude = () => requisitar('GET', '/health');
export const verificarProntidao = () => requisitar('GET', '/ready');

/**
 * Termômetro. A API filtra busca e categoria; a prioridade é filtrada aqui porque
 * a tela permite marcar mais de uma ao mesmo tempo.
 */
export async function listarNecessidades({ busca, categoria, nivel } = {}) {
  const lista = await requisitar('GET', '/necessidades', {
    params: { q: busca || undefined, categoria: categoria || undefined, limit: LIMITE },
  });
  let itens = lista.map(necessidadePublica);
  const niveis = (Array.isArray(nivel) ? nivel : []).map(Number);
  if (niveis.length) itens = itens.filter((i) => niveis.includes(i.urgencia.nivel));
  itens.sort((a, b) => a.urgencia.nivel - b.urgencia.nivel
    || a.percentual_atendimento - b.percentual_atendimento
    || a.nome_item.localeCompare(b.nome_item, 'pt-BR'));
  return { total: itens.length, itens };
}

/** Opções dos filtros: urgências de GET /categorias e tipos de produto presentes no termômetro. */
export async function obterFiltros() {
  const [categorias, todas] = await Promise.all([listarCategorias(), requisitar('GET', '/necessidades', { params: { limit: LIMITE } })]);
  return {
    urgencias: categorias.map(urgenciaDe),
    categorias: [...new Set(todas.map((n) => n.categoria_suprimento).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
  };
}

/** Horários com vagas em um dia (GET /disponibilidade). */
export async function consultarDisponibilidade(data) {
  const r = await requisitar('GET', '/disponibilidade', { params: { data } });
  return (r.horarios ?? []).map((h) => ({ horario: h.horario, capacidade: num(h.capacidade), vagas: num(h.vagas) }));
}

/**
 * POST /agendamentos. `chave` (Idempotency-Key) deve ser a MESMA numa nova tentativa após falha de rede.
 * Devolve { agendamento, token_acesso, repetido }.
 */
export async function criarAgendamento({ chave, doador, data, horario, itens }) {
  const r = await requisitar('POST', '/agendamentos', {
    cabecalhos: { 'Idempotency-Key': chave },
    corpo: {
      doador,
      data,
      horario,
      itens: itens.map((i) => ({ id_item: Number(i.id_item), id_necessidade: String(i.id_necessidade), quantidade_doada: i.quantidade })),
    },
  });
  return { agendamento: agendamentoInterno(r.agendamento), token_acesso: r.token_acesso, repetido: r.repetido };
}

// ---- rotas do doador com o código privado do agendamento

export async function consultarMeuAgendamento(id, token) {
  return agendamentoInterno(await requisitar('GET', `/agendamentos/${id}`, { tokenAgendamento: token }));
}

export async function cancelarMeuAgendamento(id, token) {
  return agendamentoInterno(await requisitar('PATCH', `/agendamentos/${id}/cancelar`, { tokenAgendamento: token, corpo: {} }));
}

export async function remarcarMeuAgendamento(id, token, data, horario) {
  return agendamentoInterno(await requisitar('PATCH', `/agendamentos/${id}/remarcar`, { tokenAgendamento: token, corpo: { data, horario } }));
}

// ================================================================ AUTENTICAÇÃO

export async function entrar(email, senha) {
  const r = await requisitar('POST', '/auth/login', { corpo: { email, senha } });
  return { token: r.token, expira_em: r.expira_em, usuario: usuarioInterno(r.usuario) };
}

export async function obterUsuarioAtual() {
  const r = await requisitar('GET', '/auth/me', admin);
  return usuarioInterno(r?.usuario ?? r);
}

/** Revoga a sessão no servidor. Falhas são ignoradas: o token local é apagado de qualquer forma. */
export async function sairDaSessao() {
  try { await requisitar('POST', '/auth/logout', admin); } catch { /* sessão já inválida */ }
}

// ================================================================ ADMIN: agendamentos e recebimentos

async function listarDoacoesBrutas() {
  return requisitar('GET', '/doacoes', { ...admin, params: { limit: LIMITE } });
}

/** Soma do que já chegou por agendamento e produto, a partir dos recebimentos confirmados. */
function somarRecebidos(doacoes) {
  const mapa = new Map();
  for (const d of doacoes) {
    if (d.status !== 'Confirmado' || !d.id_agendamento) continue;
    for (const i of d.itens ?? []) {
      const chave = `${d.id_agendamento}|${i.id_item}`;
      mapa.set(chave, (mapa.get(chave) ?? 0) + num(i.quantidade_recebida));
    }
  }
  return mapa;
}

const PERIODOS = {
  hoje: () => [hojeSP(), hojeSP()],
  semana: () => [hojeSP(), diaSP(7)],
  passados: () => [diaSP(-30), hojeSP()],
};

/**
 * GET /admin/agendamentos aceita um dia e um status por vez. Para "próximos 7 dias" e para
 * vários status, a lista (até 100) é filtrada aqui. "Já chegou" vem de GET /doacoes.
 */
export async function listarAgendamentosAdmin({ periodo = 'hoje', incluirEncerrados = false } = {}) {
  const [de, ate] = PERIODOS[periodo]();
  const [lista, doacoes] = await Promise.all([
    requisitar('GET', '/admin/agendamentos', { ...admin, params: { limit: LIMITE, data: periodo === 'hoje' ? de : undefined } }),
    listarDoacoesBrutas(),
  ]);
  const recebidos = somarRecebidos(doacoes);
  const status = incluirEncerrados ? ['Pendente', 'Confirmado', 'Concluído', 'Cancelado'] : ['Pendente', 'Confirmado'];
  const agendamentos = lista
    .filter((a) => status.includes(a.status_agendamento))
    .filter((a) => { const dia = a.data_hora_agendada.slice(0, 10); return dia >= de && dia <= ate; })
    .sort((a, b) => a.data_hora_agendada.localeCompare(b.data_hora_agendada))
    .map((a) => agendamentoInterno(a, recebidos));
  return { total: agendamentos.length, agendamentos };
}

export const cancelarAgendamentoAdmin = (id) => requisitar('PATCH', `/admin/agendamentos/${id}/cancelar`, { ...admin, corpo: {} });
export const remarcarAgendamentoAdmin = (id, data, horario) =>
  requisitar('PATCH', `/admin/agendamentos/${id}/remarcar`, { ...admin, corpo: { data, horario } });
/** Sem pendências: corpo vazio. Com itens faltando, a API exige motivo_pendencias. */
export const concluirAgendamento = (id, motivo) =>
  requisitar('PATCH', `/admin/agendamentos/${id}/concluir`, { ...admin, corpo: motivo ? { motivo_pendencias: motivo } : {} });

/**
 * POST /doacoes. `chave` é UUID e deve ser a MESMA numa nova tentativa após falha de rede.
 * Cada item informa id_necessidade explicitamente (string para somar à meta, null para não somar).
 */
export async function registrarRecebimento({ chave, id_agendamento, ocorrido_em, itens }) {
  const { dados } = await requisitarCompleto('POST', '/doacoes', {
    ...admin,
    cabecalhos: { 'Idempotency-Key': chave },
    corpo: {
      id_agendamento: idNum(id_agendamento),
      ocorrido_em,
      itens: itens.map((i) => ({
        id_item: Number(i.id_item),
        id_necessidade: i.id_necessidade ? String(i.id_necessidade) : null,
        quantidade_recebida: i.quantidade,
      })),
    },
  });
  return { ...recebimentoInterno(dados.doacao), repetido: Boolean(dados.repetido) };
}

export async function listarRecebimentos() {
  return (await listarDoacoesBrutas()).map(recebimentoInterno);
}

export const estornarRecebimento = (id, motivo) =>
  requisitar('PATCH', `/doacoes/${id}/estornar`, { ...admin, corpo: { motivo } });

/** O painel inicial não tem rota própria na API: os números são montados a partir de três consultas. */
export async function obterResumo() {
  const [hoje, semana, termometro, doacoes] = await Promise.all([
    listarAgendamentosAdmin({ periodo: 'hoje' }),
    listarAgendamentosAdmin({ periodo: 'semana' }),
    listarNecessidades(),
    listarDoacoesBrutas(),
  ]);
  const mes = mesAtualSP();
  const mesDe = (iso) => { const p = partesSP(paraInstante(iso)); return `${p.ano}-${p.mes}`; };
  return {
    agendamentos_hoje: hoje.total,
    agendamentos_proximos_7_dias: semana.total,
    necessidades_abertas: termometro.total,
    necessidades_criticas_abaixo_30: termometro.itens.filter((n) => n.urgencia.nivel === 1 && n.percentual_atendimento < 30).length,
    recebimentos_mes: { mes, entregas: doacoes.filter((d) => d.status === 'Confirmado' && mesDe(d.ocorrido_em) === mes).length },
  };
}

// ================================================================ ADMIN: necessidades (metas)

/** Histórico de metas (todas as situações). Totais chegam como string e viram número aqui. */
export async function listarNecessidadesAdmin(status = 'Aberta') {
  const [lista, categorias, catalogo] = await Promise.all([
    requisitar('GET', '/admin/necessidades/historico', { ...admin, params: { limit: LIMITE } }),
    listarCategorias(),
    requisitar('GET', '/admin/itens', { ...admin, params: { limit: LIMITE } }),
  ]);
  const ativos = new Map(catalogo.map((p) => [p.id_item, p.ativo]));
  const porNome = new Map(categorias.map((c) => [c.nome_categoria, c]));
  const necessidades = lista
    .filter((n) => status === 'todas' || n.status === status)
    .map((n) => {
      const pct = num(n.percentual_atendimento);
      return {
        id_necessidade: txt(n.id_necessidade),
        id_item: txt(n.id_item),
        nome_item: n.nome_item,
        unidade_medida: n.unidade_medida,
        quantidade_meta: num(n.quantidade_meta),
        quantidade_arrecadada: num(n.quantidade_arrecadada),
        quantidade_faltante: num(n.quantidade_faltante),
        percentual_atendimento: pct,
        percentual_barra: Math.min(pct, 100),
        meta_atingida: num(n.quantidade_arrecadada) >= num(n.quantidade_meta),
        urgencia: urgenciaDe(porNome.get(n.urgencia)),
        status: n.status,
        produto_ativo: ativos.get(n.id_item) ?? true,
        criada_em: n.criada_em,
        encerrada_em: n.encerrada_em,
      };
    });
  if (status === 'Aberta') {
    necessidades.sort((a, b) => a.urgencia.nivel - b.urgencia.nivel || a.percentual_atendimento - b.percentual_atendimento);
  }
  return { total: necessidades.length, necessidades };
}

export async function abrirNecessidade({ id_item, nivel, quantidade_meta }) {
  return requisitar('POST', '/admin/necessidades', {
    ...admin, corpo: { id_item: Number(id_item), id_categoria: await idCategoriaDoNivel(nivel), quantidade_meta },
  });
}

/** A API exige a prioridade na renovação: a tela envia a escolhida ou a atual. */
export async function renovarNecessidade(id, { quantidade_meta, nivel }) {
  return requisitar('POST', `/admin/necessidades/${id}/renovar`, {
    ...admin, corpo: { id_categoria: await idCategoriaDoNivel(nivel), quantidade_meta },
  });
}

/** status 'Encerrada' usa /encerrar; 'Cancelada' usa /cancelar. */
export const encerrarNecessidade = (id, status) =>
  requisitar('PATCH', `/admin/necessidades/${id}/${status === 'Cancelada' ? 'cancelar' : 'encerrar'}`, { ...admin, corpo: {} });

// ================================================================ ADMIN: catálogo de produtos

/** Catálogo com urgência sugerida e, para cada produto, a meta aberta (se houver). */
export async function listarItens(ativo = 'todos') {
  const [catalogo, categorias, abertas] = await Promise.all([
    requisitar('GET', '/admin/itens', { ...admin, params: { limit: LIMITE } }),
    listarCategorias(),
    listarNecessidadesAdmin('Aberta'),
  ]);
  const porId = new Map(categorias.map((c) => [c.id_categoria, c]));
  const metaAberta = new Map(abertas.necessidades.map((n) => [n.id_item, n]));
  const itens = catalogo
    .filter((p) => ativo === 'todos' || String(p.ativo) === ativo)
    .sort((a, b) => a.nome_item.localeCompare(b.nome_item, 'pt-BR'))
    .map((p) => ({
      id_item: txt(p.id_item),
      nome_item: p.nome_item,
      unidade_medida: p.unidade_medida,
      categoria_suprimento: p.categoria_suprimento,
      ativo: p.ativo,
      urgencia_sugerida: urgenciaDe(porId.get(p.id_categoria)),
      id_necessidade_aberta: metaAberta.get(txt(p.id_item))?.id_necessidade ?? null,
    }));
  return { total: itens.length, itens };
}

/**
 * POST /itens e, se pedido, POST /admin/necessidades. São duas chamadas: se a segunda falhar,
 * o produto fica cadastrado sem meta e a mensagem avisa para abrir a necessidade depois.
 */
export async function criarItem({ nome_item, unidade_medida, categoria_suprimento, nivel, quantidade_meta }) {
  const id_categoria = await idCategoriaDoNivel(nivel);
  const produto = await requisitar('POST', '/itens', {
    ...admin, corpo: { nome_item, unidade_medida, categoria_suprimento, id_categoria },
  });
  if (quantidade_meta) {
    try {
      await requisitar('POST', '/admin/necessidades', { ...admin, corpo: { id_item: produto.id_item, id_categoria, quantidade_meta } });
    } catch (e) {
      e.message = `Produto cadastrado, mas a necessidade não foi aberta: ${e.message} Abra pela tela Necessidades.`;
      throw e;
    }
  }
  return produto;
}

/** PUT exige o produto completo; a unidade é reenviada sem mudança. */
export async function atualizarItem(id, { nome_item, unidade_medida, categoria_suprimento, nivel }) {
  return requisitar('PUT', `/itens/${id}`, {
    ...admin, corpo: { nome_item, unidade_medida, categoria_suprimento, id_categoria: await idCategoriaDoNivel(nivel) },
  });
}

/** DELETE /itens/{id} desativa (não apaga). A API atual não tem rota para reativar. */
export const desativarItem = (id) => requisitar('DELETE', `/itens/${id}`, admin);

// ================================================================ ADMIN: relatório

export async function obterArrecadacaoMensal(mes = mesAtualSP()) {
  const lista = await requisitar('GET', '/admin/arrecadacao/mensal', { ...admin, params: { mes, limit: LIMITE } });
  return lista.map((l) => ({ ...l, id_item: txt(l.id_item), quantidade_arrecadada: num(l.quantidade_arrecadada), entregas: num(l.entregas) }));
}
