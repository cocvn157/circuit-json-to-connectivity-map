import { expect, test } from "bun:test"
import { PcbConnectivityMap } from "../src"
import {
  getPourPortIds,
  makeCopperPourCircuit,
} from "./fixtures/copper-pour-circuit"

test("overlapping copper on different nets remains in separate components", () => {
  const circuitJson = makeCopperPourCircuit()
  const sourceTrace = circuitJson.find(
    (e) => e.type === "source_trace" && e.source_trace_id === "source_trace_1",
  )!
  if (sourceTrace.type !== "source_trace")
    throw new Error("Expected a source trace")
  sourceTrace.connected_source_net_ids = ["signal"]
  const pour = circuitJson.find((e) => e.type === "pcb_copper_pour")!
  if (pour.type !== "pcb_copper_pour") throw new Error("Expected a pour")
  circuitJson.push({
    ...pour,
    pcb_copper_pour_id: "pour_signal",
    source_net_id: "signal",
  })
  const components = new PcbConnectivityMap(
    circuitJson,
  ).getCopperConductorComponents()
  expect(getPourPortIds(components)).toEqual(["port_0"])
  const signalComponent = components.find((conductors) =>
    conductors.some((c) => c.pourId === "pour_signal"),
  )!
  expect(signalComponent.flatMap((c) => c.pcbPortIds ?? [])).toEqual(["port_1"])
})
