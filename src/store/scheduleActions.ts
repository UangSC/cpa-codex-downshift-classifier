/**
 * Glue between the settings UI and the scheduler.
 *
 * Keeping this out of the store keeps `setScheduleEnabled` a pure state change, so a
 * disable can never leave a live timer behind.
 */

import { useEffect } from 'react'
import { armSchedule, disarmSchedule } from './scheduler'
import { useStore } from './store'

export function applyScheduleChange(enabled: boolean) {
  useStore.getState().setScheduleEnabled(enabled)
  if (enabled) armSchedule({ force: true })
  else disarmSchedule()
}

/** Re-arms whenever the schedule is enabled but has no computed slot yet. */
export function useScheduleSync() {
  const enabled = useStore((s) => s.settings.schedule.enabled)
  const nextRunAt = useStore((s) => s.settings.schedule.nextRunAt)

  useEffect(() => {
    if (!enabled) {
      disarmSchedule()
      return
    }
    if (!nextRunAt) armSchedule({ force: true })
  }, [enabled, nextRunAt])
}
