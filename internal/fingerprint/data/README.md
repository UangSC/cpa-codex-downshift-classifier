# 指纹参考数据

来源为 [cpa-plugin-codex-candy-eval](https://github.com/UangSC/cpa-plugin-codex-candy-eval)，固定提交 `86d832c58f85f33e0cff91368fae1cb1012899f8`；其模型检测器来自 [Ikaleio/lm-detector](https://github.com/Ikaleio/lm-detector)，固定提交 `a4ef212df06817e8071acd05f00219f4c9eb2f9a`。

- `shared_detector.bin` 为原样保留的冻结排序模型和温度校准参数，是运行时参考数据，不是编译后的插件包。
- `enrollment-suite.json` 为原参考采集使用的 36 个固定挑战。每轮无放回随机选择三个，保留系统指令与用户前缀。
- `models.json` 保存同一参考库的模型、家族与样本数量，加载时校验构建时间、模型顺序、样本量及校准绑定。
- `LICENSE` 为上游 MIT 许可证，`../PORT_LICENSE` 为参考 Go 移植的 MIT 许可证。分发时保留二者。

参考库将 `gpt-6.1-sol` 与 `gpt-6-astra` 的答案合并在 `gpt-6-astra` 候选下；`deepseek-flash` 对应已登记的 `deepseek-v4.1-flash-1017`。其它名称只做大小写和提供方前缀规范化，未登记的模型不自动推断别名。

检测器将三组数字的频率、位置、步长与序列特征进行聚合，使用冻结的 LDA、近邻和分布质心模型排序，再用绑定参考库的温度参数生成候选内概率。少于三次有效回答或序列不符合参考模型行为时不生成概率。普通数字均值只作为描述统计保存，不参与单独的成功判定。

概率只比较库内候选，不是模型真实身份的证明。参考数据、挑战题和校准参数必须从同一上游版本同时更新；每轮历史应记录检测器 SHA-256 修订号。
