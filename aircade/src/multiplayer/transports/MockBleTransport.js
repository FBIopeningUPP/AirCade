import { MessageCodec } from '../MessageCodec';
import { TransportInterface } from './TransportInterface';

export class MockBleTransport extends TransportInterface {
  constructor() {
    super();
    this.codec = new MessageCodec();
    this.role = null;
    this.peer_id = null;
    this.connected = false;
    this.latency = 50;
    this.packet_loss = 0.0;
    this.dup_chance = 0.0;
    this.reorder_chance = 0.0;
    this.msg_log = [];
    this._pending = [];
    this.peers = new Map();
    this.hostSimulation = null;
    this._client_peer_id = null;
  }

  async initialize() {}

  async host(_opts) {
    this.role = 'host';
    this.peer_id = 'host-' + Date.now();
    this.connected = true;
    this.peers.set(this.peer_id, { id: this.peer_id, isHost: true });
  }

  setHostSimulation(sim) {
    this.hostSimulation = sim;
  }

  async scan() {
    this.role = 'client';
    return { device_id: 'mock-host', name: 'Aircade-TEST', rssi: -40 };
  }

  async connect(_device_id) {
    this.connected = true;
    this._client_peer_id = 'client-' + Date.now();
    this.peer_id = this._client_peer_id;
    this.peers.set(this._client_peer_id, { id: this._client_peer_id, isHost: false });
    const join = this.codec.encode_join_req('Player');
    setTimeout(() => this._recv(join), this.latency);
  }

  async send_input(input) {
    if (!this.connected) return;
    const buf = this.codec.encode_input(input);
    this.msg_log.push({ dir: 'out', type: 'INPUT', data: input, time: Date.now() });
    this._send(buf);
  }

  async send_control(msg) {
    if (!this.connected) return;
    let buf;
    switch (msg.type) {
      case 'JOIN_REQ':
        buf = this.codec.encode_join_req(msg.name);
        break;
      case 'PING':
        buf = this.codec.encode_ping(msg.seq, msg.client_time);
        break;
      case 'SYNC_REQ':
        buf = this.codec.encode_sync_req(msg.last_tick, msg.last_seq);
        break;
      default:
        return;
    }
    this.msg_log.push({ dir: 'out', type: msg.type, data: msg, time: Date.now() });
    this._send(buf);
  }

  async broadcast_state(buf) {
    if (!this.connected || this.role !== 'host') return;
    for (const peer of this.peers.values()) {
      if (!peer.isHost) {
        this._sendToPeer(peer.id, buf);
      }
    }
  }

  async broadcast_event(buf) {
    if (!this.connected || this.role !== 'host') return;
    for (const peer of this.peers.values()) {
      if (!peer.isHost) {
        this._sendToPeer(peer.id, buf);
      }
    }
  }

  _sendToPeer(peerId, buf) {
    if (Math.random() < this.packet_loss) return;
    const delay = this.latency + (Math.random() * 20 - 10);
    const deliver = () => {
      if (Math.random() < this.dup_chance) this._recv(buf);
      if (Math.random() < this.reorder_chance && this._pending.length) {
        this._pending.push({ buf, t: Date.now() + delay });
      } else {
        this._recv(buf);
      }
    };
    this._pending.push({ buf, t: Date.now() + delay });
    setTimeout(() => {
      const idx = this._pending.findIndex(p => p.buf === buf);
      if (idx >= 0) {
        this._pending.splice(idx, 1);
        deliver();
      }
    }, delay);
  }

  async disconnect() {
    this.connected = false;
    if (this.on_peer_disconnected) this.on_peer_disconnected(this.peer_id);
  }

  _send(buf) {
    if (this.role === 'host') {
      for (const peer of this.peers.values()) {
        if (!peer.isHost) {
          this._sendToPeer(peer.id, buf);
        }
      }
    } else {
      this._sendToPeer(this._client_peer_id || this.peer_id, buf);
    }
  }

  _recv(buf) {
    if (!this.connected) return;
    try {
      const msg = this.codec.decode(buf);
      this.msg_log.push({ dir: 'in', type: msg.type, data: msg, time: Date.now() });
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
    } catch {
    }
  }

  _handleJoinRequest(_msg) {
    if (!this._client_peer_id) return;
    this.peers.set(this._client_peer_id, { id: this._client_peer_id, isHost: false });
    if (this.on_peer_connected) this.on_peer_connected(this._client_peer_id);
    if (this.hostSimulation) {
      this.hostSimulation.addPlayer(this._client_peer_id);
      const playerIndex = this.hostSimulation.getPlayerIndex(this._client_peer_id);
      const snap = this.hostSimulation.getSnapshot(this._client_peer_id);
      const buf = this.codec.encode_join_accept(playerIndex, this.hostSimulation.worldSeed || Math.floor(Math.random() * 65536), snap);
      this._sendToPeer(this._client_peer_id, buf);
    }
  }

  simulate_snapshot(snap) {
    const buf = this.codec.encode_snapshot(snap);
    this._recv(buf);
  }

  simulate_event(evt) {
    const buf = this.codec.encode_event(evt);
    this._recv(buf);
  }

  simulate_join_accept(player_id, world_seed, snap) {
    const buf = this.codec.encode_join_accept(player_id, world_seed, snap);
    this._recv(buf);
  }

  simulate_pong(seq, server_time, client_time) {
    const buf = this.codec.encode_pong(seq, server_time, client_time);
    this._recv(buf);
  }

  simulate_sync_resp(snap) {
    const buf = this.codec.encode_sync_resp(snap);
    this._recv(buf);
  }

  set_net_cond(latency, loss, dup, reorder) {
    this.latency = latency;
    this.packet_loss = loss;
    this.dup_chance = dup;
    this.reorder_chance = reorder;
  }
}

// TODO: add jitter simulation for connection interval variance