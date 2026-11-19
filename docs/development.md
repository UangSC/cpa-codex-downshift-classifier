# 开发与部署

当前仓库为源码预览。内部版本 `0.1.2` 用于插件注册与产物命名，尚未发布正式版。正式发布需要同时完成 Linux 和 Windows 编译产物及对应宿主验证。

## 准备环境

需要 Go 1.23+、支持 CGO 的 C 编译器、Node.js 20.19+（20.x）或 22.12+ 和 pnpm。项目不绑定开发者的绝对路径，也不会安装 SDK 或更改全局环境。

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
```

`pnpm dev` 只启动页面开发服务器。正式页面嵌入 CPA 并通过同源管理接口获取真实数据；本项目不提供模拟后端或测试账号。

## Windows 源码构建

```powershell
./scripts/build.ps1 -GoExe <go.exe路径> -Compiler <gcc.exe路径>
```

工具已在 PATH 中时可省略路径；也可使用 `CPA_DOWNSHIFT_GO` 和 `CC` 进程变量。脚本会：

1. 执行 TypeScript 检查与 Vite 构建。
2. 将页面产物准备到 `web/dist/`，供 `go:embed` 使用。
3. 运行 `go vet` 并生成 Windows amd64 原生 DLL。
4. 在 `build/windows/amd64/` 写入本地产物和 SHA-256 文件。

`dist/`、`web/dist/` 和 `build/` 均为生成目录，不提交到源码仓库。直接运行 Go 构建或静态检查前，应先通过构建脚本准备嵌入资源。源码变更可在本地执行额外验证；本地测试脚本与诊断资料不随此次源码发布。

## 配置与部署

参考 [配置示例](../examples/plugin-config.yaml)。`api_base` 只允许本机回环 HTTP 地址，`management_key` 使用已有 CPA 管理密钥；`state_dir` 留空时使用 CPA 可执行文件旁的 `plugin-data/cpa-codex-downshift-classifier/`。

```powershell
./scripts/deploy-local.ps1 -CoreDir <CPA核心目录> -GuiConfig <EasyCLIProxyAPI配置文件>
```

未使用 EasyCLIProxyAPI 时，可通过进程变量提供管理密钥，然后运行同一部署脚本。脚本仅通过官方配置 API 更新本插件节点，使用 `If-Match` 避免覆盖并发配置修改，并保留配置、原插件与状态备份。同版本重新构建会切换合法加载路径，以保证 CPA 实际重新加载新 DLL。

部署完成会输出已加载版本、页面地址和备份位置，并验证 CPA 内核哈希及其它插件注册状态。备份属于本机运行数据，不应加入源码提交。回退需要恢复对应备份中的插件文件、插件配置和状态，不能只替换 DLL。

## Codex 请求头

默认头在 `internal/cpa/request_headers.go` 中维护，当前基线为 Codex CLI `0.170.0`。页面允许保存普通请求头覆盖，认证、账号和传输控制头不可覆盖。

CPA 自带的 Codex 身份重设可能覆盖调用方的 User-Agent。需要调整宿主配置时，可显式运行：

```powershell
./scripts/configure-codex-headers.ps1 -CoreDir <CPA核心目录> -GuiConfig <EasyCLIProxyAPI配置文件> -UserAgent <Codex-CLI-User-Agent>
```

该工具通过官方接口更新 Codex OAuth 默认 UA 并关闭旧内置身份重设，先备份宿主配置。凭证中的非插件请求头规则保持原值；规则冲突会返回错误。

## 提交范围

提交源代码、锁文件、文档、配置示例和必要构建工具。凭证、管理密钥、完整本机配置、状态、日志、截图、依赖、二进制、缓存、本地测试脚本和合成测试数据不提交。`.gitignore` 已包含相应规则；提交前仍应检查暂存区文件清单和差异。
