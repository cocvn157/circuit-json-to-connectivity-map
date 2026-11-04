import { expect, test } from "bun:test"
import type { AnyCircuitElement } from "circuit-json"
import { PcbConnectivityMap } from "../src"
import { makeCopperPourCircuit } from "./fixtures/copper-pour-circuit"

test("generated stitching vias conduct copper without acting as authored anchors", () => {
  const circuitJson: AnyCircuitElement[] = makeCopperPourCircuit().filter(
    (e) => e.type === "pcb_copper_pour",
  )
  circuitJson.push({
    type: "pcb_via",
    pcb_via_id: "via_gnd",
    source_net_id: "gnd",
    x: 0,
    y: 0,
    hole_diameter: 0.3,
    outer_diameter: 0.6,
    layers: ["top", "bottom"],
    pcb_port_ids: ["via_top", "via_bottom"],
  })
  const authored = new PcbConnectivityMap(
    circuitJson,
  ).getCopperConductorComponents()
  const generated = new PcbConnectivityMap(
    circuitJson,
  ).getCopperConductorComponents(new Set(["via_gnd"]))
  expect(authored).toHaveLength(1)
  expect(generated).toHaveLength(1)
  expect(authored[0]!.some((c) => c.isTerminal)).toBe(true)
  expect(generated[0]!.some((c) => c.isTerminal)).toBe(false)
  expect(generated[0]!.find((c) => c.viaId)?.pcbPortIds).toEqual([
    "via_top",
    "via_bottom",
  ])
})
