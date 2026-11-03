# Circuit JSON to Connectivity Map

This library provides utilities to generate connectivity maps from circuit JSON data. It's designed to work with the `@tscircuit/soup` library and offers functionality to find connected networks and create connectivity maps.

## Installation

To install the library, use npm or bun:

```bash
npm add circuit-json-to-connectivity-map
```

## Features

- Find connected networks from a list of connections
- Generate source port connectivity maps from circuit JSON data
- Generate full connectivity maps from circuit JSON data

## Usage

### Finding Connected Networks

```typescript
import { findConnectedNetworks } from "circuit-json-to-connectivity-map"

const connections = [
  ["A", "B"],
  ["B", "C"],
  ["D", "E"],
]

const result = findConnectedNetworks(connections)
console.log(result)

// Output:
// {
//   connectivity_net0: ["A", "B", "C"],
//   connectivity_net3: ["D", "E"],
// }
```

### Generating Source Port Connectivity Map

```typescript
import { getSourcePortConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map"
import type { AnyCircuitElement } from "circuit-json"

const circuitJson: AnyCircuitElement[] = [
  // Your circuit JSON data here
]

const connectivityMap = getSourcePortConnectivityMapFromCircuitJson(circuitJson)

// Check if two IDs are connected
console.log(connectivityMap.areIdsConnected("port1", "port2"))

// Get all IDs connected to a specific net
console.log(connectivityMap.getIdsConnectedToNet("net1"))

// Get the net connected to a specific ID
console.log(connectivityMap.getNetConnectedToId("port1"))
```

### Generating Full Connectivity Map

```typescript
import { getFullConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map"
import type { AnyCircuitElement } from "circuit-json"

const circuitJson: AnyCircuitElement[] = [
  // Your circuit JSON data here
]

const fullConnectivityMap = getFullConnectivityMapFromCircuitJson(circuitJson)

// Check if two IDs are connected (including PCB elements)
console.log(fullConnectivityMap.areIdsConnected("smtpad1", "port1"))

// Get all IDs connected to a specific net
console.log(fullConnectivityMap.getIdsConnectedToNet("net1"))

// Get the net connected to a specific ID
console.log(fullConnectivityMap.getNetConnectedToId("pcb_port1"))
```

## API Reference

### `findConnectedNetworks(connections: Array<string[]>): Record<string, string[]>`

Finds connected networks from a list of connections.

### `getSourcePortConnectivityMapFromCircuitJson(circuitJson: AnyCircuitElement[]): ConnectivityMap`

Generates a source port connectivity map from circuit JSON data.

### `getFullConnectivityMapFromCircuitJson(circuitJson: AnyCircuitElement[]): ConnectivityMap`

Generates a full connectivity map from circuit JSON data, including PCB elements.

### `ConnectivityMap`

A class representing the connectivity map with methods:

- `areIdsConnected(id1: string, id2: string): boolean`
- `getIdsConnectedToNet(netId: string): string[]`
- `getNetConnectedToId(id: string): string | undefined`

### `PcbConnectivityMap`

`new PcbConnectivityMap(circuitJson)` analyzes physical copper on logical nets
with assigned copper pours. Same-net contacts on compatible layers determine
the components used by `connMap`, `areTracesConnected`,
`getAllTracesConnectedToTrace`, and `getAllTracesConnectedToPort`. Logical net
membership permits a physical contact; it does not itself connect copper.
Trace-only connectivity remains available outside this analysis and cannot
join the components owned by copper analysis.

`getCopperConductorComponents(generatedStitchingViaIds?)` returns those components
with pour, trace, via, port, layer, and terminal metadata. Geometry stays private.
Generated stitching vias still conduct but can be excluded from terminal anchors.

The flat connectivity API can assign an ID to only one component:

- A trace ID belongs to the component containing all of its conducting geometry.
  When its geometry spans disconnected components, the ID remains in each
  component's metadata but has no network in `connMap`. Trace queries omit it.
  A physical bridge can reunite the components and restore the trace ID.
- The same rule applies to port IDs shared by disconnected pads or vias.
- A port's copper geometry takes precedence over trace endpoint references.
  References without copper geometry act as aliases only when they identify
  one unambiguous component; they cannot merge separate components.
- An analyzed trace with no conducting geometry has no physical network.

`addTrace(trace)` adds or replaces a trace without mutating the input Circuit
JSON array. With assigned pours, it rebuilds the physical analysis and its ID
projection, removing stale connections when a bridge or alias changes.

## Development

This project uses [Bun](https://bun.sh) as its JavaScript runtime.

To start development:

1. Clone the repository
2. Run `bun install` to install dependencies
3. Make your changes
4. Run `bun test` to ensure all tests pass

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT License](LICENSE)
