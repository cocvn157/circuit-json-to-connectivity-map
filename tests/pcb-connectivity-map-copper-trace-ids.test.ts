import { expect, test } from "bun:test"
import type { PCBTrace } from "circuit-json"
import { PcbConnectivityMap } from "../src"
import { makeCopperPourCircuit } from "./fixtures/copper-pour-circuit"

test("pour contact connects trace IDs without explicit port references", () => {
  const traces: PCBTrace[] = [-4, 0, 4].map((x, index) => ({
    type: "pcb_trace",
    pcb_trace_id: `trace_${index}`,
    source_trace_id: `source_trace_${index}`,
    route: [
      { route_type: "wire", x, y: 1, layer: "top", width: 0.2 },
      { route_type: "wire", x, y: 4, layer: "top", width: 0.2 },
    ],
  }))
  const map = new PcbConnectivityMap([...makeCopperPourCircuit(), ...traces])

  expect(map.areTracesConnected("trace_0", "trace_1")).toBe(true)
  expect(map.areTracesConnected("trace_0", "trace_2")).toBe(false)
  expect(map.connMap.areIdsConnected("pour_gnd", "trace_0")).toBe(true)
  expect(
    map
      .getAllTracesConnectedToPort("port_0")
      .map((trace) => trace.pcb_trace_id)
      .sort(),
  ).toEqual(["trace_0", "trace_1"])
  expect(
    map
      .getAllTracesConnectedToTrace("trace_0")
      .map((trace) => trace.pcb_trace_id)
      .sort(),
  ).toEqual(["trace_0", "trace_1"])
  const pourComponent = map
    .getCopperConductorComponents()
    .find((conductors) => conductors.some((c) => c.pourId === "pour_gnd"))!
  expect(
    pourComponent.flatMap((c) => (c.traceId ? [c.traceId] : [])).sort(),
  ).toEqual(["trace_0", "trace_1"])
})
