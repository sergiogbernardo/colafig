# Runbook operacional de privacidade

Este é um ponto de partida técnico-operacional e precisa de validação jurídica e definição de responsáveis.

## Solicitações de titulares

Canal publicado: `privacidade@sabion.io`.

Para cada solicitação:

1. gerar protocolo e registrar data, tipo de pedido e responsável;
2. responder pelo mesmo e-mail cadastrado ou aplicar verificação adicional proporcional;
3. nunca pedir senha, token de sessão ou documento sem necessidade comprovada;
4. localizar dados em Supabase Auth, `profiles`, `user_albums`, `collections`, `friendships`, eventos/limites sociais, logs e backups;
5. registrar a decisão, os sistemas afetados, a execução e a resposta enviada;
6. restringir o acesso ao registro da solicitação aos responsáveis autorizados.

Pedidos de exportação devem usar formato estruturado e legível. Pedidos de exclusão devem revogar sessões, eliminar a conta no Auth e verificar os `on delete cascade`, backups e dados locais. Dados cuja retenção seja legalmente necessária devem ser isolados, minimizados e documentados.

## Incidentes de segurança

1. conter o incidente sem destruir evidências;
2. registrar início, descoberta, sistemas, categorias de dados e titulares potencialmente afetados;
3. trocar/revogar credenciais e sessões quando necessário;
4. avaliar risco ou dano relevante aos titulares e acionar responsável jurídico/privacidade;
5. preparar comunicação à ANPD e aos titulares quando aplicável;
6. documentar causa, linha do tempo, medidas e validação da correção;
7. manter o registro do incidente pelo prazo regulatório aplicável — atualmente, no mínimo cinco anos para os registros abrangidos pela regulamentação da ANPD.

## Retenção proposta para aprovação

| Dado | Regra proposta | Evento de exclusão |
|---|---|---|
| Conta, perfil e coleção | enquanto a conta estiver ativa | exclusão da conta |
| Amizades e convites pendentes | enquanto necessários ao recurso | remoção/cancelamento ou exclusão da conta |
| Eventos de limite de convites | 90 dias | rotina automática de limpeza |
| Limites de busca | janela ativa + margem operacional curta | rotina automática de limpeza |
| Logs de infraestrutura | menor período compatível com segurança e contrato do provedor | expiração automática |
| Backups | janela de recuperação documentada | rotação automática |
| Solicitações de titulares | prazo aprovado por jurídico e segurança | expiração controlada |
| Registros de incidentes regulados | mínimo regulatório aplicável | revisão após o prazo |

Nenhum prazo desta tabela deve ser anunciado como definitivo antes de confirmar configuração real dos provedores e aprovação jurídica.
