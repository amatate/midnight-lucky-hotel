import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CabinetPartArt, PART_ART_INDEX, RoomCrown } from "@/app/components/CabinetArtwork";
import { PartsBar } from "@/app/components/PartsBar";
import { createRun } from "@/core/run";
import type { RunState } from "@/core/types";

afterEach(cleanup);
const mixed: RunState = { ...createRun(8), service: "kitchen", phase: "READY_TO_SPIN",
  partSlots: [{ id: "harvest-vat", level: 2 }, { id: "votive-candle", level: 1 }, { id: "shock-absorber", level: 2 }, null, null],
  counters: { blankCharge: 0, cherryWinsThisShift: 0, harvestCharge: 2, votiveCharge: 3 } };

describe("physical cabinet presentation", () => {
  it("provides one distinct artwork per part and keeps cross-route installations visible", () => {
    expect(Object.keys(PART_ART_INDEX)).toHaveLength(19);
    expect(new Set(Object.values(PART_ART_INDEX)).size).toBe(19);
    const before = structuredClone(mixed);
    const { container } = render(<PartsBar state={mixed} />);
    expect(screen.getAllByTestId("part-slot")).toHaveLength(5);
    expect([...container.querySelectorAll("[data-part-art]")].map((el) => el.getAttribute("data-part-art")))
      .toEqual(["harvest-vat", "votive-candle", "shock-absorber"]);
    expect(container.querySelector('[data-part-readout="harvest-vat"]')).toHaveTextContent("2/3");
    expect(container.querySelector('[data-part-readout="votive-candle"]')).toHaveTextContent("3/3");
    expect(container.querySelector('[data-part-readout="shock-absorber"]')).toHaveTextContent("保护 2");
    expect(mixed).toEqual(before);
  });
  it("withholds committed charge changes during playback and dims only revealed damage", () => {
    const state: RunState = { ...mixed, phase: "RESOLVING_EFFECTS",
      counters: { ...mixed.counters, harvestCharge: 0, votiveCharge: 0 },
      pendingEvents: [{ sequence: 2, type: "PART_DISABLED", partId: "votive-candle", slot: 1 }] };
    const { container, rerender } = render(<PartsBar state={state} presentedThroughSequence={null} />);
    expect(container.querySelector('[data-part-readout="harvest-vat"]')).toHaveTextContent("结算中");
    expect(container.querySelector('[data-part-readout="votive-candle"]')).not.toHaveTextContent("0/3");
    expect(screen.getAllByTestId("part-slot")[1]).not.toHaveAttribute("data-disabled");
    rerender(<PartsBar state={state} presentedThroughSequence={2} />);
    expect(screen.getAllByTestId("part-slot")[1]).toHaveAttribute("data-disabled", "true");
    rerender(<PartsBar state={{ ...state, phase: "READY_TO_SPIN", pendingEvents: [] }} />);
    expect(container.querySelector('[data-part-readout="votive-candle"]')).toHaveTextContent("0/3");
  });
  it("falls back to native glyphs when the atlas fails without removing the help action", () => {
    const { container } = render(<CabinetPartArt id="jam-jar" fallback={<span>fallback</span>} />);
    const art = container.querySelector("[data-part-art]")!;
    fireEvent.load(container.querySelector("image")!);
    expect(art).toHaveAttribute("data-art-ready", "true");
    fireEvent.error(container.querySelector("image")!);
    expect(art).toHaveAttribute("data-art-ready", "false");
    expect(screen.getByText("fallback")).toBeInTheDocument();
  });
  it("uses independent clipping identifiers when several room crowns are mounted", () => {
    const { container } = render(<><RoomCrown tier={1} /><RoomCrown tier={1} /><RoomCrown tier={6} /></>);
    const ids = [...container.querySelectorAll("clipPath")].map((el) => el.id);
    expect(new Set(ids).size).toBe(3);
    expect(container.querySelectorAll('[data-room-crown="6"]')).toHaveLength(1);
  });
});
