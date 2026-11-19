package cpa

import (
	"math"
	"strconv"
	"time"
)

func parseQuotaSignals(signals map[string]string, observed time.Time) Quota {
	q := Quota{Windows: []QuotaWindow{}, Status: "unknown"}
	if observed.IsZero() {
		return q
	}
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
