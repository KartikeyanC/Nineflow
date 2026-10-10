import React from 'react'
import { Plus, Download } from 'lucide-react'
import { useWork } from '../WorkContext'
import { PLATFORMS, POST_TYPES, PILLARS, POST_STATUSES } from '../workStore'
import { postEngagement, real } from '../workCalc'
import { Section, Table, Th, Td, TextIn, NumIn, SelectIn, DateIn, CheckIn, RowTools, Legend, Pill } from '../ui'
import { toCsv, download } from './TaskLog'
import { cx } from '../../components/ui'

const TONE = { Published: 'bg-mint text-mint-fg', Scheduled: 'bg-sky text-sky-fg', Drafted: 'bg-butter text-butter-fg', Idea: 'bg-page text-muted', Cancelled: 'bg-coral text-coral-fg' }

export default function Social() {
  const { work, updateRow, removeRow, addPost } = useWork()
  const rows = [...work.posts].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const set = (p, patch) => updateRow('posts', p.id, patch)
  const published = real(work.posts).filter((p) => p.status === 'Published')
  const totalEng = published.reduce((s, p) => s + postEngagement(p).engagements, 0)
  const totalReach = published.reduce((s, p) => s + (Number(p.reach) || 0), 0)
  const cols = [['Date', (p) => p.date], ['Platform', (p) => p.platform], ['Post type', (p) => p.postType], ['Pillar', (p) => p.pillar], ['Topic', (p) => p.topic], ['Caption ready', (p) => p.captionReady], ['Creative ready', (p) => p.creativeReady], ['Status', (p) => p.status], ['Link', (p) => p.link], ['Likes', (p) => p.likes], ['Comments', (p) => p.comments], ['Shares', (p) => p.shares], ['Reach', (p) => p.reach], ['Engagement %', (p) => postEngagement(p).rate?.toFixed(2)]].map(([label, get]) => ({ label, get }))

  return (
    <Section title="Social media calendar" hint="One line per post. Enter likes, comments, shares and reach the day after it goes live; engagement rate is calculated."
      right={<div className="flex gap-2">
        <button type="button" className="btn-ghost h-9 py-0" onClick={() => download('social-calendar.csv', toCsv(real(work.posts), cols))}><Download size={14} /> CSV</button>
        <button type="button" className="btn-black h-9 py-0" onClick={addPost}><Plus size={14} /> New post</button>
      </div>}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <Legend />
        <p className="text-xs text-muted">Published: <b className="text-ink">{published.length}</b> · overall engagement <b className="text-ink">{totalReach ? ((totalEng / totalReach) * 100).toFixed(1) : '—'}%</b></p>
      </div>
      <Table minWidth={1700}>
        <thead><tr>
          <Th fill>Date</Th><Th fill>Platform</Th><Th fill>Post type</Th><Th fill>Content pillar</Th><Th fill>Topic</Th><Th fill>Caption</Th><Th fill>Creative</Th><Th fill>Status</Th><Th fill>Link</Th>
          <Th fill>Likes</Th><Th fill>Comments</Th><Th fill>Shares</Th><Th fill>Reach</Th><Th calc>Engagement</Th><Th />
        </tr></thead>
        <tbody>
          {rows.map((p) => {
            const e = postEngagement(p)
            return (
              <tr key={p.id} className={cx('hover:bg-page/60', p.example && 'bg-butter/20')}>
                <Td><DateIn value={p.date} onChange={(v) => set(p, { date: v })} /></Td>
                <Td><SelectIn value={p.platform} options={PLATFORMS} className="w-28" onChange={(v) => set(p, { platform: v })} /></Td>
                <Td><SelectIn value={p.postType} options={POST_TYPES} className="w-28" onChange={(v) => set(p, { postType: v })} /></Td>
                <Td><SelectIn value={p.pillar} options={PILLARS} className="w-36" onChange={(v) => set(p, { pillar: v })} /></Td>
                <Td><TextIn value={p.topic} className="w-52" placeholder="Topic" onChange={(v) => set(p, { topic: v })} /></Td>
                <Td className="text-center"><CheckIn value={p.captionReady} onChange={(v) => set(p, { captionReady: v })} /></Td>
                <Td className="text-center"><CheckIn value={p.creativeReady} onChange={(v) => set(p, { creativeReady: v })} /></Td>
                <Td><SelectIn value={p.status} options={POST_STATUSES} className="w-28" onChange={(v) => set(p, { status: v })} /></Td>
                <Td><TextIn value={p.link} className="w-44" placeholder="https://…" onChange={(v) => set(p, { link: v })} /></Td>
                <Td><NumIn value={p.likes} step={1} onChange={(v) => set(p, { likes: v })} /></Td>
                <Td><NumIn value={p.comments} step={1} onChange={(v) => set(p, { comments: v })} /></Td>
                <Td><NumIn value={p.shares} step={1} onChange={(v) => set(p, { shares: v })} /></Td>
                <Td><NumIn value={p.reach} step={1} className="w-24" onChange={(v) => set(p, { reach: v })} /></Td>
                <Td calc className="font-semibold">{e.rate == null ? '—' : <Pill tone={e.rate >= work.settings.targets.engagementPct ? 'bg-mint text-mint-fg' : 'bg-peach text-peach-fg'}>{e.rate.toFixed(1)}%</Pill>}</Td>
                <Td><span className="inline-flex items-center gap-1"><Pill tone={TONE[p.status]}>{p.status}</Pill><RowTools example={p.example} onDelete={() => removeRow('posts', p.id)} /></span></Td>
              </tr>
            )
          })}
        </tbody>
      </Table>
    </Section>
  )
}
