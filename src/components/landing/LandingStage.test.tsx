import { afterEach, expect, rs, test } from "@rstest/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import {
  LandingStage,
  pickNextPalette,
  pickRandomTitle,
  resolveInitialPalette,
  TITLE_VARIANTS,
} from "./LandingStage";
import type {
  CityscapeController,
  CityscapeFactory,
  LetteringController,
  LetteringFactory,
} from "./types";

rs.mock("@/lib/login", () => ({
  login: rs.fn(async () => ({ ok: false, code: "cancelled" })),
}));

interface MockControllers {
  cityscapes: Array<
    CityscapeController & { [K in keyof CityscapeController]: ReturnType<typeof rs.fn> }
  >;
  letterings: Array<
    LetteringController & { [K in keyof LetteringController]: ReturnType<typeof rs.fn> }
  >;
  createCityscape: CityscapeFactory;
  createLettering: LetteringFactory;
}

function createMockFactories(): MockControllers {
  const cityscapes: MockControllers["cityscapes"] = [];
  const letterings: MockControllers["letterings"] = [];

  const createCityscape: CityscapeFactory = () => {
    const controller = {
      setPalette: rs.fn(),
      regenerate: rs.fn(),
      setReducedMotion: rs.fn(),
      setPaused: rs.fn(),
      handlePointerMove: rs.fn(),
      resize: rs.fn(),
      dispose: rs.fn(),
    };
    cityscapes.push(controller);
    return controller;
  };

  const createLettering: LetteringFactory = () => {
    const controller = {
      setPalette: rs.fn(),
      setMedium: rs.fn(),
      setText: rs.fn(),
      setReducedMotion: rs.fn(),
      replay: rs.fn(),
      resize: rs.fn(),
      dispose: rs.fn(),
    };
    letterings.push(controller);
    return controller;
  };

  return { cityscapes, letterings, createCityscape, createLettering };
}

interface MockMediaQueryController {
  dispatchChange: (matches: boolean) => void;
  restore: () => void;
}

function mockReducedMotion(initialMatches: boolean): MockMediaQueryController {
  const originalMatchMedia = window.matchMedia;
  let currentMatches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  window.matchMedia = rs.fn((query: string) => ({
    get matches() {
      return currentMatches;
    },
    media: query,
    onchange: null,
    addListener: rs.fn(),
    removeListener: rs.fn(),
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      if (typeof listener === "function") {
        listeners.add(listener as (event: MediaQueryListEvent) => void);
      }
    },
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      if (typeof listener === "function") {
        listeners.delete(listener as (event: MediaQueryListEvent) => void);
      }
    },
    dispatchEvent: rs.fn(() => true),
  })) as unknown as typeof window.matchMedia;

  return {
    dispatchChange: (matches: boolean) => {
      currentMatches = matches;
      const event = { matches, media: "(prefers-reduced-motion: reduce)" } as MediaQueryListEvent;
      for (const listener of listeners) {
        listener(event);
      }
    },
    restore: () => {
      window.matchMedia = originalMatchMedia;
    },
  };
}

let restoreMediaQuery: (() => void) | null = null;

afterEach(() => {
  restoreMediaQuery?.();
  restoreMediaQuery = null;
  delete document.documentElement.dataset.palette;
  window.sessionStorage.clear();
  rs.useRealTimers();
});

test("LandingStage renders accessible structure, single h1, aria-hidden canvases, and no Studio pill", () => {
  const mocks = createMockFactories();
  const { container } = render(
    <LandingStage
      createCityscape={mocks.createCityscape}
      createLettering={mocks.createLettering}
    />,
  );

  const headings = screen.getAllByRole("heading", { level: 1 });
  expect(headings).toHaveLength(1);
  expect(headings[0]).toHaveTextContent("susu.dev");

  const canvases = container.querySelectorAll("canvas");
  expect(canvases).toHaveLength(2);
  for (const canvas of canvases) {
    expect(canvas).toHaveAttribute("aria-hidden", "true");
  }

  expect(screen.queryByRole("button", { name: "Studio" })).not.toBeInTheDocument();
});

test("pickRandomTitle maps rand() onto every title variant and never overflows", () => {
  expect(pickRandomTitle(() => 0)).toBe("susu.dev");
  expect(pickRandomTitle(() => 0.5)).toBe("すす.dev");
  expect(pickRandomTitle(() => 0.99)).toBe("小小.dev");
  expect(pickRandomTitle(() => 1)).toBe("小小.dev");
  // Excluding the current title never returns it
  expect(pickRandomTitle(() => 0, "susu.dev")).toBe("すす.dev");
  expect(pickRandomTitle(() => 0.99, "susu.dev")).toBe("小小.dev");
  expect(pickRandomTitle(() => 0.5, "小小.dev")).toBe("すす.dev");
});

test("pickNextPalette cycles randomly without repeating the previous palette and handles storage errors", () => {
  const randomPick = pickNextPalette();
  expect(["sumi", "twilight", "nocturne"]).toContain(randomPick);
  window.sessionStorage.clear();

  const first = pickNextPalette(() => 0);
  expect(first).toBe("sumi");

  const second = pickNextPalette(() => 0);
  expect(second).toBe("twilight");

  const third = pickNextPalette(() => 0.99);
  expect(third).toBe("nocturne");

  // Out-of-bounds random falls back safely to "sumi"
  expect(pickNextPalette(() => 2)).toBe("sumi");

  // Handles sessionStorage throwing (e.g. restricted privacy contexts)
  const origStorage = window.sessionStorage;
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    get() {
      throw new Error("storage blocked");
    },
  });
  try {
    expect(pickNextPalette(() => 0.5)).toBe("twilight");
  } finally {
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: origStorage,
    });
  }
});

test("resolveInitialPalette honors explicit prop, then boot dataset, then pickNextPalette", () => {
  expect(resolveInitialPalette("nocturne")).toBe("nocturne");

  document.documentElement.dataset.palette = "twilight";
  expect(resolveInitialPalette()).toBe("twilight");
  expect(document.documentElement.dataset.palette).toBeUndefined();

  document.documentElement.dataset.palette = "invalid";
  expect(resolveInitialPalette(undefined, () => 0)).toBe("sumi");
});

test("LandingStage supports keyboard navigation, lettering replay, and dialog pause/resume", async () => {
  const user = userEvent.setup();
  const mocks = createMockFactories();

  render(
    <LandingStage
      createCityscape={mocks.createCityscape}
      createLettering={mocks.createLettering}
      initialPalette="sumi"
    />,
  );

  const cityscape = mocks.cityscapes[0];
  const lettering = mocks.letterings[0];
  if (!cityscape || !lettering) {
    throw new Error("Expected controllers to be created");
  }

  // Tab to lettering replay button and activate via keyboard
  await user.tab();
  const replayButton = screen.getByRole("button", { name: "Replay susu.dev title shading" });
  expect(document.activeElement).toBe(replayButton);
  await user.keyboard("{Enter}");
  expect(lettering.setText).toHaveBeenCalledTimes(1);
  // First click leaves the initial "susu.dev" for a different variant
  expect(lettering.setText.mock.calls[0]?.[0]).not.toBe("susu.dev");
  expect(TITLE_VARIANTS).toContain(lettering.setText.mock.calls[0]?.[0]);
  await user.click(replayButton);
  expect(lettering.setText).toHaveBeenCalledTimes(2);
  expect(lettering.setText.mock.calls[1]?.[0]).not.toBe(lettering.setText.mock.calls[0]?.[0]);

  // Tab to Log in button and activate with Space
  await user.tab();
  const loginButton = screen.getByRole("button", { name: "Log in" });
  expect(document.activeElement).toBe(loginButton);
  await user.keyboard(" ");

  expect(screen.getByRole("dialog", { name: "Sign in to susu.dev" })).toBeInTheDocument();
  expect(cityscape.setPaused).toHaveBeenLastCalledWith(true);

  // Escape closes dialog, restores focus to Log in button, and unpauses cityscape
  const dialog = screen.getByRole("dialog", { name: "Sign in to susu.dev" });
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(document.activeElement).toBe(loginButton);
  expect(cityscape.setPaused).toHaveBeenLastCalledWith(false);

  // Pointer move forwards coordinates to cityscape
  fireEvent.pointerMove(window, { clientX: 240, clientY: 180 });
  expect(cityscape.handlePointerMove).toHaveBeenCalledWith(240, 180);
});

test("LandingStage automatically redraws skyline every 30s unless paused, hidden, or reduced-motion", () => {
  rs.useFakeTimers();
  const mq = mockReducedMotion(false);
  restoreMediaQuery = mq.restore;

  const mocks = createMockFactories();
  const { unmount } = render(
    <LandingStage
      createCityscape={mocks.createCityscape}
      createLettering={mocks.createLettering}
      initialPalette="sumi"
    />,
  );

  const cityscape = mocks.cityscapes[0];
  const lettering = mocks.letterings[0];
  if (!cityscape || !lettering) {
    throw new Error("Expected controllers");
  }

  // Fires automatically after 30 seconds, and swaps the title variant with it
  expect(lettering.setText).not.toHaveBeenCalled();
  act(() => {
    rs.advanceTimersByTime(30_000);
  });
  expect(cityscape.regenerate).toHaveBeenCalledTimes(1);
  expect(lettering.setText).toHaveBeenCalledTimes(1);
  expect(TITLE_VARIANTS).toContain(lettering.setText.mock.calls[0]?.[0]);

  // Skips redraw while reduced motion is active
  act(() => {
    mq.dispatchChange(true);
    rs.advanceTimersByTime(30_000);
  });
  expect(cityscape.regenerate).toHaveBeenCalledTimes(1);
  expect(lettering.setText).toHaveBeenCalledTimes(1);

  // Resumes redraw when reduced motion turns off
  act(() => {
    mq.dispatchChange(false);
    rs.advanceTimersByTime(30_000);
  });
  expect(cityscape.regenerate).toHaveBeenCalledTimes(2);

  // Unmount clears the interval (no leaks)
  unmount();
  act(() => {
    rs.advanceTimersByTime(60_000);
  });
  expect(cityscape.regenerate).toHaveBeenCalledTimes(2);
});

test("LandingStage forwards live prefers-reduced-motion changes to both controllers", () => {
  const mq = mockReducedMotion(false);
  restoreMediaQuery = mq.restore;

  const mocks = createMockFactories();
  render(
    <LandingStage
      createCityscape={mocks.createCityscape}
      createLettering={mocks.createLettering}
    />,
  );

  const cityscape = mocks.cityscapes[0];
  const lettering = mocks.letterings[0];
  if (!cityscape || !lettering) {
    throw new Error("Expected controllers to be created");
  }

  act(() => {
    mq.dispatchChange(true);
  });
  expect(cityscape.setReducedMotion).toHaveBeenCalledWith(true);
  expect(lettering.setReducedMotion).toHaveBeenCalledWith(true);

  act(() => {
    mq.dispatchChange(false);
  });
  expect(cityscape.setReducedMotion).toHaveBeenCalledWith(false);
  expect(lettering.setReducedMotion).toHaveBeenCalledWith(false);
});

test("LandingStage disposes every controller instance cleanly under React.StrictMode", () => {
  const mocks = createMockFactories();
  const { unmount } = render(
    <StrictMode>
      <LandingStage
        createCityscape={mocks.createCityscape}
        createLettering={mocks.createLettering}
      />
    </StrictMode>,
  );

  expect(mocks.cityscapes.length).toBeGreaterThanOrEqual(1);
  expect(mocks.letterings.length).toBeGreaterThanOrEqual(1);

  unmount();

  for (const controller of mocks.cityscapes) {
    expect(controller.dispose).toHaveBeenCalledTimes(1);
  }
  for (const controller of mocks.letterings) {
    expect(controller.dispose).toHaveBeenCalledTimes(1);
  }
});

test("LandingStage resizes controllers via ResizeObserver and falls back to window resize", () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  const observerState: { callback: ResizeObserverCallback | null } = { callback: null };
  const disconnect = rs.fn();
  const observe = rs.fn();

  class MockResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      observerState.callback = callback;
    }
    observe = observe;
    unobserve = rs.fn();
    disconnect = disconnect;
  }

  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

  try {
    const mocks = createMockFactories();
    const { unmount } = render(
      <LandingStage
        createCityscape={mocks.createCityscape}
        createLettering={mocks.createLettering}
        initialPalette="twilight"
        initialMedium="hatch"
      />,
    );

    expect(observe).toHaveBeenCalledTimes(1);
    observerState.callback?.([], {} as ResizeObserver);
    expect(mocks.cityscapes[0]?.resize).toHaveBeenCalledTimes(1);
    expect(mocks.letterings[0]?.resize).toHaveBeenCalledTimes(1);

    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);

    // Fallback when ResizeObserver is unavailable
    // @ts-expect-error testing missing global ResizeObserver
    globalThis.ResizeObserver = undefined;
    const fallbackMocks = createMockFactories();
    const fallbackRender = render(
      <LandingStage
        createCityscape={fallbackMocks.createCityscape}
        createLettering={fallbackMocks.createLettering}
      />,
    );

    fireEvent(window, new Event("resize"));
    expect(fallbackMocks.cityscapes[0]?.resize).toHaveBeenCalledTimes(1);
    expect(fallbackMocks.letterings[0]?.resize).toHaveBeenCalledTimes(1);

    fallbackRender.unmount();
  } finally {
    globalThis.ResizeObserver = originalResizeObserver;
  }
});

test("LandingStage renders safely when no engine factories are provided", () => {
  render(<LandingStage />);
  expect(screen.getByRole("heading", { level: 1, name: "susu.dev" })).toBeInTheDocument();
});
