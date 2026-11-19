import type { useStore } from '../store/store'
import { changedSettings } from './settingsDraft'
import { hasOpenDialog, isEditingTarget, isPlainShortcut, isPrimaryShortcut } from './keyboard'

type ShortcutState = Pick<ReturnType<typeof useStore.getState>,
  'authenticated' | 'tab' | 'selected' | 'clearSelection' | 'settings' | 'settingsDraft' | 'settingsSaving' | 'saveSettingsDraft'>

/** 只编排已有动作；键盘保存仍经过原来的校验和巡检授权确认。 */
export function handleApplicationShortcut(event: KeyboardEvent, state: ShortcutState): void {
  if (!state.authenticated || hasOpenDialog()) return
  if (state.tab === 'settings' && isPrimaryShortcut(event, 's')) {
    event.preventDefault()
    if (!state.settingsSaving && state.settingsDraft && changedSettings(state.settings, state.settingsDraft).length) {
      void state.saveSettingsDraft()
    }
    return
  }
  if (isPlainShortcut(event, 'Escape') && !isEditingTarget(event.target) && state.selected.length) {
    event.preventDefault()
    state.clearSelection()
  }
}
