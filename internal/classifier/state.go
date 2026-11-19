package classifier

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

func str(v string) *string { return &v }
func stamp() string        { return time.Now().UTC().Format(time.RFC3339Nano) }
func identifier(prefix string) string {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
	}
	return prefix + "-" + hex.EncodeToString(b[:])
}
func clone[T any](v T) T {
	b, _ := json.Marshal(v)
	var result T
	_ = json.Unmarshal(b, &result)
	return result
}
func terminal(v string) bool {
	return v == "done" || v == "skipped" || v == "cancelled" || v == "failed"
}
func (s *Service) persistLocked() error {
	data, err := json.MarshalIndent(s.state, "", "  ")
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(s.path), ".state-*.tmp")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if err = f.Chmod(0600); err == nil {
		_, err = f.Write(data)
	}
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(name, s.path)
}
func (s *Service) recordLocked(id string) *Record {
	r := s.state.Records[id]
	if r == nil {
		r = &Record{Sync: Sync{Status: "not-needed"}, Targets: map[string]Target{}}
		s.state.Records[id] = r
	}
	if r.Targets == nil {
		r.Targets = map[string]Target{}
	}
	return r
}
func targetID(id, model string) string { return id + "::" + model }
