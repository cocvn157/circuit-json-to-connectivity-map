import { expect, test } from "bun:test"
import { PcbConnectivityMap } from "../src"
import {
  getPourPortIds,
  makeCopperPourCircuit,
} from "./fixtures/copper-pour-circuit"

test("addTrace updates copper groups and existing map queries without mutating the input", () => {
  const circuitJson = makeCopperPourCircuit()
  const original = structuredClone(circuitJson)
  const map = new PcbConnectivityMap(circuitJson)
  expect(getPourPortIds(map.getCopperConductorComponents())).toEqual([
    "port_0",
    "port_1",
  ])
  expect(map.connMap.areIdsConnected("port_0", "port_2")).toBe(false)

  map.addTrace({
    type: "pcb_trace",
    pcb_trace_id: "bridge",
    source_trace_id: "source_trace_1",
    route: [
      { route_type: "wire", x: 0, y: 0, width: 0.2, layer: "top" },
      {
        route_type: "wire",
        x: 4,
        y: 0,
        width: 0.2,
        layer: "top",
      },
    ],
  })

  expect(getPourPortIds(map.getCopperConductorComponents())).toEqual([
    "port_0",
    "port_1",
    "port_2",
  ])
  expect(map.connMap.areIdsConnected("port_0", "port_2")).toBe(true)
  expect(
    map
      .getAllTracesConnectedToPort("port_0")
      .map((trace) => trace.pcb_trace_id),
  ).toEqual(["bridge"])
  expect(circuitJson).toEqual(original)
})
