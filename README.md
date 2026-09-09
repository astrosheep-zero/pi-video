# pi-read-video

让 Pi 的当前模型自己调用 `read_video` 看本地视频。**Kimi 和 Gemini 都使用 inline，完全不调用 Files API。**

```text
@recordings/bug.mp4 看看第 13 秒之后按钮为什么消失，结合项目代码找原因。
```

没有 `/video` 命令，不拦截 `@`，不调用第二个模型生成视频摘要。配置只用 `video: true`。

## 安装

推荐通过 npm 安装到 Pi：

```bash
pi install npm:pi-read-video
```

当前 Pi 会话需要 `/reload`，新会话会自动加载。仍需按下文配置 `video: true`。

也可手动解压，把整个 `pi-read-video` 目录放到：

```text
~/.pi/agent/extensions/pi-read-video/
```

手动安装入口应为 `~/.pi/agent/extensions/pi-read-video/index.ts`。npm 版不要与手动安装版或旧的 `pi-video` 扩展同时加载，它们都会注册 `read_video`；切换安装方式前请将旧目录移出 extensions。

在 Pi 中执行 `/reload`。安装使用不需要先运行 `npm install` 或编译：Pi 提供入口使用的宿主模块，并加载 TypeScript 文件。

本版对齐 `@earendil-works/pi-coding-agent` 0.85.1 的扩展接口。实际运行请满足 Pi 的 Node.js 要求，至少 22.19.0。旧 `@mariozechner/*` 包名、改版宿主尚未验证。

## 配置

将下面内容**合并到**已有的 `~/.pi/agent/models.json`，不要覆盖其他 provider、模型和认证配置。使用自定义 agent 目录时，插件通过 Pi 的 `getAgentDir()` 获取同一个目录。

```json
{
  "providers": {
    "kimi-coding": {
      "modelOverrides": {
        "kimi-for-coding": { "video": true },
        "k3": { "video": true },
        "k3-256k": { "video": false }
      }
    },
    "google": {
      "baseUrl": "https://generativelanguage.googleapis.com",
      "video": true
    }
  }
}
```

**`video` 是本插件读取的自定义布尔字段，不是 Pi 原生字段。** 不添加 `adapter`、`capabilities` 或 `x-video`；也不要向 Pi 的 `input` 数组添加 `video`。

优先级：`modelOverrides[id].video` > `models[]` 中对应模型的 `video` > provider 的 `video` > `false`。例如某个 Gemini 模型可以单独设 `false`。`true` 只是允许工具，不会给不支持视频的模型增加能力。

当前 Pi 对 provider 配置还要求至少有一个它认识的有效设置。因此示例的 Google provider 同时给出了官方 `baseUrl`；不要新建一个只有 `"video": true` 的 provider 对象。已有有效 provider 直接增加 `video` 即可。

插件在启动、`/reload` 和每个用户回合开始时重新读取 JSONC。配置损坏时默认禁用，不继续沿用旧的启用状态。模型切换时只调整 `read_video`，不改变其他工具。

## 支持范围

| Pi provider / API | 注入的格式 |
| --- | --- |
| `kimi-coding` / `anthropic-messages`，官方 Coding 端点 | `type: "video"`，`source.type: "base64"` |
| `google` / `google-generative-ai`，官方 Gemini Developer API | `inlineData: { mimeType, data }` |

Kimi 的 video block 是其 Anthropic **兼容端点的扩展**，不代表 Claude API 支持视频。本版没有启用 Vertex、Gemini CLI OAuth、第三方代理或 OpenAI-compatible 路由。即使配置 `video: true`，未实现的路由仍不会启用工具。

身份认证、HTTP 发送、流式输出和服务端重试都交给 Pi。插件自己不读取 key，不构造上传请求，不保存远端 file ID。

## 工作方式与边界

用户在 **Pi 交互输入框**中用 `@` 选择视频。模型看到路径后，根据任务调用 `read_video({"path":"..."})`。插件验证并读取本地文件，在内存中编码 base64，通过 `before_provider_request` 将真实的工具结果转换为相应协议的视频输入。

`@` 不会强制调用工具，也不会在用户刚输入路径时自动发送视频。要看画面，需要模型调用 `read_video`。普通 `read` 误读视频时会被阻止，并收到改用 `read_video` 的提示。

**不要把交互引用和启动参数 `pi @clip.mp4` 混用。** 后者会先经过 Pi 自己的 CLI 文件处理，本插件不接管这个步骤。本版支持先启动 Pi，再在输入框引用视频。

视频扩展名及容器头检查支持 MP4、MOV、WebM、MKV、AVI、MPEG、FLV、3GP，但不负责验证编解码器、时长或音轨理解能力，最终以 provider 解码结果为准。没有 FFmpeg 依赖，也不自动抽帧、转码或裁剪。

## 隐私、会话与大小限制

Inline 仍会将视频内容发送给当前模型服务，只是不经过独立 Files API。不要把它理解为本地推理或零留存承诺。

会话只保存路径、文件名、MIME、大小、哈希和引用标记；**不保存 base64**。进程内媒体存储按内容去重，有 96 MiB 编码字符串预算和 256 条引用上限。只串行执行文件编码，避免并行工具调用同时分配多个完整文件缓冲区。

`/reload`、恢复会话、分叉、新会话和树导航后，不会从历史路径静默重新读取文件。内存引用不可用时会明确告诉模型，需要再次调用 `read_video`。切换 provider 不会自动把另一 provider 的视频发过去。

显式调用 `read_video(path)` 即读取该本地视频，不按工作目录内外弹窗确认，非交互模式也可读取上传目录等外部路径。模型可通过此工具读取当前进程有权限访问的视频文件；文件字节仍仅在已启用的受支持模型请求中发送。读取使用同一个文件描述符并核对文件身份及大小，防止检查后文件被替换。视频中的文字是待分析数据，不是新的指令。

| 路由 | 单文件原始大小预算 | 序列化请求参数预算 |
| --- | ---: | ---: |
| Kimi | 35 MiB | 50,000,000 bytes |
| Gemini | 14 MiB | 20,000,000 bytes |

这些是**本插件的保守客户端预算**，不是 API 硬上限声明。完整请求检查会计入 base64、历史内容和其他请求参数；Google SDK 随后仍会进行自己的 HTTP 序列化。原始文件小于上限并不保证整个请求能装下，也不保证不超过模型 token 上下文。

超出预算时，本插件不注入这次的视频，通知用户并在工具结果中说明原因；不会自动上传作为兜底。应缩短上下文或自行裁剪视频。重复引用同一内容在一次请求内只附加一次；不同回合仍可能重复携带 inline 视频并产生相应流量和模型用量。

本插件不会记录原始请求，但其他调试扩展或 SDK 日志仍可能记录包含视频的请求体。

## 开发与验证

```bash
# 离线单元测试与模拟 Pi 宿主测试，无需真实 key，也不发 API 请求
npm test

# 完整的宿主类型检查需要先安装开发依赖
npm install --ignore-scripts
npm run typecheck

# 真实 Pi Anthropic / Google 序列化链检查；在发送前截断，不发 HTTP
npm run test:pi
```

测试使用合成容器头，不冒充真实视频解码或端到端验证。详细结果及未验证项见 [docs/VERIFICATION.md](docs/VERIFICATION.md)。模块职责见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，接口依据见 [docs/SOURCES.md](docs/SOURCES.md)。

## 发布到 GitHub

目标仓库为 `astrosheep-zero/pi-read-video`。下面的脚本仅用于首次创建仓库，仓库已经存在时会拒绝执行。

在已安装 GitHub CLI、登录 `astrosheep-zero` 并配置 Git 提交身份的本机执行：

```bash
node scripts/publish.mjs
```

脚本先验证账号、运行测试，然后创建并推送 `astrosheep-zero/pi-read-video`，默认私有。只有明确传入 `--public` 才会公开。它不接收 token 参数，不修改已有 origin，不覆盖已存在的仓库，也不向上级 Git 仓库添加文件。

提交前可先检查 `git diff --cached`；需要后续更新时使用正常的 Git 提交与推送流程，而非重复执行首次发布脚本。
