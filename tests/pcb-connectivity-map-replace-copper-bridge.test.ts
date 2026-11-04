import { expect, test } from "bun:test"
import type { PCBTrace } from "circuit-json"
import { PcbConnectivityMap } from "../src"
import {
  getPourPortIds,
  makeCopperPourCircuit,
} from "./fixtures/copper-pour-circuit"

test("replacing a copper bridge removes stale geometry and port connections", () => {
  const bridge: PCBTrace = {
    type: "pcb_trace",
    pcb_trace_id: "bridge",
    source_trace_id: "source_trace_1",
    route: [
      {
        route_type: "wire",
        x: 0,
        y: 0,
        width: 0.2,
        layer: "top",
        start_pcb_port_id: "port_1",
      },
      {
        route_type: "wire",
        x: 4,
        y: 0,
        width: 0.2,
        layer: "top",
        end_pcb_port_id: "port_2",
      },
    ],
  }
  const outsideTrace: PCBTrace = {
    type: "pcb_trace",
    pcb_trace_id: "outside_trace",
    source_trace_id: "source_trace_2",
    route: [
      { route_type: "wire", x: 4, y: 0, width: 0.2, layer: "top" },
      { route_type: "wire", x: 4, y: 3, width: 0.2, layer: "top" },
    ],
  }
  const circuitJson = [...makeCopperPourCircuit(), bridge, outsideTrace]
  const original = structuredClone(circuitJson)
  const map = new PcbConnectivityMap(circuitJson)
  expect(map.connMap.areIdsConnected("port_0", "port_2")).toBe(true)
  expect(map.areTracesConnected("bridge", "outside_trace")).toBe(true)
  expect(getPourPortIds(map.getCopperConductorComponents())).toEqual([
    "port_0",
    "port_1",
    "port_2",
  ])

  const detached: PCBTrace = {
    ...bridge,
    route: [
      { route_type: "wire", x: 8, y: 6, width: 0.2, layer: "top" },
      { route_type: "wire", x: 10, y: 6, width: 0.2, layer: "top" },
    ],
  }
  map.addTrace(detached)
  expect(getPourPortIds(map.getCopperConductorComponents())).toEqual([
    "port_0",
    "port_1",
  ])
  expect(map.connMap.areIdsConnected("port_0", "port_2")).toBe(false)
  expect(map.connMap.areIdsConnected("pour_gnd", "bridge")).toBe(false)
  expect(map.areTracesConnected("bridge", "outside_trace")).toBe(false)
  expect(map.getAllTracesConnectedToPort("port_0")).toEqual([])
  expect(map.getAllTracesConnectedToPort("port_2")).toEqual([outsideTrace])
  expect(map.traceIdToElm.get("bridge")).toEqual(detached)
  expect(
    map.circuitJson.filter(
      (e) => e.type === "pcb_trace" && e.pcb_trace_id === "bridge",
    ),
  ).toEqual([detached])
  expect(circuitJson).toEqual(original)

  map.addTrace(bridge)
  expect(map.connMap.areIdsConnected("port_0", "port_2")).toBe(true)
  expect(map.areTracesConnected("bridge", "outside_trace")).toBe(true)
})
