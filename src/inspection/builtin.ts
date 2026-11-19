import { registerInspectionMethod } from './registry'

registerInspectionMethod({
  id: 'candy', label: '糖果题',
  description: '正常只询问一次；答案不符直接判定，异常或无有效回答才重试。',
  challengeCount: 1,
  validateReply: (reply) => !!reply.candy?.answer.trim(),
  stopAfterReply: (reply) => reply.candy?.matched === false,
})
registerInspectionMethod({
  id: 'fingerprint', label: '模型指纹',
  description: '由服务端采集三道数字挑战并与已配置的参考库比对；没有参考库时不可启用。',
  challengeCount: 3,
  validateReply: (reply) => !!reply.sample?.accepted && reply.sample.numbers.length === reply.sample.expectedCount &&
    reply.sample.numbers.length > 0 && reply.sample.numbers.every(Number.isFinite),
})
