package classifier

import (
	"context"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/UangSC/cpa-codex-downshift-classifier/internal/cpa"
	"github.com/UangSC/cpa-codex-downshift-classifier/internal/fingerprint"
)

type StartRequest struct {
	CredentialIDs            []string `json:"credentialIds,omitempty"`
	Model                    string   `json:"model"`
	Method                   string   `json:"method"`
	Scope                    string   `json:"scope"`
	AcknowledgeConfigChanges bool     `json:"acknowledgeConfigChanges"`
	ConfigChangesMode        string   `json:"configChangesMode"`
	ConfigChangesRevision    string   `json:"configChangesRevision"`
}

func (s *Service) Start(ctx context.Context, q StartRequest) (string, error) {
	if q.Method != "candy" && q.Method != "fingerprint" {
		return "", bad("检测方式仅支持糖果题或模型指纹")
	}
	if q.Method == "fingerprint" && !fingerprint.Available() {
		return "", bad("模型指纹参考库暂不可用")
	}
	q.Model = strings.TrimSpace(q.Model)
	if q.Model == "" || len(q.Model) > 200 {
		return "", bad("检测模型无效")
	}
	if q.Scope != "manual" && q.Scope != "batch" && q.Scope != "scheduled" {
		return "", bad("检测范围无效")
	}
	if q.Scope != "scheduled" && !q.AcknowledgeConfigChanges {
		return "", &apiError{409, "请先确认巡检会修改凭证的模型前缀或优先级配置"}
	}
	s.mutation.Lock()
	defer s.mutation.Unlock()
	live, err := s.adapter.ListCredentials(ctx)
	if err != nil {
		return "", err
	}
	selected := map[string]bool{}
	for _, id := range q.CredentialIDs {
		selected[id] = true
	}
	found := map[string]bool{}
	candidates := []cpa.Credential{}
	for _, c := range live {
		found[c.ID] = true
		if len(selected) == 0 || selected[c.ID] {
			candidates = append(candidates, c)
		}
	}
	for id := range selected {
		if !found[id] {
			return "", bad("检测集合包含不存在的 Codex 凭证")
		}
	}
	if len(candidates) == 0 {
		return "", bad("CPA 当前没有可检测的 Codex 凭证")
	}
	sortCredentials(candidates)
	s.mu.Lock()
	defer s.mu.Unlock()
	if q.Scope != "scheduled" && (q.ConfigChangesMode != s.state.Settings.Routing.Mode || q.ConfigChangesRevision != configurationFingerprint(s.state.Settings, false)) {
		return "", &apiError{409, "巡检或分组配置已变化，请重新确认巡检会修改的配置"}
	}
	if q.Method != s.state.Settings.InspectionMethod {
		return "", &apiError{409, "检测方式与当前已保存设置不一致，请保存后重新确认巡检"}
	}
	if q.Scope == "scheduled" && (!s.state.Settings.Schedule.Enabled || !s.state.ScheduledConfigChangesAcknowledged || s.state.ScheduledConfigurationFingerprint != configurationFingerprint(s.state.Settings, true)) {
		return "", &apiError{409, "定时巡检未获得当前配置的修改授权"}
	}
	participating := candidates[:0]
	for _, c := range candidates {
		if r := s.state.Records[c.ID]; r == nil || !r.InspectionExcluded {
			participating = append(participating, c)
		}
	}
	candidates = participating
	if len(candidates) == 0 {
		return "", &apiError{409, "所选凭证均不参与巡检，请先恢复参与"}
	}
	for _, t := range s.state.Tasks {
		if t.Status == "running" {
			return "", &apiError{409, "已有巡检任务正在运行"}
		}
	}
	task := Task{ID: identifier("task"), Scope: q.Scope, Label: "Codex 凭证巡检", Method: q.Method, CreatedAt: stamp(), Status: "running", Items: []RunItem{}, Concurrency: s.state.Settings.Concurrency.MaxObjects}
	for _, c := range candidates {
		tid := targetID(c.ID, q.Model)
		r := s.recordLocked(c.ID)
		if _, ok := r.Targets[q.Model]; !ok {
			r.Targets[q.Model] = Target{ID: tid, CredentialID: c.ID, Model: q.Model, Verdict: "untested", Rounds: []Round{}}
		}
		task.Items = append(task.Items, RunItem{TargetID: tid, State: "queued"})
	}
	previous := s.state.Tasks
	s.state.Tasks = append([]Task{task}, previous...)
	if len(s.state.Tasks) > 40 {
		s.state.Tasks = s.state.Tasks[:40]
	}
	if err = s.persistLocked(); err != nil {
		s.state.Tasks = previous
		return "", err
	}
	taskCtx, cancel := context.WithCancel(s.ctx)
	s.tasks[task.ID] = cancel
	settings := clone(s.state.Settings)
	s.wg.Add(1)
	go s.runTask(taskCtx, cancel, task, q, candidates, settings)
	return task.ID, nil
}
func sortCredentials(c []cpa.Credential) { // 空闲或未知先执行，明确忙碌的账号稍后等待。
	for i := 0; i < len(c); i++ {
		for j := i + 1; j < len(c); j++ {
			if c[i].Availability == "busy" && c[j].Availability != "busy" {
				c[i], c[j] = c[j], c[i]
			}
		}
	}
}
func (s *Service) patchItem(taskID, targetID string, fn func(*RunItem)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.state.Tasks {
		t := &s.state.Tasks[i]
		if t.ID == taskID {
			for j := range t.Items {
				if t.Items[j].TargetID == targetID {
					fn(&t.Items[j])
					return
				}
			}
		}
	}
}
func (s *Service) CancelTask(id string) error {
	s.mutation.Lock()
	defer s.mutation.Unlock()
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.state.Tasks {
		t := &s.state.Tasks[i]
		if t.ID != id {
			continue
		}
		if cancel := s.tasks[id]; cancel != nil {
			cancel()
		}
		if t.Status == "running" {
			t.Status = "cancelled"
			now := stamp()
			t.FinishedAt = &now
			for j := range t.Items {
				item := &t.Items[j]
				if !terminal(item.State) {
					item.State = "cancelled"
					item.Note = str("任务已停止；正在返回的请求不会再提交判定或修改分组")
					item.FinishedAt = &now
				}
			}
			return s.persistLocked()
		}
		return nil
	}
	return &apiError{404, "任务不存在"}
}
func (s *Service) runTask(ctx context.Context, cancel context.CancelFunc, task Task, q StartRequest, credentials []cpa.Credential, settings Settings) {
	defer s.wg.Done()
	defer cancel()
	jobs := make(chan cpa.Credential)
	var workers sync.WaitGroup
	var connectionFailures atomic.Int32
	for i := 0; i < task.Concurrency; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for c := range jobs {
				if ctx.Err() != nil {
					return
				}
				s.inspect(ctx, cancel, task, q, c, settings, &connectionFailures)
			}
		}()
	}
dispatch:
	for _, c := range credentials {
		select {
		case jobs <- c:
		case <-ctx.Done():
			break dispatch
		}
	}
	close(jobs)
	workers.Wait()
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.tasks, task.ID)
	for i := range s.state.Tasks {
		t := &s.state.Tasks[i]
		if t.ID != task.ID {
			continue
		}
		now := stamp()
		t.FinishedAt = &now
		if ctx.Err() != nil {
			t.Status = "cancelled"
		} else {
			t.Status = "completed"
		}
		for j := range t.Items {
			item := &t.Items[j]
			if !terminal(item.State) {
				item.State = "cancelled"
				item.FinishedAt = &now
				item.CurrentTest = nil
				item.Note = str("任务已停止")
			}
		}
	}
	// 无人值守连续连接失败时，同时停止计划，避免无限新建任务。
	if connectionFailures.Load() >= 3 {
		s.state.Settings.Schedule.Enabled = false
		s.state.Settings.Schedule.NextRunAt = nil
	}
	_ = s.persistLocked()
}
