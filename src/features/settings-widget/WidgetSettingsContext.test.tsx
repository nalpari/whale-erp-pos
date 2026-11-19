import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SoundPlayer } from "../../shared/sound/sound-player";
import { WidgetSettingsProvider } from "./WidgetSettingsContext";

describe("WidgetSettingsProvider", () => {
  beforeEach(() => localStorage.clear());

  it("저장된 알림음 크기를 재생기에 알린다", async () => {
    localStorage.setItem(
      "widgetSettings",
      JSON.stringify({
        showPreparing: true,
        showReady: true,
        position: "bottom-right",
        volume: 70,
      }),
    );
    const sound: SoundPlayer = {
      playNewOrder: vi.fn(),
      playWarning: vi.fn(),
      setVolume: vi.fn(),
    };
    render(
      <WidgetSettingsProvider sound={sound}>
        <div />
      </WidgetSettingsProvider>,
    );
    expect(sound.setVolume).toHaveBeenCalledWith(70);
  });
});
