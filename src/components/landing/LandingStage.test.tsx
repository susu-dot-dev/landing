import { afterEach, expect, rs, test } from "@rstest/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { LandingStage } from "./LandingStage";
import type {
  CityscapeController,
  CityscapeFactory,
  LetteringController,
  LetteringFactory,
} from "./types";

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
});

test("LandingStage renders accessible structure, single h1, and aria-hidden canvases", () => {
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
});

test("LandingStage supports keyboard navigation, lettering replay, studio controls, and dialog pause/resume", async () => {
  const user = userEvent.setup();
  const mocks = createMockFactories();

  const { container } = render(
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

  // Tab to lettering replay button and activate via keyboard
  await user.tab();
  const replayButton = screen.getByRole("button", { name: "Replay susu.dev title shading" });
  expect(document.activeElement).toBe(replayButton);
  await user.keyboard("{Enter}");
  expect(lettering.replay).toHaveBeenCalledTimes(1);

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

  // Open Studio tray and switch palette, medium, and redraw skyline
  await user.click(screen.getByRole("button", { name: "Studio" }));
  await user.click(screen.getByRole("button", { name: "Nocturne" }));
  expect(container.querySelector(".landing-stage")).toHaveAttribute("data-palette", "nocturne");
  expect(cityscape.setPalette).toHaveBeenCalledWith("nocturne");
  expect(lettering.setPalette).toHaveBeenCalledWith("nocturne");

  await user.click(screen.getByRole("button", { name: "Pencil" }));
  expect(lettering.setMedium).toHaveBeenCalledWith("pencil");

  await user.click(screen.getByRole("button", { name: "Redraw Skyline" }));
  expect(cityscape.regenerate).toHaveBeenCalledTimes(1);

  // Pointer move forwards coordinates to cityscape
  fireEvent.pointerMove(window, { clientX: 240, clientY: 180 });
  expect(cityscape.handlePointerMove).toHaveBeenCalledWith(240, 180);
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
