import { expect, test } from "bun:test"
import { pcb_trace, pcb_via, type PCBTrace } from "circuit-json"
import { PcbConnectivityMap } from "../src"
import { makeCopperPourCircuit } from "./fixtures/copper-pour-circuit"

test("standalone through-via preserves inner-layer contacts", () => {
  const circuit = makeCopperPourCircuit()
  const pad = circuit.find(
    (e) => e.type === "pcb_smtpad" && e.pcb_port_id === "port_1",
  )!
  if (pad.type !== "pcb_smtpad") throw new Error("pad")
  pad.layer = "inner1"
  circuit.push(
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
  expect(
    new PcbConnectivityMap(circuit).connMap.areIdsConnected(
      "pour_gnd",
      "port_1",
    ),
  ).toBe(true)
  circuit.push(
    pcb_via.parse({
      type: "pcb_via",
      pcb_via_id: "actual_via",
      pcb_trace_id: "via_bridge",
      source_net_id: "gnd",
      through_hole: true,
      x: 0,
      y: 0,
      outer_diameter: 0.6,
      hole_diameter: 0.3,
      layers: ["top", "bottom"],
    }),
  )
  expect(
    new PcbConnectivityMap(circuit).connMap.areIdsConnected(
      "pour_gnd",
      "port_1",
    ),
  ).toBe(true)
})

test("adding isolated copper traces does not connect an outside port", () => {
  const circuit = makeCopperPourCircuit()
  const map = new PcbConnectivityMap(circuit)
  const traces: PCBTrace[] = [8, 10].map((x) => ({
    type: "pcb_trace",
    pcb_trace_id: `isolated_${x}`,
    source_trace_id: "source_trace_0",
    route: [
      { route_type: "wire", x, y: 0, layer: "top", width: 0.2 },
      { route_type: "wire", x, y: 1, layer: "top", width: 0.2 },
    ],
  }))
  for (const trace of traces) map.addTrace(trace)
  const fresh = new PcbConnectivityMap([...circuit, ...traces])
  expect(fresh.connMap.areIdsConnected("isolated_10", "port_2")).toBe(false)
  expect(map.connMap.areIdsConnected("isolated_10", "port_2")).toBe(false)
})

test("explicit linear taper touches the copper pour", () => {
  const circuit = makeCopperPourCircuit()
  circuit.push(
    pcb_trace.parse({
      type: "pcb_trace",
      pcb_trace_id: "taper",
      source_trace_id: "source_trace_0",
      route: [
        {
          route_type: "wire",
          x: -1,
          y: 2.3,
          layer: "top",
          width: 0.2,
          start_width: 0.2,
          end_width: 1,
          width_interpolation_mode: "linear",
        },
        { route_type: "wire", x: 0, y: 2.3, layer: "top", width: 1 },
      ],
    }),
  )
  expect(
    new PcbConnectivityMap(circuit).connMap.areIdsConnected(
      "taper",
      "pour_gnd",
    ),
  ).toBe(true)
})
