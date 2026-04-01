import { streamText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { supabaseAdmin } from '../lib/supabase.js'
import { searchRelevantChunks } from './rag.service.js'

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

interface ConsultMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Stream an AI consultation response (internal seller ↔ AI chat).
 * Uses the same context as suggestions (conversation history, RAG, brain, profile)
 * but with a different system prompt: advisory mode, NOT message drafting.
 */
export async function* streamConsultation(
  conversationId: string,
  question: string,
  chatHistory: ConsultMessage[],
  orgId: string
): AsyncGenerator<{ type: 'text' | 'done' | 'error'; data: string }> {
  try {
    // 1. Fetch conversation + sector
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('id, sector_id, contact_id')
      .eq('id', conversationId)
      .eq('org_id', orgId)
      .single()

    if (!conv) {
      yield { type: 'error', data: 'Conversa não encontrada' }
      return
    }

    const sectorId = conv.sector_id

    // 2. Fetch last 15 messages for richer context
    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('sender_type, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(15)

    const conversationHistory = (messages || [])
      .reverse()
      .map((m) => {
        const role = m.sender_type === 'contact' ? 'Cliente' : 'Vendedor'
        return `${role}: ${m.content || '[mídia]'}`
      })
      .join('\n')

    // 3. Sector config
    let sectorPrompt = ''
    let model = 'claude-sonnet-4-20250514'

    if (sectorId) {
      const { data: sector } = await supabaseAdmin
        .from('sectors')
        .select('system_prompt, ai_model, name')
        .eq('id', sectorId)
        .single()

      if (sector) {
        sectorPrompt = sector.system_prompt || ''
        model = sector.ai_model || model
      }
    }

    // 4. RAG knowledge
    let knowledgeContext = ''
    if (sectorId) {
      try {
        const sources = await searchRelevantChunks(question, sectorId, orgId)
        if (sources.length > 0) {
          knowledgeContext = sources
            .map((s, i) => `[${i + 1}] (${s.documentName})\n${s.content}`)
            .join('\n\n')
        }
      } catch { /* continue without */ }
    }

    // 5. Brain directives
    let brainDirectives = ''
    try {
      const { data: directives } = await supabaseAdmin
        .from('org_brain_directives')
        .select('category, title, content')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('priority', { ascending: false })
        .limit(8)

      if (directives && directives.length > 0) {
        const applicable = directives.filter((d: Record<string, unknown>) => {
          const sectors = d.applies_to_sectors as string[] | null
          if (!sectors || sectors.length === 0) return true
          return sectorId ? sectors.includes(sectorId) : true
        })
        if (applicable.length > 0) {
          brainDirectives = applicable
            .map((d) => `[${(d.category as string).toUpperCase()}] ${d.title}:\n${d.content}`)
            .join('\n\n')
        }
      }
    } catch { /* continue */ }

    // 6. Contact profile
    let contactContext = ''
    if (conv.contact_id) {
      try {
        const { data: contact } = await supabaseAdmin
          .from('contacts')
          .select('name, profile_summary, profile_stage, profile_sentiment, profile_interests, profile_objections, total_conversations, total_revenue')
          .eq('id', conv.contact_id)
          .single()

        if (contact) {
          const interests = (contact.profile_interests as string[]) || []
          const objections = (contact.profile_objections as string[]) || []
          contactContext = `Nome: ${contact.name || 'desconhecido'}
${contact.profile_summary ? `Resumo: ${contact.profile_summary}` : ''}
Estágio: ${contact.profile_stage || 'desconhecido'}
Sentimento: ${contact.profile_sentiment || 'neutro'}
${interests.length > 0 ? `Interesses: ${interests.join(', ')}` : ''}
${objections.length > 0 ? `Objeções: ${objections.join(', ')}` : ''}
${contact.total_conversations ? `Conversas anteriores: ${contact.total_conversations}` : 'Primeiro contato'}
${contact.total_revenue ? `Receita histórica: R$ ${contact.total_revenue}` : ''}`
        }
      } catch { /* continue */ }
    }

    // 7. Build CONSULT system prompt (advisory, not message drafting)
    const systemPrompt = buildConsultPrompt(
      sectorPrompt,
      conversationHistory,
      knowledgeContext,
      brainDirectives,
      contactContext
    )

    // 8. Build messages array (consult chat history + new question)
    const aiMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...chatHistory,
      { role: 'user', content: question },
    ]

    // 9. Stream response
    console.log(`[AI Consult] Calling model=${model}, messages=${aiMessages.length}, systemPrompt length=${systemPrompt.length}`)

    const result = await streamText({
      model: anthropic(model),
      system: systemPrompt,
      messages: aiMessages,
      temperature: 0.4,
      maxTokens: 1024,
    })

    let chunkCount = 0
    for await (const chunk of result.textStream) {
      chunkCount++
      yield { type: 'text', data: chunk }
    }

    console.log(`[AI Consult] Stream complete. Chunks: ${chunkCount}`)

    // If no chunks were produced, there may have been a silent failure
    if (chunkCount === 0) {
      // Await the full text to surface any hidden errors
      try {
        const fullText = await result.text
        console.log(`[AI Consult] Full text (fallback): "${fullText.substring(0, 200)}"`)
        if (fullText) {
          yield { type: 'text', data: fullText }
        } else {
          const finishReason = await result.finishReason
          console.error(`[AI Consult] No text produced. finishReason=${finishReason}`)
          yield { type: 'error', data: 'A IA não gerou resposta. Tente novamente.' }
        }
      } catch (innerErr) {
        console.error('[AI Consult] Hidden stream error:', innerErr)
        const msg = innerErr instanceof Error ? innerErr.message : 'Erro ao processar resposta'
        yield { type: 'error', data: msg }
      }
    }

    yield { type: 'done', data: '' }
  } catch (err) {
    console.error('[AI Consult] Error:', err)
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    yield { type: 'error', data: message }
  }
}

function buildConsultPrompt(
  sectorPrompt: string,
  conversationHistory: string,
  knowledgeContext: string,
  brainDirectives: string,
  contactContext: string
): string {
  let prompt = `Você é um consultor estratégico interno ajudando um vendedor em tempo real. O cliente NÃO verá esta conversa.

SEU PAPEL:
- Dar orientação estratégica e tática ao vendedor
- Analisar o comportamento do cliente e sugerir abordagens
- Ajudar a resolver objeções e dúvidas do vendedor
- NÃO escreva mensagens prontas para enviar ao cliente
- Em vez disso, explique a estratégia e o raciocínio por trás

TOM E FORMATAÇÃO:
- Direto e prático (como um mentor de vendas experiente)
- Use português brasileiro informal
- Seja conciso — máximo 4-6 linhas por resposta
- Use parágrafos curtos separados por linha em branco
- Pode usar **negrito** para termos-chave, mas sem exageros
- NÃO use listas numeradas, bullets ou headers em markdown
- Escreva como texto corrido natural, em tom de conversa`

  if (sectorPrompt) {
    prompt += `\n\nCONTEXTO DO SETOR:\n${sectorPrompt}`
  }

  if (contactContext) {
    prompt += `\n\nPERFIL DO CLIENTE:\n${contactContext}`
  }

  if (conversationHistory) {
    prompt += `\n\nCONVERSA ATUAL COM O CLIENTE:\n${conversationHistory}`
  }

  if (brainDirectives) {
    prompt += `\n\nDIRETRIZES DA EMPRESA:\n${brainDirectives}`
  }

  if (knowledgeContext) {
    prompt += `\n\nBASE DE CONHECIMENTO DISPONÍVEL:\n${knowledgeContext}`
  }

  return prompt
}
