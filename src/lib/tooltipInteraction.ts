/** 只拦截拖选松手紧接着合成的鼠标点击，下一轮操作与键盘点击不受影响。 */
export function suppressSelectionReleaseClick(target: EventTarget): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const cleanup = () => {
    target.removeEventListener('click', block, { capture: true })
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  const block = (event: Event) => {
    if ((event as MouseEvent).detail === 0) return
    event.preventDefault()
    event.stopImmediatePropagation()
    cleanup()
  }
  target.addEventListener('click', block, { capture: true })
  timer = setTimeout(cleanup, 0)
  return cleanup
}
