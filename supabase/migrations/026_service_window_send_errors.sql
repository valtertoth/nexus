-- 026 · Erros de envio visíveis + janela de serviço confiável (Lane B)
-- Auditoria 23-07: erro da Meta (131047 janela expirada, 131056, 470 etc.) virava
--   wa_status='failed' SEM motivo persistido — o vendedor não sabia por que falhou.
--   Agora guardamos o código/motivo devolvidos pela Cloud API em cada mensagem, tanto
--   nos statuses assíncronos do webhook quanto nas falhas síncronas dos /send.
-- Texto (não int) de propósito: os códigos da Meta são numéricos mas tratamos como
--   rótulo opaco, e wa_error_message é livre.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS wa_error_code TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS wa_error_message TEXT;

-- Consulta comum: mensagens falhas de uma org (painel de diagnóstico / retry em massa)
CREATE INDEX IF NOT EXISTS idx_messages_failed
  ON messages(org_id, created_at DESC)
  WHERE wa_status = 'failed';
