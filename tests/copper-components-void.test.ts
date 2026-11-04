import { expect, test } from "bun:test"
import type { AnyCircuitElement } from "circuit-json"
import { PcbConnectivityMap } from "../src"
import {
  getPourPortIds,
  makeCopperPourCircuit,
} from "./fixtures/copper-pour-circuit"

test("a pad inside a pour void is physically disconnected", () => {
  const circuitJson: AnyCircuitElement[] = makeCopperPourCircuit().map(
    (element) =>
      element.type !== "pcb_copper_pour"
        ? element
        : {
            type: "pcb_copper_pour",
            pcb_copper_pour_id: element.pcb_copper_pour_id,
            source_net_id: element.source_net_id,
            layer: "top",
            covered_with_solder_mask: false,
            shape: "brep",
            brep_shape: {
              outer_ring: {
                vertices: [
                  { x: -6, y: -2 },
                  { x: 2, y: -2 },
                  { x: 2, y: 2 },
                  { x: -6, y: 2 },
                ],
              },
              inner_rings: [
                {
                  vertices: [
                    { x: -1, y: -1 },
                    { x: -1, y: 1 },
                    { x: 1, y: 1 },
                    { x: 1, y: -1 },
                  ],
                },
              ],
            },
          },
  )
  expect(
    getPourPortIds(
      new PcbConnectivityMap(circuitJson).getCopperConductorComponents(),
    ),
  ).toEqual(["port_0"])
})
