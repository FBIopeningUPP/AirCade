import { MessageCodec } from '../MessageCodec';
import { TransportInterface } from './TransportInterface';

export class MockBleTransport extends TransportInterface {
  constructor() {
    super();
    this.codec = new MessageCodec();
    this.role = null;
    this.peer_id = null;
    this.connected = false;
    this.latency = 20;
    this.peers = new Map();
    this.hostSimulation = null;
    this._client_peer_id = null;
    
    // Setup BroadcastChannel for cross-tab communication!
    this.channel = new BroadcastChannel('aircade_mock_ble');
    this.channel.onmessage = (event) => this._onChannelMessage(event.data);
    this.channelId = 'mock_' + Math.random().toString(36).substr(2, 9);
  }

  async initialize() {
    console.log('[MockBleTransport] Initialized on channel:', this.channelId);
  }

  _onChannelMessage(payload) {
    if (payload.sender === this.channelId) return; // ignore own messages
    if (payload.target && payload.target !== this.channelId) return; // ignore messages not for me
    
    if (payload.type === 'SCAN_REQ' && this.role === 'host') {
      this.channel.postMessage({
        sender: this.channelId,
        target: payload.sender,
        type: 'SCAN_RESP',
        data: { device_id: this.channelId, name: 'Aircade-TEST', rssi: -40 }
      });
    }
    else if (payload.type === 'SCAN_RESP' && this.role === 'client' && this._scanResolver) {
      this._scanResolver(payload.data);
      this._scanResolver = null;
    }
    else if (payload.type === 'CONNECT_REQ' && this.role === 'host') {
      this._client_peer_id = payload.sender;
      this.peers.set(this._client_peer_id, { id: this._client_peer_id, isHost: false });
      
      this.channel.postMessage({
        sender: this.channelId,
        target: payload.sender,
        type: 'CONNECT_RESP',
        data: { accepted: true }
      });
      
      if (this.on_peer_connected) this.on_peer_connected(this._client_peer_id);
    }
    else if (payload.type === 'CONNECT_RESP' && this.role === 'client') {
      if (payload.data.accepted && this._connectResolver) {
        this.connected = true;
        this.peer_id = this.channelId;
        this.peers.set(this.channelId, { id: this.channelId, isHost: false });
        this._connectResolver();
        this._connectResolver = null;
      }
    }
    else if (payload.type === 'DATA') {
      if (this.connected) {
        const u8 = new Uint8Array(payload.data);
        this._recv(u8);
      }
    }
  }

  async host(_opts) {
    this.role = 'host';
    this.peer_id = this.channelId;
    this.connected = true;
    this.peers.set(this.peer_id, { id: this.peer_id, isHost: true });
    console.log('[MockBleTransport] Hosting as', this.peer_id);
  }

  setHostSimulation(sim) {
    this.hostSimulation = sim;
  }

  async scan() {
    this.role = 'client';
    return new Promise((resolve) => {
      this._scanResolver = resolve;
      this.channel.postMessage({ sender: this.channelId, target: null, type: 'SCAN_REQ' });
      // Timeout if no host found
      setTimeout(() => {
        if (this._scanResolver) {
          this._scanResolver(null);
          this._scanResolver = null;
        }
      }, 3000);
    });
  }

  async connect(device_id) {
    this.role = 'client';
    this.host_device_id = device_id;
    return new Promise((resolve, reject) => {
      this._connectResolver = resolve;
      this.channel.postMessage({ sender: this.channelId, target: device_id, type: 'CONNECT_REQ' });
      setTimeout(() => {
        if (this._connectResolver) {
          reject(new Error("Connection timeout"));
          this._connectResolver = null;
        }
      }, 3000);
    });
  }

  async send_input(input) {
    if (!this.connected) return;
    const buf = this.codec.encode_input(input);
    this._send(buf);
  }

  async send_control(msg) {
    if (!this.connected) return;
    let buf;
    switch (msg.type) {
      case 'JOIN_REQ': buf = this.codec.encode_join_req(msg.name); break;
      case 'PING': buf = this.codec.encode_ping(msg.seq, msg.client_time); break;
      case 'SYNC_REQ': buf = this.codec.encode_sync_req(msg.last_tick, msg.last_seq); break;
      default: return;
    }
    this._send(buf);
  }

  async broadcast_state(buf) {
    if (!this.connected || this.role !== 'host') return;
    try {
      const msg = this.codec.decode(buf);
      this.on_state_update?.(msg);
    } catch (e) {
      console.error('DECODE ERROR in MockBleTransport:', e);
    }
    for (const peer of this.peers.values()) {
      if (!peer.isHost) this._sendToPeer(peer.id, buf);
    }
  }

  async broadcast_event(buf) {
    if (!this.connected || this.role !== 'host') return;
    try {
      const msg = this.codec.decode(buf);
      this.on_event?.(msg);
    } catch {}
    for (const peer of this.peers.values()) {
      if (!peer.isHost) this._sendToPeer(peer.id, buf);
    }
  }

  _sendToPeer(peerId, buf) {
    setTimeout(() => {
      this.channel.postMessage({
        sender: this.channelId,
        target: peerId,
        type: 'DATA',
        data: Array.from(buf) // Convert Uint8Array to Array for serialization
      });
    }, this.latency);
  }

  async disconnect() {
    this.connected = false;
    if (this.on_peer_disconnected) this.on_peer_disconnected(this.peer_id);
  }

  _send(buf) {
    if (this.role === 'host') {
      for (const peer of this.peers.values()) {
        if (!peer.isHost) this._sendToPeer(peer.id, buf);
      }
    } else {
      this._sendToPeer(this.host_device_id, buf);
    }
  }

  _recv(buf) {
    if (!this.connected) return;
    try {
      const msg = this.codec.decode(buf);
      if (msg.type === 'SNAPSHOT' || msg.type === 'DELTA') {
        this.on_state_update?.(msg);
      } else if (msg.type === 'EVENT' || msg.type === 'JOIN_ACCEPT' || msg.type === 'PONG' || msg.type === 'SYNC_RESP') {
        this.on_event?.(msg);
      } else if (msg.type === 'INPUT' && this.hostSimulation) {
        const senderId = this.role === 'host' ? this._client_peer_id : this.peer_id;
        this.hostSimulation.queueInput(senderId, msg);
      } else if (msg.type === 'JOIN_REQ' && this.role === 'host') {
        this._handleJoinRequest(msg);
      } else if (msg.type === 'SYNC_REQ' && this.role === 'host' && this.hostSimulation) {
        const senderId = this._client_peer_id;
        this.hostSimulation.handleSyncRequest(senderId);
      }
    } catch (e) {
      console.error('[MockBle] Decode error', e);
    }
  }

  _handleJoinRequest(msg) {
    if (!this._client_peer_id) return;
    if (this.hostSimulation) {
      this.hostSimulation.addPlayer(this._client_peer_id);
      const playerIndex = this.hostSimulation.getPlayerIndex(this._client_peer_id);
      const snap = this.hostSimulation.getSnapshot(this._client_peer_id);
      const buf = this.codec.encode_join_accept(playerIndex, this.hostSimulation.worldSeed || Math.floor(Math.random() * 65536), snap);
      this._sendToPeer(this._client_peer_id, buf);
    }
  }
}