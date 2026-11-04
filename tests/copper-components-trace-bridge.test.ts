import { expect, test } from "bun:test"
import { PcbConnectivityMap } from "../src"
import {
  getPourPortIds,
  makeCopperPourCircuit,
} from "./fixtures/copper-pour-circuit"

test("a physical trace extends a pour component to an outside terminal", () => {
  const circuitJson = makeCopperPourCircuit()
  circuitJson.push({
    type: "pcb_trace",
    pcb_trace_id: "bridge",
    source_trace_id: "source_trace_1",
    route: [
      { route_type: "wire", x: 0, y: 0, width: 0.2, layer: "top" },
      { route_type: "wire", x: 4, y: 0, width: 0.2, layer: "top" },
    ],
  })
  expect(
    getPourPortIds(
      new PcbConnectivityMap(circuitJson).getCopperConductorComponents(),
    ),
  ).toEqual(["port_0", "port_1", "port_2"])
})
