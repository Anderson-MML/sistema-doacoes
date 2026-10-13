# Validação da tarefa 8

31 testes locais de API/banco aprovados, sem falhas. Um desses casos executa as 25 verificações originais do Vinicius; não somar 25 novamente ao total. Suíte executada no pacote da tarefa 8, sem depender da pasta frontend-react.

Abrange migração repetível e sem reset, recusa de modelo misto, catálogo/metas, renovação e histórico, sessões, usuários inativos, vagas, idempotência, meta desatualizada, IDs bigint, recebimentos parciais/espontâneos, estorno, mês de São Paulo, conclusão e role limitada local. Cliente HTTP de referência valida o contrato de agendamento e recuperação após perda da resposta.

Ambiente: banco PGlite descartável. Nome da conexão local adaptado em memória nos scripts de teste; regras e arquivos SQL originais preservados. Não comprova permissões ou concorrência entre conexões no Neon real. API ainda não publicada. Integração de API externa da tarefa 9 e frontend completo permanecem fora deste pacote.
