# 验证记录

## 本地修改复验（下方原始记录保留作历史）

- 删除目录外视频的确认回调、UI 弹窗和工作目录边界判定；保留真实路径解析、文件身份检查、大小预算与取消。
- `npm test`：101 项通过，覆盖无弹窗的并行外部读取、原始 ID 来源核验、未授权 marker 拒绝、协议 ID 配对和重复响应拒绝。
- `npm run typecheck`：使用本机 Pi 0.85.1 宿主依赖，通过完整类型检查。
- `npm run test:pi`：18 项通过。调用真实 Pi 0.85.1 Anthropic / Google 序列化器，在 `onPayload` 捕获后主动终止，未发送 HTTP。覆盖 Kimi、Gemini 3 带 ID、Gemini 2.5 无 ID 协议，同模型/切模型、普通/特殊字符/超长 ID。该检查需开发依赖；也加入了 CI 配置，但尚未在远端运行。
- ID 分层已修改：context 继续核验原始 call ID 与工具结果来源；协议层只消费 Pi 已序列化的 call/response 配对及已授权 marker，不读取引用中的原始 ID，不复制归一化规则。上述 18 种组合均附加成功，原始会话和助手签名数据不被改写。
- 异常 ID 仅为回归测试构造，不代表 Kimi 服务端实际返回该类 ID；测试通过不意味着服务端接受任意 ID。
- 本次仍未验证真实视频解码、Kimi/Gemini 服务端响应或 Pi TUI 实际交互。


日期：2026-09-09。版本：pi-read-video 0.1.0。

## 已执行

- `npm test`：**90 项通过，0 项失败，0 项跳过**。完整 TAP 输出在 `TEST-RESULTS.txt`。
- TypeScript 核心层严格检查：通过，包含 `strict`、`noUncheckedIndexedAccess`、未使用符号检查。检查范围为 `src`，不含依赖 Pi SDK 声明的 `pi-extension.ts`。
- 模拟 Pi 事件全链路：工具调用 → context 来源校验 → 请求注入；两种 provider 均通过，并在测试中禁止任何 `fetch` 或认证读取。
- 发布脚本安全测试：默认私有、账号匹配、既有仓库拒绝覆盖、上级 Git 仓库保护；这些是模拟命令测试。
- `npm pack --dry-run --ignore-scripts`：通过，包含插件入口和全部运行时源文件。

## 环境与限制

实际离线执行环境：Node.js 22.16.0、TypeScript 5.8.3；核心检查复用了环境已安装的 Node 类型声明 25.1.0。由于目标 Pi 0.85.1 的引擎要求，真实安装仍要求 Node.js >=22.19.0。CI 配置准备了 Node 22.19.0 和 24 的测试，但未在远端执行。

完整 `npm run typecheck` **尚未通过验证**：该环境没有 Pi、Pi TUI 与 TypeBox 的开发声明包；尝试访问 npm registry 返回 EAI_AGAIN。核心类型检查不能替代完整 SDK 类型检查。CI 中包含安装开发依赖后执行完整检查的独立任务。

未在真实 Pi TUI 进程中加载，也未调用真实 Kimi/Gemini API。单元测试使用合成容器头，只验证读取、编码、状态和请求结构，不验证 provider 视频解码、实际额度、真实限额或回答质量。

## GitHub 发布状态

已通过当前 GitHub 连接确认目标账号为 `astrosheep-zero`，查询目标仓库 `pi-read-video` 时返回 404。当前会话暴露的 GitHub 操作仅供读取，未提供创建仓库或推送文件操作；本地也没有 GitHub CLI 与发布凭据。

实际运行 `node scripts/publish.mjs` 在第一步退出：

```text
Cannot run gh: spawnSync gh ENOENT
```

因此**没有声称创建仓库或完成 push**。源码内保留了发布脚本，可在已有 GitHub CLI 登录的本机继续，默认创建私有仓库，不接收或存储 token。
