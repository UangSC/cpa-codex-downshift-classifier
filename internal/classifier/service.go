package classifier

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/UangSC/cpa-codex-downshift-classifier/internal/cpa"
)

const apiPrefix = "/v0/management/plugins/cpa-codex-downshift-classifier"

type Service struct {
	adapter          cpa.Adapter
	path             string
	mu               sync.Mutex
	mutation         sync.Mutex
	state            diskState
	ctx              context.Context
	cancel           context.CancelFunc
	tasks            map[string]context.CancelFunc
	wg               sync.WaitGroup
	location         *time.Location
	scheduleFailures int
}

func New(adapter cpa.Adapter, stateDir string) (*Service, error) {
	if adapter == nil || stateDir == "" {
		return nil, errors.New("插件宿主或状态目录缺失")
	}
	if err := os.MkdirAll(stateDir, 0700); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		loc = time.FixedZone("Asia/Shanghai", 8*3600)
	}
	s := &Service{adapter: adapter, path: filepath.Join(stateDir, "state.json"), ctx: ctx, cancel: cancel, tasks: map[string]context.CancelFunc{}, location: loc, state: diskState{Version: 8, Settings: DefaultSettings(), Records: map[string]*Record{}, Tasks: []Task{}}}
	raw, err := os.ReadFile(s.path)
	if err == nil {
		var persisted diskState
		if err = json.Unmarshal(raw, &persisted); err != nil {
			cancel()
			return nil, fmt.Errorf("状态文件无法解析，已保留原文件：%w", err)
		}
		if (persisted.Version < 1 || persisted.Version > 8) || persisted.Records == nil {
			cancel()
			return nil, errors.New("状态文件版本或记录结构不受支持")
		}
		upgradingHeaderProfile := persisted.Version < 6
		upgradingErrorPolicy := persisted.Version < 8
		if upgradingErrorPolicy {
			if persisted.Settings.FailureRule.RequestThreshold == 0 {
				persisted.Settings.FailureRule.RequestThreshold = DefaultSettings().FailureRule.RequestThreshold
			}
			if persisted.Settings.Retry.BaseDelayMs == 2000 && persisted.Settings.Retry.MaxRetries == 2 && persisted.Settings.Retry.BackoffFactor == 2 {
				persisted.Settings.Retry.BaseDelayMs = DefaultSettings().Retry.BaseDelayMs
			}
			if persisted.Settings.Concurrency.MaxObjects == 3 {
				persisted.Settings.Concurrency.MaxObjects = DefaultSettings().Concurrency.MaxObjects
			}
		}
		if persisted.Version < 5 && persisted.Settings.ReasoningEffort == "" {
			persisted.Settings.ReasoningEffort = "low"
		}
		if persisted.Version < 6 {
			defaults := DefaultSettings()
			if persisted.Settings.HeaderOverrides == nil {
				persisted.Settings.HeaderOverrides = map[string]string{}
			}
			if persisted.Settings.Pagination.List == 0 {
				persisted.Settings.Pagination.List = defaults.Pagination.List
			}
			if persisted.Settings.Pagination.Card == 0 {
				persisted.Settings.Pagination.Card = defaults.Pagination.Card
			}
			if persisted.Settings.Pagination.Pool == 0 {
				persisted.Settings.Pagination.Pool = defaults.Pagination.Pool
			}
		}
		if err = validateSettings(persisted.Settings); err != nil {
			cancel()
			return nil, fmt.Errorf("持久化设置无效：%w", err)
		}
		persisted.Settings.HeaderOverrides, _ = cpa.ValidateHeaderOverrides(persisted.Settings.HeaderOverrides)
		if persisted.Version < 3 {
			// 只升级旧版未自定义的优先级，历史权重元数据完全保留且不写入 CPA。
			if legacyDefaultPriorities(persisted.Settings.Routing) {
				for group, defaults := range DefaultSettings().Routing.Groups {
					values := persisted.Settings.Routing.Groups[group]
					values.Priority = defaults.Priority
					persisted.Settings.Routing.Groups[group] = values
				}
			}
			persisted.Version = 3
		}
		if persisted.Version < 4 {
			if persisted.Settings.Schedule.Enabled {
				persisted.Settings.Schedule.Enabled = false
				persisted.Settings.Schedule.NextRunAt = nil
				persisted.ScheduleConsentRequired = true
			}
			persisted.ScheduledConfigChangesAcknowledged = false
			persisted.ScheduledConfigurationFingerprint = ""
			persisted.Version = 4
		}
		if persisted.Version < 5 {
			if persisted.Settings.ReasoningEffort == "low" && persisted.ScheduledConfigChangesAcknowledged &&
				persisted.ScheduledConfigurationFingerprint == legacyConfigurationFingerprint(persisted.Settings, true) {
				persisted.ScheduledConfigurationFingerprint = configurationFingerprint(persisted.Settings, true)
			}
			persisted.Version = 5
		}
		if persisted.Version < 6 {
			// 新的 CLI 默认头影响请求身份，未针对当前配置授权的旧计划由下方检查关闭。
			persisted.Version = 6
		}
		if upgradingHeaderProfile && persisted.Settings.Schedule.Enabled {
			persisted.Settings.Schedule.Enabled = false
			persisted.Settings.Schedule.NextRunAt = nil
			persisted.ScheduledConfigChangesAcknowledged = false
			persisted.ScheduledConfigurationFingerprint = ""
			persisted.ScheduleConsentRequired = true
		}
		if persisted.Version < 7 {
			// 旧版只开放糖果任务；添加批次关联不改变题目、判定或既有计划授权。
			for i := range persisted.Tasks {
				if persisted.Tasks[i].Method == "" {
					persisted.Tasks[i].Method = "candy"
				}
			}
			linkHistoricalRounds(&persisted)
			persisted.Version = 7
		}
		if upgradingErrorPolicy {
			// 频繁429现在参与降档；旧计划未授权新的请求重试与写入规则。
			if persisted.Settings.Schedule.Enabled {
				persisted.Settings.Schedule.Enabled = false
				persisted.Settings.Schedule.NextRunAt = nil
				persisted.ScheduleConsentRequired = true
			}
			persisted.ScheduledConfigChangesAcknowledged = false
			persisted.ScheduledConfigurationFingerprint = ""
			persisted.Version = 8
		}
		persisted.Settings.AcknowledgeScheduledConfigChanges = false
		s.state = persisted
	} else if !os.IsNotExist(err) {
		cancel()
		return nil, err
	}
	restoreRefreshedQuotas(s)
	// 重启后的任务不能继续使用上一进程的请求上下文。
	for i := range s.state.Tasks {
		t := &s.state.Tasks[i]
		if t.Status == "running" {
			t.Status = "cancelled"
			now := stamp()
			t.FinishedAt = &now
			for j := range t.Items {
				item := &t.Items[j]
				if !terminal(item.State) {
					item.State = "cancelled"
					item.Note = str("CPA 重启，本次未完成的巡检已停止")
					item.FinishedAt = &now
					item.RetryAt = nil
				}
			}
		}
	}
	if s.state.Settings.Schedule.Enabled && (!s.state.ScheduledConfigChangesAcknowledged || s.state.ScheduledConfigurationFingerprint != configurationFingerprint(s.state.Settings, true)) {
		s.state.Settings.Schedule.Enabled = false
		s.state.Settings.Schedule.NextRunAt = nil
		s.state.ScheduleConsentRequired = true
	}
	if s.state.Settings.Schedule.Enabled {
		s.state.Settings.Schedule.NextRunAt = nextRun(s.state.Settings.Schedule, time.Now(), loc)
	}
	if err = s.persistLocked(); err != nil {
		cancel()
		return nil, err
	}
	s.wg.Add(1)
	go s.scheduleLoop()
	return s, nil
}
func legacyDefaultPriorities(routing RoutingSettings) bool {
	if len(routing.Groups) != 3 {
		return false
	}
	for _, group := range []string{"normal", "downshift", "ungrouped"} {
		if values, ok := routing.Groups[group]; !ok || values.Priority != 0 {
			return false
		}
	}
	for _, values := range routing.Overrides {
		if values.Priority != 0 {
			return false
		}
	}
	return true
}
func (s *Service) Close() {
	s.cancel()
	s.mu.Lock()
	for _, cancel := range s.tasks {
		cancel()
	}
	s.mu.Unlock()
	s.wg.Wait()
}
