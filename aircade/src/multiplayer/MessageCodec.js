import { BinWriter, BinReader, packPos, unpackPos } from '../../shared/utilities/binary';
import { BLE } from '../../shared/constants/BleConstants';

export class MessageCodec {
  constructor() {
    this.max_pkt = BLE.MTU;
  }

  encode_input(input) {
    const w = new BinWriter(32);
    w.u8(BLE.MSG_TYPES.INPUT);
    w.u16(input.seq);
    w.u8(input.tick & 0xff);
    w.u8(input.flags);
    w.i16(input.joy_x);
    w.i16(input.joy_y);
    w.u8((input.target_id << 3) | input.target_type);
    return w.done();
  }

  encode_join_req(name) {
    const w = new BinWriter(32);
    w.u8(BLE.MSG_TYPES.JOIN_REQ);
    w.u16(0);
    const n = new TextEncoder().encode(name.slice(0, 16));
    w.u8(n.length);
    w.bytes(n);
    return w.done();
  }

  encode_ping(seq, client_time) {
    const w = new BinWriter(16);
    w.u8(BLE.MSG_TYPES.PING);
    w.u16(seq);
    w.u32(client_time);
    return w.done();
  }

  encode_sync_req(last_tick, last_seq) {
    const w = new BinWriter(16);
    w.u8(BLE.MSG_TYPES.SYNC_REQ);
    w.u16(last_tick);
    w.u16(last_seq);
    return w.done();
  }

  encode_snapshot(snap) {
    const w = new BinWriter(this.max_pkt);
    w.u8(BLE.MSG_TYPES.SNAPSHOT);
    w.u16(snap.tick);
    w.u8((snap.player_count << 6) | (snap.local_player_id & 0x3));

    for (const p of snap.players) {
      const pos = packPos(p.x, p.y);
      w.u8(pos >> 16); w.u8(pos >> 8); w.u8(pos);
      w.i16(Math.round(p.vx * 10));
      w.i16(Math.round(p.vy * 10));
      w.u8(p.health);
      const inv = (p.inv.wood << 11) | (p.inv.stone << 6) | (p.inv.radio << 3);
      w.u16(inv);
    }

    w.u8(snap.darkness_alpha);
    w.u8(snap.campfires.length);
    for (const c of snap.campfires) {
      const pos = packPos(c.x, c.y);
      w.u8(pos >> 16); w.u8(pos >> 8); w.u8(pos);
      w.u8(c.active ? 1 : 0);
    }

    w.u16(snap.last_ack_seq);
    return w.done();
  }

  encode_delta(delta) {
    const w = new BinWriter(this.max_pkt);
    w.u8(BLE.MSG_TYPES.DELTA);
    w.u16(delta.tick);
    w.u8(delta.changes.length);
    for (const ch of delta.changes) {
      w.u8((ch.entity_type << 6) | (ch.entity_id & 0x3f));
      w.u8(ch.flags);
      if (ch.has_pos) {
        const pos = packPos(ch.x, ch.y);
        w.u8(pos >> 16); w.u8(pos >> 8); w.u8(pos);
      }
    }
    w.u16(delta.last_ack_seq);
    return w.done();
  }

  encode_event(evt) {
    const w = new BinWriter(32);
    w.u8(BLE.MSG_TYPES.EVENT);
    w.u8(evt.evt_type);
    w.u8(evt.player_id);
    switch (evt.evt_type) {
      case BLE.EVENT_TYPES.GATHER:
        w.u8((evt.target_id << 3) | evt.item_id);
        w.u8(evt.qty);
        break;
      case BLE.EVENT_TYPES.CRAFT:
        w.u8(evt.campfire_id);
        const pos = packPos(evt.x, evt.y);
        w.u8(pos >> 16); w.u8(pos >> 8); w.u8(pos);
        break;
      case BLE.EVENT_TYPES.DAMAGE:
        w.u8(evt.new_health);
        break;
      case BLE.EVENT_TYPES.WIN:
        break;
    }
    return w.done();
  }

  encode_join_accept(player_id, world_seed, snap) {
    const w = new BinWriter(this.max_pkt);
    w.u8(BLE.MSG_TYPES.JOIN_ACCEPT);
    w.u8(player_id);
    w.u16(world_seed);
    const snap_buf = this.encode_snapshot(snap);
    w.bytes(snap_buf.slice(1));
    return w.done();
  }

  encode_pong(seq, server_time, client_time) {
    const w = new BinWriter(16);
    w.u8(BLE.MSG_TYPES.PONG);
    w.u16(seq);
    w.u32(server_time);
    w.u32(client_time);
    return w.done();
  }

  encode_sync_resp(snap) {
    const w = new BinWriter(this.max_pkt);
    w.u8(BLE.MSG_TYPES.SYNC_RESP);
    const snap_buf = this.encode_snapshot(snap);
    w.bytes(snap_buf.slice(1));
    return w.done();
  }

  decode(buf) {
    const r = new BinReader(buf);
    const type = r.u8();
    switch (type) {
      case BLE.MSG_TYPES.INPUT:
        return this._dec_input(r);
      case BLE.MSG_TYPES.JOIN_REQ:
        return this._dec_join_req(r);
      case BLE.MSG_TYPES.PING:
        return this._dec_ping(r);
      case BLE.MSG_TYPES.SYNC_REQ:
        return this._dec_sync_req(r);
      case BLE.MSG_TYPES.SNAPSHOT:
        return this._dec_snapshot(r);
      case BLE.MSG_TYPES.DELTA:
        return this._dec_delta(r);
      case BLE.MSG_TYPES.EVENT:
        return this._dec_event(r);
      case BLE.MSG_TYPES.JOIN_ACCEPT:
        return this._dec_join_accept(r);
      case BLE.MSG_TYPES.PONG:
        return this._dec_pong(r);
      case BLE.MSG_TYPES.SYNC_RESP:
        return this._dec_sync_resp(r);
      default:
        throw new Error('unknown type ' + type.toString(16));
    }
  }

  _dec_input(r) {
    return {
      type: 'INPUT',
      seq: r.u16(),
      tick: r.u8(),
      flags: r.u8(),
      joy_x: r.i16(),
      joy_y: r.i16(),
      target: r.u8(),
    };
  }

  _dec_join_req(r) {
    const len = r.u8();
    const name = new TextDecoder().decode(r.bytes(len));
    return { type: 'JOIN_REQ', name };
  }

  _dec_ping(r) {
    return { type: 'PING', seq: r.u16(), client_time: r.u32() };
  }

  _dec_sync_req(r) {
    return { type: 'SYNC_REQ', last_tick: r.u16(), last_seq: r.u16() };
  }

  _dec_snapshot(r) {
    const tick = r.u16();
    const pc = r.u8();
    const player_count = pc >> 6;
    const local_player_id = pc & 0x3;
    const players = [];
    for (let i = 0; i < player_count; i++) {
      const pos = (r.u8() << 16) | (r.u8() << 8) | r.u8();
      const { x, y } = unpackPos(pos);
      players.push({
        id: i,
        x, y,
        vx: r.i16() / 10,
        vy: r.i16() / 10,
        health: r.u8(),
        inv: {
          wood: (r.u16() >> 11) & 0x1f,
          stone: (r.u16() >> 6) & 0x1f,
          radio: (r.u16() >> 3) & 0x7,
        },
      });
    }
    return {
      type: 'SNAPSHOT',
      tick,
      player_count,
      local_player_id,
      players,
      darkness_alpha: r.u8(),
      campfires: [],
      last_ack_seq: r.u16(),
    };
  }

  _dec_delta(r) {
    const tick = r.u16();
    const count = r.u8();
    const changes = [];
    for (let i = 0; i < count; i++) {
      const et = r.u8();
      const flags = r.u8();
      const has_pos = (flags & 0x80) !== 0;
      let x = 0, y = 0;
      if (has_pos) {
        const pos = (r.u8() << 16) | (r.u8() << 8) | r.u8();
        ({ x, y } = unpackPos(pos));
      }
      changes.push({
        entity_type: et >> 6,
        entity_id: et & 0x3f,
        flags: flags & 0x7f,
        has_pos, x, y,
      });
    }
    return { type: 'DELTA', tick, changes, last_ack_seq: r.u16() };
  }

  _dec_event(r) {
    const evt_type = r.u8();
    const player_id = r.u8();
    let evt = { type: 'EVENT', evt_type, player_id };
    switch (evt_type) {
      case BLE.EVENT_TYPES.GATHER:
        const t = r.u8();
        evt.target_id = t >> 3;
        evt.item_id = t & 0x7;
        evt.qty = r.u8();
        break;
      case BLE.EVENT_TYPES.CRAFT:
        evt.campfire_id = r.u8();
        const pos = (r.u8() << 16) | (r.u8() << 8) | r.u8();
        ({ x: evt.x, y: evt.y } = unpackPos(pos));
        break;
      case BLE.EVENT_TYPES.DAMAGE:
        evt.new_health = r.u8();
        break;
      case BLE.EVENT_TYPES.WIN:
        break;
    }
    return evt;
  }

  _dec_join_accept(r) {
    const player_id = r.u8();
    const world_seed = r.u16();
    const snap = this._dec_snapshot(r);
    return { type: 'JOIN_ACCEPT', player_id, world_seed, snapshot: snap };
  }

  _dec_pong(r) {
    return { type: 'PONG', seq: r.u16(), server_time: r.u32(), client_time: r.u32() };
  }

  _dec_sync_resp(r) {
    const snap = this._dec_snapshot(r);
    return { type: 'SYNC_RESP', snapshot: snap };
  }
}

// console.log('codec test', new MessageCodec().encode_input({seq:1,tick:0,flags:3,joy_x:500,joy_y:-200,target_id:5,target_type:0}));