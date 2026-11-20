import { expect, rs, test } from "@rstest/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudioControls } from "./StudioControls";

test("StudioControls toggles tray with aria-expanded and aria-controls", async () => {
  const user = userEvent.setup();
  const onPaletteChange = rs.fn();
  const onMediumChange = rs.fn();
  const onReplayLettering = rs.fn();
  const onRedrawSkyline = rs.fn();

  render(
    <StudioControls
      palette="sumi"
      medium="marker"
      onPaletteChange={onPaletteChange}
      onMediumChange={onMediumChange}
      onReplayLettering={onReplayLettering}
      onRedrawSkyline={onRedrawSkyline}
    />,
  );

  const toggle = screen.getByRole("button", { name: "Studio" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("region", { name: "Look and feel controls" })).not.toBeInTheDocument();

  await user.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");

  const panel = screen.getByRole("region", { name: "Look and feel controls" });
  expect(toggle).toHaveAttribute("aria-controls", panel.id);

  await user.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("region", { name: "Look and feel controls" })).not.toBeInTheDocument();
});

test("StudioControls exposes accurate aria-pressed state and triggers callbacks", async () => {
  const user = userEvent.setup();
  const onPaletteChange = rs.fn();
  const onMediumChange = rs.fn();
  const onReplayLettering = rs.fn();
  const onRedrawSkyline = rs.fn();

  render(
    <StudioControls
      palette="twilight"
      medium="hatch"
      onPaletteChange={onPaletteChange}
      onMediumChange={onMediumChange}
      onReplayLettering={onReplayLettering}
      onRedrawSkyline={onRedrawSkyline}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Studio" }));

  expect(screen.getByRole("button", { name: "Sumi" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Twilight" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Nocturne" })).toHaveAttribute("aria-pressed", "false");

  expect(screen.getByRole("button", { name: "Marker" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Hatch" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Pencil" })).toHaveAttribute("aria-pressed", "false");

  await user.click(screen.getByRole("button", { name: "Nocturne" }));
  expect(onPaletteChange).toHaveBeenCalledWith("nocturne");

  await user.click(screen.getByRole("button", { name: "Pencil" }));
  expect(onMediumChange).toHaveBeenCalledWith("pencil");

  await user.click(screen.getByRole("button", { name: "Replay Shading" }));
  expect(onReplayLettering).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole("button", { name: "Redraw Skyline" }));
  expect(onRedrawSkyline).toHaveBeenCalledTimes(1);
});
