---
name: frontend-premium
description: Guia de design premium para interfaces React. Use SEMPRE ao criar componentes visuais, páginas, layouts, telas, ou qualquer elemento de UI no projeto. Garante estética profissional e rejeita design genérico. Ative ao mencionar componentes, telas, dashboard, sidebar, cards, botões, formulários, ou estilização.
---

# Frontend Premium Design

Este skill guia a criação de interfaces profissionais que evitam estética genérica de IA ("AI slop").

## Direção estética do Nexus
Tom: **Refined minimal** — limpo, preciso, sofisticado. Não é frio, é elegante.
Referências: Linear.app, Vercel Dashboard, Raycast, Notion.

## Regras de design

### Tipografia
- Usar a font stack do shadcn/ui (system fonts bem configurados)
- Tamanhos: text-xs para labels/metadata, text-sm para corpo, text-base para títulos de seção
- Pesos: font-normal para corpo, font-medium para ênfase (NUNCA font-bold em corpo de texto)
- NUNCA: Inter como escolha explícita, Arial, Times New Roman

### Cores
- Base: paleta zinc/slate do Tailwind
- Sidebar: bg-zinc-950 (dark permanente)
- Conteúdo: bg-white / bg-zinc-50
- Accent: cores dos setores (definidas no banco)
- NUNCA: gradientes roxos, bg-gradient-to-r genéricos, cores neon

### Espaçamento
- Generoso. gap-3 ou gap-4 mínimo entre elementos
- p-4 ou p-6 em containers/cards
- Respire. Espaço em branco é premium.

### Bordas e divisores
- border-zinc-200 (light mode), border-zinc-800 (dark)
- Sempre 1px (border), nunca 2px
- Usar <Separator /> do shadcn para divisões
- NUNCA: bordas coloridas grossas, border-2 ou border-4

### Sombras
- Quase nunca. Se usar, shadow-sm apenas
- Cards SEM sombra, COM borda sutil (border border-zinc-200)
- NUNCA: shadow-lg, shadow-xl, drop-shadow em cards

### Hover e transições
- Sempre: transition-colors duration-150
- Hover sutil: hover:bg-zinc-50 ou hover:bg-zinc-100
- NUNCA: scale transforms, rotate, bounce em UI funcional

### Ícones
- lucide-react exclusivamente
- Tamanho: 16px (size-4) para inline, 20px (size-5) para botões
- stroke-width: 1.5 (padrão lucide)
- NUNCA: ícones > 24px em UI funcional, emoji como ícone

### Componentes
- shadcn/ui para TUDO: Button, Input, Dialog, Select, etc.
- Variantes: default para ações primárias, outline para secundárias, ghost para terciárias
- NUNCA: criar botão custom com <button>, div com onClick simulando botão

### Layout
- Sidebar fixa + conteúdo fluido (flex)
- Grid para dashboards (grid-cols-2 lg:grid-cols-4)
- NUNCA: layouts centralizados com max-w-md mx-auto para telas de trabalho
- NUNCA: hero sections, jumbotrons, layouts de landing page em telas internas

### Empty states
- Ícone muted (text-zinc-300) + texto curto + CTA
- Nunca ilustrações elaboradas ou animações Lottie

### Loading states
- Skeleton do shadcn/ui
- NUNCA: spinners grandes centralizados, texto "Carregando..."
