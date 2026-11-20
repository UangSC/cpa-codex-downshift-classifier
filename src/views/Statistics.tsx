import { useMemo, useState } from 'react'
import type { Target } from '../types'
import { useStore } from '../store/store'
import { useNow } from '../components/ui'
import '../styles/statistics.css'

const DAY = 86_400_000
const dayNumber = (time: number) => Math.floor((time + 8 * 3_600_000) / DAY)
const outcomes = [
  ['normal', '正常', 'var(--normal-dot)'],
  ['downshift', '降档', 'var(--danger-dot)'],
  ['uncertain', '不确定', 'var(--warn-dot)'],
  ['incomplete', '未完成', 'var(--neutral-dot)'],
] as const

export function summarizeWeek(targets: Target[], model: string, now: number) {
  const first = dayNumber(now) - 6
  const days = Array.from({ length: 7 }, (_, i) => ({
    date: new Date((first + i) * DAY).toISOString().slice(5, 10),
    normal: 0, downshift: 0, uncertain: 0, incomplete: 0, total: 0,
  }))
  const accounts = new Set<string>()
  let candy = 0, matched = 0, samples = 0, accepted = 0
  for (const target of targets) {
    if (model && target.model !== model) continue
    for (const round of target.rounds) {
      const finish = Date.parse(round.finishedAt)
      const day = days[dayNumber(finish) - first]
      if (!day || finish > now) continue
      accounts.add(target.credentialId)
      const outcome = round.outcome
      day[outcome === 'cancelled' || outcome === 'blocked' ? 'incomplete' : outcome]++
      day.total++
      const evidence = round.evidence
      if (evidence.candy?.answer?.trim()) {
        candy++
        if (evidence.candy.matched) matched++
      }
      for (const sample of evidence.fingerprint?.samples ?? []) {
        samples++
        if (sample.accepted) accepted++
      }
    }
  }
  return { days, accounts: accounts.size, candy, matched, samples, accepted }
}

export function Statistics() {
  const targets = useStore((s) => s.targets)
  const [model, setModel] = useState('')
  const now = useNow()
  const models = useMemo(() => [...new Set(targets.map((t) => t.model))].sort(), [targets])
  const stats = useMemo(() => summarizeWeek(targets, model, now), [targets, model, now])
  const peak = Math.max(1, ...stats.days.map((d) => d.total))
  const total = stats.days.reduce((sum, day) => sum + day.total, 0)
  return <>
    <div className="page-head stats-head"><div><h2>巡检统计</h2>
      <div className="sub">近 7 个自然日 · 按巡检结束时间统计 · 每个凭证与模型组合最多保留最近 40 轮</div></div>
      <select aria-label="统计模型" value={model} onChange={(event) => setModel(event.target.value)}>
        <option value="">全部模型</option>{models.map((name) => <option key={name}>{name}</option>)}
      </select>
    </div>
    <div className="stats-grid">
      <section className="stats-panel"><h3>每日巡检结论</h3>
        <p>{stats.accounts} 个凭证 · {total} 轮巡检 · {stats.days.reduce((sum, d) => sum + d.downshift, 0)} 轮降档</p>
        <div className="stats-legend">{outcomes.map(([key, label, color]) => <span key={key}><i style={{ background: color }} />{label}</span>)}</div>
        {stats.days.map((day) => <div className="stats-day" key={day.date}>
          <span>{day.date}</span><div className="stats-track" role="img" aria-label={outcomes.map(([key,label]) => label + day[key]).join('，')}>
            {outcomes.map(([key,label,color]) => day[key] > 0 && <span key={key} title={label + ' ' + day[key] + ' 轮'} style={{width: (day[key] / peak * 100) + '%', background: color}} />)}
          </div><b>{day.total}</b>
        </div>)}
      </section>
      <section className="stats-panel"><h3>回答质量</h3>
        {([
          ['糖果题答对率', stats.matched, stats.candy, '按有回答的轮次计算'],
          ['指纹样本有效率', stats.accepted, stats.samples, '按已记录的指纹样本计算'],
        ] as const).map(([label, count, denominator, note]) => <div className="stats-metric" key={label}>
          <div><strong>{label}</strong><b>{denominator ? Math.round(count / denominator * 100) + '%' : '暂无样本'}</b></div>
          <div className="stats-track" aria-hidden="true"><span style={{width: (denominator ? count / denominator * 100 : 0) + '%', background: 'var(--accent)'}} /></div>
          <small>{count} / {denominator} · {note}</small>
        </div>)}
      </section>
    </div>
  </>
}
