# TASKS - CLOUDTRON ONECLICK (v1.5.0-dev)

### TAREFA ATIVA: Failover Priority Reorder & Matriz Customizável de Agentes (Paperclip Fase 1)

- [ ] **Alvos:** `@server.js`, `@app.html`, `@docs/app.html`, `@test/suite.js`
- [ ] **Prioridade:** Arquitetural & Funcional (Resiliência Configurável + Orquestração Multi-Agente)

---

#### 1. FRENTE A: Reordenação Dinâmica da Fila de Failover

##### A. Interface e Persistência (@app.html e @docs/app.html)
1. **Modal de Configurações (Aba Provedores & API Keys):**
   - Renderizar o container: *"Ordem de Prioridade do Failover"*.
   - Listar os provedores suportados (`nvidia`, `groq`, `openrouter`, `gemini`) como cards compactos.
   - Cada card deve conter botões de reordenação rápida (**▲ Subir** / **▼ Descer**).
   - Exibir badge contextual: se o campo da API Key correspondente estiver vazio, exibir badge cinza `[Sem Chave - Ignorado no Circuito]`.
2. **Armazenamento e Payload:**
   - Persistir a ordem no `localStorage` sob a chave `cloudtron_failover_priority` (padrão: `["nvidia", "groq", "openrouter"]`).
   - Na função de envio (`sendPrompt` / `/api/messages`), incluir o array no body:
     ```json
     { "providerPriority": ["groq", "nvidia", "openrouter"] }
     ```

##### B. Backend Resiliente (@server.js)
1. **Resolução Dinâmica da Cascata:**
   - Extrair `providerPriority` do `req.body`. Caso ausente, aplicar o fallback padrão.
   - Filtrar dinamicamente apenas os provedores que possuam credencial válida configurada (`hasValidKey(provider)`).
   - Iterar sobre a lista na ordem exata solicitada pelo usuário.
   - Em caso de HTTP 429, 5xx, timeout ou erro de rede, saltar para o próximo da fila preservando o payload e o In-Context RLHF intactos.
   - Emitir o evento SSE `provider_meta` com o provider final assumido.

---

#### 2. FRENTE B: Matriz Customizável de Agentes (Paperclip Fase 1)

##### A. Estrutura de Dados e Presets
1. Cada slot de agente é definido por:
   ```typescript
   interface AgentRoleConfig {
     id: string;              // "agent_lead", "agent_coder", "agent_qa", "agent_custom_1"
     name: string;            // Nome amigável exibido no UI
     avatar: string;          // Emoji ou sigla
     presetKey: string;       // "architect", "coder", "qa", "sound_engineer", "custom"
     roleDirective: string;   // Diretriz injetada no system prompt
     effortLevel: string;     // "Auto", "Profundo", "Código", "Rápido"
   }
Biblioteca de Presets Nativos:

Planejador / Arquiteto L1-L2: Raciocínio estrutural, diagramas, geração de TASKS.md e contratos de interface.

Executor / Coder L3: Sintaxe cirúrgica, sem introduções ou prosa, zero truncamento de código.

Auditor / QA L4: Detecção de regressões, contratos de rede, falhas de segurança e edge cases.

Engenheiro de Som / DSP: Roteamento de barramentos, ganho, equalização, acústica e mixagem digital.

Custom: Template neutro desbloqueado para digitação livre.

B. UI de Gerenciamento & Chat Input (@app.html e @docs/app.html)
Modal / Gaveta de Configuração do Squad:

Permite editar o nome, avatar, preset base e roleDirective (textarea expansível) de cada agente.

Botão para resetar para os presets padrão ou adicionar novos slots customizados.

Persistência no localStorage sob cloudtron_squad_agents.

Seletor de Agente Ativo no Input do Chat:

Adicionar chip seletor ao lado do seletor de esforço (ex.: [@Arquiteto], [@Coder], [@Auditor]).

Ao trocar de agente, aplica visualmente o badge correspondente e vincula o effortLevel padrão daquele agente.

Handoff 1-Clique na Mensagem:

No rodapé de cada resposta gerada, renderizar a ação Passar contexto para [Próximo Agente] ➔.

Ao clicar, o resumo/conteúdo da resposta é formatado e inserido no input pronto para despacho ao próximo papel.

C. Backend Orchestration (@server.js)
Receber o campo activeRoleDirective no body da requisição.

Interceptar a montagem do system prompt:

Inserir a diretriz do agente com precedência logo abaixo das diretrizes de arquitetura e regras de auto-calibração.

3. Bateria de Testes de Contrato (@test/suite.js)
Adicionar teste unitário validando a resolução de prioridade personalizada enviada no payload (ex: forçar ordem groq -> nvidia e simular erro na primeira).

Validar contrato de injeção da activeRoleDirective no payload de mensagens.

4. Critérios de Aceitação
Reordenar a lista no modal altera a ordem real de execução no backend.

Provedores sem chave são desconsiderados automaticamente da fila sem quebrar a cascata.

O usuário consegue alternar entre agentes pré-definidos e customizados no input.

Pipeline completo (npm run pipeline: L4 -> L3 -> L5) passa com 100% de sucesso.