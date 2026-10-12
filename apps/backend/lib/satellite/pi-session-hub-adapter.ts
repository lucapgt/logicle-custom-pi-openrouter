import { PiSessionController, type PiSessionStore } from './pi-session-controller'
import { isPiSessionResponse } from './pi-session-protocol'

export interface AuthenticatedSatelliteSocket {
  readyState: number
  OPEN: number
  send(data: string): void
}
export interface SatelliteConnectionIdentity {
  satelliteId: string
  socket: AuthenticatedSatelliteSocket
}
/** Caller MUST derive connection identity from the socket, never from a JSON field. */
export function createPiHubAdapter(
  connections: Map<string, SatelliteConnectionIdentity>,
  store: PiSessionStore,
  timeoutMs?: number
) {
  const controller = new PiSessionController({
    send(satelliteId, command) {
      const connection = connections.get(satelliteId)
      if (!connection || connection.socket.readyState !== connection.socket.OPEN) {
        throw new Error('Satellite is not connected')
      }
      connection.socket.send(JSON.stringify(command))
    },
  }, store, timeoutMs)
  return {
    controller,
    async receive(connection: SatelliteConnectionIdentity, payload: unknown): Promise<boolean> {
      if (connections.get(connection.satelliteId)?.socket !== connection.socket) return false
      if (!isPiSessionResponse(payload)) return false
      return controller.receive(connection.satelliteId, payload)
    },
    disconnected(connection: SatelliteConnectionIdentity): void {
      if (connections.get(connection.satelliteId)?.socket === connection.socket) {
        controller.disconnected(connection.satelliteId)
      }
    },
    sampling(satelliteId: string, parentRequestId: string) {
      return controller.getSamplingContext(satelliteId, parentRequestId)
    },
  }
}
