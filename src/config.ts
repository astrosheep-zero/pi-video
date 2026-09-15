import { readFile } from "node:fs/promises";
import { parseJsonc } from "./jsonc.ts";
import { isRecord, type ModelIdentity } from "./types.ts";
/** Compiled policy deliberately discards API keys and all unrelated model settings. */
export class VideoPolicy {
  private readonly models = new Map<string, boolean>();
  private readonly overrides = new Map<string, boolean>();
  static parse(source: string): VideoPolicy {
    const value = parseJsonc(source);
    if (!isRecord(value) || (value.providers !== undefined && !isRecord(value.providers))) {
      throw new Error("models.json must have an object-valued providers field");
    }
    const policy = new VideoPolicy();
    for (const [name, provider] of Object.entries(value.providers ?? {})) {
      if (!isRecord(provider))
        throw new Error(`Invalid provider: ${name}`);
      if (provider.video !== undefined) {
        throw new Error(`${name}.video is not supported; set video on a model or modelOverride`);
      }
      if (provider.models !== undefined && !Array.isArray(provider.models)) {
        throw new Error(`${name}.models must be an array`);
      }
      for (const model of (provider.models ?? []) as unknown[]) {
        if (!isRecord(model) || typeof model.id !== "string" || model.id.length === 0) {
          throw new Error(`${name}.models contains a model without an id`);
        }
        policy.setFlag(policy.models, `${name}/${model.id}`, model.video);
      }
      if (provider.modelOverrides !== undefined && !isRecord(provider.modelOverrides)) {
        throw new Error(`${name}.modelOverrides must be an object`);
      }
      for (const [id, override] of Object.entries(provider.modelOverrides ?? {})) {
        if (!isRecord(override))
          throw new Error(`Invalid override: ${name}/${id}`);
        policy.setFlag(policy.overrides, `${name}/${id}`, override.video);
      }
    }
    return policy;
  }
  private setFlag(target: Map<string, boolean>, key: string, value: unknown): void {
    if (value === undefined)
      return;
    if (typeof value !== "boolean")
      throw new Error(`${key}.video must be true or false`);
    target.set(key, value);
  }
  /** Explicit model override > model definition > disabled. */
  enabled(model: ModelIdentity | undefined): boolean {
    if (!model)
      return false;
    const key = `${model.provider}/${model.id}`;
    return this.overrides.get(key) ?? this.models.get(key) ?? false;
  }
}
export async function loadVideoPolicy(path: string): Promise<VideoPolicy> {
  try {
    return VideoPolicy.parse(await readFile(path, "utf8"));
  }
  catch (error) {
    if (isRecord(error) && error.code === "ENOENT")
      return new VideoPolicy();
    throw error;
  }
}
