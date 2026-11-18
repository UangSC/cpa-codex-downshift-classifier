import { useStore } from '../store/store'
import { DEMO_SCENARIOS, runScenario } from '../store/scenarios'
import { Chip, Icon, Modal } from '../components/ui'

export function DemoPanel() {
  const open = useStore((s) => s.demoOpen)
  const setOpen = useStore((s) => s.setDemoOpen)
  const resetDemo = useStore((s) => s.resetDemo)
  const running = useStore((s) => s.tasks.some((t) => t.status === 'running'))
  const inspectionModel = useStore((s) => s.settings.inspectionModel)

  const groups = ['判定结果', '错误与重试', '状态与边界'] as const

  /** Running a scenario opens the task drawer; close the panel so the operator sees it. */
  const run = (scenarioId: string) => {
    runScenario(scenarioId)
    setOpen(false)
  }

  return (
    <Modal
      open={open}
      wide
      onClose={() => setOpen(false)}
      title="演示场景"
      sub="全部为模拟流程：会真实推动界面状态与分组变化，但不会发起任何真实请求"
      footer={
        <>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
            提示：模拟检测的请求耗时与重试等待按真实节奏执行，但数据来自本地场景。
          </span>
          <span className="spacer" />
          <button type="button" className="btn btn-sm" onClick={() => resetDemo()}>
            重置演示数据
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setOpen(false)}>
            完成
          </button>
        </>
      }
    >
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
          padding: '9px 11px',
          borderRadius: 10,
          border: '1px dashed var(--warn-border)',
          background: 'var(--warn-soft)',
          color: 'var(--warn)',
          fontSize: 12,
          marginBottom: 14,
        }}
      >
        <span style={{ marginTop: 1 }}>
          <Icon.Alert />
        </span>
        <span>
          这些按钮用于验证判定规则与状态流转。点击后会自动打开巡检面板；若已有任务在运行，请先等待或停止它。
        </span>
      </div>

      {groups.map((group) => (
        <div key={group} style={{ marginBottom: 14 }}>
          <div className="history-day" style={{ margin: '0 0 6px 2px' }}>
            {group}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {DEMO_SCENARIOS.filter((s) => s.group === group).map((scenario) => (
              <div
                key={scenario.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '9px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  background: 'var(--surface-2)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 550 }}>{scenario.title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>
                    {scenario.expect}
                  </div>
                  <div
                    className="mono"
                    style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, opacity: 0.85 }}
                  >
                    {scenario.scope.replaceAll('{model}', inspectionModel)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={running}
                  onClick={() => run(scenario.id)}
                  title={running ? '请先等待当前巡检结束' : '运行该模拟场景'}
                >
                  <Icon.Play />
                  运行
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="divider" />
      <div className="inline" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Chip tone="accent">模拟数据</Chip>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
          界面上的「模拟数据」标记始终可见；接入真实后端前，检测结论与分组写入都只发生在浏览器内存中。
        </span>
      </div>
    </Modal>
  )
}
