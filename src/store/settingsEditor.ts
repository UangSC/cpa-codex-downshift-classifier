import { useStore } from './store'

export function useSettingsEditor() {
  const actual = useStore((state) => state.settings)
  const draft = useStore((state) => state.settingsDraft)
  const update = useStore((state) => state.editSettingsDraft)
  return { settings: draft ?? actual, update }
}
