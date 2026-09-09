# 代码与抽象边界

## 请求链路

```text
Pi 交互 @路径
  → 模型决定调用 read_video
  → Pi 绑定层校验参数并桥接取消信号
  → VideoService 检查策略和路由
  → media 检查文件并读取一次
  → VideoStore 保存内存 base64，返回纯元数据引用
  → Pi 持久化普通文本工具结果与元数据
  → context 为当前请求核验工具结果来源
  → before_provider_request 调用纯协议变换
  → Pi 原有 provider 发送包含 inline 视频的请求
```

## 模块职责

| 模块 | 负责 | 不负责 |
| --- | --- | --- |
| `index.ts` | 从 Pi 取得宿主模块、Schema、文本渲染器 | 业务逻辑 |
| `pi-extension.ts` | Pi 事件、工具注册、启停、UI、取消信号桥接 | 编码协议、读认证 |
| `config.ts` / `jsonc.ts` | 把原始配置编译为布尔策略 | 保存 API key、实现 provider |
| `routes.ts` | 已实现的 provider/API/官方端点及客户端预算 | 推断未知模型能力 |
| `service.ts` | 一次读取用例、生命周期、上下文来源校验 | HTTP、具体视频 wire block |
| `media.ts` / `formats.ts` | 路径、文件身份、受限读取、容器头、base64 | 网络、TUI、转码 |
| `store.ts` / `references.ts` | 内存内容去重、引用、无字节的持久化表示 | 磁盘缓存、恢复时读文件 |
| `wire/kimi.ts` | Kimi tool_result 转换为 base64 video block | Gemini、文件 I/O |
| `wire/gemini.ts` | 保留 functionResponse 分组并追加 inlineData | Kimi、文件 I/O |
| `wire/index.ts` | 模型一致性检查及总请求预算 | 发送 HTTP 或读取认证 |

没有将 provider 差异泛化成用户必须配置的 adapter 框架。只有两个小型、独立、可测试的协议变换函数。新增协议必须同时具备明确路由、转换实现和测试，不能只添加一个模型名字。

## 数据生命周期与可信边界

`VideoReference` 只包含元数据，是唯一允许进入工具 `details.readVideo` 的类型。`InlineVideo` 带 base64，留在 `VideoStore`，只在发送前生成请求副本。没有 `any` 或把视频伪装为 `ImageContent` 的类型转换。

`context` 只为当前消息中的成功 `read_video` 工具结果建立可注入标记，核对 call ID 与本进程生成的引用。用户输入、普通 read 结果、伪造 details、错误结果都不能触发注入。**助手消息不改写**，避免破坏签名重放。

原始会话 call ID 只用于 context 层来源核验。`ResolveVideo` 只返回本次 context 已授权、路由匹配且仍在内存中的 marker。协议层不读取引用中的原始 call ID，也不实现 Pi 的 ID 归一化规则：它仅使用 Pi 已序列化的 ID 配对 call/response；旧版 Gemini 无 ID 时按已出现的 read_video 调用计数消费。协议编码器必须与此授权 resolver 一起使用，不能直接用未校验的全局缓存查询替代。

Kimi 转换器还要求前面确实存在对应的 `tool_use`，将 video 放进该调用的 `tool_result.content`。Gemini 转换器核对 function call/response 对应关系，不改 ID、不改 thought signature、不拆散并行 functionResponse 组，将媒体放进紧随其后的 user Content，而不是塞进 JSON output 字符串。

所有变换都返回副本，不把实际视频块写回 Pi 会话。即使配置在 context 检查后被关闭，请求层仍会重新检查启用状态。标记本身不是文件读取授权，重启后不会据此自动读盘。

## 有意保留的限制

文件读取前会检查单文件预算；请求重写后再检查包含全部上下文的序列化参数预算。超出后明确退化为“视频未提供”，绝不偷偷转为 Files API。日志或其他扩展在本插件之后再次改变请求的情况不由本插件控制。

文件编码排队，进程存储有上限，但总 RSS 还包括 Pi 自身、临时 Buffer、SDK 参数和序列化副本。96 MiB 是缓存中编码字符串的计数预算，不是整个进程的内存承诺。

同一 provider/端点内切换到另一个已启用视频的模型可以重用仍在内存中的内容；跨 provider/API/端点不重用。被清除或淘汰的引用需要模型再次调用工具。这是明确的内存生命周期选择，不实现自动恢复视频或隐式跨服务发送。
