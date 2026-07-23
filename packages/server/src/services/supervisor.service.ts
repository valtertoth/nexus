import { supabaseAdmin } from '../lib/supabase.js'

// ─── Painel do Supervisor ─────────────────────────────────────────────────────
// Visão de dono: agrega o estado VIVO do atendimento de uma org em poucas queries
// (sem N+1). Somente leitura. As colunas first_response_at/response_time_secs são
// populadas pela camada de atribuição (assignment.service) e existem no banco.

const STALL_THRESHOLD_SECS = 15 * 60 // "parada": cliente esperando há > 15min
const ACTIVE_STATUSES = ['open', 'pending'] as const
const CLOSED_STATUSES = ['resolved', 'closed'] as const
const MAX_ACTIVE = 400 // teto defensivo para a fila ativa da org
const LIST_LIMIT = 12 // itens nas listas "esperando" / "paradas"

// ─── Tipos de saída ───────────────────────────────────────────────────────────

export interface AgentLoad {
  user_id: string
  name: string
  is_online: boolean
  open: number
  waiting: number
  avg_first_response_secs: number | null
  response_count: number
}

export interface WaitingConversation {
  conversation_id: string
  contact_name: string | null
  assigned_to: string | null
  assigned_name: string | null
  status: string
  wait_secs: number
  window_open: boolean
}

export interface SupervisorOverview {
  generated_at: string
  totals: {
    open: number
    pending: number
    closed_today: number
    queue: number
    waiting: number
    stalled: number
  }
  first_response: { avg_secs: number | null; count: number }
  agents: AgentLoad[]
  waiting_longest: WaitingConversation[]
  stalled: WaitingConversation[]
}

// ─── Linhas cruas do banco ────────────────────────────────────────────────────

interface ActiveConvRow {
  id: string
  status: string
  assigned_to: string | null
  last_message_at: string | null
  wa_service_window_expires_at: string | null
  contact: { name: string | null } | { name: string | null }[] | null
}

interface UserRow {
  id: string
  name: string | null
  is_online: boolean | null
}

interface ResponseRow {
  assigned_to: string | null
  response_time_secs: number | null
}

interface LatestMsgRow {
  conversation_id: string
  sender_type: string
  is_internal_note: boolean | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Início do dia no fuso de São Paulo (BRT = UTC-3, sem horário de verão desde 2019).
function startOfDaySaoPauloISO(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = fmt.formatToParts(new Date())
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const m = parts.find((p) => p.type === 'month')?.value ?? '01'
  const d = parts.find((p) => p.type === 'day')?.value ?? '01'
  return new Date(`${y}-${m}-${d}T00:00:00-03:00`).toISOString()
}

function contactName(row: ActiveConvRow): string | null {
  const c = row.contact
  if (!c) return null
  return Array.isArray(c) ? c[0]?.name ?? null : c.name ?? null
}

async function countConversations(
  build: (
    q: ReturnType<typeof supabaseAdmin.from>,
  ) => PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number> {
  const { count } = await build(supabaseAdmin.from('conversations'))
  return count ?? 0
}

// ─── Agregação principal ──────────────────────────────────────────────────────

export async function getSupervisorOverview(orgId: string): Promise<SupervisorOverview> {
  const now = Date.now()
  const startIso = startOfDaySaoPauloISO()

  // Rodada 1 — contadores baratos (head:true) + linhas de tempo de resposta +
  // usuários + fila ativa. Tudo em paralelo.
  const [
    openCount,
    pendingCount,
    closedTodayCount,
    queueCount,
    responseRowsRes,
    usersRes,
    activeRes,
  ] = await Promise.all([
    countConversations((q) =>
      q.select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'open'),
    ),
    countConversations((q) =>
      q.select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'pending'),
    ),
    countConversations((q) =>
      q
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .in('status', CLOSED_STATUSES as unknown as string[])
        .gte('resolved_at', startIso),
    ),
    countConversations((q) =>
      q
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .in('status', ACTIVE_STATUSES as unknown as string[])
        .is('assigned_to', null),
    ),
    supabaseAdmin
      .from('conversations')
      .select('assigned_to, response_time_secs')
      .eq('org_id', orgId)
      .gte('first_response_at', startIso)
      .not('response_time_secs', 'is', null),
    supabaseAdmin
      .from('users')
      .select('id, name, is_online')
      .eq('org_id', orgId)
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('conversations')
      .select('id, status, assigned_to, last_message_at, wa_service_window_expires_at, contact:contacts(name)')
      .eq('org_id', orgId)
      .in('status', ACTIVE_STATUSES as unknown as string[])
      .order('last_message_at', { ascending: true, nullsFirst: false })
      .limit(MAX_ACTIVE),
  ])

  const responseRows = (responseRowsRes.data ?? []) as ResponseRow[]
  const users = (usersRes.data ?? []) as UserRow[]
  const activeConvs = (activeRes.data ?? []) as ActiveConvRow[]

  // Rodada 2 — descobrir o remetente da última mensagem (não-nota) de cada
  // conversa ativa, em UMA query. Isso define quem está "aguardando resposta".
  const activeIds = activeConvs.map((c) => c.id)
  const latestSender = new Map<string, string>()

  if (activeIds.length > 0) {
    const { data: msgRows } = await supabaseAdmin
      .from('messages')
      .select('conversation_id, sender_type, is_internal_note')
      .eq('org_id', orgId)
      .in('conversation_id', activeIds)
      .order('created_at', { ascending: false })
      .limit(5000)

    for (const m of (msgRows ?? []) as LatestMsgRow[]) {
      if (m.is_internal_note === true) continue // notas internas não contam
      if (!latestSender.has(m.conversation_id)) {
        latestSender.set(m.conversation_id, m.sender_type)
      }
    }
  }

  // Tempo médio de 1ª resposta (hoje) — geral e por agente.
  let respSum = 0
  let respCount = 0
  const perAgentRespSum = new Map<string, number>()
  const perAgentRespCount = new Map<string, number>()
  for (const r of responseRows) {
    if (r.response_time_secs == null) continue
    respSum += r.response_time_secs
    respCount++
    if (r.assigned_to) {
      perAgentRespSum.set(r.assigned_to, (perAgentRespSum.get(r.assigned_to) ?? 0) + r.response_time_secs)
      perAgentRespCount.set(r.assigned_to, (perAgentRespCount.get(r.assigned_to) ?? 0) + 1)
    }
  }
  const avgFirstResponse = respCount > 0 ? Math.round(respSum / respCount) : null

  // Percorre a fila ativa: classifica esperando/parada e acumula carga por agente.
  const perAgentOpen = new Map<string, number>()
  const perAgentWaiting = new Map<string, number>()
  const waitingList: WaitingConversation[] = []
  const stalledList: WaitingConversation[] = []
  const userNameById = new Map<string, string>()
  for (const u of users) userNameById.set(u.id, u.name ?? '—')

  let waitingTotal = 0
  let stalledTotal = 0

  for (const conv of activeConvs) {
    const assigned = conv.assigned_to
    if (assigned) perAgentOpen.set(assigned, (perAgentOpen.get(assigned) ?? 0) + 1)

    const isWaiting = latestSender.get(conv.id) === 'contact'
    if (!isWaiting) continue

    const lastMs = conv.last_message_at ? new Date(conv.last_message_at).getTime() : now
    const waitSecs = Math.max(0, Math.round((now - lastMs) / 1000))
    const windowOpen = conv.wa_service_window_expires_at
      ? new Date(conv.wa_service_window_expires_at).getTime() > now
      : false

    if (assigned) perAgentWaiting.set(assigned, (perAgentWaiting.get(assigned) ?? 0) + 1)
    waitingTotal++

    const entry: WaitingConversation = {
      conversation_id: conv.id,
      contact_name: contactName(conv),
      assigned_to: assigned,
      assigned_name: assigned ? userNameById.get(assigned) ?? null : null,
      status: conv.status,
      wait_secs: waitSecs,
      window_open: windowOpen,
    }
    waitingList.push(entry)

    if (windowOpen && waitSecs > STALL_THRESHOLD_SECS) {
      stalledTotal++
      stalledList.push(entry)
    }
  }

  waitingList.sort((a, b) => b.wait_secs - a.wait_secs)
  stalledList.sort((a, b) => b.wait_secs - a.wait_secs)

  const agents: AgentLoad[] = users
    .map((u) => {
      const rc = perAgentRespCount.get(u.id) ?? 0
      return {
        user_id: u.id,
        name: u.name ?? '—',
        is_online: !!u.is_online,
        open: perAgentOpen.get(u.id) ?? 0,
        waiting: perAgentWaiting.get(u.id) ?? 0,
        avg_first_response_secs: rc > 0 ? Math.round((perAgentRespSum.get(u.id) ?? 0) / rc) : null,
        response_count: rc,
      }
    })
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name))

  return {
    generated_at: new Date(now).toISOString(),
    totals: {
      open: openCount,
      pending: pendingCount,
      closed_today: closedTodayCount,
      queue: queueCount,
      waiting: waitingTotal,
      stalled: stalledTotal,
    },
    first_response: { avg_secs: avgFirstResponse, count: respCount },
    agents,
    waiting_longest: waitingList.slice(0, LIST_LIMIT),
    stalled: stalledList.slice(0, LIST_LIMIT),
  }
}
