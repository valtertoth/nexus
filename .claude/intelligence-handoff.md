# Handoff do Intelligence para o Nexus

## O que foi feito no Intelligence (sessão 2026-04-03/04)

### Integração Intelligence ↔ Nexus: COMPLETA
- Intelligence (porta 8765) tem rotas `/integrations/nexus/*`
- Auto-sync a cada 5 minutos busca conversões pendentes no Nexus
- API Key do Nexus já está configurada: `nxk_8732273ef9339fe66dc4e979b979df5d86a080e7df411733073bc85e557b1611`
- Conexão testada e funcionando (48+ syncs executados)
- URL de produção do Nexus: `https://nexusserver-production-f97f.up.railway.app`

### Deploy Railway: ONLINE
- Serviço `@nexus/server` rodando com status ACTIVE
- Health check respondendo 200
- Webhook verification respondendo corretamente (testado com hub.challenge)

## O QUE FALTA FAZER (prioridade)

### 1. Registrar webhook WhatsApp no Meta
O app "Claude" (ID: 916571154294013) no Meta Developers NÃO tem o produto WhatsApp configurado. Só tem API de Marketing.

**Opções:**
- Adicionar caso de uso "WhatsApp Business" ao app "Claude"
- Ou configurar no WhatsApp Business Platform diretamente

**Dados do webhook:**
- URL: `https://nexusserver-production-f97f.up.railway.app/webhook`
- Verify Token: `nexus-webhook-secret-2024`
- O endpoint já foi testado e responde corretamente

**Números:**
- +55 11 4040-1981 — número do atendimento automatizado (Nexus)
- +55 18 99671-4293 — número do vendedor atual (celular, NÃO migrar ainda)
- WA_PHONE_NUMBER_ID no .env.local: 996081613596426
- WA_BUSINESS_ACCOUNT_ID: 2828127757477641

**IMPORTANTE:** O usuário quer TESTAR o Nexus antes de migrar o número real. Usar o número de teste (+1 555-633-8690) ou o 4040-1981 para testes.

### 2. Deploy frontend Nexus
- Build: `npm run build:web` (gera /packages/web/dist/)
- Precisa de hosting (Vercel, Netlify, ou junto no Railway)
- Configurar `VITE_API_URL=https://nexusserver-production-f97f.up.railway.app`

### 3. Após webhook funcionando
- Testar envio/recebimento de mensagens
- Testar registro de outcome (convertido/perdido)
- Verificar se conversion_events são criados corretamente
- Intelligence vai buscar automaticamente a cada 5min e enviar para Meta CAPI + Google Ads

## Contexto do negócio
- Empresa: Toth Móveis (móveis de madeira maciça premium)
- Ticket médio: R$5.942
- 24 vendas/mês, 100% via WhatsApp
- Site Shopify é vitrine — ninguém compra no checkout
- Intelligence roda na porta 8765 com Meta Ads, Google Ads, GA4, GSC, Merchant, Shopify
- Budget ads: R$300/dia (R$150 Google + R$150 Meta)
