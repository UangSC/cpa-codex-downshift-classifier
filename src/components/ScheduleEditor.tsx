import { useStore } from '../store/store'
import { useSettingsEditor } from '../store/settingsEditor'
import { changedSettings } from '../lib/settingsDraft'
import { computeNextRun } from '../lib/schedule'
import { formatCountdown, formatDateTime } from '../lib/format'
import { Icon, Segmented, Switch, useNow } from './ui'
import { TimeRangeEditor } from './TimeRangeEditor'
import { SettingsPanel } from './SettingsPanel'

export function ScheduleEditor() {
  const { settings, update } = useSettingsEditor()
  const actual = useStore((state) => state.settings)
  const now = useNow(15_000)
  const schedule = settings.schedule
  const changed = changedSettings(actual, settings).includes('schedule')
  const next = changed ? computeNextRun(settings, now) : actual.schedule.nextRunAt ?? computeNextRun(settings, now)
  return <SettingsPanel title="定时巡检" desc="默认关闭。开启或修改时间后，确认保存才会生效；时间按北京时间（Asia/Shanghai）计算。">
    <div className="field"><Switch checked={schedule.enabled} onChange={(enabled) => update({ schedule: { ...schedule, enabled } })}
      label={schedule.enabled ? '开启定时巡检' : '不定时巡检（手动触发）'} /></div>
    {schedule.enabled ? <>
      <div className="field"><Segmented ariaLabel="定时方式" value={schedule.mode}
        onChange={(mode) => update({ schedule: { ...schedule, mode } })}
        options={[{ value: 'interval', label: '按间隔' }, { value: 'daily', label: '每天定时' }, { value: 'windows', label: '自定义时间段' }]} /></div>
      {schedule.mode === 'daily' ? <div className="field">
        <label className="field-label" htmlFor="schedule-time">每天执行时间</label>
        <input id="schedule-time" type="time" className="input" value={schedule.dailyTime}
          onChange={(event) => update({ schedule: { ...schedule, dailyTime: event.target.value } })} />
      </div> : <div className="field">
        <label className="field-label" htmlFor="schedule-interval">{schedule.mode === 'windows' ? '时间段内巡检间隔' : '执行间隔'}</label>
        <select id="schedule-interval" className="select" value={schedule.intervalMinutes}
          onChange={(event) => update({ schedule: { ...schedule, intervalMinutes: Number(event.target.value) } })}>
          {[15, 30, 60, 120, 180, 360, 720, 1440].map((minutes) => <option key={minutes} value={minutes}>{minutes < 60 ? `${minutes} 分钟` : `${minutes / 60} 小时`}</option>)}
        </select>
      </div>}
      {schedule.mode === 'windows' && <TimeRangeEditor windows={schedule.windows} onChange={(windows) => update({ schedule: { ...schedule, windows } })} />}
      <div className="schedule-note"><Icon.History /><span>{next
        ? `${changed ? '保存后下一次巡检' : '下一次巡检'}：${formatDateTime(next)}（${formatCountdown(next, now)}）`
        : '请先设置有效时间段，保存后才会安排巡检。'}</span></div>
    </> : <div className="schedule-note"><Icon.Info /><span>关闭时只执行手动巡检。保存关闭后不会产生新的定时任务。</span></div>}
    <p className="field-hint">定时巡检遵循额度门槛与并发限制。到点时若已有任务，本次跳过并等待下一个计划时间。</p>
  </SettingsPanel>
}
