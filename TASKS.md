# TASKS - CLOUDTRON ONECLICK (v1.4.0)

### TAREFA ATIVA: Backend Multi-Provider Cascading Failover & Rate-Limit Shield

- [ ] **Alvos:** `@server.js`, `@app.html`, `@docs/app.html`, `@test/suite.js`
- [ ] **Prioridade:** Arquitetural Crítica (Resiliência de Inferência & Continuidade de Sessão)

---

#### 1. Diagnóstico e Necessidade Técnica
- Atualmente, a rota `/api/messages` depende exclusivamente do provider selecionado (NVIDIA NIM por padrão).
- Se a NVIDIA retornar HTTP 429 (Rate Limit), HTTP 503 (Overloaded) ou Connection Timeout, o streaming é abortado e a interface congela em erro.
- O fallback deve ser transparente para o usuário: tentar a réplica no próximo provedor disponível preservando 100% das mensagens, system prompt e injeção de auditoria do NeMo RLHF.

---

#### 2. Especificação da Correção

##### A. Lógica de Cascata no Backend (@server.js)
1. **Definição da Ordem de Prioridade:**
   - Provider 1: `nvidia` (NVIDIA NIM)
   - Provider 2: `groq` (Groq API — ultra-baixa latência)
   - Provider 3: `openrouter` (OpenRouter API)
2. **Critérios de Acionamento do Fallback:**
   - Respostas HTTP 429, 500, 502, 503, 504.
   - Timeout de conexão ou erro de rede (`ECONNREFUSED`, `ETIMEDOUT`).
   - Chave do provedor principal não configurada ou inválida.
3. **Mapeamento de Modelos Equivalentes no Fallback:**
   - NVIDIA: `nvidia/nemotron-3.5-super-vl-120b-a12b` (ou modelo ativo).
   - Groq: `llama-3.3-70b-versatile` ou `mixtral-8x7b-32768`.
   - OpenRouter: `meta-llama/llama-3.3-70b-instruct` ou similar.
4. **Preservação de Contexto e Telemetria:**
   - O payload original (`messages`, incluindo os blocos `[AUDITORIA DO JUIZ NEMO]`) deve ser repassado sem mutações para o novo endpoint.
   - Enviar no início do stream (ou em cabeçalho SSE) a telemetria do provedor que assumiu a resposta:
     `data: {"type": "provider_meta", "provider": "Groq", "failover": true, "original": "NVIDIA"}\n\n`

##### B. Atualização do Frontend (@app.html e @docs/app.html)
1. Escutar o evento de telemetria `provider_meta` no leitor de stream.
2. Atualizar o badge de status e latência no rodapé:
   - Se for o provider primário: exibir nome normal e latência (ex: `NVIDIA NIM • 124ms`).
   - Se foi ativado o failover: exibir badge visual de contingência (ex: `⚠️ Groq (Failover Ativo) • 89ms`).

##### C. Bateria de Testes (@test/suite.js)
1. Adicionar teste unitário de simulação de fallback:
   - Simular mock de erro 429 da NVIDIA e verificar se a rota tenta o provider secundário.

---

#### 3. Critérios de Aceitação
- Se a chamada para a NVIDIA falhar com 429 ou timeout, a requisição é assumida pelo próximo provider configurado sem quebrar o streaming.
- As diretrizes de sistema persistentes e a injeção do NeMo são entregues intactas ao provider de fallback.
- O pipeline completo (`npm run pipeline`: L4 -> L3 -> L5) passa com 100% de sucesso.