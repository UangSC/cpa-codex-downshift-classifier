package classifier

import (
	"context"
	"fmt"
	"math"
	"strings"
	"sync/atomic"
	"time"

	"github.com/UangSC/cpa-codex-downshift-classifier/internal/cpa"
)

func quotaReason(c cpa.Credential, v Settings) string {
	if c.Disabled || c.Auth == "expired" {
		return "凭证被禁用或认证失效"
	}
	if c.Unavailable {
		return "CPA 当前报告此凭证不可用或处于冷却，按真实状态跳过"
	}
	known := false
	minimum := 100.0
	for _, window := range c.Quota.Windows {
		if window.RemainingPercent != nil {
			known = true
			minimum = math.Min(minimum, *window.RemainingPercent)
		}
	}
	if c.Quota.Status == "exhausted" {
		return "额度已耗尽"
	}
	if known && minimum <= v.Quota.MinRemainingPercent {
		return fmt.Sprintf("剩余额度 %.1f%% 未高于 %.1f%% 门槛", minimum, v.Quota.MinRemainingPercent)
	}
	if !known && v.Quota.UnknownPolicy == "skip" {
		return "额度未知，按设置跳过"
	}
	return ""
}
func supportsModel(c cpa.Credential, model string) bool {
	if len(c.Models) == 0 {
		return false
	}
	for _, m := range c.Models {
		if m == model || strings.TrimPrefix(m, strings.Trim(c.Prefix, "/")+"/") == model {
			return true
		}
	}
	return false
}
func wait(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
func (s *Service) inspect(ctx context.Context, cancel context.CancelFunc, task Task, q StartRequest, c cpa.Credential, v Settings, connectionFailures *atomic.Int32) {
	tid := targetID(c.ID, q.Model)
	skip := func(message string) {
		s.patchItem(task.ID, tid, func(i *RunItem) { now := stamp(); i.State = "skipped"; i.Note = str(message); i.FinishedAt = &now })
	}
	// 开始执行前刷新官方状态，不能仅使用入队时的额度与认证状态。
	waitingSince := time.Now()
	for {
		if s.inspectionExcluded(c.ID) {
			skip("该凭证不参与巡检，本轮已跳过")
			return
		}
		live, err := s.adapter.ListCredentials(ctx)
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			if connectionFailures.Add(1) >= 3 {
				cancel()
			}
			s.patchItem(task.ID, tid, func(i *RunItem) { i.State = "failed"; i.Note = str("读取 CPA 状态失败：" + err.Error()) })
			return
		}
		exists := false
		for _, fresh := range live {
			if fresh.ID == c.ID {
				c = fresh
				exists = true
				break
			}
		}
		if !exists {
			skip("凭证已从 CPA 移除")
			return
		}
		if reason := quotaReason(c, v); reason != "" {
			skip(reason)
			return
		}
		if !supportsModel(c, q.Model) {
			skip("该凭证未注册所选检测模型")
			return
		}
		if c.Availability != "busy" {
			break
		}
		if time.Since(waitingSince) > 5*time.Minute {
			skip("凭证持续忙碌，超过五分钟等待上限")
			return
		}
		s.patchItem(task.ID, tid, func(i *RunItem) { i.State = "waiting"; i.Note = str("等待 CPA 官方状态报告凭证空闲") })
		if wait(ctx, 2*time.Second) != nil {
			return
		}
	}
	start := stamp()
	if s.inspectionExcluded(c.ID) {
		skip("该凭证不参与巡检，本轮已跳过")
		return
	}
	s.patchItem(task.ID, tid, func(i *RunItem) { i.State = "running"; i.StartedAt = &start; i.CurrentTest = &q.Method; i.Note = nil })
	round := Round{ID: identifier("round"), TargetID: tid, StartedAt: start, Scope: q.Scope, Tests: []string{q.Method}, Outcome: "uncertain", ReasonCode: "no-model-response", Reason: "未取得有效回答", ReasoningEffort: v.ReasoningEffort, Evidence: Evidence{Tests: []string{q.Method}, Attempts: []Attempt{}, Errors: []EvidenceError{}, Usage: &Usage{}}}
	var codes []int
	for attempt := 0; attempt <= v.Retry.MaxRetries; attempt++ {
		if s.inspectionExcluded(c.ID) {
			skip("该凭证不参与巡检，已停止后续检测请求")
			return
		}
		delay := 0
		if attempt > 0 {
			delay = int(float64(v.Retry.BaseDelayMs) * math.Pow(v.Retry.BackoffFactor, float64(attempt-1)))
			s.patchItem(task.ID, tid, func(i *RunItem) {
				i.State = "retrying"
				i.Note = str(fmt.Sprintf("本轮第 %d/%d 次重试，等待 %.1f 秒", attempt, v.Retry.MaxRetries, float64(delay)/1000))
			})
			if wait(ctx, time.Duration(delay)*time.Millisecond) != nil {
				break
			}
		}
		if ctx.Err() != nil {
			break
		}
		if s.inspectionExcluded(c.ID) {
			skip("该凭证不参与巡检，已停止后续检测请求")
			return
		}
		s.patchItem(task.ID, tid, func(i *RunItem) { i.State = "running"; i.Attempt = attempt + 1 })
		at := stamp()
		requestStart := time.Now()
		reply, err := s.adapter.Probe(ctx, c.ID, q.Model, CandyQuestion, v.ReasoningEffort, v.HeaderOverrides)
		if ctx.Err() != nil {
			break
		}
		status := any(reply.Status)
		valid := err == nil && reply.Status >= 200 && reply.Status < 300 && strings.TrimSpace(reply.Answer) != ""
		if err != nil {
			status = "network-error"
			connectionFailures.Add(1)
		} else {
			connectionFailures.Store(0)
		}
		duration := reply.DurationMs
		if duration == 0 {
			duration = time.Since(requestStart).Milliseconds()
		}
		round.Evidence.Attempts = append(round.Evidence.Attempts, Attempt{attempt + 1, status, at, delay, duration, q.Method, 1, attempt, valid})
		round.Evidence.Usage.InputTokens += reply.InputTokens
		round.Evidence.Usage.OutputTokens += reply.OutputTokens
		if err != nil || reply.Status < 200 || reply.Status >= 300 || !valid {
			message := reply.Error
			if err != nil {
				message = err.Error()
			}
			if message == "" {
				message = "未返回有效模型回答"
			}
			if len(message) > 1000 {
				message = message[:1000]
			}
			round.Evidence.Errors = append(round.Evidence.Errors, EvidenceError{at, reply.Status, message})
		}
		if err != nil && connectionFailures.Load() >= 3 {
			round.Reason = "连续三次无法连接 CPA，自动停止巡检与定时计划"
			cancel()
			break
		}
		if err == nil && (reply.Status == 401 || reply.Status == 403) {
			round.Outcome = "blocked"
			round.ReasonCode = "auth-expired"
			round.Reason = "凭证认证失效，未形成能力判定"
			break
		}
		if err == nil && reply.Status == 429 {
			round.Outcome = "blocked"
			round.ReasonCode = "quota-exhausted"
			round.Reason = "额度不足或限流，未形成能力判定"
			break
		}
		if reply.Status == 502 || reply.Status == 503 {
			codes = append(codes, reply.Status)
		}
		if valid {
			answer := reply.Answer
			if len(answer) > 32768 {
				answer = answer[:32768]
			}
			matched := MatchesCandy(answer)
			round.Evidence.Candy = &Candy{"candy-bag-21", CandyQuestion, "21", answer, matched, "接受含独立数字 21 的回答；子串和小数不计入。"}
			if matched {
				round.Outcome = "normal"
				round.ReasonCode = "all-tests-passed"
				round.Reason = "糖果题通过"
				if attempt > 0 {
					round.ReasonCode = "passed-after-retry"
					round.Reason = "异常后重试恢复，糖果题完整通过"
				}
			} else {
				round.Outcome = "downshift"
				round.ReasonCode = "candy-mismatch"
				round.Reason = "糖果题答案不符：回答未包含独立数字 21"
			}
			break
		}
		// 仅网络/服务异常、空回答重试；其他4xx立即结束且不当作降档。
		if err == nil && reply.Status >= 400 && reply.Status < 500 {
			round.Reason = "CPA 拒绝请求，未形成能力判定"
			break
		}
	}
	if ctx.Err() == nil && round.Outcome == "uncertain" && len(codes) > 0 {
		s.mu.Lock()
		previous := s.recordLocked(c.ID).Targets[q.Model].Rounds
		s.mu.Unlock()
		count := 1
		for _, old := range previous {
			if old.Evidence.ServiceError == nil {
				break
			}
			count++
			if count >= v.FailureRule.WindowRounds {
				break
			}
		}
		round.Evidence.ServiceError = &ServiceErrors{codes, count, v.FailureRule.WindowRounds}
		round.ReasonCode = "single-service-error"
		round.Reason = "本轮 502/503 服务错误重试耗尽，保持当前分组"
		if count >= v.FailureRule.WindowRounds {
			round.Outcome = "downshift"
			round.ReasonCode = "repeated-service-errors"
			round.Reason = fmt.Sprintf("连续 %d 轮巡检出现 502/503 服务错误", v.FailureRule.WindowRounds)
		}
	}
	round.FinishedAt = stamp()
	round.Evidence.DurationMs = time.Since(mustTime(start)).Milliseconds()
	s.commitRound(ctx, task, q, c, round, v)
}
func mustTime(v string) time.Time { t, _ := time.Parse(time.RFC3339Nano, v); return t }
func (s *Service) commitRound(ctx context.Context, task Task, q StartRequest, c cpa.Credential, round Round, settings Settings) {
	s.mutation.Lock()
	defer s.mutation.Unlock()
	if s.inspectionExcluded(c.ID) {
		s.patchItem(task.ID, round.TargetID, func(item *RunItem) {
			item.State = "skipped"
			item.Note = str("该凭证不参与巡检，未提交判定或写入配置")
			item.FinishedAt = &round.FinishedAt
			item.CurrentTest = nil
		})
		return
	}
	if ctx.Err() != nil {
		round.Outcome = "cancelled"
		round.ReasonCode = "cancelled"
		round.Reason = "任务已停止，本轮未提交判定或分组"
	}
	if round.Outcome == "normal" || round.Outcome == "downshift" {
		if ctx.Err() == nil {
			syncRecord, _ := s.apply(ctx, c.ID, str(round.Outcome), settings)
			round.Sync = &syncRecord
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	r := s.recordLocked(c.ID)
	target := r.Targets[q.Model]
	if target.ID == "" {
		target = Target{ID: targetID(c.ID, q.Model), CredentialID: c.ID, Model: q.Model, Verdict: "untested"}
	}
	if round.Outcome == "normal" || round.Outcome == "downshift" || round.Outcome == "uncertain" {
		target.Verdict = round.Outcome
		target.Blocked = nil
	} else if round.Outcome == "blocked" {
		kind := "auth"
		if round.ReasonCode == "quota-exhausted" {
			kind = "quota"
		}
		target.Blocked = &Blocked{kind, round.Reason}
	}
	target.Rounds = append([]Round{round}, target.Rounds...)
	if len(target.Rounds) > 40 {
		target.Rounds = target.Rounds[:40]
	}
	r.Targets[q.Model] = target
	for i := range s.state.Tasks {
		t := &s.state.Tasks[i]
		if t.ID != task.ID {
			continue
		}
		for j := range t.Items {
			item := &t.Items[j]
			if item.TargetID != target.ID {
				continue
			}
			item.State = "done"
			item.Note = nil
			if round.Outcome == "cancelled" {
				item.State = "cancelled"
				item.Note = &round.Reason
			}
			if round.Sync != nil && round.Sync.Status == "failed" {
				item.Note = round.Sync.Message
			}
			item.FinishedAt = &round.FinishedAt
			item.CurrentTest = nil
		}
	}
	if err := s.persistLocked(); err != nil {
		for i := range s.state.Tasks {
			for j := range s.state.Tasks[i].Items {
				item := &s.state.Tasks[i].Items[j]
				if item.TargetID == target.ID {
					item.State = "failed"
					item.Note = str("证据持久化失败：" + err.Error())
				}
			}
		}
	}
}
