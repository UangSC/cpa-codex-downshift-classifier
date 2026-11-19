import type { ProbeReply } from './types'
import type { TestKind } from '../types'

export interface InspectionMethod {
  id: TestKind
  label: string
  description: string
  challengeCount: number
  validateReply: (reply: ProbeReply) => boolean
  stopAfterReply?: (reply: ProbeReply) => boolean
}
const methods = new Map<TestKind, InspectionMethod>()
export function registerInspectionMethod(method: InspectionMethod): () => void {
  if (!method.id || methods.has(method.id)) throw new Error(`检测方式 ID 无效或已注册：${method.id}`)
  if (!Number.isInteger(method.challengeCount) || method.challengeCount < 1) throw new Error('检测方式题数必须为正整数')
  methods.set(method.id, method)
  return () => { if (methods.get(method.id) === method) methods.delete(method.id) }
}
export function listInspectionMethods(): InspectionMethod[] { return [...methods.values()] }
export function getInspectionMethod(id: TestKind): InspectionMethod {
  const method = methods.get(id)
  if (!method) throw new Error(`未注册的检测方式：${id}`)
  return method
}
export function methodLabel(id: TestKind): string { return methods.get(id)?.label ?? id }
