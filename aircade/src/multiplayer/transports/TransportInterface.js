export class TransportInterface {
  constructor() {
    this.onStateUpdate = null;
    this.onEvent = null;
    this.onPeerConnected = null;
    this.onPeerDisconnected = null;
  }

  async initialize() { throw new Error('initialize not implemented'); }
  async host(_opts) { throw new Error('host not implemented'); }
  async scan() { throw new Error('scan not implemented'); }
  async connect(_deviceId) { throw new Error('connect not implemented'); }
  async sendInput(_input) { throw new Error('sendInput not implemented'); }
  async sendControl(_msg) { throw new Error('sendControl not implemented'); }
  async broadcastState(_buf) { throw new Error('broadcastState not implemented'); }
  async broadcastEvent(_buf) { throw new Error('broadcastEvent not implemented'); }
  async disconnect() { throw new Error('disconnect not implemented'); }
}