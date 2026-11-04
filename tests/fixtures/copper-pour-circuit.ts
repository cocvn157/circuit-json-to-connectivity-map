import type { AnyCircuitElement, PcbCopperPourRect } from "circuit-json"
import type { CopperConductor } from "../../src"

export const makeCopperPourCircuit = (): AnyCircuitElement[] => [
  {
    type: "pcb_copper_pour",
    pcb_copper_pour_id: "pour_gnd",
    source_net_id: "gnd",
    covered_with_solder_mask: false,
    shape: "rect",
    center: { x: -2, y: 0 },
    width: 8,
    height: 4,
    layer: "top",
  } satisfies PcbCopperPourRect,
  ...[-4, 0, 4].flatMap((x, index): AnyCircuitElement[] => [
    {
      type: "source_trace",
      source_trace_id: `source_trace_${index}`,
      connected_source_port_ids: [`source_port_${index}`],
      connected_source_net_ids: ["gnd"],
    },
    {
      type: "pcb_port",
      pcb_port_id: `port_${index}`,
      source_port_id: `source_port_${index}`,
      x,
      y: 0,
      layers: ["top"],
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: `pad_${index}`,
      pcb_port_id: `port_${index}`,
      shape: "circle",
      x,
      y: 0,
      radius: 0.5,
      layer: "top",
    },
  ]),
]

export const getPourPortIds = (components: CopperConductor[][]) =>
  components
    .find((conductors) =>
      conductors.some((conductor) => conductor.pourId === "pour_gnd"),
    )!
    .flatMap((conductor) => conductor.pcbPortIds ?? [])
    .sort()
