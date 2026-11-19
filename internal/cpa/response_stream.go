package cpa

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"strings"
)

// responseStream 保留宿主分片边界。Codex 执行器可能逐行输出 Scanner
// 去掉换行后的 SSE，而其它执行器仍可能输出完整帧或任意字节切片。
type responseStream struct {
	raw     bytes.Buffer
	framed  bytes.Buffer
	pending []byte
	size    int
}

func (s *responseStream) writeChunk(chunk []byte) error {
	if len(chunk) > maxResponseBytes-s.size {
		return errors.New("检测响应超过 8 MiB 限制")
	}
	s.size += len(chunk)
	s.raw.Write(chunk)
	if len(chunk) == 0 {
		return nil
	}
	// 上轮已检查过旧数据，只需从边界前最多三个字节搜索新分隔符。
	searchStart := max(0, len(s.pending)-3)
	if startsSSEField(chunk) && startsSSEField(bytes.TrimSpace(bytes.TrimPrefix(s.pending, []byte("\xef\xbb\xbf")))) {
		payload, hasData := sseDataPayload(s.pending)
		completeData := hasData && (json.Valid(payload) || bytes.Equal(payload, []byte("[DONE]")))
		lastLine := s.pending
		if index := bytes.LastIndexAny(lastLine, "\r\n"); index >= 0 {
			lastLine = lastLine[index+1:]
		}
		if completeData {
			// 完整 JSON 后开始新的字段帧，恢复 Scanner 丢失的空行。
			s.pending = append(s.pending, '\n', '\n')
		} else if startsSSEField(lastLine) && (!hasData || (!bytes.HasPrefix(chunk, []byte(":")) && !jsonStringOpen(payload))) {
			// 不在 JSON 字符串内部修复边界，避免损坏被分片的 data:/event: 文本。
			if last := s.pending[len(s.pending)-1]; last != '\n' && last != '\r' && chunk[0] != '\n' && chunk[0] != '\r' {
				s.pending = append(s.pending, '\n')
			}
		}
	}
	s.pending = append(s.pending, chunk...)
	for {
		length := sseFrameLength(s.pending[searchStart:])
		if length == 0 {
			break
		}
		length += searchStart
		s.framed.Write(s.pending[:length])
		s.pending = s.pending[length:]
		searchStart = 0
	}
	return nil
}

func (s *responseStream) bytes() []byte {
	result := make([]byte, 0, s.framed.Len()+len(s.pending))
	result = append(result, s.framed.Bytes()...)
	return append(result, s.pending...)
}

func (s *responseStream) answer() (string, int, int, error) {
	// 优先接受原始完整 SSE/JSON，确保任意字节切片中的注释或元数据内容
	// 不被宿主逐行契约的边界修复误改；仅缺少合法终态时再尝试恢复分隔。
	if answer, input, output, err := completedAnswer(s.raw.Bytes()); err == nil {
		return answer, input, output, nil
	}
	return completedAnswer(s.bytes())
}

func startsSSEField(chunk []byte) bool {
	for _, prefix := range []string{"data:", "event:", "id:", "retry:", ":"} {
		if bytes.HasPrefix(chunk, []byte(prefix)) {
			return true
		}
	}
	return false
}

func sseFrameLength(raw []byte) int {
	length := 0
	for _, separator := range []string{"\n\n", "\r\n\r\n", "\r\r"} {
		if index := bytes.Index(raw, []byte(separator)); index >= 0 && (length == 0 || index+len(separator) < length) {
			length = index + len(separator)
		}
	}
	return length
}

func normalizeSSELineEndings(raw []byte) []byte {
	raw = bytes.TrimPrefix(raw, []byte("\xef\xbb\xbf"))
	return bytes.ReplaceAll(bytes.ReplaceAll(raw, []byte("\r\n"), []byte("\n")), []byte("\r"), []byte("\n"))
}

func sseDataPayload(frame []byte) ([]byte, bool) {
	var data []string
	for _, line := range bytes.Split(normalizeSSELineEndings(frame), []byte("\n")) {
		if bytes.HasPrefix(line, []byte("data:")) {
			data = append(data, strings.TrimPrefix(string(line[len("data:"):]), " "))
		}
	}
	return []byte(strings.TrimSpace(strings.Join(data, "\n"))), len(data) > 0
}

func jsonStringOpen(raw []byte) bool {
	quoted, escaped := false, false
	for _, value := range raw {
		if escaped {
			escaped = false
			continue
		}
		if quoted && value == '\\' {
			escaped = true
			continue
		}
		if value == '"' {
			quoted = !quoted
		}
	}
	return quoted
}

// 裸 JSON 响应与逐个交付的 JSON 事件不包含 SSE 字段；Decoder 保留相邻
// JSON 对象的边界，同时允许宿主把对象进一步拆成任意字节分片。
func completedJSONResponse(raw []byte) (completedResponse, bool, error) {
	var response completedResponse
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || trimmed[0] != '{' {
		return response, false, nil
	}
	decoder := json.NewDecoder(bytes.NewReader(trimmed))
	found := false
	for {
		var payload json.RawMessage
		if err := decoder.Decode(&payload); err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return completedResponse{}, false, errors.New("检测事件格式无效")
		}
		completed, ok, err := completedEvent(payload, true)
		if err != nil {
			return completedResponse{}, false, err
		}
		if ok {
			response, found = completed, true
		}
	}
	if !found {
		return response, false, errors.New("检测流未完整完成，不能形成判定")
	}
	return response, true, nil
}

func completedEvent(payload []byte, allowBareResponse bool) (completedResponse, bool, error) {
	var event struct {
		Type     string            `json:"type"`
		Response completedResponse `json:"response"`
	}
	if json.Unmarshal(payload, &event) != nil {
		return completedResponse{}, false, errors.New("检测事件格式无效")
	}
	if event.Type == "response.failed" || event.Type == "response.incomplete" || event.Type == "error" {
		return completedResponse{}, false, errors.New("检测流返回失败或未完成事件，不能形成判定")
	}
	if event.Type == "response.completed" && event.Response.Status == "completed" {
		return event.Response, true, nil
	}
	if allowBareResponse && event.Type == "" {
		var response completedResponse
		if json.Unmarshal(payload, &response) == nil && response.Status == "completed" {
			return response, true, nil
		}
	}
	return completedResponse{}, false, nil
}
