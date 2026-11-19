package cpa

import (
	"math"
	"strconv"
	"strings"
	"time"
)

func parseQuotaSignals(signals map[string]string, observed time.Time) Quota {
	q := Quota{Windows: []QuotaWindow{}, Status: "unknown"}
	if observed.IsZero() {
		return q
	}
	q.ObservedAt = observed.UTC().Format(time.RFC3339Nano)
	// HTTP 头名不区分大小写；CPA 管理接口会保留 X-Codex-* 的规范形式。
	// 复制后归一化，避免将真实额度误判为未知，也不修改调用方的观测数据。
	normalized := make(map[string]string, len(signals))
	for name, value := range signals {
		normalized[strings.ToLower(strings.TrimSpace(name))] = strings.TrimSpace(value)
	}
	signals = normalized
	for _, window := range []string{"primary", "secondary"} {
		base := "x-codex-" + window + "-"
		minutes, err := strconv.Atoi(signals[base+"window-minutes"])
		if err != nil {
			continue
		}
		key := ""
		if minutes == 300 {
			key = "5h"
		}
		if minutes == 10080 {
			key = "7d"
		}
		if key == "" {
			continue
		}
		used, err := strconv.ParseFloat(signals[base+"used-percent"], 64)
		if err != nil || math.IsNaN(used) || math.IsInf(used, 0) || used < 0 || used > 100 {
			continue
		}
		seconds, err := strconv.ParseInt(signals[base+"reset-at"], 10, 64)
		reset := time.Unix(seconds, 0)
		if err != nil {
			after, afterErr := strconv.ParseInt(signals[base+"reset-after-seconds"], 10, 64)
			if afterErr != nil || after < 0 || after > 31536000 {
				continue
			}
			reset = observed.Add(time.Duration(after) * time.Second)
		}
		if !reset.After(time.Now()) {
			continue
		}
		remaining := 100 - used
		at := reset.UTC().Format(time.RFC3339)
		q.Windows = append(q.Windows, QuotaWindow{Key: key, RemainingPercent: &remaining, ResetsAt: &at})
		q.Status = "known"
		if remaining == 0 {
			q.Status = "exhausted"
		}
	}
	for _, w := range q.Windows {
		if w.RemainingPercent != nil && *w.RemainingPercent == 0 {
			q.Status = "exhausted"
		}
	}
	return q
}
