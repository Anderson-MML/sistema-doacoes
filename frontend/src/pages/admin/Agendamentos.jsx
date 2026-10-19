import { useState } from 'react';
import {
  cancelarAgendamentoAdmin, concluirAgendamento, listarAgendamentosAdmin, remarcarAgendamentoAdmin,
} from '../../api/index.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useTitulo } from '../../hooks/useTitulo.js';
import { CabecalhoPagina, Painel } from '../../components/admin/LayoutAdmin.jsx';
import { FormRecebimento } from '../../components/admin/FormRecebimento.jsx';
import { Dialogo } from '../../components/ui/Dialogo.jsx';
import { Botao } from '../../components/ui/Botao.jsx';
import { Alerta } from '../../components/ui/Alerta.jsx';
import { Campo } from '../../components/ui/Campo.jsx';
import { EscolherHorario } from '../../components/ui/EscolherHorario.jsx';
import { Carregando, ErroCarregamento, Vazio } from '../../components/ui/Estados.jsx';
import { formatarData, formatarHora, formatarNumero } from '../../utils/formatar.js';

const PERIODOS = [
  { valor: 'hoje', texto: 'Hoje' },
  { valor: 'semana', texto: 'Próximos 7 dias' },
  { valor: 'passados', texto: 'Últimos 30 dias' },
];

const ESTILO_STATUS = {
  Pendente: 'bg-media-claro text-media-texto border-media',
  Confirmado: 'bg-lar-claro text-lar-escuro border-lar',
  'Concluído': 'bg-baixa-claro text-sucesso border-sucesso',
  Cancelado: 'bg-nevoa text-tinta-suave border-linha-forte',
};

const faltando = (a) => a.itens.filter((i) => i.status_item === 'Agendado' && i.quantidade_recebida < i.quantidade_prometida);
const jaRecebeu = (a) => a.itens.some((i) => i.quantidade_recebida > 0);

export default function Agendamentos() {
  useTitulo('Doações agendadas');
  const [periodo, setPeriodo] = useState('hoje');
  const [verEncerrados, setVerEncerrados] = useState(false);
  const [dialogo, setDialogo] = useState(null); // { tipo: 'chegou'|'concluir'|'cancelar'|'remarcar', ag }
  const [aviso, setAviso] = useState('');
  const lista = useCarregar(() => listarAgendamentosAdmin({ periodo, incluirEncerrados: verEncerrados }), [periodo, verEncerrados]);

  const fechar = (mensagem) => {
    setDialogo(null);
    if (mensagem) { setAviso(mensagem); lista.recarregar(); }
  };

  return (
    <div>
      <CabecalhoPagina titulo="Doações agendadas" descricao="Quando o doador chegar, clique em Chegou e confira o que ele trouxe." />

      <Painel className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <fieldset>
          <legend className="so-leitor">Período</legend>
          <div className="flex flex-wrap gap-2">
            {PERIODOS.map((x) => (
              <label key={x.valor} className="flex min-h-11 cursor-pointer items-center rounded-lg border-2 border-linha-forte px-4 font-bold has-[:checked]:border-lar has-[:checked]:bg-lar has-[:checked]:text-white has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-lar">
                <input type="radio" name="periodo" className="so-leitor" checked={periodo === x.valor} onChange={() => setPeriodo(x.valor)} />
                {x.texto}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="checkbox" className="size-5 accent-lar" checked={verEncerrados} onChange={(e) => setVerEncerrados(e.target.checked)} />
          Mostrar concluídos e cancelados
        </label>
      </Painel>

      {aviso && <Alerta tipo="sucesso" className="mb-4">{aviso}</Alerta>}
      {lista.carregando && !lista.dados && <Carregando demorando={lista.demorando} />}
      {lista.erro && <ErroCarregamento erro={lista.erro} aoTentarDeNovo={lista.recarregar} />}
      {lista.dados?.total === 0 && (
        <Vazio titulo={periodo === 'hoje' ? 'Nenhuma entrega agendada para hoje' : 'Nenhuma entrega neste período'}>
          Doações que chegarem sem agendamento podem ser registradas em Registrar doação.
        </Vazio>
      )}

      <ul className="flex flex-col gap-4">
        {lista.dados?.agendamentos.map((a) => {
          const ativo = ['Pendente', 'Confirmado'].includes(a.status_agendamento);
          return (
            <li key={a.id_agendamento}>
              <article aria-labelledby={`ag-${a.id_agendamento}`} className="rounded-xl border border-linha bg-papel p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-2xl font-bold">{formatarHora(a.data_hora_agendada)}</p>
                    {periodo !== 'hoje' && <p className="text-tinta-suave first-letter:uppercase">{formatarData(a.data_hora_agendada)}</p>}
                  </div>
                  <span className={`rounded-full border-2 px-3 py-0.5 text-sm font-bold ${ESTILO_STATUS[a.status_agendamento]}`}>
                    {a.status_agendamento}
                  </span>
                </div>
                <h2 id={`ag-${a.id_agendamento}`} className="mt-3 text-lg font-bold">{a.doador?.nome ?? `Agendamento ${a.id_agendamento}`}</h2>
                {a.doador && (
                  <p className="text-tinta-suave">
                    <a href={`tel:${(a.doador.telefone ?? '').replace(/\D/g, '')}`} className="text-lar underline underline-offset-2">{a.doador.telefone}</a>
                    {' | '}{a.doador.email}
                  </p>
                )}

                <div className="relative mt-4 overflow-x-auto">
                  <table className="w-full text-left">
                    <caption className="so-leitor">Produtos prometidos</caption>
                    <thead>
                      <tr className="border-b-2 border-linha">
                        <th scope="col" className="py-2 pr-3">Produto</th>
                        <th scope="col" className="py-2 pr-3 text-right">Prometido</th>
                        <th scope="col" className="py-2 text-right">Já chegou</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.itens.map((i) => (
                        <tr key={i.id_item} className="border-b border-linha">
                          <td className="py-2 pr-3">{i.nome_item}{i.status_item === 'Cancelado' && <span className="text-tinta-suave"> (não entregue)</span>}</td>
                          <td className="py-2 pr-3 text-right">{formatarNumero(i.quantidade_prometida)} {i.unidade_medida}</td>
                          <td className="py-2 text-right">{formatarNumero(i.quantidade_recebida)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {ativo && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Botao onClick={() => setDialogo({ tipo: 'chegou', ag: a })}>Chegou</Botao>
                    {jaRecebeu(a) ? (
                      <Botao variante="secundario" onClick={() => setDialogo({ tipo: 'concluir', ag: a })}>Concluir</Botao>
                    ) : (
                      <>
                        <Botao variante="secundario" onClick={() => setDialogo({ tipo: 'remarcar', ag: a })}>Remarcar</Botao>
                        <Botao variante="perigo" onClick={() => setDialogo({ tipo: 'cancelar', ag: a })}>Cancelar</Botao>
                      </>
                    )}
                  </div>
                )}
              </article>
            </li>
          );
        })}
      </ul>

      <Dialogo aberto={dialogo?.tipo === 'chegou'} aoFechar={() => fechar()} titulo="Registrar o que chegou" largura="max-w-2xl">
        {dialogo?.tipo === 'chegou' && (
          <FormRecebimento key={dialogo.ag.id_agendamento} agendamento={dialogo.ag}
            aoCancelar={() => fechar()} aoConcluir={() => fechar('Doação registrada.')} />
        )}
      </Dialogo>
      <Dialogo aberto={dialogo?.tipo === 'concluir'} aoFechar={() => fechar()} titulo="Concluir agendamento" descricao={dialogo?.ag?.doador?.nome}>
        {dialogo?.tipo === 'concluir' && <FormConcluir ag={dialogo.ag} aoConcluir={fechar} />}
      </Dialogo>
      <Dialogo aberto={dialogo?.tipo === 'remarcar'} aoFechar={() => fechar()} titulo="Remarcar entrega" descricao={dialogo?.ag?.doador?.nome}>
        {dialogo?.tipo === 'remarcar' && <FormRemarcar ag={dialogo.ag} aoConcluir={fechar} />}
      </Dialogo>
      <Dialogo aberto={dialogo?.tipo === 'cancelar'} aoFechar={() => fechar()} titulo="Cancelar agendamento?" descricao={dialogo?.ag?.doador?.nome}>
        {dialogo?.tipo === 'cancelar' && <FormCancelar ag={dialogo.ag} aoConcluir={fechar} />}
      </Dialogo>
    </div>
  );
}

function useAcao() {
  const [estado, setEstado] = useState({ processando: false, erro: null });
  async function executar(fn, aoConcluir, mensagem) {
    setEstado({ processando: true, erro: null });
    try { await fn(); aoConcluir(mensagem); } catch (erro) { setEstado({ processando: false, erro }); }
  }
  return { ...estado, executar };
}

function FormConcluir({ ag, aoConcluir }) {
  const pendentes = faltando(ag);
  const [motivo, setMotivo] = useState('');
  const [erroMotivo, setErroMotivo] = useState('');
  const acao = useAcao();

  function confirmar() {
    if (pendentes.length && !motivo.trim()) return setErroMotivo('Explique por que faltaram itens.');
    setErroMotivo('');
    acao.executar(() => concluirAgendamento(ag.id_agendamento, pendentes.length ? motivo.trim() : null), aoConcluir, 'Agendamento concluído.');
  }

  return (
    <div className="flex flex-col gap-4">
      {pendentes.length ? (
        <>
          <p>Alguns itens chegaram em quantidade menor que a prometida:</p>
          <ul className="list-disc pl-6">
            {pendentes.map((i) => (
              <li key={i.id_item}>{i.nome_item}: {formatarNumero(i.quantidade_recebida)} de {formatarNumero(i.quantidade_prometida)} {i.unidade_medida}</li>
            ))}
          </ul>
          <p>Ao concluir, o que faltou será marcado como não entregue. O que já chegou continua contado.</p>
          <Campo rotulo="Motivo" obrigatorio erro={erroMotivo} dica="Ex.: o doador trouxe só uma parte.">
            <textarea rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Campo>
        </>
      ) : (
        <p>Tudo o que foi prometido já chegou. Concluir encerra este agendamento.</p>
      )}
      {acao.erro && <Alerta tipo="erro">{acao.erro.message}</Alerta>}
      <Botao carregando={acao.processando} onClick={confirmar} className="self-start">Concluir agendamento</Botao>
    </div>
  );
}

function FormRemarcar({ ag, aoConcluir }) {
  const [novo, setNovo] = useState({ data: '', horario: '' });
  const [erro, setErro] = useState('');
  const acao = useAcao();

  function salvar() {
    if (!novo.data || !novo.horario) return setErro('Escolha o dia e um horário livre.');
    setErro('');
    acao.executar(() => remarcarAgendamentoAdmin(ag.id_agendamento, novo.data, novo.horario), aoConcluir, 'Entrega remarcada. Avise o doador.');
  }

  return (
    <div className="flex flex-col gap-4">
      <p>Atual: <strong className="first-letter:uppercase">{formatarData(ag.data_hora_agendada)}, às {formatarHora(ag.data_hora_agendada)}</strong></p>
      <EscolherHorario data={novo.data} horario={novo.horario} aoMudar={setNovo} idData="remarcar-dia" idHorario="remarcar-horario" />
      {(erro || acao.erro) && <Alerta tipo="erro">{erro || acao.erro.message}</Alerta>}
      <Botao carregando={acao.processando} onClick={salvar} className="self-start">Salvar novo horário</Botao>
    </div>
  );
}

function FormCancelar({ ag, aoConcluir }) {
  const acao = useAcao();
  return (
    <div className="flex flex-col gap-4">
      <p>Use quando o doador desistiu ou não virá. Não dá para desfazer.</p>
      {acao.erro && <Alerta tipo="erro">{acao.erro.message}</Alerta>}
      <Botao variante="perigoCheio" carregando={acao.processando} className="self-start"
        onClick={() => acao.executar(() => cancelarAgendamentoAdmin(ag.id_agendamento), aoConcluir, 'Agendamento cancelado.')}>
        Cancelar agendamento
      </Botao>
    </div>
  );
}
