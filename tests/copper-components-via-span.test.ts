import { expect, test } from "bun:test"
import { PcbConnectivityMap } from "../src"
import {
  getPourPortIds,
  makeCopperPourCircuit,
} from "./fixtures/copper-pour-circuit"

test("a route via spans inner copper layers when no standalone via exists", () => {
  const circuitJson = makeCopperPourCircuit()
  const pad = circuitJson.find(
    (e) => e.type === "pcb_smtpad" && e.pcb_port_id === "port_1",
  )!
  if (pad.type !== "pcb_smtpad") throw new Error("Expected a pad")
  pad.layer = "inner1"
  circuitJson.push(
    {
      type: "pcb_board",
      pcb_board_id: "board",
      center: { x: 0, y: 0 },
      width: 16,
      height: 10,
      num_layers: 4,
      thickness: 1.6,
      material: "fr4",
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "via_bridge",
      source_trace_id: "source_trace_1",
      route: [
        {
          route_type: "via",
          x: 0,
          y: 0,
          from_layer: "bottom",
          to_layer: "top",
          outer_diameter: 0.6,
          hole_diameter: 0.3,
        },
      ],
    },
  )
  const map = new PcbConnectivityMap(circuitJson)
  expect(getPourPortIds(map.getCopperConductorComponents())).toEqual([
    "port_0",
    "port_1",
  ])
  expect(
    map
      .getAllTracesConnectedToPort("port_0")
      .map((trace) => trace.pcb_trace_id),
  ).toEqual(["via_bridge"])
})
