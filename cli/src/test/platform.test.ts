import { describe, expect, test } from "bun:test";
import { detectPlatform, detectWslVersion } from "../lib/platform.js";

describe("detectPlatform", () => {
  test("returns a valid platform value", () => {
    const platform = detectPlatform();
    expect(["linux", "wsl", "macos"]).toContain(platform);
  });

  test("returns linux on a standard Linux host (no WSL env)", () => {
    // This test only makes sense when running on actual Linux (not WSL).
    // On WSL it will return "wsl" which is also correct.
    const platform = detectPlatform();
    if (!process.env.WSL_DISTRO_NAME) {
      if (process.platform === "linux") {
        expect(platform).toBe("linux");
      } else if (process.platform === "darwin") {
        expect(platform).toBe("macos");
      }
    } else {
      expect(platform).toBe("wsl");
    }
  });
});

describe("detectWslVersion", () => {
  test("returns null when platform is linux", () => {
    expect(detectWslVersion("linux")).toBeNull();
  });

  test("returns null when platform is macos", () => {
    expect(detectWslVersion("macos")).toBeNull();
  });

  test("returns 1 or 2 when platform is wsl", () => {
    // Only meaningful on actual WSL; on other platforms the /proc/version
    // check either fails or doesn't contain WSL markers, so we skip.
    if (detectPlatform() === "wsl") {
      const version = detectWslVersion("wsl");
      expect(version === 1 || version === 2).toBe(true);
    }
  });
});
