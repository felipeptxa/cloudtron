# TASKS - CLOUDTRON ONECLICK

### TAREFA ATIVA: Correção de Escopo ReferenceError (accumulatedResponseText) no server.js

- [x] **Alvos:** `@server.js`
- [ ] **Prioridade:** Bloqueador Crítico (Falha no fechamento do SSE e auditoria NeMo)

#### 1. Diagnóstico & Causa-Raiz
- O streaming com a NVIDIA NIM completa com sucesso (TTFT < 500ms), mas o servidor lança:
  `[ERRO PROXY]: accumulatedResponseText is not defined`
- Falta a declaração da variável acumuladora no escopo da função de proxy de mensagens, ou há divergência de nomenclatura entre o loop que recebe os chunks de texto e o bloco que executa a auditoria pós-stream (NeMo Eval).

#### 2. Especificações Técnicas & Ações
1. **Declaração e Acumulação no Escopo da Rota (@server.js):**
   - No início da função de streaming da rota `/api/messages`, inicializar a variável explicitamente:
     ```javascript
     let accumulatedResponseText = '';
     ```
   - Dentro do loop de leitura dos chunks SSE vindos da NVIDIA/OpenAI, assegurar que cada pedaço de texto extraído do delta (`delta.content`) seja concatenado:
     ```javascript
     if (delta && delta.content) {
       accumulatedResponseText += delta.content;
     }
     ```
2. **Proteção no Pós-Processamento e NeMo Core:**
   - Antes de invocar o avaliador ou telemetria, assegurar que `accumulatedResponseText` seja passado com fallback seguro:
     ```javascript
     const finalContent = accumulatedResponseText || '';
     ```
3. **Fechamento Seguro do Stream:**
   - Garantir que o evento final enviado ao cliente seja emitido sem exceções:
     ```javascript
     if (!res.writableEnded) {
       res.write(`data: [DONE]\n\n`);
       res.end();
     }
     ```

#### 3. Critérios de Aceitação & Validação
- O prompt é enviado e a resposta completa do Nemotron é renderizada no chat.
- A linha de telemetria e o badge do NeMo aparecem sem mensagens de falha.
- Terminal do Node registra o encerramento do stream sem `[ERRO PROXY]`.
- Execução de `npm test` aprovada com 19/19 checks.