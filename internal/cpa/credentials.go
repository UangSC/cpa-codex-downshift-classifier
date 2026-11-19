package cpa

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"sort"
	"strings"
	"time"
)

type hostAuth struct {
	ID             string    `json:"id"`
	Index          string    `json:"auth_index"`
	Name           string    `json:"name"`
	Label          string    `json:"label"`
	Email          string    `json:"email"`
	Provider       string    `json:"provider"`
	Type           string    `json:"type"`
	Status         string    `json:"status"`
	StatusMessage  string    `json:"status_message"`
	AccountType    string    `json:"account_type"`
	Disabled       bool      `json:"disabled"`
	Unavailable    bool      `json:"unavailable"`
	NextRetryAfter time.Time `json:"next_retry_after"`
	Priority       int       `json:"priority"`
	Weight         *int      `json:"weight"`
	Prefix         string    `json:"prefix"`
	Quota          struct {
		Signals    map[string]string `json:"signals"`
		ObservedAt time.Time         `json:"observed_at"`
	} `json:"quota"`
}

func (c *Client) accounts(ctx context.Context) ([]hostAuth, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	var list struct {
		Files []hostAuth `json:"files"`
	}
	if err := c.host("host.auth.list", map[string]any{}, &list); err != nil {
		return nil, errors.New("读取 CPA 凭证列表失败")
	}
	if list.Files == nil {
		return nil, errors.New("CPA 凭证列表响应不完整")
	}
	out := []hostAuth{}
	seen := map[string]bool{}
	for _, a := range list.Files {
		if a.Provider != "codex" && a.Type != "codex" {
			continue
		}
		if a.ID == "" || a.Index == "" || seen[a.ID] {
			return nil, errors.New("CPA Codex 凭证标识缺失或重复")
		}
		seen[a.ID] = true
		out = append(out, a)
	}
	return out, nil
}

func (c *Client) ListCredentials(ctx context.Context) ([]Credential, error) {
	list, err := c.accounts(ctx)
	if err != nil {
		return nil, err
	}
	// Official auth-files adds the passive quota observations omitted by host.auth.list.
	var official struct {
		Files []hostAuth `json:"files"`
	}
	if err = c.request(ctx, "GET", "/auth-files", nil, &official); err != nil {
		return nil, err
	}
	byID := map[string]hostAuth{}
	for _, a := range official.Files {
		byID[a.ID] = a
	}
	out := make([]Credential, 0, len(list))
	for _, a := range list {
		if err = ctx.Err(); err != nil {
			return nil, err
		}
		if fresh, ok := byID[a.ID]; ok {
			a = fresh
		}
		runtime, runtimeErr := c.runtime(ctx, a.Index, a.ID)
		if runtimeErr != nil {
			return nil, runtimeErr
		}
		a.Disabled, a.Unavailable = runtime.Disabled, runtimeUnavailable(runtime, time.Now())
		a.Status, a.StatusMessage = runtime.Status, runtime.StatusMessage
		var stored struct {
			JSON json.RawMessage `json:"json"`
		}
		if c.host("host.auth.get", map[string]string{"auth_index": a.Index}, &stored) != nil {
			return nil, errors.New("读取 CPA Codex 凭证配置失败")
		}
		var fields struct {
			Prefix   string `json:"prefix"`
			Priority *int   `json:"priority"`
			Weight   *int   `json:"weight"`
			Plan     string `json:"plan_type"`
		}
		if json.Unmarshal(stored.JSON, &fields) != nil {
			return nil, errors.New("CPA Codex 凭证配置格式无效")
		}
		priority := a.Priority
		if fields.Priority != nil {
			priority = *fields.Priority
		}
		weight := 1
		if fields.Weight != nil {
			weight = *fields.Weight
		}
		if a.Weight != nil {
			weight = *a.Weight
		}
		var models struct {
			Models []struct {
				ID string `json:"id"`
			} `json:"models"`
		}
		if err = c.request(ctx, "GET", "/auth-files/models?name="+url.QueryEscape(a.ID), nil, &models); err != nil {
			return nil, err
		}
		ids := []string{}
		seen := map[string]bool{}
		prefix := strings.Trim(fields.Prefix, "/")
		for _, m := range models.Models {
			model := m.ID
			if prefix != "" {
				model = strings.TrimPrefix(model, prefix+"/")
			}
			if model != "" && !seen[model] {
				seen[model] = true
				ids = append(ids, model)
			}
		}
		sort.Strings(ids)
		name := a.Email
		if name == "" {
			name = a.Label
		}
		if name == "" {
			name = a.Name
		}
		plan := a.AccountType
		if fields.Plan != "" {
			plan = fields.Plan
		}
		if plan == "" {
			plan = "unknown"
		}
		auth := "valid"
		if strings.EqualFold(strings.TrimSpace(a.StatusMessage), "token expired") {
			auth = "expired"
		}
		out = append(out, Credential{ID: a.ID, AuthIndex: a.Index, Name: name, File: a.Name, Plan: plan, Prefix: prefix, Priority: priority, Weight: weight, Disabled: a.Disabled, Unavailable: a.Unavailable, Auth: auth, Availability: "unknown", Models: ids, Quota: c.currentQuota(a.ID, parseQuotaSignals(a.Quota.Signals, a.Quota.ObservedAt))})
	}
	return out, nil
}

func (c *Client) runtime(ctx context.Context, index, id string) (hostAuth, error) {
	if err := ctx.Err(); err != nil {
		return hostAuth{}, err
	}
	var response struct {
		Auth hostAuth `json:"auth"`
	}
	if c.host("host.auth.get_runtime", map[string]string{"auth_index": index}, &response) != nil || response.Auth.ID != id || response.Auth.Index != index {
		return hostAuth{}, errors.New("无法确认 Codex 凭证当前运行状态")
	}
	return response.Auth, nil
}

// CPA 在下一次调度前可能仍保留 Unavailable；只有官方冷却期限已到期时
// 才将选择权交回宿主，禁用和认证失效不会因此被解除。
func runtimeUnavailable(auth hostAuth, now time.Time) bool {
	if !auth.Unavailable {
		return false
	}
	if auth.Disabled || strings.EqualFold(strings.TrimSpace(auth.StatusMessage), "token expired") {
		return true
	}
	return auth.NextRetryAfter.IsZero() || auth.NextRetryAfter.After(now)
}

func runtimeCooldownMillis(auth hostAuth, now time.Time) int64 {
	if !auth.Unavailable || auth.NextRetryAfter.IsZero() || !auth.NextRetryAfter.After(now) {
		return 0
	}
	remaining := auth.NextRetryAfter.Sub(now)
	return int64((remaining-1)/time.Millisecond) + 1
}
