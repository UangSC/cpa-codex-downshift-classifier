import { useEffect, useMemo } from 'react'
import { useStore, type TabKey } from './store/store'
import { useScheduleSync } from './store/scheduleActions'
import { Overview } from './views/Overview'
import { HistoryView } from './views/History'
import { SettingsView } from './views/Settings'
import { RunPanel } from './components/RunPanel'
import { EvidenceSheet } from './components/EvidenceSheet'
import { DemoPanel } from './components/DemoPanel'
import { Toasts } from './components/Toasts'
import { Icon, SelectionProvider, useSelectionSet } from './components/ui'

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: '概览', icon: <Icon.Layers /> },
  { key: 'history', label: '历史', icon: <Icon.History /> },
  { key: 'settings', label: '设置', icon: <Icon.Cog /> },
]

export default function App() {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const settings = useStore((s) => s.settings)
  const tasks = useStore((s) => s.tasks)
  const source = useStore((s) => s.source)
  const selected = useStore((s) => s.selected)
  const toggleSelect = useStore((s) => s.toggleSelect)
  const setSelected = useStore((s) => s.selectTargets)
  const clearSelection = useStore((s) => s.clearSelection)
  const openDetail = useStore((s) => s.openDetail)
  const setRunPanel = useStore((s) => s.setRunPanel)
  const updateSettings = useStore((s) => s.updateSettings)

  useScheduleSync()

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  const selectionSet = useSelectionSet(selected)
  const selectionApi = useMemo(
    () => ({
      selected,
      toggle: toggleSelect,
      set: setSelected,
      clear: clearSelection,
      has: (id: string) => selectionSet.has(id),
    }),
    [selected, toggleSelect, setSelected, clearSelection, selectionSet],
  )

  // Every credential needs an evidence record for whichever model is being inspected.
  const ensureTargetsForModel = useStore((s) => s.ensureTargetsForModel)
  useEffect(() => {
    ensureTargetsForModel(settings.inspectionModel)
  }, [settings.inspectionModel, ensureTargetsForModel])

  const running = tasks.find((t) => t.status === 'running')
  const finishedCount = running
    ? running.items.filter(
        (i) =>
          i.state === 'done' || i.state === 'skipped' || i.state === 'cancelled' || i.state === 'failed',
      ).length
    : 0

  return (
    <SelectionProvider value={selectionApi}>
      <div className="app">
        <header className="topbar">
          <div className="topbar-inner">
            <div className="brand">
              <span className="brand-mark" aria-hidden="true">
                ◈
              </span>
              <div className="brand-text">
                <h1>Codex 降档检测</h1>
                <p>CLIProxyAPI 凭证巡检</p>
              </div>
            </div>

            <nav className="nav" aria-label="主导航">
              {TABS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="nav-item"
                  aria-current={tab === item.key ? 'page' : undefined}
                  onClick={() => setTab(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="topbar-actions">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setRunPanel(true)}
                title="查看巡检任务与排队状态"
              >
                {running ? (
                  <>
                    <span
                      className="dot"
                      style={{ background: 'var(--accent)', animation: 'pulse 1.1s ease-in-out infinite' }}
                      aria-hidden="true"
                    />
                    巡检中 {finishedCount}/{running.items.length}
                  </>
                ) : (
                  <>
                    <Icon.History />
                    任务
                    {tasks.length > 0 && <span className="count-badge" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}>{tasks.length}</span>}
                  </>
                )}
              </button>

              <span
                className={`env-badge ${source === 'live' ? 'is-live' : ''}`}
                title={
                  source === 'live'
                    ? '数据来自 CLIProxyAPI 插件接口'
                    : '当前使用本地模拟数据，不会调用 CLIProxyAPI'
                }
              >
                <i aria-hidden="true" />
                {source === 'live' ? '实时数据' : '模拟数据'}
              </span>

              <button
                type="button"
                className="icon-btn"
                onClick={() =>
                  updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })
                }
                aria-label={settings.theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
                title={settings.theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
              >
                {settings.theme === 'dark' ? <Icon.Sun /> : <Icon.Moon />}
              </button>
            </div>
          </div>
        </header>

        <main className="page">
          {tab === 'overview' && <Overview onOpenDetail={openDetail} />}
          {tab === 'history' && <HistoryView onOpenDetail={openDetail} />}
          {tab === 'settings' && <SettingsView />}
        </main>

        <RunPanel />
        <EvidenceSheet />
        <DemoPanel />
        <Toasts />
      </div>
    </SelectionProvider>
  )
}

