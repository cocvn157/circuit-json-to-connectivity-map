import { expect, test } from "bun:test"
import { PcbConnectivityMap } from "../src"
import {
  getPourPortIds,
  makeCopperPourCircuit,
} from "./fixtures/copper-pour-circuit"

test("plated copper bridges layers that XY overlap alone cannot connect", () => {
  const circuitJson = makeCopperPourCircuit()
  const pad = circuitJson.find(
    (e) => e.type === "pcb_smtpad" && e.pcb_port_id === "port_1",
  )!
  if (pad.type !== "pcb_smtpad") throw new Error("Expected a pad")
  pad.layer = "bottom"
  expect(
    getPourPortIds(
      new PcbConnectivityMap(circuitJson).getCopperConductorComponents(),
    ),
  ).toEqual(["port_0"])
  circuitJson.push({
    type: "pcb_plated_hole",
    pcb_plated_hole_id: "plated_bridge",
    pcb_port_id: "port_1",
    shape: "circle",
    x: 0,
    y: 0,
    outer_diameter: 0.6,
    hole_diameter: 0.3,
    layers: ["top", "bottom"],
  })
  expect(
    new Set(
      getPourPortIds(
        new PcbConnectivityMap(circuitJson).getCopperConductorComponents(),
      ),
    ),
  ).toEqual(new Set(["port_0", "port_1"]))
})
