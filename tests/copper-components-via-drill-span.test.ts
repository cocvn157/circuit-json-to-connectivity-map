import { expect, test } from "bun:test"
import type { AnyCircuitElement, LayerRef, PcbVia } from "circuit-json"
import { PcbConnectivityMap } from "../src"

const layers: LayerRef[] = [
  "top",
  "inner1",
  "inner2",
  "inner3",
  "inner4",
  "bottom",
]
const cases: { name: string; via: Partial<PcbVia>; expected: LayerRef[] }[] = [
  {
    name: "through-hole",
    via: { through_hole: true, layers: ["top", "bottom"] },
    expected: layers,
  },
  {
    name: "inferred through span",
    via: { layers: ["bottom", "top"] },
    expected: layers,
  },
  {
    name: "blind drill",
    via: {
      through_hole: false,
      topmost_drill_layer: "top",
      bottommost_drill_layer: "inner2",
      layers: ["top"],
    },
    expected: ["top", "inner1", "inner2"],
  },
  {
    name: "buried drill",
    via: {
      through_hole: false,
      topmost_drill_layer: "inner1",
      bottommost_drill_layer: "inner3",
      layers: ["inner1", "inner3"],
    },
    expected: ["inner1", "inner2", "inner3"],
  },
  {
    name: "legacy drill endpoints",
    via: {
      from_layer: "inner1",
      to_layer: "inner3",
      layers: ["inner1", "inner3"],
    },
    expected: ["inner1", "inner2", "inner3"],
  },
  {
    name: "inferred buried span",
    via: { layers: ["inner3", "inner1"] },
    expected: ["inner1", "inner2", "inner3"],
  },
]

for (const { name, via, expected } of cases) {
  test(`standalone ${name} contacts only copper within its drill span`, () => {
    const circuit: AnyCircuitElement[] = [
      {
        type: "pcb_board",
        pcb_board_id: "board",
        center: { x: 0, y: 0 },
        width: 10,
        height: 10,
        num_layers: 6,
        thickness: 1.6,
        material: "fr4",
      },
      ...layers.map(
        (layer): AnyCircuitElement => ({
          type: "pcb_copper_pour",
          pcb_copper_pour_id: `pour_${layer}`,
          source_net_id: "gnd",
          shape: "rect",
          center: { x: 0, y: 0 },
          width: 1,
          height: 1,
          layer,
          covered_with_solder_mask: false,
        }),
      ),
      {
        type: "pcb_via",
        pcb_via_id: "via",
        source_net_id: "gnd",
        x: 0,
        y: 0,
        outer_diameter: 0.6,
        hole_diameter: 0.3,
        layers: ["top", "bottom"],
        ...via,
      },
    ]
    const original = structuredClone(circuit)
    const map = new PcbConnectivityMap(circuit)
    for (const layer of layers) {
      expect(map.connMap.areIdsConnected("via", `pour_${layer}`)).toBe(
        expected.includes(layer),
      )
    }
    expect(circuit).toEqual(original)
  })
}

test("a route via uses the matching standalone barrel's full span and diameter", () => {
  const circuit: AnyCircuitElement[] = [
    {
      type: "pcb_board",
      pcb_board_id: "board",
      center: { x: 0, y: 0 },
      width: 10,
      height: 10,
      num_layers: 4,
      thickness: 1.6,
      material: "fr4",
    },
    {
      type: "pcb_copper_pour",
      pcb_copper_pour_id: "pour",
      source_net_id: "gnd",
      shape: "rect",
      center: { x: 0.25, y: 0 },
      width: 0.04,
      height: 0.04,
      layer: "inner2",
      covered_with_solder_mask: false,
    },
    {
      type: "pcb_via",
      pcb_via_id: "via",
      pcb_trace_id: "trace",
      source_net_id: "gnd",
      through_hole: true,
      x: 0,
      y: 0,
      outer_diameter: 0.6,
      hole_diameter: 0.3,
      layers: ["top", "bottom"],
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "trace",
      route: [
        {
          route_type: "via",
          x: 0,
          y: 0,
          from_layer: "top",
          to_layer: "inner1",
        },
      ],
    },
  ]
  const map = new PcbConnectivityMap(circuit)
  expect(map.connMap.areIdsConnected("trace", "pour")).toBe(true)
  expect(
    map
      .getCopperConductorComponents()
      .flat()
      .find((c) => c.traceId === "trace")?.layers,
  ).toEqual(["top", "inner1", "inner2", "bottom"])
})
