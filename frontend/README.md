# Frontend: Sistema de Doações Lar Ternura

React 18 + Tailwind CSS 4 + Vite 5. Consome a **API 2.0.0** (`openapi.json`): área do doador e painel da ONG.

## Rodar localmente

```bash
cd frontend
npm install
cp .env.example .env.local   # no Windows: copy .env.example .env.local
npm run dev                  # abre em http://127.0.0.1:5173
```

Use `127.0.0.1`, não `localhost` (no Windows o `localhost` resolve para IPv6 primeiro).

## Modo simulado (sem API)

Com `VITE_USAR_MOCK=true` no `.env.local`, o front usa um servidor simulado que roda no navegador
(`src/api/mock/`). Ele segue o contrato e as regras dos triggers do banco, com o cenário do
`05_DADOS_FICTICIOS.sql`. Os dados ficam no `localStorage`; a faixa amarela no topo tem o botão
"Restaurar dados de exemplo".

Conta de demonstração: `admin@demo.org`, senha `demo12345`.

O simulador já segue o contrato proposto no PDF "Ajustes no backend: itens 1, 3 e 9", que ainda
precisa ser implementado na API real:

- `GET /admin/agendamentos` do mais recente para o mais antigo, com `q` (código, nome, telefone
  ou e-mail) e `status` com vários valores (`Pendente,Confirmado`);
- `quantidade_recebida` em cada item do agendamento;
- `POST /admin/agendamentos/{id}/receber-e-concluir`, que registra o que chegou e conclui de uma vez.

Enquanto a API não tiver essas mudanças, a tela **Doações agendadas** só funciona no modo simulado.

**Para usar a API real:**

1. No `.env.local` do front: `VITE_USAR_MOCK=false` e `VITE_API_URL=http://127.0.0.1:3000` (ou a URL publicada).
2. No backend, incluir a origem do front em `CORS_ORIGINS` (em desenvolvimento: `http://127.0.0.1:5173`).
3. Nenhuma tela muda: só `src/api/index.js` conhece o contrato da API.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Gera `dist/` para publicação |
| `npm test` | 14 testes do servidor simulado contra o `openapi.json` e o cenário do banco |

## Estrutura

```
src/
├── api/
│   ├── cliente.js        # fetch, timeout de 70 s (cold start do Render), tokens, Idempotency-Key, request_id
│   ├── index.js          # camada de adaptação: única parte que conhece o openapi.json
│   └── mock/             # servidor simulado da API 2.0.0 + dados + testes
├── components/
│   ├── ui/               # Botão, Campo, Diálogo, Alerta, Barra de progresso... (acessíveis)
│   ├── publico/          # layout, filtros, cartão de necessidade, painel "Sua doação"
│   └── admin/            # layout do painel, rota protegida, registro de recebimento
├── contexts/             # sessão (AuthContext) e carrinho do doador (DoacaoContext)
├── hooks/                # useCarregar, useEnvio, useTitulo, useTelaGrande
├── pages/publico/        # Termômetro, Agendar, Confirmação, Meu agendamento (link privado)
├── pages/admin/          # Entrar, Início, Agendamentos, Registrar, Necessidades, Produtos
├── utils/                # datas em America/Sao_Paulo, validações, urgência, Google Agenda, link privado
└── config.js             # Endereço de entrega e contatos da ONG
```

## Acessibilidade (WCAG 2.1 AA)

- Fonte **Atkinson Hyperlegible** (criada para leitores com baixa visão), base de 18 px.
- Contraste mínimo de 4,5:1 em todos os textos. As cores de urgência do banco (`#EF4444`, `#F59E0B`,
  `#10B981`) falham com texto branco, então o front usa tons próprios por nível (`src/index.css`).
- Urgência sempre com texto, nunca só cor. Áreas de toque de no mínimo 44×44 px.
- Link "Pular para o conteúdo", foco visível de 3 px, foco levado ao conteúdo ao trocar de página.
- Formulários com rótulos ligados, `aria-invalid`, `aria-describedby` e resumo de erros com links.
- Diálogos com `<dialog>` nativo (prende o foco, fecha com Esc). Avisos com `aria-live`.
- Verificação automática com axe-core: 0 violações em 13 telas e diálogos. Sem rolagem lateral a 390 px.

## Decisões de integração com a API 2.0.0

- **Idempotência:** `POST /agendamentos` e `POST /doacoes` enviam `Idempotency-Key` (UUID). A mesma chave
  só é reaproveitada quando a tentativa anterior falhou por rede; se a API respondeu, a próxima usa chave nova.
- **Vínculo com a meta:** o carrinho guarda o `id_necessidade` de cada item. Em `POST /doacoes`, o front envia o
  vínculo explicitamente e mostra a opção "Somar à necessidade aberta" para a ONG decidir.
- **Horários:** vêm de `GET /disponibilidade`; horários lotados aparecem riscados e desabilitados.
- **Link privado do doador:** `/meu-agendamento/{id}#{token_acesso}`. O código fica depois do `#`, então não
  é enviado a servidores nem aparece em logs. Também é guardado no aparelho em que o agendamento foi feito.
- **Datas:** agendamentos chegam em hora local de São Paulo sem fuso; `paraInstante()` em `utils/formatar.js` trata.
