# 接口依据

核对日期：2026-09-09。这些资料用于确认接口形状，不等于真实账号端到端验证。

## Pi

- [扩展文档](https://pi.dev/docs/latest/extensions)：`registerTool`、`context`、`before_provider_request`、`model_select` 与会话生命周期。
- [模型文档](https://pi.dev/docs/latest/models)：原生 `input` 字段与 `modelOverrides`。
- [包定义](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/package.json)：查阅时为 0.85.1，Node 引擎要求为 `>=22.19.0`。
- [扩展类型](https://github.com/earendil-works/pi/blob/be26e32704f7cab048e2b356206350ef7ad65999/packages/coding-agent/src/core/extensions/types.ts)：工具执行与渲染接口。
- [模型配置](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/model-config.ts)：`video` 不是原生字段。插件自行读取原始 JSONC，不假定该字段会出现在运行时 Model。
- [Google 参数构造](https://github.com/earendil-works/pi/blob/main/packages/ai/src/api/google-generative-ai.ts)：`onPayload` 位于 `GenerateContentParameters` 构造后、SDK 调用前。
- [Google 消息转换](https://github.com/earendil-works/pi/blob/main/packages/ai/src/api/google-shared.ts)：工具结果位于 `functionResponse.response.output`，并行响应分组，Google tool-call ID 归一化。
- [Kimi provider](https://github.com/earendil-works/pi/blob/main/packages/ai/src/providers/kimi-coding.ts)：`kimi-coding` 使用 Anthropic-compatible API。
- [CLI 文件处理](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/cli/file-processor.ts)：启动时 `@file` 与交互编辑器文件引用的处理不同。

## Kimi

- [Anthropic 协议转换](https://github.com/MoonshotAI/kimi-code/blob/main/packages/agent-core-v2/src/human/llm/requester/bases/anthropic/lower.ts)：`video`、`source.type = base64`、`media_type`、`data`；video 可在工具结果内。
- [inline 视频构造](https://github.com/MoonshotAI/kimi-code/blob/main/packages/agent-core-v2/src/agent/media/videoUpload.ts)：本地视频 data URL 与协议选择。
- [官方 Hermes 集成文档](https://www.kimi.com/code/docs/third-party-tools/hermes.html)：说明可直接发送 base64 视频；其中约 50 MB 是 Hermes 客户端上限，不是 Kimi API 上限。
- [模型文档](https://www.kimi.com/code/docs/kimi-code/models.html)：模型能力与 `k3-256k` 的视频限制。

## Gemini

- [GenerateContent 视频理解文档](https://ai.google.dev/gemini-api/docs/generate-content/video-understanding)：inlineData 视频示例与约 20 MB 总请求建议。
- [GenerateContent API](https://ai.google.dev/api/generate-content)：Content / Part / inlineData。
- [通用视频文档](https://ai.google.dev/gemini-api/docs/video-understanding)：页面还描述更新的 Interactions 路径及不同输入体积建议。本插件使用 Pi 当前的 GenerateContent 参数接口，保留独立的保守客户端预算，不把不同 API 文档的限额混为一谈。

## CI

GitHub Actions 固定在查阅时 v4 标签指向的 commit：checkout `11d5960a326750d5838078e36cf38b85af677262`；setup-node `49933ea5288caeca8642d1e84afbd3f7d6820020`。仓库未发布前，CI 仅是随附配置，不能称为已通过远端检查。
