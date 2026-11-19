package classifier

import "time"

// linkHistoricalRounds only recovers a batch from an unambiguous recorded task,
// target and time interval. Nearby timestamps alone never identify a batch.
func linkHistoricalRounds(state *diskState) {
	for _, record := range state.Records {
		if record == nil {
			continue
		}
		for model, target := range record.Targets {
			for i := range target.Rounds {
				round := &target.Rounds[i]
				if round.TaskID != "" {
					if round.BatchStartedAt == "" {
						for _, task := range state.Tasks {
							if task.ID == round.TaskID {
								round.BatchStartedAt = task.CreatedAt
								break
							}
						}
					}
					continue
				}
				var match *Task
				ambiguous := false
				for taskIndex := range state.Tasks {
					task := &state.Tasks[taskIndex]
					if !historicalTaskContains(*task, *round) {
						continue
					}
					if match != nil {
						ambiguous = true
						break
					}
					match = task
				}
				if match != nil && !ambiguous {
					round.TaskID, round.BatchStartedAt = match.ID, match.CreatedAt
				}
			}
			record.Targets[model] = target
		}
	}
}

func historicalTaskContains(task Task, round Round) bool {
	if task.ID == "" || task.Scope != round.Scope || task.FinishedAt == nil {
		return false
	}
	batchStart, err := time.Parse(time.RFC3339Nano, task.CreatedAt)
	if err != nil {
		return false
	}
	batchEnd, err := time.Parse(time.RFC3339Nano, *task.FinishedAt)
	if err != nil {
		return false
	}
	roundStart, err := time.Parse(time.RFC3339Nano, round.StartedAt)
	if err != nil {
		return false
	}
	roundEnd, err := time.Parse(time.RFC3339Nano, round.FinishedAt)
	if err != nil || roundEnd.Before(roundStart) || roundStart.Before(batchStart) || roundEnd.After(batchEnd) {
		return false
	}
	for _, item := range task.Items {
		if item.TargetID == round.TargetID {
			return true
		}
	}
	return false
}
