import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTitulo } from '../../hooks/useTitulo.js';
import { BotaoLink, Botao } from '../../components/ui/Botao.jsx';
import { formatarData, formatarHora, formatarNumero, primeiroNome, paraInstante } from '../../utils/formatar.js';
import { linkGoogleAgenda } from '../../utils/agenda.js';
import { linkDoAgendamento } from '../../utils/meusAgendamentos.js';
import { LOCAL_ENTREGA } from '../../config.js';

export default function AgendamentoConfirmado() {
  useTitulo('Entrega agendada');
  const { state } = useLocation();
  const titulo = useRef(null);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => { titulo.current?.focus(); }, []);

  const ag = state?.agendamento;
  if (!ag) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold">Nenhum agendamento para mostrar</h1>
        <p className="mt-3 text-lg">Esta página aparece logo depois de você confirmar uma entrega.</p>
        <BotaoLink to="/" className="mt-6">Ver o que o Lar precisa</BotaoLink>
      </div>
    );
  }

  const link = linkDoAgendamento(ag.id_agendamento, state.token);
  const lista = ag.itens.map((i) => `${formatarNumero(i.quantidade_prometida)} ${i.unidade_medida} de ${i.nome_item}`).join('\n');
  const agenda = linkGoogleAgenda({
    titulo: 'Entregar doação no Lar Ternura',
    inicioIso: paraInstante(ag.data_hora_agendada).toISOString(),
    detalhes: `Itens:\n${lista}\n\n${LOCAL_ENTREGA.instrucoes}\n\nConsultar, remarcar ou cancelar: ${link}`,
    local: `${LOCAL_ENTREGA.nome}, ${LOCAL_ENTREGA.endereco}`,
  });

  async function copiar() {
    try { await navigator.clipboard.writeText(link); setCopiado(true); } catch { setCopiado(false); }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 ref={titulo} tabIndex={-1} className="text-3xl font-bold outline-none">
        Obrigado{state.nome ? `, ${primeiroNome(state.nome)}` : ''}! Sua entrega está agendada.
      </h1>

      <section className="mt-8 rounded-xl border-2 border-sucesso bg-baixa-claro p-6">
        <h2 className="text-xl font-bold">Quando</h2>
        <p className="mt-1 text-2xl font-bold first-letter:uppercase">
          {formatarData(ag.data_hora_agendada)}, às {formatarHora(ag.data_hora_agendada)}
        </p>
        <h2 className="mt-6 text-xl font-bold">Onde</h2>
        <p className="mt-1">{LOCAL_ENTREGA.nome}<br />{LOCAL_ENTREGA.endereco}</p>
        <p className="mt-2">{LOCAL_ENTREGA.instrucoes}</p>
        <h2 className="mt-6 text-xl font-bold">O que levar</h2>
        <ul className="mt-2 list-disc pl-6">
          {ag.itens.map((i) => (
            <li key={i.id_item}><strong>{formatarNumero(i.quantidade_prometida)} {i.unidade_medida}</strong> de {i.nome_item}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="titulo-link" className="mt-6 rounded-xl border-2 border-lar p-6">
        <h2 id="titulo-link" className="text-xl font-bold">Guarde este link</h2>
        <p className="mt-1">Com ele você consulta, muda o horário ou cancela a entrega. Ele funciona só para este agendamento.</p>
        <p className="mt-3 break-all rounded-lg bg-nevoa p-3 text-sm">{link}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Botao variante="secundario" onClick={copiar}>Copiar link</Botao>
          <p role="status" className="font-bold text-sucesso">{copiado ? 'Link copiado.' : ''}</p>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <a href={agenda} target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center rounded-lg border-2 border-lar px-5 font-bold text-lar hover:bg-lar-claro">
          Adicionar ao Google Agenda<span className="so-leitor"> (abre em nova aba)</span>
        </a>
        <BotaoLink to="/" variante="discreto">Voltar para a lista</BotaoLink>
      </div>
    </div>
  );
}
