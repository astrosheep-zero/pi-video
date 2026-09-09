import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { registerReadVideo } from "./src/pi-extension.ts";
/** Pi supplies the host modules; the implementation has no runtime npm dependencies. */
export default function (pi: ExtensionAPI): void {
  registerReadVideo(pi, {
    agentDir: getAgentDir(),
    parameters: Type.Object({
      path: Type.String({
        minLength: 1,
        description: "Local video path, absolute or relative to the project. A leading @ is accepted.",
      }),
    }),
    renderText: (text) => new Text(text, 0, 0),
  });
}
