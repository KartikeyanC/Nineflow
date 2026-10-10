import React from 'react'
import { Plus, Download } from 'lucide-react'
import { useWork } from '../WorkContext'
import { AD_PLATFORMS, OBJECTIVES, AD_STATUSES } from '../workStore'
import { campaignDerived, real, h1 } from '../workCalc'
import { Section, Table, Th, Td, TextIn, NumIn, SelectIn, DateIn, RowTools, Legend, Pill } from '../ui'
import { toCsv, download } from './TaskLog'
import { cx } from '../../components/ui'

const TONE = { Active: 'bg-mint text-mint-fg', Planned: 'bg-sky text-sky-fg', Paused: 'bg-butter text-butter-fg', Ended: 'bg-page text-muted' }

export default function Ads() {
  const { work, updateRow, removeRow, addCampaign } = useWork()
  const cur = work.settings.currency
  const set = (c, p) => updateRow('campaigns', c.id, p)
  const live = real(work.campaigns).filter((c) => campaignDerived(c).live)
  const money = (v) => (v == null ? '—' : `${cur}${h1(v)}`)
  const cols = [['Campaign', (c) => c.campaign], ['Platform', (c) => c.platform], ['Objective', (c) => c.objective], ['Product', (c) => c.product], ['Start', (c) => c.startDate], ['End', (c) => c.endDate], ['Budget', (c) => c.budget], ['Spend', (c) => c.spend], ['Budget used %', (c) => campaignDerived(c).budgetUsedPct], ['Impressions', (c) => c.impressions], ['Clicks', (c) => c.clicks], ['Leads', (c) => c.leads], ['CTR %', (c) => campaignDerived(c).ctr?.toFixed(2)], ['CPC', (c) => campaignDerived(c).cpc?.toFixed(2)], ['CPL', (c) => campaignDerived(c).cpl?.toFixed(2)], ['Target CPL', (c) => c.targetCpl], ['Days left', (c) => campaignDerived(c).daysLeft], ['Status', (c) => c.status]].map(([label, get]) => ({ label, get }))

  return (
    <Section title="Ad campaign tracker" hint="One line per campaign. Update spend, impressions, clicks and leads in the daily ad check; everything to the right of Leads is calculated."
      right={<div className="flex gap-2">
        <button type="button" className="btn-ghost h-9 py-0" onClick={() => download('ad-campaigns.csv', toCsv(real(work.campaigns), cols))}><Download size={14} /> CSV</button>
        <button type="button" className="btn-black h-9 py-0" onClick={addCampaign}><Plus size={14} /> New campaign</button>
      </div>}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <Legend />
        <p className="text-xs text-muted">Live now: <b className="text-ink">{live.length}</b> · spend {money(live.reduce((s, c) => s + (Number(c.spend) || 0), 0))} · leads <b className="text-ink">{live.reduce((s, c) => s + (Number(c.leads) || 0), 0)}</b></p>
      </div>
      <Table minWidth={2200}>
        <thead><tr>
          <Th fill>Campaign</Th><Th fill>Platform</Th><Th fill>Objective</Th><Th fill>Product</Th><Th fill>Start</Th><Th fill>End</Th><Th fill>Budget</Th><Th fill>Spend</Th><Th calc>Budget used</Th>
          <Th fill>Impressions</Th><Th fill>Clicks</Th><Th fill>Leads</Th><Th calc>Click rate</Th><Th calc>Cost / click</Th><Th calc>Cost / lead</Th><Th fill>Target CPL</Th><Th calc>vs target</Th><Th calc>Days left</Th><Th fill>Status</Th><Th />
        </tr></thead>
        <tbody>
          {work.campaigns.map((c) => {
            const d = campaignDerived(c)
            return (
              <tr key={c.id} className={cx('hover:bg-page/60', c.example && 'bg-butter/20')}>
                <Td><TextIn value={c.campaign} className="w-44" placeholder="Campaign name" onChange={(v) => set(c, { campaign: v })} /></Td>
                <Td><SelectIn value={c.platform} options={AD_PLATFORMS} className="w-28" onChange={(v) => set(c, { platform: v })} /></Td>
                <Td><SelectIn value={c.objective} options={OBJECTIVES} className="w-32" onChange={(v) => set(c, { objective: v })} /></Td>
                <Td><TextIn value={c.product} className="w-36" onChange={(v) => set(c, { product: v })} /></Td>
                <Td><DateIn value={c.startDate} onChange={(v) => set(c, { startDate: v })} /></Td>
                <Td><DateIn value={c.endDate} onChange={(v) => set(c, { endDate: v })} /></Td>
                <Td><NumIn value={c.budget} step={10} className="w-24" onChange={(v) => set(c, { budget: v })} /></Td>
                <Td><NumIn value={c.spend} step={1} className="w-24" onChange={(v) => set(c, { spend: v })} /></Td>
                <Td calc>{d.budgetUsedPct == null ? '—' : <Pill tone={d.overBudget ? 'bg-coral text-coral-fg' : d.budgetUsedPct >= 80 ? 'bg-peach text-peach-fg' : 'bg-mint text-mint-fg'}>{d.budgetUsedPct}%</Pill>}</Td>
                <Td><NumIn value={c.impressions} step={100} className="w-28" onChange={(v) => set(c, { impressions: v })} /></Td>
                <Td><NumIn value={c.clicks} step={1} onChange={(v) => set(c, { clicks: v })} /></Td>
                <Td><NumIn value={c.leads} step={1} onChange={(v) => set(c, { leads: v })} /></Td>
                <Td calc className="text-right">{d.ctr == null ? '—' : `${d.ctr.toFixed(2)}%`}</Td>
                <Td calc className="text-right">{money(d.cpc)}</Td>
                <Td calc className="text-right font-semibold">{money(d.cpl)}</Td>
                <Td><NumIn value={c.targetCpl} className="w-20" onChange={(v) => set(c, { targetCpl: v })} /></Td>
                <Td calc>{d.cplVsTarget == null ? '—' : <Pill tone={d.cplVsTarget <= 0 ? 'bg-mint text-mint-fg' : 'bg-coral text-coral-fg'}>{d.cplVsTarget > 0 ? '+' : ''}{d.cplVsTarget}%</Pill>}</Td>
                <Td calc className={cx('text-right', d.daysLeft != null && d.daysLeft < 0 && 'text-faint')}>{d.daysLeft == null ? '—' : d.daysLeft < 0 ? 'ended' : d.daysLeft}</Td>
                <Td><SelectIn value={c.status} options={AD_STATUSES} className="w-28" onChange={(v) => set(c, { status: v })} /></Td>
                <Td><span className="inline-flex items-center gap-1"><Pill tone={TONE[c.status]}>{d.live ? 'Live' : c.status}</Pill><RowTools example={c.example} onDelete={() => removeRow('campaigns', c.id)} /></span></Td>
              </tr>
            )
          })}
        </tbody>
      </Table>
    </Section>
  )
}
