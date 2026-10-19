// Confere o servidor simulado contra o openapi.json do Anderson (API 2.0.0) e contra os
// resultados esperados da documentação do banco (seção 9). Rodar com: npm test
import { describe, it, expect, beforeEach } from 'vitest';
import { tratarRequisicao, restaurarDadosMock } from './servidor.js';
import { HORARIOS_DEMO } from './dados.js';

const req = (metodo, caminho, extra = {}) => tratarRequisicao({ metodo, caminho, latencia: 0, ...extra });
const uuid = () => crypto.randomUUID();
const amanha = () => new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

async function token() {
  return (await req('POST', '/auth/login', { corpo: { email: 'admin@demo.org', senha: 'demo12345' } })).corpo.token;
}

beforeEach(() => restaurarDadosMock());

describe('termômetro público', () => {
  it('cenário do 05: 5 metas, percentuais esperados, cobertor inativo fora', async () => {
    const { status, corpo } = await req('GET', '/necessidades');
    expect(status).toBe(200);
    expect(corpo).toHaveLength(5);
    const pct = Object.fromEntries(corpo.map((i) => [i.nome_item.split(' ')[1], i.percentual_atendimento]));
    expect(pct).toEqual({ Leite: 36.67, Fralda: 50, Arroz: 0, 'Sabão': 125, Sabonete: 0 });
  });

  it('id_item é inteiro, id_necessidade é string, aliases presentes', async () => {
    const [n] = (await req('GET', '/necessidades')).corpo;
    expect(typeof n.id_item).toBe('number');
    expect(typeof n.id_necessidade).toBe('string');
    expect(n.quantidade_atual).toBe(n.quantidade_arrecadada);
    expect(n.quantidade_necessaria).toBe(n.quantidade_meta);
  });
});

describe('POST /agendamentos', () => {
  const corpo = (extra = {}) => ({
    doador: { nome: 'Pessoa fictícia', email: 'teste@example.com', telefone: '11999999999', tipo_doador: 'PJ' },
    data: amanha(), horario: HORARIOS_DEMO[0],
    itens: [{ id_item: 4, id_necessidade: '4', quantidade_doada: 2 }],
    ...extra,
  });

  it('exige Idempotency-Key e devolve código privado; repetição devolve 200', async () => {
    expect((await req('POST', '/agendamentos', { corpo: corpo() })).status).toBe(422);
    const chave = uuid();
    const r1 = await req('POST', '/agendamentos', { corpo: corpo(), cabecalhos: { 'Idempotency-Key': chave } });
    expect(r1.status).toBe(201);
    expect(r1.corpo.token_acesso).toMatch(/^[a-f0-9]{64}$/);
    expect(r1.corpo.agendamento.data_hora_agendada).not.toMatch(/Z$/);
    const r2 = await req('POST', '/agendamentos', { corpo: corpo(), cabecalhos: { 'Idempotency-Key': chave } });
    expect(r2.status).toBe(200);
    expect(r2.corpo.repetido).toBe(true);
    const r3 = await req('POST', '/agendamentos', { corpo: corpo({ horario: HORARIOS_DEMO[1] }), cabecalhos: { 'Idempotency-Key': chave } });
    expect(r3.status).toBe(409);
  });

  it('meta atendida ou encerrada devolve 409', async () => {
    const r = await req('POST', '/agendamentos', { corpo: corpo({ itens: [{ id_item: 5, id_necessidade: '5', quantidade_doada: 1 }] }), cabecalhos: { 'Idempotency-Key': uuid() } });
    expect(r.status).toBe(409); // sabão está em 125%
  });

  it('lota o horário pela capacidade', async () => {
    for (let n = 0; n < 3; n += 1) {
      await req('POST', '/agendamentos', { corpo: corpo({ doador: { nome: 'Pessoa', email: `p${n}@example.com`, telefone: '11999999999' } }), cabecalhos: { 'Idempotency-Key': uuid() } });
    }
    const disp = (await req('GET', '/disponibilidade', { params: { data: amanha() } })).corpo;
    expect(disp.horarios.find((h) => h.horario === HORARIOS_DEMO[0]).vagas).toBe(0);
    const r = await req('POST', '/agendamentos', { corpo: corpo(), cabecalhos: { 'Idempotency-Key': uuid() } });
    expect(r.status).toBe(409);
  });

  it('doador consulta, remarca e cancela com o código privado', async () => {
    const r = await req('POST', '/agendamentos', { corpo: corpo(), cabecalhos: { 'Idempotency-Key': uuid() } });
    const { agendamento, token_acesso: t } = r.corpo;
    const id = agendamento.id_agendamento;
    expect((await req('GET', `/agendamentos/${id}`, { token: 'x'.repeat(64) })).status).toBe(401);
    expect((await req('GET', `/agendamentos/${id}`, { token: t })).status).toBe(200);
    const rem = await req('PATCH', `/agendamentos/${id}/remarcar`, { token: t, corpo: { data: amanha(), horario: HORARIOS_DEMO[2] } });
    expect(rem.corpo.data_hora_agendada).toContain(`T${HORARIOS_DEMO[2]}`);
    const can = await req('PATCH', `/agendamentos/${id}/cancelar`, { token: t, corpo: {} });
    expect(can.corpo.status_agendamento).toBe('Cancelado');
  });
});

describe('sessão da ONG', () => {
  it('login errado 401; sem token 401; logout revoga', async () => {
    expect((await req('POST', '/auth/login', { corpo: { email: 'admin@demo.org', senha: 'x' } })).status).toBe(401);
    expect((await req('GET', '/admin/itens')).status).toBe(401);
    const t = await token();
    expect((await req('GET', '/auth/me', { token: t })).status).toBe(200);
    expect((await req('POST', '/auth/logout', { token: t })).status).toBe(204);
    expect((await req('GET', '/auth/me', { token: t })).status).toBe(401);
  });
});

describe('POST /doacoes', () => {
  it('registra parcial do agendamento, soma à meta e é idempotente por UUID', async () => {
    const t = await token();
    const chave = uuid();
    const corpo = { id_agendamento: 5, ocorrido_em: new Date().toISOString(), itens: [{ id_item: 4, id_necessidade: '4', quantidade_recebida: 5 }] };
    const r = await req('POST', '/doacoes', { token: t, corpo, cabecalhos: { 'Idempotency-Key': chave } });
    expect(r.status).toBe(201);
    expect(r.corpo.doacao.status).toBe('Confirmado');
    const leite = (await req('GET', '/necessidades', { params: { q: 'leite' } })).corpo[0];
    expect(leite.quantidade_arrecadada).toBe(27);
    const rep = await req('POST', '/doacoes', { token: t, corpo, cabecalhos: { 'Idempotency-Key': chave } });
    expect(rep.status).toBe(200);
    expect((await req('GET', '/necessidades', { params: { q: 'leite' } })).corpo[0].quantidade_arrecadada).toBe(27);
  });

  it('id_necessidade é obrigatório (string ou null); null não soma ao termômetro', async () => {
    const t = await token();
    const sem = await req('POST', '/doacoes', { token: t, cabecalhos: { 'Idempotency-Key': uuid() }, corpo: { ocorrido_em: new Date().toISOString(), itens: [{ id_item: 6, quantidade_recebida: 3 }] } });
    expect(sem.status).toBe(422);
    const ok = await req('POST', '/doacoes', { token: t, cabecalhos: { 'Idempotency-Key': uuid() }, corpo: { ocorrido_em: new Date().toISOString(), itens: [{ id_item: 6, id_necessidade: null, quantidade_recebida: 3 }] } });
    expect(ok.status).toBe(201);
    expect((await req('GET', '/necessidades', { params: { q: 'sabonete' } })).corpo[0].quantidade_arrecadada).toBe(0);
  });

  it('concluir com pendência exige motivo', async () => {
    const t = await token();
    expect((await req('PATCH', '/admin/agendamentos/5/concluir', { token: t, corpo: {} })).status).toBe(422);
    const r = await req('PATCH', '/admin/agendamentos/5/concluir', { token: t, corpo: { motivo_pendencias: 'Doador não trouxe' } });
    expect(r.corpo.status_agendamento).toBe('Concluído');
  });

  it('estorno retira a entrega dos totais', async () => {
    const t = await token();
    await req('PATCH', '/doacoes/4/estornar', { token: t, corpo: { motivo: 'teste' } });
    expect((await req('GET', '/necessidades', { params: { q: 'sabão' } })).corpo[0].quantidade_arrecadada).toBe(0);
  });
});

describe('metas e catálogo', () => {
  it('renovar começa do zero e mantém a antiga no histórico (totais como string)', async () => {
    const t = await token();
    const r = await req('POST', '/admin/necessidades/4/renovar', { token: t, corpo: { id_categoria: 1, quantidade_meta: 80 } });
    expect(r.status).toBe(201);
    const hist = (await req('GET', '/admin/necessidades/historico', { token: t })).corpo;
    expect(hist.find((n) => n.id_necessidade === '4')).toMatchObject({ status: 'Encerrada', quantidade_arrecadada: '22' });
    expect(hist.find((n) => n.id_necessidade === r.corpo.id_necessidade).quantidade_arrecadada).toBe('0');
  });

  it('segunda meta aberta para o mesmo produto: 409', async () => {
    const t = await token();
    expect((await req('POST', '/admin/necessidades', { token: t, corpo: { id_item: 4, id_categoria: 1, quantidade_meta: 10 } })).status).toBe(409);
  });

  it('PUT não muda unidade em uso; DELETE desativa', async () => {
    const t = await token();
    const base = { nome_item: 'Leite', unidade_medida: 'caixas', categoria_suprimento: 'Alimentos', id_categoria: 1 };
    expect((await req('PUT', '/itens/4', { token: t, corpo: base })).status).toBe(409);
    expect((await req('DELETE', '/itens/4', { token: t })).status).toBe(204);
    expect((await req('GET', '/necessidades', { params: { q: 'leite' } })).corpo).toHaveLength(0);
  });
});
