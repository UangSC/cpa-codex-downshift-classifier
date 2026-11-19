package classifier

import "fmt"

const maxRetryWaitMs = 120000

func isTransientHTTPStatus(status int) bool {
	return status == 502 || status == 503 || status == 429
}

func newServiceErrorEvidence(codes []int, settings Settings) *ServiceErrors {
	return &ServiceErrors{Codes: append([]int(nil), codes...), WindowSize: settings.FailureRule.WindowRounds, ErrorAttempts: len(codes), RequestThreshold: settings.FailureRule.RequestThreshold}
}

// 达到单轮真实HTTP异常门槛即结束，不继续请求第四次来覆盖频繁失败。
func markFrequentServiceErrors(round *Round, codes []int, settings Settings) {
	round.Evidence.ServiceError = newServiceErrorEvidence(codes, settings)
	round.Evidence.ServiceError.ErrorRoundsInWindow = 1
	round.Evidence.ServiceError.Trigger = "attempts"
	round.Outcome, round.ReasonCode = "downshift", "repeated-service-errors"
	round.Reason = fmt.Sprintf("本轮累计 %d 次 502/503/429，达到 %d 次频繁异常门槛", len(codes), settings.FailureRule.RequestThreshold)
}

func applyServiceErrorRule(round *Round, codes []int, previous []Round, settings Settings) {
	if len(codes) == 0 {
		return
	}
	if len(codes) >= settings.FailureRule.RequestThreshold && round.Outcome != "blocked" && round.Outcome != "cancelled" {
		markFrequentServiceErrors(round, codes, settings)
		return
	}
	round.Evidence.ServiceError = newServiceErrorEvidence(codes, settings)
	// 完整回答的行为结论、认证、本地额度守卫和取消不参与跨轮异常累计。
	if round.Outcome != "uncertain" {
		return
	}
	count := 1
	for _, old := range previous {
		if !failedServiceErrorRound(old) {
			break
		}
		count++
		if count >= settings.FailureRule.WindowRounds {
			break
		}
	}
	round.Evidence.ServiceError.ErrorRoundsInWindow = count
	round.ReasonCode = "single-service-error"
	round.Reason = fmt.Sprintf("本轮出现 %d 次 502/503/429，未达到单轮或连续失败轮次门槛，保持当前分组", len(codes))
	if count >= settings.FailureRule.WindowRounds {
		round.Evidence.ServiceError.Trigger = "rounds"
		round.Outcome, round.ReasonCode = "downshift", "repeated-service-errors"
		round.Reason = fmt.Sprintf("连续 %d 轮未完成检测并出现 502/503/429，达到重复失败门槛", count)
	}
}

func failedServiceErrorRound(round Round) bool {
	if round.Outcome != "uncertain" && round.Outcome != "downshift" {
		return false
	}
	if round.ReasonCode != "single-service-error" && round.ReasonCode != "repeated-service-errors" {
		return false
	}
	for _, attempt := range round.Evidence.Attempts {
		if attempt.LocalState {
			continue
		}
		switch status := attempt.Status.(type) {
		case int:
			if isTransientHTTPStatus(status) {
				return true
			}
		case float64:
			if status == float64(int(status)) && isTransientHTTPStatus(int(status)) {
				return true
			}
		}
	}
	return false
}
