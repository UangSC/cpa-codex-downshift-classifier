/** 常见快捷键共用边界：保留输入编辑、输入法以及已处理的按键事件。 */
export function isEditingTarget(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null
  if (!node) return false
  if (node.isContentEditable) return true
  if (typeof node.closest === 'function') {
    return !!node.closest('textarea, select, input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]), [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]')
  }
  return node.tagName === 'TEXTAREA' || node.tagName === 'SELECT' ||
    node.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'reset'].includes((node as HTMLInputElement).type)
}

export function isCompositionEvent(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229
}

export function hasOpenDialog(): boolean {
  return typeof document !== 'undefined' && !!document.querySelector('[role="dialog"], [role="alertdialog"]')
}

function matchesKey(event: KeyboardEvent, key: string): boolean {
  return !event.defaultPrevented && !event.repeat && !isCompositionEvent(event) && event.key.toLowerCase() === key.toLowerCase()
}

export function isPrimaryShortcut(event: KeyboardEvent, key: string): boolean {
  return matchesKey(event, key) && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey
}

export function isPlainShortcut(event: KeyboardEvent, key: string): boolean {
  return matchesKey(event, key) && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
}
