package cpa

import (
	"bufio"
	"bytes"
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

func (c *Client) Probe(ctx context.Context, id, model, prompt, instructions, effort string, headerOverrides map[string]string) (ProbeReply, error) {
	overrides, validationErr := ValidateHeaderOverrides(headerOverrides)
	if validationErr != nil {
		return ProbeReply{Status: 400, Error: validationErr.Error()}, nil
	}
	if effort != "low" && effort != "medium" && effort != "high" {
		return ProbeReply{}, errors.New("思考程度仅支持 low、medium、high")
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	started := time.Now()
	reply := ProbeReply{}
	if ctx.Err() != nil {
		return reply, ctx.Err()
	}
	list, err := c.accounts(ctx)
	if err != nil {
		return reply, err
	}
	var account *hostAuth
	for i := range list {
		if list[i].ID == id {
			account = &list[i]
			break
		}
	}
	if account == nil {
		return reply, errors.New("Codex 凭证不存在或已移除")
	}
	runtime, err := c.runtime(ctx, account.Index, id)
	if err != nil {
		return reply, err
	}
	if runtime.Disabled || strings.EqualFold(strings.TrimSpace(runtime.StatusMessage), "token expired") {
		return ProbeReply{Status: 403, Error: "CPA 已禁用此凭证或认证失效", LocalState: true}, nil
	}
	if runtimeUnavailable(runtime, time.Now()) {
		return ProbeReply{Status: 429, Error: "CPA 凭证当前不可用或正在冷却，未发送上游请求", LocalState: true, RetryAfterMs: runtimeCooldownMillis(runtime, time.Now())}, nil
	}
	if strings.TrimSpace(model) == "" || strings.TrimSpace(prompt) == "" {
		return reply, errors.New("模型和检测题目不能为空")
	}
	if err := c.prepareHeaderMappings(ctx, account, overrides); err != nil {
		var configuration *headerConfigurationError
		if errors.As(err, &configuration) {
			return ProbeReply{Status: 409, Error: configuration.Error()}, nil
		}
		return reply, err
	}
	body, err := json.Marshal(map[string]any{"model": model, "input": []any{map[string]any{"role": "user", "content": []any{map[string]any{"type": "input_text", "text": prompt}}}}, "instructions": instructions, "stream": true, "store": false, "reasoning": map[string]string{"effort": effort}})
	if err != nil {
		return reply, err
	}
	var stream struct {
		Status  int         `json:"status_code"`
		ID      string      `json:"stream_id"`
		Headers http.Header `json:"headers"`
	}
	// CPA sdk/translator.FormatOpenAIResponse is "openai-response";
	// translator.FromString does not normalize aliases such as "responses".
	err = c.host("host.model.execute_stream", map[string]any{"entry_protocol": "openai-response", "exit_protocol": "openai-response", "model": model, "forced_provider": "codex", "auth_id": id, "stream": true, "headers": requestHeaders(overrides), "body": body}, &stream)
	if err != nil {
		reply, probeErr := probeHostError(err, time.Since(started).Milliseconds())
		return c.withRuntimeCooldown(ctx, account.Index, id, reply), probeErr
	}
	reply.Status = stream.Status
	reply.RetryAfterMs = retryAfterMillis(stream.Headers, time.Now())
	if reply.Status == 0 {
		reply.Status = 200
	}
	reply.DurationMs = time.Since(started).Milliseconds()
	if stream.ID == "" {
		reply.Error = "CPA 没有返回检测流"
		if reply.Status == 200 {
			return reply, errors.New(reply.Error)
		}
		return c.withRuntimeCooldown(ctx, account.Index, id, reply), nil
	}
	defer c.host("host.model.stream_close", map[string]string{"stream_id": stream.ID}, nil)
	if err := ctx.Err(); err != nil {
		return reply, err
	}
	var collected responseStream
	for {
		if ctx.Err() != nil {
			return reply, ctx.Err()
		}
		type streamChunk struct {
			Payload []byte `json:"payload"`
			Error   string `json:"error"`
			Done    bool   `json:"done"`
		}
		type readResult struct {
			chunk streamChunk
			err   error
		}
		done := make(chan readResult, 1)
		go func() {
			var chunk streamChunk
			err := c.host("host.model.stream_read", map[string]string{"stream_id": stream.ID}, &chunk)
			done <- readResult{chunk, err}
		}()
		var next readResult
		select {
		case next = <-done:
		case <-ctx.Done():
			_ = c.host("host.model.stream_close", map[string]string{"stream_id": stream.ID}, nil)
			<-done
			return reply, ctx.Err()
		}
		if next.err != nil {
			reply, probeErr := probeHostError(next.err, time.Since(started).Milliseconds())
			return c.withRuntimeCooldown(ctx, account.Index, id, reply), probeErr
		}
		if err := collected.writeChunk(next.chunk.Payload); err != nil {
			return reply, errors.New("检测响应超过 8 MiB 限制")
		}
		if next.chunk.Error != "" {
			return reply, errors.New("CPA 上游检测流未能完成，连接或传输失败")
		}
		if next.chunk.Done {
			break
		}
	}
	reply.DurationMs = time.Since(started).Milliseconds()
	if reply.Status < 200 || reply.Status >= 300 {
		return c.withRuntimeCooldown(ctx, account.Index, id, reply), nil
	}
	answer, input, output, err := collected.answer()
	if err != nil {
		reply.Error = err.Error()
		return reply, nil
	}
	reply.Answer = answer
	reply.InputTokens = input
	reply.OutputTokens = output
	return reply, nil
}

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

type completedResponse struct {
	Status string `json:"status"`
	Output []struct {
		Type    string `json:"type"`
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	} `json:"output"`
	Usage struct {
		Input  int `json:"input_tokens"`
		Output int `json:"output_tokens"`
	} `json:"usage"`
}

func completedAnswer(raw []byte) (string, int, int, error) {
	if response, found, err := completedJSONResponse(raw); found || err != nil {
		if err != nil {
			return "", 0, 0, err
		}
		return responseAnswer(response)
	}
	// SSE 允许 LF、CRLF 和 CR；宿主字节切片中的 CRLF 在完整收集后统一处理。
	raw = normalizeSSELineEndings(raw)
	var response completedResponse
	scanner := bufio.NewScanner(bytes.NewReader(raw))
	scanner.Buffer(make([]byte, 4096), maxResponseBytes)
	var data strings.Builder
	found := false
	consume := func() error {
		if data.Len() == 0 {
			return nil
		}
		payload := data.String()
		data.Reset()
		if strings.TrimSpace(payload) == "[DONE]" {
			return nil
		}
		completed, ok, err := completedEvent([]byte(payload), false)
		if err != nil {
			return err
		}
		if ok {
			response = completed
			found = true
		}
		return nil
	}
	for scanner.Scan() {
		line := strings.TrimSuffix(scanner.Text(), "\r")
		if strings.HasPrefix(line, "data:") {
			if data.Len() > 0 {
				data.WriteByte('\n')
			}
			data.WriteString(strings.TrimSpace(strings.TrimPrefix(line, "data:")))
		} else if line == "" {
			if err := consume(); err != nil {
				return "", 0, 0, err
			}
		}
	}
	if scanner.Err() != nil {
		return "", 0, 0, errors.New("检测事件读取失败")
	}
	if err := consume(); err != nil {
		return "", 0, 0, err
	}
	if !found {
		return "", 0, 0, errors.New("检测流未完整完成，不能形成判定")
	}
	return responseAnswer(response)
}

func responseAnswer(response completedResponse) (string, int, int, error) {
	parts := []string{}
	for _, item := range response.Output {
		if item.Type != "message" {
			continue
		}
		for _, content := range item.Content {
			if content.Type == "output_text" {
				parts = append(parts, content.Text)
			}
		}
	}
	answer := strings.Join(parts, "\n")
	if strings.TrimSpace(answer) == "" {
		return "", 0, 0, errors.New("模型没有返回有效文本回答")
	}
	if len(answer) > 64<<10 {
		answer = answer[:64<<10]
	}
	return answer, response.Usage.Input, response.Usage.Output, nil
}
