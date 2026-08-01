import { MockBleTransport } from './transports/MockBleTransport';
import { BleTransport } from './transports/BleTransport';
import { MessageCodec } from './MessageCodec';
import { BLE } from '../shared/constants/BleConstants';
import { Capacitor } from '@capacitor/core';

class MultiplayerManager {
  constructor() {
    this.transport = null;
    this.codec = new MessageCodec();
    this.role = null;
    this.connected = false;
    this.playerId = null;
    this.worldSeed = null;
    this.localSeq = 0;
    this.localTick = 0;
    this.lastAckSeq = 0;
    this.lastAckTick = 0;
    this.inputQueue = [];
    this.maxQueueSize = 60;
    this.tickInterval = null;
    this.pingInterval = null;
    this.pingSeq = 0;
    this.pendingPings = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.onStateUpdate = null;
    this.onEvent = null;
    this.onConnectionChange = null;
    this.onError = null;
    this.isHost = false;
    this.hostSimulation = null;
  }

  static getInstance() {
    if (!MultiplayerManager._instance) {
      MultiplayerManager._instance = new MultiplayerManager();
    }
    return MultiplayerManager._instance;
  }

  setCallbacks({ onStateUpdate, onEvent, onConnectionChange, onError }) {
    this.onStateUpdate = onStateUpdate;
    this.onEvent = onEvent;
    this.onConnectionChange = onConnectionChange;
    this.onError = onError;
  }

  _emitConnectionChange(state) {
    this.connected = state === 'connected';
    this.onConnectionChange?.(state);
  }

  _emitError(error) {
    console.error('[MultiplayerManager] Error:', error);
    this.onError?.(error);
  }

  async initialize() {
    const isMobile = Capacitor.getPlatform() !== 'web';
    this.transport = isMobile ? new BleTransport() : new MockBleTransport();
    this.transport.on_state_update = (msg) => this._handleStateUpdate(msg);
    this.transport.on_event = (msg) => this._handleEvent(msg);
    this.transport.on_peer_connected = (peerId) => this._onPeerConnected(peerId);
    this.transport.on_peer_disconnected = (peerId) => this._onPeerDisconnected(peerId);
    await this.transport.initialize();
  }

  async host() {
    if (!this.transport) await this.initialize();
    this.role = 'host';
    this.isHost = true;
    this._emitConnectionChange('connecting');
    await this.transport.host({});
  }

  async scan() {
    if (!this.transport) await this.initialize();
    this.role = 'client';
    this.isHost = false;
    this._emitConnectionChange('scanning');
    return await this.transport.scan();
  }

  async connect(deviceId) {
    this._emitConnectionChange('connecting');
    await this.transport.connect(deviceId);
  }

  disconnect() {
    this._stopTickLoop();
    this._stopPingLoop();
    this.transport?.disconnect();
    this.role = null;
    this.playerId = null;
    this.worldSeed = null;
    this.localSeq = 0;
    this.localTick = 0;
    this.lastAckSeq = 0;
    this.lastAckTick = 0;
    this.inputQueue = [];
    this.pendingPings.clear();
    this._emitConnectionChange('disconnected');
  }

  _onPeerConnected(peerId) {
    console.log('[MultiplayerManager] Peer connected:', peerId);
    if (this.isHost) {
      this._startHostSimulation();
      if (this.hostSimulation) {
        const _playerId = this.hostSimulation.addPlayer(peerId);
        this._sendJoinAccept(peerId, this.hostSimulation.getSnapshot());
      }
    }
  }

  _onPeerDisconnected(peerId) {
    console.log('[MultiplayerManager] Peer disconnected:', peerId);
    if (this.isHost) {
      this._stopHostSimulation();
    } else {
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this._emitError(new Error('Max reconnection attempts reached'));
      return;
    }
    this.reconnectAttempts++;
    console.log(`[MultiplayerManager] Reconnecting... attempt ${this.reconnectAttempts}`);
    setTimeout(() => {
      if (this.role === 'client' && this.transport) {
        this.transport.connect(this.transport.peer_id);
        setTimeout(() => this.requestSync(), 100);
      }
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  _startTickLoop() {
    if (this.tickInterval) return;
    const tickRate = BLE.TICK_RATE;
    const tickMs = 1000 / tickRate;
    this.tickInterval = setInterval(() => this._tick(), tickMs);
  }

  _stopTickLoop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  _startPingLoop() {
    if (this.pingInterval) return;
    this.pingInterval = setInterval(() => this._sendPing(), 5000);
  }

  _stopPingLoop() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  _tick() {
    this.localTick = (this.localTick + 1) & 0xff;
    this._sendInput();
  }

  _sendInput() {
    if (!this.connected || !this.transport) return;
    const input = this.inputQueue.shift() || this._getDefaultInput();
    input.seq = this.localSeq++;
    input.tick = this.localTick;
    this.transport.send_input(input);
  }

  _getDefaultInput() {
    return {
      flags: 0,
      joy_x: 0,
      joy_y: 0,
      target_id: 0,
      target_type: 0,
    };
  }

  queueInput(input) {
    if (this.inputQueue.length >= this.maxQueueSize) {
      this.inputQueue.shift();
    }
    this.inputQueue.push(input);
  }

  _sendPing() {
    if (!this.connected || !this.transport) return;
    const seq = this.pingSeq++;
    const clientTime = Date.now();
    this.pendingPings.set(seq, clientTime);
    this.transport.send_control({ type: 'PING', seq, client_time: clientTime });
  }

  _handlePong(msg) {
    const clientTime = this.pendingPings.get(msg.seq);
    if (clientTime) {
      const rtt = Date.now() - clientTime;
      console.log(`[MultiplayerManager] Ping RTT: ${rtt}ms`);
      this.pendingPings.delete(msg.seq);
    }
  }

  _handleStateUpdate(msg) {
    if (msg.type === 'SNAPSHOT') {
      this.lastAckSeq = msg.last_ack_seq;
      this.lastAckTick = msg.tick;
      this.onStateUpdate?.(msg);
    } else if (msg.type === 'DELTA') {
      this.lastAckSeq = msg.last_ack_seq;
      this.lastAckTick = msg.tick;
      this.onStateUpdate?.(msg);
    }
  }

  _handleEvent(msg) {
    switch (msg.type) {
      case 'JOIN_ACCEPT':
        this.playerId = msg.player_id;
        this.worldSeed = msg.world_seed;
        this.connected = true;
        this.reconnectAttempts = 0;
        this._emitConnectionChange('connected');
        this._startTickLoop();
        this._startPingLoop();
        this.onStateUpdate?.(msg.snapshot);
        break;
      case 'PONG':
        this._handlePong(msg);
        break;
      case 'SYNC_RESP':
        this.onStateUpdate?.(msg.snapshot);
        break;
      case 'EVENT':
        this.onEvent?.(msg);
        break;
    }
  }

  requestSync() {
    if (!this.connected || !this.transport) return;
    this.transport.send_control({
      type: 'SYNC_REQ',
      last_tick: this.lastAckTick,
      last_seq: this.lastAckSeq,
    });
  }

  async _startHostSimulation() {
    if (this.hostSimulation) return;
    const { HostSimulation } = await import('./HostSimulation');
    this.hostSimulation = new HostSimulation(this.transport, this.codec, this.worldSeed || Math.floor(Math.random() * 65536));
    this.transport.setHostSimulation(this.hostSimulation);
    this.hostSimulation.start();
  }

  _stopHostSimulation() {
    if (this.hostSimulation) {
      this.hostSimulation.stop();
      this.hostSimulation = null;
    }
  }

  getState() {
    return {
      role: this.role,
      connected: this.connected,
      playerId: this.playerId,
      worldSeed: this.worldSeed,
      localSeq: this.localSeq,
      localTick: this.localTick,
      lastAckSeq: this.lastAckSeq,
      lastAckTick: this.lastAckTick,
      queueLength: this.inputQueue.length,
    };
  }
}

MultiplayerManager._instance = null;

export const multiplayerManager = MultiplayerManager.getInstance();
export default MultiplayerManager;