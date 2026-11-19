# 管理 API

基路径：`/v0/management/plugins/cpa-codex-downshift-classifier`。所有请求由 CPA 校验 `Authorization: Bearer <管理密钥>`，浏览器客户端固定使用当前 CPA 来源。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/snapshot` | 凭证、目标、历史、任务、设置和能力 |
| POST | `/checks` | 启动手动或批量巡检 |
| GET | `/tasks?id=<taskId>` | 读取任务 |
| POST | `/tasks/cancel?id=<taskId>` | 取消任务 |
| POST | `/sync` | 重试待同步分组 |
| PUT | `/settings` | 保存完整设置 |
| PUT | `/routing` | 编辑或重置凭证优先级 |
| POST | `/exclusions` | 保存是否参与巡检 |

宿主只支持固定管理路由，任务 ID 使用查询参数。JSON 类型见后端 `internal/classifier/types.go` 与页面 `src/types.ts`。

## 启动巡检

```json
{
  "credentialIds": ["<凭证ID>"],
  "model": "gpt-6.1-sol",
  "method": "candy",
  "scope": "manual",
  "acknowledgeConfigChanges": true,
  "configChangesMode": "prefix",
  "configChangesRevision": "<当前快照的配置版本>"
}
```

省略 `credentialIds` 时选择全部符合条件的凭证，仍排除不参与巡检的凭证。外部请求只使用 `manual` 或 `batch`；定时任务由后台调度并检查已保存的授权。

配置可能写入凭证前缀或优先级，因此手动请求必须提交确认、当前写入模式和配置版本。版本变化、已有运行任务或选中凭证均被排除时返回 409。成功返回 `taskId`，后续从快照或任务接口读取进度。

`method` 支持 `candy` 与 `fingerprint`，并且必须与已保存的检测方式一致。指纹模式需先保存设置、取得新的确认版本；它采集三份有效结果后才计算目标参考概率，正常要求严格大于 0.90。认证、额度、网络或样本不足不能被伪装为指纹概率。

## 设置与路由

`PUT /settings` 保存完整设置对象，草稿应基于当前快照。配置包括前缀、写入模式、分组优先级、检测模型、重试、额度策略、并发、思考程度、头覆盖、定时和界面偏好。

开启或改变影响定时执行的设置时，本次提交需临时附带 `acknowledgeScheduledConfigChanges: true`；确认字段不作为页面普通设置保存。后台保存授权指纹，旧授权不能覆盖新的检测和写入规则。

`PUT /routing` 接收 `{credentialId, priority?, reset?}`；`POST /sync` 接收 `{credentialId}`。权重只继承 CPA 当前值，显式权重修改会被拒绝。

设置可能已经保存，但部分凭证同步失败；此时接口返回 409，客户端应刷新真实状态并保留设置草稿。单次设置更新不构成跨凭证事务。

## 排除凭证

```json
{
  "credentialIds": ["<凭证ID>"],
  "excluded": true
}
```

只保存参与状态，不禁用 CPA 凭证、不改写路由和历史。运行中尚未完成的凭证不能移入排除池。恢复参与不会自动启动巡检。

## 快照与判定

快照的 `source` 为 `live`，同时返回 `configChangesRevision`、`requestHeaderProfile`、凭证、检测目标、任务、设置与能力。缺少可靠的额度、会话或指纹信息时返回未知，不补造数据。

每轮证据记录实际题目、答案、尝试状态、错误、用量、耗时和配置同步结果。只有完整模型响应才能进入答案判定；401/403、429 与网络问题保持独立原因，不能直接按能力降档处理。

轮次包含 `taskId` 和 `batchStartedAt`，任务包含 `method`，用于历史和进行中任务按同一批次展示。状态版本 7 保留旧设置与历史，只对唯一匹配的旧任务补充关联。任务超出保留数量后，轮次仍保留独立的批次身份和开始时间。

指纹证据包括 `challengeCount`、`validSamples`、各次回答、`requestedProbability`（目标参考概率）、`probability`（最高候选概率）、`candidates`、`threshold` 与 `referenceBank`。缺少可靠概率时字段为 `null`；成功题不重跑，失败尝试计入统一重试预算。
