import { expect, test } from "bun:test"
import { pcb_trace, type AnyCircuitElement, type PCBTrace } from "circuit-json"
import { PcbConnectivityMap } from "../src"

const makeTraces = (reverse: boolean, widening = false): PCBTrace[] => {
  const widths = widening ? [0.2, 1] : [1, 0.2]
  const route = [
    { route_type: "wire", x: 0, y: 0, width: widths[0], layer: "top" },
    { route_type: "wire", x: 10, y: 0, width: widths[1], layer: "top" },
  ]
  return [
    pcb_trace.parse({
      type: "pcb_trace",
      pcb_trace_id: "interpolated",
      source_trace_id: "source_ground",
      route_thickness_mode: "interpolated",
      route: reverse ? route.reverse() : route,
    }),
    pcb_trace.parse({
      type: "pcb_trace",
      pcb_trace_id: "neighbor",
      source_trace_id: "source_ground",
      route: [
        { route_type: "wire", x: 9, y: 0.4, width: 0.2, layer: "top" },
        { route_type: "wire", x: 10, y: 0.4, width: 0.2, layer: "top" },
      ],
    }),
  ]
}

const makeCircuit = (traces: PCBTrace[]): AnyCircuitElement[] => [
  {
    type: "source_trace",
    source_trace_id: "source_ground",
    connected_source_port_ids: [],
    connected_source_net_ids: ["gnd"],
  },
  {
    type: "pcb_copper_pour",
    pcb_copper_pour_id: "pour_a",
    source_net_id: "gnd",
    covered_with_solder_mask: false,
    shape: "rect",
    center: { x: 0, y: 0 },
    width: 0.2,
    height: 0.2,
    layer: "top",
  },
  {
    type: "pcb_copper_pour",
    pcb_copper_pour_id: "pour_b",
    source_net_id: "gnd",
    covered_with_solder_mask: false,
    shape: "rect",
    center: { x: 10, y: 0.4 },
    width: 0.2,
    height: 0.2,
    layer: "top",
  },
  ...traces,
]

for (const reverse of [false, true]) {
  for (const swapOrder of [false, true]) {
    test(`interpolated traces cannot join isolated pours (reverse=${reverse}, swap=${swapOrder})`, () => {
      const traces = makeTraces(reverse)
      if (swapOrder) traces.reverse()
      const map = new PcbConnectivityMap(makeCircuit(traces))
      const components = map.getCopperConductorComponents()
      const firstPour = components.find((group) =>
        group.some((c) => c.pourId === "pour_a"),
      )!
      expect(firstPour.some((c) => c.pourId === "pour_b")).toBe(false)
      expect(map.connMap.areIdsConnected("pour_a", "interpolated")).toBe(true)
      expect(map.connMap.areIdsConnected("pour_b", "neighbor")).toBe(true)
      expect(map.connMap.areIdsConnected("pour_a", "pour_b")).toBe(false)
      expect(map.areTracesConnected("interpolated", "neighbor")).toBe(false)
      expect(
        map
          .getAllTracesConnectedToTrace("interpolated")
          .map((t) => t.pcb_trace_id),
      ).toEqual(["interpolated"])
    })
  }

  test(`interpolated intersections use both endpoint widths without pours (reverse=${reverse})`, () => {
    const separated = makeTraces(reverse)
    const touching = makeTraces(reverse, true)
    expect(
      new PcbConnectivityMap(separated).areTracesConnected(
        "interpolated",
        "neighbor",
      ),
    ).toBe(false)
    expect(
      new PcbConnectivityMap(touching).areTracesConnected(
        "interpolated",
        "neighbor",
      ),
    ).toBe(true)
  })
}
