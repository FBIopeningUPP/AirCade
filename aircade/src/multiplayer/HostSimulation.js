import { BLE } from '../shared/constants/BleConstants';

export class HostSimulation {
  constructor(transport, codec, worldSeed) {
    this.transport = transport;
    this.codec = codec;
    this.worldSeed = worldSeed;
    this.tickRate = BLE.TICK_RATE;
    this.tickMs = BLE.TICK_MS;
    this.currentTick = 0;
    this.inputBuffers = new Map();
    this.players = new Map();
    this.trees = new Map();
    this.rocks = new Map();
    this.radios = new Map();
    this.campfires = new Map();
    this.nextEntityId = 1;
    this.nextPlayerId = 1;
    this.darknessAlpha = 0;
    this.running = false;
    this.tickInterval = null;
    this.maxPlayers = 4;
    this.playerPositions = new Map();
    this.playerVelocities = new Map();
    this.playerHealth = new Map();
    this.playerInventories = new Map();
    this.numericIds = new Map();
    this.entityTypes = {
      TREE: 0,
      ROCK: 1,
      RADIO: 2,
      CAMPFIRE: 3,
    };
    this.gatherRadius = 80;
    this.campfireWarmRadius = 150;
    this.darknessDamageIntervalTicks = 3000 / this.tickMs;
    this.lastDarknessDamageTick = 0;
    this.winRadioCount = 3;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._generateWorld();
    this.tickInterval = setInterval(() => this._tick(), this.tickMs);
    console.log('[HostSimulation] Started');
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    console.log('[HostSimulation] Stopped');
  }

  _generateWorld() {
    const rng = this._seededRandom(this.worldSeed);
    for (let i = 0; i < 150; i++) {
      const id = this.nextEntityId++;
      const x = Math.floor(rng() * 3800) + 100;
      const y = Math.floor(rng() * 3800) + 100;
      this.trees.set(id, { id, x, y, active: true, type: this.entityTypes.TREE });
    }
    for (let i = 0; i < 100; i++) {
      const id = this.nextEntityId++;
      const x = Math.floor(rng() * 3800) + 100;
      const y = Math.floor(rng() * 3800) + 100;
      this.rocks.set(id, { id, x, y, active: true, type: this.entityTypes.ROCK });
    }
    for (let i = 0; i < 5; i++) {
      const id = this.nextEntityId++;
      const x = Math.floor(rng() * 3800) + 100;
      const y = Math.floor(rng() * 3800) + 100;
      this.radios.set(id, { id, x, y, active: true, type: this.entityTypes.RADIO });
    }
  }

  _seededRandom(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  _tick() {
    this.currentTick++;
    this._processInputs();
    this._updatePhysics();
    this._updateDarkness();
    this._broadcastSnapshot();
  }

  _processInputs() {
    for (const [playerId, inputs] of this.inputBuffers) {
      if (inputs.length === 0) {
        this.playerVelocities.set(playerId, { vx: 0, vy: 0 });
        continue;
      }
      // Consume all pending inputs and apply the latest
      let lastInput = null;
      while (inputs.length > 0) {
        lastInput = inputs.shift();
      }
      const player = this.players.get(playerId);
      if (!player) continue;
      this._applyInput(playerId, lastInput);
    }
  }

  _applyInput(playerId, input) {
    const speed = 400;
    const dt = this.tickMs / 1000;
    const vx = input.joy_x * speed;
    const vy = input.joy_y * speed;
    if (vx !== 0 || vy !== 0) {
      console.log(`[HostSimulation] _applyInput: playerId=${playerId}, joy_x=${input.joy_x}, vx=${vx}, dt=${dt}`);
    }
    this.playerVelocities.set(playerId, { vx, vy });
    if (input.flags & BLE.INPUT_FLAGS.CHOP) {
      this._tryGather(playerId, input.target_id, input.target_type);
    }
    if (input.flags & BLE.INPUT_FLAGS.CRAFT) {
      this._tryCraftCampfire(playerId);
    }
  }

  _tryGather(playerId, targetId, targetType) {
    const pos = this.playerPositions.get(playerId);
    if (!pos) return;
    let entities;
    switch (targetType) {
      case BLE.ENTITY_TYPES.TREE:
        entities = this.trees;
        break;
      case BLE.ENTITY_TYPES.ROCK:
        entities = this.rocks;
        break;
      case BLE.ENTITY_TYPES.RADIO:
        entities = this.radios;
        break;
      default:
        return;
    }
    const entity = entities.get(targetId);
    if (!entity || !entity.active) return;
    const dist = Math.hypot(pos.x - entity.x, pos.y - entity.y);
    if (dist < this.gatherRadius) {
      entity.active = false;
      const inventory = this.playerInventories.get(playerId) || { wood: 0, stone: 0, radio: 0 };
      let itemId;
      switch (targetType) {
        case BLE.ENTITY_TYPES.TREE:
          inventory.wood++;
          itemId = BLE.ITEM_IDS.WOOD;
          break;
        case BLE.ENTITY_TYPES.ROCK:
          inventory.stone++;
          itemId = BLE.ITEM_IDS.STONE;
          break;
        case BLE.ENTITY_TYPES.RADIO:
          inventory.radio++;
          itemId = BLE.ITEM_IDS.RADIO;
          break;
      }
      this.playerInventories.set(playerId, inventory);
      this._broadcastEvent({
        evt_type: BLE.EVENT_TYPES.GATHER,
        player_id: playerId,
        target_id: targetId,
        item_id: itemId,
        qty: 1,
      });
      this._checkWin(playerId, inventory);
    }
  }

  _tryCraftCampfire(playerId) {
    const inventory = this.playerInventories.get(playerId) || { wood: 0, stone: 0, radio: 0 };
    if (inventory.wood >= 2 && inventory.stone >= 1) {
      inventory.wood -= 2;
      inventory.stone -= 1;
      this.playerInventories.set(playerId, inventory);
      const pos = this.playerPositions.get(playerId);
      if (!pos) return;
      const id = this.nextEntityId++;
      this.campfires.set(id, { id, x: pos.x, y: pos.y, active: true, type: this.entityTypes.CAMPFIRE });
      this._broadcastEvent({
        evt_type: BLE.EVENT_TYPES.CRAFT,
        player_id: playerId,
        campfire_id: id,
        x: pos.x,
        y: pos.y,
      });
    }
  }

  _checkWin(playerId, inventory) {
    if (inventory.radio >= this.winRadioCount) {
      this._broadcastEvent({
        evt_type: BLE.EVENT_TYPES.WIN,
        player_id: playerId,
      });
    }
  }

  _updatePhysics() {
    for (const [playerId, vel] of this.playerVelocities) {
      const pos = this.playerPositions.get(playerId);
      if (!pos) continue;
      if (vel.vx !== 0 || vel.vy !== 0) {
        console.log(`[HostSimulation] _updatePhysics: playerId=${playerId}, pos before=(${pos.x}, ${pos.y}), vx=${vel.vx}`);
      }
      pos.x += vel.vx * (this.tickMs / 1000);
      pos.y += vel.vy * (this.tickMs / 1000);
      
      const checkCollision = (group, radius) => {
        for (const item of group.values()) {
          if (!item.active) continue;
          const cf_r = 20;
          const dy_offset = item.type === this.entityTypes.TREE ? 30 : 0;
          const dx = pos.x - item.x;
          const dy = pos.y - (item.y + dy_offset);
          const min_dist = (cf_r + p_r) * 0.9;
          const dist = Math.hypot(dx, dy);
          if (dist < min_dist) {
            const push = min_dist - dist;
            const pdx = dist === 0 ? 1 : dx / dist;
            const pdy = dist === 0 ? 0 : dy / dist;
            pos.x += pdx * push;
            pos.y += pdy * push;
          }
        }
      };
      
      checkCollision(this.trees, 20);
      checkCollision(this.rocks, 15);
      
      pos.x = Math.max(24, Math.min(3976, pos.x));
      pos.y = Math.max(24, Math.min(3976, pos.y));
    }
  }

  _updateDarkness() {
    const cycle = Math.sin((this.currentTick / 3600) * Math.PI * 2 - Math.PI / 2);
    this.darknessAlpha = Math.max(0, cycle) * 0.85;

    if (this.currentTick - this.lastDarknessDamageTick > this.darknessDamageIntervalTicks) {
      this.lastDarknessDamageTick = this.currentTick;
      for (const [playerId, pos] of this.playerPositions) {
        let isWarm = false;
        for (const campfire of this.campfires.values()) {
          if (campfire.active) {
            const dist = Math.hypot(pos.x - campfire.x, pos.y - campfire.y);
            if (dist < this.campfireWarmRadius) {
              isWarm = true;
              break;
            }
          }
        }
        
        const health = this.playerHealth.get(playerId) || 100;
        
        if (!isWarm && this.darknessAlpha > 0.5) {
          // Freezing
          const newHealth = health - 5;
          this.playerHealth.set(playerId, newHealth);
          this._broadcastEvent({
            evt_type: BLE.EVENT_TYPES.DAMAGE,
            player_id: this.numericIds.get(playerId) || 0,
            new_health: Math.max(0, newHealth),
          });
          if (newHealth <= 0) {
            this._handlePlayerDeath(playerId);
          }
        } else if (isWarm && health < 100) {
          // Healing by the fire
          const newHealth = Math.min(100, health + 2);
          this.playerHealth.set(playerId, newHealth);
          this._broadcastEvent({
            evt_type: BLE.EVENT_TYPES.DAMAGE,
            player_id: this.numericIds.get(playerId) || 0,
            new_health: newHealth,
          });
        }
      }
    }
  }

  _handlePlayerDeath(playerId) {
    this.playerPositions.delete(playerId);
    this.playerVelocities.delete(playerId);
    this.playerHealth.delete(playerId);
    this.playerInventories.delete(playerId);
    this.players.delete(playerId);
    this.inputBuffers.delete(playerId);
    this.numericIds.delete(playerId);
    this._broadcastEvent({
      evt_type: BLE.EVENT_TYPES.PLAYER_LEFT,
      player_id: this.numericIds.get(playerId) || 0,
    });
  }

  _broadcastSnapshot() {
    const players = [];
    for (const [playerId, pos] of this.playerPositions) {
      const vel = this.playerVelocities.get(playerId) || { vx: 0, vy: 0 };
      const health = this.playerHealth.get(playerId) || 100;
      const inv = this.playerInventories.get(playerId) || { wood: 0, stone: 0, radio: 0 };
      players.push({
        id: playerId,
        x: pos.x,
        y: pos.y,
        vx: vel.vx,
        vy: vel.vy,
        health,
        inv: {
          wood: inv.wood,
          stone: inv.stone,
          radio: inv.radio,
        },
      });
    }
    const campfires = [];
    for (const [_id, cf] of this.campfires) {
      if (cf.active) {
        campfires.push({ x: cf.x, y: cf.y, active: cf.active });
      }
    }
    const snapshot = {
      tick: this.currentTick,
      player_count: players.length,
      local_player_id: 0,
      players,
      darkness_alpha: Math.floor(this.darknessAlpha * 255),
      campfires,
      last_ack_seq: 0,
    };
    const buf = this.codec.encode_snapshot(snapshot);
    this.transport.broadcast_state(buf);
  }

  _broadcastEvent(evt) {
    const buf = this.codec.encode_event(evt);
    this.transport.broadcast_event(buf);
  }

  addPlayer(playerId) {
    if (this.players.size >= this.maxPlayers) return false;
    this.players.set(playerId, true);
    this.inputBuffers.set(playerId, []);
    this.playerPositions.set(playerId, { x: 400, y: 300 });
    this.playerVelocities.set(playerId, { vx: 0, vy: 0 });
    this.playerHealth.set(playerId, 100);
    this.playerInventories.set(playerId, { wood: 0, stone: 0, radio: 0 });
    const numId = this.nextPlayerId++;
    this.numericIds.set(playerId, numId);
    this._broadcastEvent({
      evt_type: BLE.EVENT_TYPES.PLAYER_JOINED,
      player_id: numId,
    });
    return true;
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    this.inputBuffers.delete(playerId);
    this._handlePlayerDeath(playerId);
  }

  queueInput(playerId, input) {
    const buffer = this.inputBuffers.get(playerId);
    if (input.joy_x !== 0 || input.joy_y !== 0) {
      console.log(`[HostSimulation] queueInput for ${playerId}, buffer exists: ${!!buffer}, joy_x: ${input.joy_x}`);
    }
    if (buffer) {
      buffer.push(input);
    }
  }

  getSnapshot(localPlayerId = null) {
    const sortedPlayerIds = Array.from(this.playerPositions.keys()).sort();
    const players = [];
    let local_player_id = 0;
    for (let i = 0; i < sortedPlayerIds.length; i++) {
      const playerId = sortedPlayerIds[i];
      if (localPlayerId === playerId) {
        local_player_id = i;
      }
      const pos = this.playerPositions.get(playerId);
      const vel = this.playerVelocities.get(playerId) || { vx: 0, vy: 0 };
      const health = this.playerHealth.get(playerId) || 100;
      const inv = this.playerInventories.get(playerId) || { wood: 0, stone: 0, radio: 0 };
      const numId = this.numericIds.get(playerId) || 0;
      players.push({
        id: numId,
        x: pos.x,
        y: pos.y,
        vx: vel.vx,
        vy: vel.vy,
        health,
        inv: {
          wood: inv.wood,
          stone: inv.stone,
          radio: inv.radio,
        },
      });
    }
    const campfires = [];
    for (const [_id, cf] of this.campfires) {
      if (cf.active) {
        campfires.push({ x: cf.x, y: cf.y, active: cf.active });
      }
    }
    return {
      tick: this.currentTick,
      player_count: players.length,
      local_player_id,
      players,
      darkness_alpha: Math.floor(this.darknessAlpha * 255),
      campfires,
      last_ack_seq: 0,
    };
  }

  getPlayerIndex(playerId) {
    const sortedPlayerIds = Array.from(this.playerPositions.keys()).sort();
    return sortedPlayerIds.indexOf(playerId);
  }

  handleSyncRequest(playerId) {
    const snapshot = this.getSnapshot(playerId);
    const buf = this.codec.encode_sync_resp(snapshot);
    this.transport._sendToPeer(playerId, buf);
  }
}