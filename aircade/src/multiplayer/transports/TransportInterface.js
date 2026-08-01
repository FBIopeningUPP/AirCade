export class TransportInterface {
  constructor() {
    this.onStateUpdate = null;
    this.onEvent = null;
    this.onPeerConnected = null;
    this.onPeerDisconnected = null;
  }

  async initialize() { throw new Error('initialize not implemented'); }
  async host(opts) { throw new Error('host not implemented'); }
  async scan() { throw new Error('scan not implemented'); }
  async connect(deviceId) { throw new Error('connect not implemented'); }
  async sendInput(input) { throw new Error('sendInput not implemented'); }
  async sendControl(msg) { throw new Error('sendControl not implemented'); }
  async broadcastState(buf) { throw new Error('broadcastState not implemented'); }
  async broadcastEvent(buf) { throw new Error('broadcastEvent not implemented'); }
  async disconnect() { throw new Error('disconnect not implemented'); }
}