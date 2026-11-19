# 第三方代码与参考数据

`internal/fingerprint/` 的指纹算法和参考数据来自以下 MIT 许可项目：

| 来源 | 固定提交 | 对应内容 | 许可证 |
| --- | --- | --- | --- |
| [UangSC/cpa-plugin-codex-candy-eval](https://github.com/UangSC/cpa-plugin-codex-candy-eval) | `86d832c58f85f33e0cff91368fae1cb1012899f8` | Go 检测算法移植、数字解析与参考挑战组织 | [Hao Wang MIT](internal/fingerprint/PORT_LICENSE) |
| [Ikaleio/lm-detector](https://github.com/Ikaleio/lm-detector) | `a4ef212df06817e8071acd05f00219f4c9eb2f9a` | 冻结排序器、校准、挑战与模型参考库 | [xqy2006 MIT](internal/fingerprint/data/LICENSE) |

源文件保留来源说明，许可证正文随源码及嵌入参考资料提供。原模型参考二进制、模型表和挑战题原样保存，适配层负责与本插件的任务、证据和配置接口连接。
