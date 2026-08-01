import { MessageCodec } from '../MessageCodec';
import { TransportInterface } from './TransportInterface';
import { BLE } from '../../shared/constants/BleConstants';
import { Capacitor } from '@capacitor/core';
import { BluetoothLowEnergy } from '@capgo/capacitor-bluetooth-low-energy';

export class BleTransport extends TransportInterface {
  constructor() {
    super();
    this.codec = new MessageCodec();
    this.role = null;
    this.peer_id = null;
    this.connected = false;
    this.device_id = null;
    this._state_char = null;
    this._input_char = null;
    this._control_char = null;
    this._scan_timeout = null;
    this._listeners = new Map();
    this.ble = BluetoothLowEnergy;
  }

  async initialize() {
    if (Capacitor.getPlatform() !== 'android' && Capacitor.getPlatform() !== 'ios') {
      throw new Error('BLE only supported on mobile');
    }
  }

  async _ensurePermissions() {
    const permissions = await this.ble.requestPermissions();
    if (permissions.bluetooth !== 'granted') {
      throw new Error('Bluetooth permissions denied');
    }
  }

  async host(_opts) {
    this.role = 'host';
    this.peer_id = 'ble-host-' + Date.now();

    await this.ble.initialize({ mode: 'peripheral' });
    await this._ensurePermissions();

    await this.ble.addGattService({
      service: BLE.SERVICE_UUID,
      characteristics: [
        {
          uuid: BLE.CHAR_STATE_UUID,
          properties: { broadcast: false, read: true, writeWithoutResponse: false, write: false, notify: true, indicate: false },
          value: [0x00],
        },
        {
          uuid: BLE.CHAR_INPUT_UUID,
          properties: { broadcast: false, read: false, writeWithoutResponse: true, write: true, notify: false, indicate: false },
        },
        {
          uuid: BLE.CHAR_CONTROL_UUID,
          properties: { broadcast: false, read: false, writeWithoutResponse: true, write: true, notify: false, indicate: false },
        },
      ],
    });

    this._state_char = BLE.CHAR_STATE_UUID;
    this._input_char = BLE.CHAR_INPUT_UUID;
    this._control_char = BLE.CHAR_CONTROL_UUID;

    let writeListenerHandle = null;
    this.ble.addListener('gattCharacteristicWriteRequest', (event) => {
      if (event.characteristic.toLowerCase() === BLE.CHAR_INPUT_UUID.toLowerCase()) {
        const buf = new Uint8Array(event.value);
        this._handleInput(buf, event.deviceId);
      } else if (event.characteristic.toLowerCase() === BLE.CHAR_CONTROL_UUID.toLowerCase()) {
        const buf = new Uint8Array(event.value);
        this._handleControl(buf, event.deviceId);
      }
    }).then(handle => { writeListenerHandle = handle; this._listeners.set('charWrite', handle); });

    let connectListenerHandle = null;
    this.ble.addListener('centralConnected', (event) => {
      this.connected = true;
      this.on_peer_connected?.(event.deviceId);
    }).then(handle => { connectListenerHandle = handle; this._listeners.set('centralConn', handle); });

    let disconnectListenerHandle = null;
    this.ble.addListener('centralDisconnected', (event) => {
      this.on_peer_disconnected?.(event.deviceId);
    }).then(handle => { disconnectListenerHandle = handle; this._listeners.set('centralDisconn', handle); });

    await this.ble.startAdvertising({
      serviceUuids: [BLE.SERVICE_UUID],
      name: 'Aircade',
    });
    this.connected = true;
  }

  async scan() {
    this.role = 'client';
    await this.ble.initialize({ mode: 'central' });
    await this._ensurePermissions();
    
    return new Promise((resolve, reject) => {
      this._scan_timeout = setTimeout(() => {
        this.ble.stopScan();
        reject(new Error('scan timeout'));
      }, 10000);

      let listenerHandle = null;
      this.ble.addListener('deviceScanned', (result) => {
        if (!result.device) return;
        
        const name = result.device.name || '';
        const hasName = name.toLowerCase().includes('aircade');
        
        let hasUuid = false;
        if (result.device.serviceUuids) {
          hasUuid = result.device.serviceUuids.some(u => 
            u.toLowerCase() === BLE.SERVICE_UUID.toLowerCase() || 
            u.toLowerCase() === '0xa1c0' || 
            u.toLowerCase() === 'a1c0'
          );
        }

        if (hasName || hasUuid) {
          clearTimeout(this._scan_timeout);
          this.ble.stopScan();
          if (listenerHandle) listenerHandle.remove();
          this.device_id = result.device.deviceId;
          resolve({ device_id: result.device.deviceId, name: name || 'Aircade Host', rssi: result.device.rssi });
        }
      }).then(handle => {
        listenerHandle = handle;
        this._listeners.set('scan', handle);
      });

      // Scan for all devices, manually filter to avoid Android filter bugs
      this.ble.startScan({
        allowDuplicates: false,
      });
    });
  }

  async connect(device_id) {
    this.device_id = device_id;
    await this.ble.connect({ deviceId: device_id });
    await this.ble.discoverServices({ deviceId: device_id });
    const { services } = await this.ble.getServices({ deviceId: device_id });
    for (const svc of services) {
      if (svc.uuid.toLowerCase() === BLE.SERVICE_UUID.toLowerCase()) {
        for (const char of svc.characteristics) {
          if (char.uuid.toLowerCase() === BLE.CHAR_STATE_UUID.toLowerCase()) {
            this._state_char = char.uuid;
            await this.ble.startCharacteristicNotifications({
              deviceId: device_id,
              service: BLE.SERVICE_UUID,
              characteristic: this._state_char,
            });
            const listener = this.ble.addListener('characteristicChanged', (val) => {
              if (val.deviceId === device_id && val.characteristic === this._state_char) {
                const buf = new Uint8Array(val.value);
                this._recv(buf);
              }
            });
            this._listeners.set('notifications', listener);
          } else if (char.uuid.toLowerCase() === BLE.CHAR_INPUT_UUID.toLowerCase()) {
            this._input_char = char.uuid;
          } else if (char.uuid.toLowerCase() === BLE.CHAR_CONTROL_UUID.toLowerCase()) {
            this._control_char = char.uuid;
          }
        }
      }
    }
    
    if (!this._state_char || !this._input_char || !this._control_char) {
      throw new Error('Bluetooth services missing. Please restart Bluetooth on both phones.');
    }

    this.connected = true;
    this.peer_id = device_id;
    const join = this.codec.encode_join_req('Player');
    await this._write(this._control_char, join);
  }

  async send_input(input) {
    if (!this.connected || !this._input_char) return;
    const buf = this.codec.encode_input(input);
    await this._write(this._input_char, buf);
  }

  async send_control(msg) {
    if (!this.connected || !this._control_char) return;
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
    await this._write(this._control_char, buf);
  }

  async broadcast_state(buf) {
    if (!this.connected || this.role !== 'host' || !this._state_char) return;
    const value = Array.from(buf);
    await this.ble.setGattCharacteristicValue({
      service: BLE.SERVICE_UUID,
      characteristic: this._state_char,
      value,
    });
    await this.ble.notifyGattCharacteristicChanged({
      service: BLE.SERVICE_UUID,
      characteristic: this._state_char,
      value,
    });
  }

  async broadcast_event(buf) {
    if (!this.connected || this.role !== 'host' || !this._state_char) return;
    const value = Array.from(buf);
    await this.ble.setGattCharacteristicValue({
      service: BLE.SERVICE_UUID,
      characteristic: this._state_char,
      value,
    });
    await this.ble.notifyGattCharacteristicChanged({
      service: BLE.SERVICE_UUID,
      characteristic: this._state_char,
      value,
    });
  }

  async _write(char_uuid, buf) {
    if (this.role === 'host') {
      return;
    }
    await this.ble.writeCharacteristic({
      deviceId: this.device_id,
      service: BLE.SERVICE_UUID,
      characteristic: char_uuid,
      value: Array.from(buf),
      type: 'withoutResponse',
    });
  }

  setHostSimulation(sim) {
    this.hostSimulation = sim;
  }

  _handleInput(buf, senderId = 'client') {
    if (!this.connected || !this.hostSimulation) return;
    try {
      const msg = this.codec.decode(buf);
      if (msg.type === 'INPUT') {
        this.hostSimulation.queueInput(senderId, msg);
      }
    } catch {
    }
  }

  _handleControl(buf, senderId = 'client') {
    try {
      const msg = this.codec.decode(buf);
      if (msg.type === 'JOIN_REQ' && this.role === 'host') {
        console.log('[BleTransport] Received JOIN_REQ from', senderId);
        this.connected_peers.add(senderId);
        this.on_peer_connected?.(senderId);
      } else if (msg.type === 'SYNC_REQ' && this.hostSimulation) {
        this.hostSimulation.handleSyncRequest(senderId);
      }
    } catch {
    }
  }

  _recv(buf) {
    if (!this.connected) return;
    try {
      const msg = this.codec.decode(buf);
      this.msg_log?.push({ dir: 'in', type: msg.type, data: msg, time: Date.now() });
      if (msg.type === 'SNAPSHOT' || msg.type === 'DELTA') {
        this.on_state_update?.(msg);
      } else if (msg.type === 'EVENT' || msg.type === 'JOIN_ACCEPT' || msg.type === 'PONG' || msg.type === 'SYNC_RESP') {
        this.on_event?.(msg);
      }
    } catch {
    }
  }

  async disconnect() {
    this.connected = false;
    if (this.role === 'host') {
      await this.ble.stopAdvertising();
      await this.ble.removeGattService({ service: BLE.SERVICE_UUID });
    } else if (this.role === 'client' && this.device_id) {
      await this.ble.disconnect({ deviceId: this.device_id });
    }
    if (this._scan_timeout) clearTimeout(this._scan_timeout);
    for (const [_key, listener] of this._listeners) {
      this.ble.removeListener(listener);
    }
    this._listeners.clear();
    this.on_peer_disconnected?.(this.peer_id);
  }
}

// console.log('BleTransport loaded');