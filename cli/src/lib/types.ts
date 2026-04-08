export type Platform = "linux" | "wsl" | "macos";

export type Status = "ok" | "warn" | "skip" | "fail";

export interface ModuleContext {
  username: string;
  userHome: string;
  platform: Platform;
  wslVersion: 1 | 2 | null;
  config: Record<string, unknown>;
}

export type ModuleEvent =
  | { type: "progress"; message: string; percent?: number }
  | { type: "result"; status: Status; detail: string }
  | { type: "check"; label: string; status: Status; detail?: string }
  | { type: "install"; tool: string; source: string; verified: boolean };

export interface ModuleResult {
  status: Status;
  detail: string;
}

export interface CheckItem {
  label: string;
  status: Status;
  detail?: string;
}
