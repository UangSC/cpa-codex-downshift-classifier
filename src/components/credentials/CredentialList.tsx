import { type CredentialView } from '../../lib/derive'
import { Chip, HoverCard, PlanMark, SecretName, useSelection } from '../ui'
import { CredentialRouting } from '../RoutingControls'
import { StatusLights } from '../StatusLights'
import { type CredentialRuntime, StatusPill, GroupCell, QuotaCell, StateChips, Actions } from './CredentialParts'

/* ------------------------------------------------------------------- list */

export function CredentialList({ views, runtime }: { views: CredentialView[]; runtime: CredentialRuntime }) {
  const selection = useSelection()
  return (
    <div className="cred-table">
      <div className="cred-table-head" aria-hidden="true">
        <span data-list-cell="selection" />
        <span data-list-cell="identity">凭证</span>
        <span data-list-cell="priority">优先级</span>
        <span data-list-cell="weight">权重</span>
        <span data-list-cell="verdict">结论</span>
        <span data-list-cell="lights">近期状态</span>
        <span data-list-cell="group">当前分组</span>
        <span data-list-cell="quota">剩余额度</span>
        <span data-list-cell="actions">操作</span>
      </div>
      {views.map((view) => {
        const selected = selection.has(view.credential.id)
        return (
          <div
            key={view.credential.id}
            className={`cred-row tone-${view.verdict} ${selected ? 'is-selected' : ''}`}
            data-testid={`cred-${view.credential.id}`}
            data-credential-id={view.credential.id}
            data-exclusion-source="true"
          >
            <div className="cred-row-check" data-list-cell="selection">
              <input
                type="checkbox"
                className="checkbox"
                checked={selected}
                onChange={() => selection.toggle(view.credential.id)}
                aria-label={`选择 ${view.credential.name}`}
              />
            </div>

            <div className="cred-ident" data-list-cell="identity">
              <PlanMark plan={view.credential.plan} size="sm" />
              <div className="cred-ident-main">
                <div className="cred-name-line">
                  <SecretName name={view.credential.name} className="cred-name" />
                  {view.credential.availability === 'busy' && (
                    <HoverCard
                      content={`当前有 ${view.credential.busySessions} 个会话在运行；巡检会在同一任务内等它空闲后继续。`}
                    >
                      <Chip tone="uncertain" dot>
                        会话中
                      </Chip>
                    </HoverCard>
                  )}
                  <StateChips view={view} />
                </div>
                <div className="cred-meta">
                  <span className="mono secret-name">{view.credential.file}</span>

                </div>
              </div>
            </div>

            <div className="cred-routing-cell" data-list-cell="priority"><CredentialRouting credential={view.credential} field="priority" /></div>
            <div className="cred-routing-cell" data-list-cell="weight"><CredentialRouting credential={view.credential} field="weight" /></div>

            <div className="cred-verdict-cell" data-list-cell="verdict">
              <StatusPill view={view} />
            </div>

            <div className="cred-lights-cell" data-list-cell="lights">
              <StatusLights
                target={view.target}
                onOpen={(roundId) => view.target && runtime.onOpenDetail(view.target.id, roundId)}
              />
            </div>

            <div className="cred-group-cell" data-list-cell="group">
              <GroupCell
                view={view}
                settings={runtime.settings}
              />
            </div>

            <div className="cred-quota-cell" data-list-cell="quota">
              <QuotaCell view={view} settings={runtime.settings} />
            </div>

            <div className="cred-row-actions" data-list-cell="actions">
              <Actions view={view} runtime={runtime} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
