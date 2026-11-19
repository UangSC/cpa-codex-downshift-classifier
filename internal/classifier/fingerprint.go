package classifier

import (
	"fmt"

	"github.com/UangSC/cpa-codex-downshift-classifier/internal/fingerprint"
)

func applyFingerprintResult(round *Round, result fingerprint.Result, retried bool) {
	evidence := round.Evidence.Fingerprint
	evidence.ValidSamples = result.ValidSamples
	evidence.EnrolledAs = result.EnrolledAs
	evidence.Probability, evidence.RequestedProbability = result.Probability, result.RequestedProbability
	evidence.ReferenceMatched, evidence.Decision = result.ReferenceMatched, result.Decision
	evidence.Candidates, evidence.Sequence, evidence.ReferenceBank = result.Candidates, result.Sequence, result.ReferenceBank
	evidence.Mean = &result.Mean
	if result.ClosestModel != "" {
		evidence.ClosestModel = str(result.ClosestModel)
	}
	if result.ClosestFamily != "" {
		evidence.ClosestFamily = str(result.ClosestFamily)
	}
	if result.ValidSamples != fingerprint.ChallengeCount || result.EnrolledAs == "" || result.RequestedProbability == nil {
		evidence.Consistency = "insufficient"
		round.Outcome, round.ReasonCode = "uncertain", "fingerprint-insufficient"
		round.Reason = "指纹参考未覆盖目标模型或三次结果不足以给出概率，保持当前分组"
		return
	}
	probability := *result.RequestedProbability
	if probability > fingerprint.ConfidenceThreshold && result.ReferenceMatched {
		evidence.Consistency = "consistent"
		round.Outcome, round.ReasonCode = "normal", "all-tests-passed"
		round.Reason = fmt.Sprintf("三次模型指纹归因完成，目标参考概率 %.2f%% 高于 90%%", probability*100)
		if retried {
			round.ReasonCode = "passed-after-retry"
		}
		return
	}
	evidence.Consistency = "anomalous"
	round.Outcome, round.ReasonCode = "downshift", "fingerprint-anomaly"
	round.Reason = fmt.Sprintf("三次模型指纹归因完成，目标参考概率 %.2f%% 未高于 90%%", probability*100)
	if probability > fingerprint.ConfidenceThreshold {
		round.Reason = "三次模型指纹归因完成，最高参考模型与目标参考不一致"
	}
}
