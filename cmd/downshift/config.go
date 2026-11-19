package main

import (
	"errors"
	"strconv"
	"strings"
)

// CPA normalizes plugin configuration to a flat YAML map. Only three scalar fields are read.
func scalarConfig(raw []byte) (map[string]string, error) {
	result := map[string]string{}
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		if key != "api_base" && key != "management_key" && key != "state_dir" {
			continue
		}
		value = strings.TrimSpace(value)
		if strings.HasPrefix(value, "\"") {
			parsed, err := strconv.Unquote(value)
			if err != nil {
				return nil, errors.New("插件字符串配置无效")
			}
			value = parsed
		} else if strings.HasPrefix(value, "'") {
			if !strings.HasSuffix(value, "'") || len(value) < 2 {
				return nil, errors.New("插件字符串配置无效")
			}
			value = strings.ReplaceAll(value[1:len(value)-1], "''", "'")
		} else {
			if idx := strings.Index(value, " #"); idx >= 0 {
				value = strings.TrimSpace(value[:idx])
			}
			if value == "null" || value == "~" {
				value = ""
			}
			if strings.HasPrefix(value, "|") || strings.HasPrefix(value, ">") || strings.HasPrefix(value, "{") || strings.HasPrefix(value, "[") {
				return nil, errors.New("插件配置仅支持单行字符串")
			}
		}
		result[key] = value
	}
	return result, nil
}
