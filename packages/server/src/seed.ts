/**
 * Seed script — popula o banco com dados de teste.
 * Rodar: npx tsx packages/server/src/seed.ts
 *
 * IMPORTANTE: Requer um user já criado via signup (Supabase Auth).
 * Configure ORG_ID e USER_ID abaixo antes de rodar.
 */
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ⚠️ Substitua pelo ID da sua org e user criados no signup
const ORG_ID = process.env.SEED_ORG_ID || 'SUBSTITUA_PELO_ORG_ID'
const USER_ID = process.env.SEED_USER_ID || 'SUBSTITUA_PELO_USER_ID'

const SECTORS = [
  { name: 'Vendas', color: '#3b82f6', system_prompt: 'Você é um assistente de vendas. Ajude clientes com informações sobre produtos, preços e disponibilidade.' },
  { name: 'Financeiro', color: '#f59e0b', system_prompt: 'Você é um assistente financeiro. Ajude com boletos, pagamentos, notas fiscais e cobranças.' },
  { name: 'Suporte', color: '#10b981', system_prompt: 'Você é um assistente de suporte técnico. Ajude com problemas, dúvidas técnicas e troubleshooting.' },
]

const CONTACTS = [
  { wa_id: '5511999001001', name: 'Maria Silva', phone: '5511999001001' },
  { wa_id: '5511999002002', name: 'João Santos', phone: '5511999002002' },
  { wa_id: '5511999003003', name: 'Ana Oliveira', phone: '5511999003003' },
  { wa_id: '5511999004004', name: 'Carlos Mendes', phone: '5511999004004' },
  { wa_id: '5511999005005', name: 'Fernanda Lima', phone: '5511999005005' },
  { wa_id: '5511999006006', name: 'Roberto Costa', phone: '5511999006006' },
  { wa_id: '5511999007007', name: 'Juliana Alves', phone: '5511999007007' },
  { wa_id: '5511999008008', name: 'Pedro Rocha', phone: '5511999008008' },
  { wa_id: '5511999009009', name: 'Luciana Ferreira', phone: '5511999009009' },
  { wa_id: '5511999010010', name: 'Marcos Pereira', phone: '5511999010010' },
]

const CONVERSATIONS_DATA = [
  { contactIdx: 0, sectorIdx: 0, status: 'open', preview: 'Olá, gostaria de saber o preço do produto X', unread: 3, minutesAgo: 2 },
  { contactIdx: 1, sectorIdx: 2, status: 'open', preview: 'Não consigo acessar minha conta desde ontem', unread: 1, minutesAgo: 5 },
  { contactIdx: 2, sectorIdx: 1, status: 'pending', preview: 'Ainda não recebi o boleto do mês passado', unread: 0, minutesAgo: 15 },
  { contactIdx: 3, sectorIdx: 0, status: 'open', preview: 'Vocês fazem entrega para o interior de SP?', unread: 2, minutesAgo: 30 },
  { contactIdx: 4, sectorIdx: 2, status: 'open', preview: 'O sistema está apresentando erro 500', unread: 5, minutesAgo: 1 },
  { contactIdx: 5, sectorIdx: 1, status: 'resolved', preview: 'Obrigado, recebi a nota fiscal!', unread: 0, minutesAgo: 120 },
  { contactIdx: 6, sectorIdx: 0, status: 'open', preview: 'Quero fazer um pedido de 50 unidades', unread: 1, minutesAgo: 8 },
  { contactIdx: 7, sectorIdx: 2, status: 'pending', preview: 'Quando será a manutenção programada?', unread: 0, minutesAgo: 60 },
  { contactIdx: 8, sectorIdx: 1, status: 'open', preview: 'Preciso de uma segunda via do recibo', unread: 1, minutesAgo: 12 },
  { contactIdx: 9, sectorIdx: 0, status: 'closed', preview: 'Pedido #4521 chegou certinho, obrigado!', unread: 0, minutesAgo: 1440 },
] as const

const MESSAGES_PER_CONVERSATION = [
  [
    { sender_type: 'contact', content: 'Boa tarde! Gostaria de saber o preço do produto X' },
    { sender_type: 'agent', content: 'Boa tarde, Maria! O produto X custa R$ 149,90. Posso te enviar mais detalhes?' },
    { sender_type: 'contact', content: 'Sim, por favor! Vocês têm em estoque?' },
    { sender_type: 'contact', content: 'E qual o prazo de entrega para São Paulo?' },
    { sender_type: 'contact', content: 'Olá, gostaria de saber o preço do produto X' },
  ],
  [
    { sender_type: 'contact', content: 'Olá, não consigo acessar minha conta desde ontem' },
    { sender_type: 'agent', content: 'Olá João! Vou verificar sua conta. Pode me informar seu email cadastrado?' },
    { sender_type: 'contact', content: 'Não consigo acessar minha conta desde ontem' },
  ],
  [
    { sender_type: 'contact', content: 'Boa tarde, ainda não recebi o boleto do mês passado' },
    { sender_type: 'agent', content: 'Ana, vou verificar. Um momento, por favor.' },
    { sender_type: 'agent', content: 'Identifiquei que houve um erro no envio. Estou gerando um novo boleto agora.' },
  ],
]

async function seed() {
  console.log('🌱 Iniciando seed...')

  // 1. Create sectors
  console.log('📂 Criando setores...')
  const { data: sectors, error: sectorsError } = await supabase
    .from('sectors')
    .insert(SECTORS.map(s => ({ ...s, org_id: ORG_ID })))
    .select()

  if (sectorsError) {
    console.error('Erro ao criar setores:', sectorsError.message)
    process.exit(1)
  }
  console.log(`   ✅ ${sectors.length} setores criados`)

  // 2. Create contacts
  console.log('👤 Criando contatos...')
  const { data: contacts, error: contactsError } = await supabase
    .from('contacts')
    .insert(CONTACTS.map(c => ({
      ...c,
      org_id: ORG_ID,
      first_message_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    })))
    .select()

  if (contactsError) {
    console.error('Erro ao criar contatos:', contactsError.message)
    process.exit(1)
  }
  console.log(`   ✅ ${contacts.length} contatos criados`)

  // 3. Create conversations
  console.log('💬 Criando conversas...')
  const conversationsToInsert = CONVERSATIONS_DATA.map(c => ({
    org_id: ORG_ID,
    contact_id: contacts[c.contactIdx].id,
    sector_id: sectors[c.sectorIdx].id,
    assigned_to: c.status !== 'closed' ? USER_ID : null,
    status: c.status,
    unread_count: c.unread,
    last_message_preview: c.preview,
    last_message_at: new Date(Date.now() - c.minutesAgo * 60000).toISOString(),
    wa_service_window_expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
  }))

  const { data: conversations, error: convsError } = await supabase
    .from('conversations')
    .insert(conversationsToInsert)
    .select()

  if (convsError) {
    console.error('Erro ao criar conversas:', convsError.message)
    process.exit(1)
  }
  console.log(`   ✅ ${conversations.length} conversas criadas`)

  // 4. Create messages for first 3 conversations
  console.log('📨 Criando mensagens...')
  let totalMessages = 0
  for (let i = 0; i < Math.min(3, conversations.length); i++) {
    const msgs = MESSAGES_PER_CONVERSATION[i]
    if (!msgs) continue

    const messagesToInsert = msgs.map((m, idx) => ({
      conversation_id: conversations[i].id,
      org_id: ORG_ID,
      sender_type: m.sender_type,
      sender_id: m.sender_type === 'agent' ? USER_ID : null,
      content: m.content,
      content_type: 'text',
      wa_status: m.sender_type === 'contact' ? 'delivered' : 'read',
      created_at: new Date(Date.now() - (msgs.length - idx) * 60000).toISOString(),
    }))

    const { error: msgsError } = await supabase
      .from('messages')
      .insert(messagesToInsert)

    if (msgsError) {
      console.error(`Erro nas mensagens da conversa ${i}:`, msgsError.message)
    } else {
      totalMessages += messagesToInsert.length
    }
  }
  console.log(`   ✅ ${totalMessages} mensagens criadas`)

  console.log('')
  console.log('🎉 Seed concluído!')
  console.log(`   Org: ${ORG_ID}`)
  console.log(`   Setores: ${sectors.length}`)
  console.log(`   Contatos: ${contacts.length}`)
  console.log(`   Conversas: ${conversations.length}`)
  console.log(`   Mensagens: ${totalMessages}`)
}

seed().catch(console.error)
