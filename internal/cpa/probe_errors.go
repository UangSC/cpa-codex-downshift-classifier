package cpa

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func probeHostError(err error, duration int64) (ProbeReply, error) {
	status := 0
	var source interface{ StatusCode() int }
	if errors.As(err, &source) {
		status = source.StatusCode()
	}
	if status < 400 || status > 599 {
		return ProbeReply{DurationMs: duration}, errors.New("CPA 定向检测连接或宿主回调失败")
	}
	reply := ProbeReply{Status: status, DurationMs: duration, Error: fmt.Sprintf("CPA 定向检测返回 HTTP %d", status)}
	if status == 429 {
		var payload struct {
			Error *struct {
				Code         string          `json:"code"`
				ResetSeconds json.RawMessage `json:"reset_seconds"`
			} `json:"error"`
		}
		// 只识别宿主明确的结构化冷却码，消息提及 cooldown 不构成证据。
		if json.Unmarshal([]byte(err.Error()), &payload) == nil && payload.Error != nil && payload.Error.Code == "model_cooldown" {
			reply.LocalState = true
			reply.Error = "CPA 模型处于官方冷却，未发送上游请求"
			if seconds, parseErr := strconv.ParseFloat(string(payload.Error.ResetSeconds), 64); parseErr == nil && seconds > 0 {
				const maxDelay = int64(1<<63 - 1)
				if seconds >= float64(maxDelay)/1000 {
					reply.RetryAfterMs = maxDelay
				} else {
					reply.RetryAfterMs = int64(math.Ceil(seconds * 1000))
				}
			}
		}
	}
	return reply, nil
}

// 真实HTTP异常后读取官方冷却期限；即使 RPC 错误没有响应头也能尊重宿主
// 的调度状态。读取失败不改写已取得的HTTP证据，下次预检会再次确认状态。
func (c *Client) withRuntimeCooldown(ctx context.Context, index, id string, reply ProbeReply) ProbeReply {
	if reply.LocalState || (reply.Status != 502 && reply.Status != 503 && reply.Status != 429) {
		return reply
	}
	if auth, err := c.runtime(ctx, index, id); err == nil {
		if minimum := runtimeCooldownMillis(auth, time.Now()); minimum > reply.RetryAfterMs {
			reply.RetryAfterMs = minimum
		}
	}
	return reply
}

// CPA 的流响应会传递响应头；当前 RPC 错误信封只有状态码和消息，不含头。
// 只读取宿主实际提供的 Retry-After，不推测错误消息中的重试时间。
func retryAfterMillis(headers http.Header, now time.Time) int64 {
	var delay int64
	for key, values := range headers {
		if !strings.EqualFold(key, "Retry-After") {
			continue
		}
		for _, value := range values {
			value = strings.TrimSpace(value)
			if seconds, err := strconv.ParseUint(value, 10, 63); err == nil {
				const maxDelay = int64(1<<63 - 1)
				candidate := maxDelay
				if seconds <= uint64(maxDelay/1000) {
					candidate = int64(seconds) * 1000
				}
				if candidate > delay {
					delay = candidate
				}
			} else if deadline, err := http.ParseTime(value); err == nil {
				candidate := deadline.Sub(now).Milliseconds()
				if candidate > delay {
					delay = candidate
				}
			}
		}
	}
	return delay
}
