# TASKS - CLOUDTRON ONECLICK

### TAREFA ATIVA: Fix de Escopo de Variável (ReferenceError: effortTagToDisplay) em sendMessage

- [ ] **Alvos:** `@app.html` e `@docs/app.html`
- [ ] **Prioridade:** Bloqueador Crítico (Uncaught ReferenceError no envio de mensagens)

#### 1. Diagnóstico do Problema
- `Uncaught (in promise) ReferenceError: effortTagToDisplay is not defined at sendMessage ((index):6250:63)`.
- A variável `effortTagToDisplay` é referenciada na montagem do elemento ou telemetria da mensagem, mas não foi definida no escopo local de `sendMessage`.

#### 2. Especificação da Correção (@app.html e @docs/app.html)
No início da função `sendMessage`, antes de qualquer uso ou chamada assíncrona, definir defensivamente a variável:

```javascript
// Garantir fallback e definição de effortTagToDisplay
const effortTagToDisplay = window.currentEffort || localStorage.getItem('cloudtron_effort') || 'Auto';
Se houver formatação ou capitalização posterior, garantir que effortTagToDisplay possua valor de fallback caso window.currentEffort seja nulo/indefinido.

3. Critérios de Aceitação
Enviar mensagens sucessivas no chat sem nenhum disparo de ReferenceError no Console (Ctrl + Shift + I).

A telemetria e o indicador de Effort no rodapé/card continuam exibindo o estado correto.

A suíte npm test passa com 19/19 checks.