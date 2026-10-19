import { useMemo, useState } from 'react';
import { atualizarItem, criarItem, desativarItem, listarItens } from '../../api/index.js';
import { useCarregar } from '../../hooks/useCarregar.js';
import { useEnvio } from '../../hooks/useEnvio.js';
import { useTitulo } from '../../hooks/useTitulo.js';
import { CabecalhoPagina } from '../../components/admin/LayoutAdmin.jsx';
import { EscolherPrioridade } from '../../components/admin/EscolherPrioridade.jsx';
import { Dialogo } from '../../components/ui/Dialogo.jsx';
import { Botao } from '../../components/ui/Botao.jsx';
import { Alerta } from '../../components/ui/Alerta.jsx';
import { Campo } from '../../components/ui/Campo.jsx';
import { SeloUrgencia } from '../../components/ui/SeloUrgencia.jsx';
import { Carregando, ErroCarregamento, Vazio } from '../../components/ui/Estados.jsx';

const UNIDADES_COMUNS = ['unidades', 'pacotes', 'latas', 'caixas', 'frascos', 'rolos', 'garrafas'];

export default function Produtos() {
  useTitulo('Produtos');
  const [filtro, setFiltro] = useState('true');
  const [dialogo, setDialogo] = useState(null); // { tipo: 'novo' } | { tipo: 'editar', produto }
  const [aviso, setAviso] = useState('');
  const lista = useCarregar(() => listarItens(filtro), [filtro]);
  const categorias = useMemo(
    () => [...new Set((lista.dados?.itens ?? []).map((i) => i.categoria_suprimento))].sort(),
    [lista.dados],
  );

  const fechar = (mensagem) => {
    setDialogo(null);
    if (mensagem) { setAviso(mensagem); lista.recarregar(); }
  };

  return (
    <div>
      <CabecalhoPagina titulo="Produtos"
        descricao="Tudo o que o Lar pode pedir. Para um produto aparecer aos doadores, ele precisa de uma necessidade aberta."
        acao={<Botao onClick={() => setDialogo({ tipo: 'novo' })}>Cadastrar produto</Botao>} />

      <div role="group" aria-label="Mostrar" className="mb-4 flex flex-wrap gap-2">
        {[['true', 'Ativos'], ['false', 'Desativados'], ['todos', 'Todos']].map(([valor, texto]) => (
          <button key={valor} type="button" aria-pressed={filtro === valor} onClick={() => setFiltro(valor)}
            className={`min-h-11 rounded-lg px-4 font-bold ${filtro === valor ? 'bg-lar text-white' : 'border-2 border-linha-forte bg-papel'}`}>
            {texto}
          </button>
        ))}
      </div>

      {aviso && <Alerta tipo="sucesso" className="mb-4">{aviso}</Alerta>}
      {lista.carregando && !lista.dados && <Carregando demorando={lista.demorando} />}
      {lista.erro && <ErroCarregamento erro={lista.erro} aoTentarDeNovo={lista.recarregar} />}
      {lista.dados?.total === 0 && <Vazio titulo="Nenhum produto aqui" />}

      {lista.dados?.total > 0 && (
        <div className="relative overflow-x-auto rounded-xl border border-linha bg-papel">
          <table className="w-full min-w-2xl text-left">
            <caption className="so-leitor">Produtos cadastrados</caption>
            <thead className="bg-nevoa">
              <tr>
                <th scope="col" className="px-4 py-3">Produto</th>
                <th scope="col" className="px-4 py-3">Tipo</th>
                <th scope="col" className="px-4 py-3">Unidade</th>
                <th scope="col" className="px-4 py-3">Prioridade sugerida</th>
                <th scope="col" className="px-4 py-3">Situação</th>
                <th scope="col" className="px-4 py-3"><span className="so-leitor">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {lista.dados.itens.map((p) => (
                <tr key={p.id_item} className="border-t border-linha">
                  <th scope="row" className="px-4 py-3 font-bold">{p.nome_item}</th>
                  <td className="px-4 py-3">{p.categoria_suprimento}</td>
                  <td className="px-4 py-3">{p.unidade_medida}</td>
                  <td className="px-4 py-3"><SeloUrgencia nivel={p.urgencia_sugerida.nivel} nome={p.urgencia_sugerida.nome} /></td>
                  <td className="px-4 py-3">
                    {!p.ativo ? 'Desativado' : p.id_necessidade_aberta ? 'Na página de doações' : 'Sem necessidade aberta'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Botao variante="discreto" onClick={() => setDialogo({ tipo: 'editar', produto: p })}
                      aria-label={`Editar ${p.nome_item}`}>Editar</Botao>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialogo aberto={dialogo?.tipo === 'novo'} aoFechar={() => fechar()} titulo="Cadastrar produto">
        {dialogo?.tipo === 'novo' && <FormProduto categorias={categorias} aoConcluir={fechar} />}
      </Dialogo>
      <Dialogo aberto={dialogo?.tipo === 'editar'} aoFechar={() => fechar()} titulo="Editar produto"
        descricao={dialogo?.produto?.nome_item}>
        {dialogo?.tipo === 'editar' && <FormProduto produto={dialogo.produto} categorias={categorias} aoConcluir={fechar} />}
      </Dialogo>
    </div>
  );
}

function FormProduto({ produto = null, categorias, aoConcluir }) {
  const editando = Boolean(produto);
  const [form, setForm] = useState({
    nome_item: produto?.nome_item ?? '',
    unidade_medida: produto?.unidade_medida ?? '',
    categoria_suprimento: produto?.categoria_suprimento ?? '',
    nivel: produto?.urgencia_sugerida.nivel ?? 2,
    abrir: true,
    quantidade_meta: '',
  });
  const [erros, setErros] = useState({});
  const envio = useEnvio();
  const mudar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function enviar(e) {
    e.preventDefault();
    const encontrados = {};
    if (!form.nome_item.trim()) encontrados.nome_item = 'Informe o nome com tamanho ou apresentação.';
    if (!editando && !form.unidade_medida.trim()) encontrados.unidade_medida = 'Informe a unidade.';
    if (!form.categoria_suprimento.trim()) encontrados.categoria_suprimento = 'Informe o tipo.';
    const meta = Number(form.quantidade_meta);
    if (!editando && form.abrir && !(Number.isInteger(meta) && meta >= 1)) encontrados.quantidade_meta = 'Informe um número inteiro maior que zero.';
    setErros(encontrados);
    if (Object.keys(encontrados).length) return;

    try {
      if (editando) {
        await envio.enviar(() => atualizarItem(produto.id_item, {
          nome_item: form.nome_item.trim(), unidade_medida: produto.unidade_medida,
          categoria_suprimento: form.categoria_suprimento.trim(), nivel: form.nivel,
        }));
        aoConcluir(`Produto atualizado: ${form.nome_item.trim()}.`);
      } else {
        await envio.enviar(() => criarItem({
          nome_item: form.nome_item.trim(), unidade_medida: form.unidade_medida.trim(),
          categoria_suprimento: form.categoria_suprimento.trim(), nivel: form.nivel,
          ...(form.abrir ? { quantidade_meta: meta } : {}),
        }));
        aoConcluir(`Produto cadastrado: ${form.nome_item.trim()}${form.abrir ? '. Já aparece na página de doações.' : '.'}`);
      }
    } catch { /* exibido abaixo */ }
  }

  const err = { ...erros, ...envio.errosCampo };
  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-5">
      <Campo rotulo="Nome" obrigatorio erro={err.nome_item} dica="Inclua tamanho ou apresentação, como Leite em pó 400 g.">
        <input type="text" value={form.nome_item} onChange={mudar('nome_item')} maxLength={120} />
      </Campo>
      <Campo rotulo="Unidade" obrigatorio={!editando} erro={err.unidade_medida}
        dica={editando ? 'A unidade não pode mudar, para não misturar quantidades já registradas. Para outra unidade, cadastre outro produto.' : 'Como o produto é contado ao chegar.'}>
        <input type="text" list="unidades-comuns" value={form.unidade_medida} onChange={mudar('unidade_medida')} maxLength={20} disabled={editando} />
      </Campo>
      <datalist id="unidades-comuns">{UNIDADES_COMUNS.map((u) => <option key={u} value={u} />)}</datalist>
      <Campo rotulo="Tipo de produto" obrigatorio erro={err.categoria_suprimento} dica="Ex.: Alimentos, Higiene, Limpeza.">
        <input type="text" list="categorias-existentes" value={form.categoria_suprimento} onChange={mudar('categoria_suprimento')} maxLength={50} />
      </Campo>
      <datalist id="categorias-existentes">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
      <EscolherPrioridade nome="nivel-produto" legenda="Prioridade sugerida" valor={form.nivel}
        aoMudar={(nivel) => setForm((f) => ({ ...f, nivel }))} erro={err.nivel} />

      {editando ? (
        <DesativarProduto produto={produto} aoConcluir={aoConcluir} />      ) : (
        <div className="flex flex-col gap-3 rounded-lg bg-nevoa p-4">
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="checkbox" className="size-6 accent-lar" checked={form.abrir} onChange={mudar('abrir')} />
            <span className="font-bold">Já pedir este produto aos doadores</span>
          </label>
          {form.abrir && (
            <Campo rotulo="Meta" obrigatorio erro={err.quantidade_meta} dica="Quanto o Lar precisa receber.">
              <input type="number" inputMode="numeric" min={1} step={1} value={form.quantidade_meta} onChange={mudar('quantidade_meta')} />
            </Campo>
          )}
        </div>
      )}

      {envio.erro && <Alerta tipo="erro">{envio.erro.message}</Alerta>}
      <Botao type="submit" carregando={envio.enviando} className="self-start">{editando ? 'Salvar alterações' : 'Cadastrar produto'}</Botao>
    </form>
  );
}

/** DELETE /itens/{id}: tira o produto da página de doações sem apagar o histórico. */
function DesativarProduto({ produto, aoConcluir }) {
  const [confirmando, setConfirmando] = useState(false);
  const envio = useEnvio();

  if (!produto.ativo) {
    return <p className="rounded-lg bg-nevoa p-3 text-sm">Produto desativado. Nesta versão não é possível reativá-lo pelo painel.</p>;
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border-2 border-linha p-4">
      <p className="font-bold">Desativar produto</p>
      <p className="text-sm text-tinta-suave">Ele sai da página de doações, mas o histórico é mantido. Nesta versão, não dá para reativar.</p>
      {envio.erro && <Alerta tipo="erro">{envio.erro.message}</Alerta>}
      {confirmando ? (
        <div className="flex flex-wrap gap-2">
          <Botao variante="perigoCheio" carregando={envio.enviando}
            onClick={async () => { try { await envio.enviar(() => desativarItem(produto.id_item)); aoConcluir(`Produto desativado: ${produto.nome_item}.`); } catch { /* exibido acima */ } }}>
            Confirmar desativação
          </Botao>
          <Botao variante="secundario" onClick={() => setConfirmando(false)}>Voltar</Botao>
        </div>
      ) : (
        <Botao variante="perigo" className="self-start" onClick={() => setConfirmando(true)}>Desativar produto</Botao>
      )}
    </div>
  );
}
