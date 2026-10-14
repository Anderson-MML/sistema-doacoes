# Tarefa 8 — API REST Lar Ternura

API 2.0.0, compatibilizada com o banco do Vinicius e validada localmente. Este pacote contém somente o backend e sua documentação; não publica ou substitui o frontend da tarefa 13/14.

## Executar

Na pasta backend, instalar dependências com `pnpm install --frozen-lockfile` e executar `pnpm test`. Os testes criam banco PGlite descartável e não usam DATABASE_URL de produção. Os cinco SQL originais em ../banco-vinicius são dependências desses testes e referências da entrega do Vinicius.

Para executar a API, configurar variáveis privadas conforme .env.example, aplicar apenas a migração complementar 002 no ambiente autorizado e iniciar com `pnpm start`. Ler ../docs/api/MIGRACAO-E-INTEGRACAO.md antes de instalar. Não executar 00_RECRIAR_BANCO_COMPLETO.sql no banco já preparado: ele é destrutivo e está incluído como referência de testes locais.

## Documentação e escopo

Contratos OpenAPI: ../docs/api/openapi.json. São 34 operações HTTP em 30 caminhos. A modelagem do banco pertence ao Vinicius; o complemento api_apoio precisa ser revisado com ele antes da aplicação no ambiente compartilhado.

Os testes incluem um cliente HTTP de referência em test/fixtures/cliente-agendamento.mjs para conferir o contrato e o retry. Esse arquivo é um apoio ao teste, não uma implementação ou publicação de tela do frontend.

Ainda falta configurar e aplicar o complemento no Neon autorizado, criar administrador, publicar a API com HTTPS e integrar ao frontend do grupo. Nenhuma migração ou seed é executada ao iniciar servidor; não houve alteração de Neon ou GitHub nesta preparação.

## Correção de estrutura — 13/10/2026

A migração e o `/ready` agora compartilham a validação estrutural das tabelas de apoio. Incompatibilidades interrompem a migração e retornam 503 no `/ready`. Ver `docs/api/CORRECAO-VALIDACAO-ESTRUTURA-13-10-2026.md` (a partir da raiz do repositório). Para regenerar a migração após mudar o contrato, executar `node scripts/build-migration.js` na pasta backend; esse comando não acessa o banco.
