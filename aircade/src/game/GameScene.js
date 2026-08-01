import Phaser from 'phaser';
import { BLE } from '../shared/constants/BleConstants';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
    this.joystickData = { x: 0, y: 0 };
    this.isHost = false;
    this.playerId = null;
    this.networkPlayers = new Map();
    this.networkCampfires = new Map();
    this.networkTrees = new Map();
    this.networkRocks = new Map();
    this.networkRadios = new Map();
    this.lastSnapshotTick = 0;
    this.darknessAlpha = 0;
  }

  preload() {
    this.load.image('player', '/player.jpg');
    this.load.image('tree', '/assets/tree.png');
    this.load.image('rock', '/rock.jpg');
    this.load.image('campfire', '/campfire.jpg');
    this.load.image('radio', '/radio_part.png');
  }

  create() {
    this.cameras.main.setBackgroundColor('#1e90ff');
    this.add.circle(2000, 2000, 1800, 0xfada5e);
    
    this.cameras.main.setBounds(-500, -500, 5000, 5000);
    this.physics.world.setBounds(0, 0, 4000, 4000);
    
    this.player = this.physics.add.sprite(400, 300, 'player').setDisplaySize(48, 48).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.player.body.setSize(this.player.width * 0.7, this.player.height * 0.7);
    this.player.body.setCollideWorldBounds(true);
    this.cameras.main.startFollow(this.player);

    this.trees = this.physics.add.staticGroup();
    this.rocks = this.physics.add.staticGroup();
    this.radios = this.physics.add.staticGroup();
    this.campfires = this.physics.add.staticGroup();
    
    this.physics.add.collider(this.player, this.trees);
    this.physics.add.collider(this.player, this.rocks);
    this.physics.add.collider(this.player, this.radios);
    this.physics.add.collider(this.player, this.campfires);

    this.wasd = this.input.keyboard.addKeys('W,S,A,D');

    this.game.events.on('joystickMove', (data) => {
      this.joystickData = data;
    });
    this.game.events.on('joystickStop', () => {
      this.joystickData = { x: 0, y: 0 };
    });
    
    this.game.events.on('chopAction', () => {
      this.emit('chopAction');
    });

    this.game.events.on('craftCampfire', () => {
      this.emit('craftCampfire');
    });

    this.scale.on('resize', () => {
      const zoom = Math.max(this.scale.width, this.scale.height) / 1200;
      this.cameras.main.setZoom(zoom);
    });
    const zoom = Math.max(this.scale.width, this.scale.height) / 1200;
    this.cameras.main.setZoom(zoom);

    this.darkness = this.add.rectangle(0, 0, 4000, 4000, 0x000000).setOrigin(0, 0).setAlpha(0).setDepth(100);

    this.time.addEvent({ delay: 3000, loop: true, callback: () => {
      if (this.darknessAlpha > 0.5 && !this.isHost) {
        let isWarm = false;
        for (const fire of this.campfires.getChildren()) {
          if (fire.active && Phaser.Math.Distance.Between(this.player.x, this.player.y, fire.x, fire.y) < 150) {
            isWarm = true;
          }
        }
        if (!isWarm) this.game.events.emit('takeDamage');
      }
    } });
  }

  applySnapshot(snapshot) {
    if (snapshot.type === 'SNAPSHOT') {
      this._applyFullSnapshot(snapshot);
    } else if (snapshot.type === 'DELTA') {
      this._applyDelta(snapshot);
    }
    this.lastSnapshotTick = snapshot.tick;
  }

  _applyFullSnapshot(snap) {
    this.darknessAlpha = snap.darkness_alpha / 255;
    if (this.darkness) {
      this.darkness.setAlpha(this.darknessAlpha);
    }

    const localPlayerData = snap.players[snap.local_player_id];
    if (localPlayerData) {
      this.player.setPosition(localPlayerData.x, localPlayerData.y);
      this.player.body.setVelocity(localPlayerData.vx, localPlayerData.vy);
    }

    const currentPlayerIds = new Set(snap.players.map((_, i) => i));
    for (const [id, netPlayer] of this.networkPlayers) {
      if (!currentPlayerIds.has(id)) {
        netPlayer.sprite.destroy();
        this.networkPlayers.delete(id);
      }
    }

    for (let i = 0; i < snap.players.length; i++) {
      if (i === snap.local_player_id) continue;
      const p = snap.players[i];
      let netPlayer = this.networkPlayers.get(i);
      if (!netPlayer) {
        const sprite = this.physics.add.sprite(p.x, p.y, 'player').setDisplaySize(48, 48).setBlendMode(Phaser.BlendModes.MULTIPLY);
        sprite.body.setSize(sprite.width * 0.7, sprite.height * 0.7);
        sprite.body.setCollideWorldBounds(true);
        this.physics.add.collider(sprite, this.trees);
        this.physics.add.collider(sprite, this.rocks);
        this.physics.add.collider(sprite, this.radios);
        this.physics.add.collider(sprite, this.campfires);
        netPlayer = { sprite, lastUpdate: this.time.now };
        this.networkPlayers.set(i, netPlayer);
      }
      netPlayer.sprite.setPosition(p.x, p.y);
      netPlayer.sprite.body.setVelocity(p.vx, p.vy);
      netPlayer.lastUpdate = this.time.now;
    }

    this._syncEntities(this.trees, snap.trees || []);
    this._syncEntities(this.rocks, snap.rocks || []);
    this._syncEntities(this.radios, snap.radios || []);
    this._syncCampfires(snap.campfires || []);
  }

  _applyDelta(delta) {
    for (const change of delta.changes) {
      if (change.entity_type === BLE.ENTITY_TYPES.TREE) {
        if (change.flags & 0x01) {
          const tree = this.trees.getChildren().find(t => t.entityId === change.entity_id);
          if (tree) tree.destroy();
        }
      } else if (change.entity_type === BLE.ENTITY_TYPES.ROCK) {
        if (change.flags & 0x01) {
          const rock = this.rocks.getChildren().find(r => r.entityId === change.entity_id);
          if (rock) rock.destroy();
        }
      } else if (change.entity_type === BLE.ENTITY_TYPES.RADIO) {
        if (change.flags & 0x01) {
          const radio = this.radios.getChildren().find(r => r.entityId === change.entity_id);
          if (radio) radio.destroy();
        }
      } else if (change.entity_type === BLE.ENTITY_TYPES.CAMPFIRE) {
        if (change.has_pos) {
          let campfire = this.networkCampfires.get(change.entity_id);
          if (!campfire) {
            campfire = this.campfires.create(change.x, change.y, 'campfire')
              .setDisplaySize(48, 48)
              .setBlendMode(Phaser.BlendModes.MULTIPLY);
            campfire.refreshBody();
            this.networkCampfires.set(change.entity_id, campfire);
          } else {
            campfire.setPosition(change.x, change.y);
            campfire.refreshBody();
          }
          campfire.entityId = change.entity_id;
        }
      }
    }
  }

  _syncEntities(group, entities) {
    const currentIds = new Set(entities.map(e => e.id));
    for (const child of group.getChildren()) {
      if (!currentIds.has(child.entityId)) {
        child.destroy();
      }
    }
    for (const e of entities) {
      let entity = group.getChildren().find(c => c.entityId === e.id);
      if (!entity) {
        const texture = group === this.trees ? 'tree' : group === this.rocks ? 'rock' : 'radio';
        const displaySize = group === this.trees ? { w: 64, h: 128 } : group === this.rocks ? { w: 48, h: 48 } : { w: 32, h: 32 };
        entity = group.create(e.x, e.y, texture).setDisplaySize(displaySize.w, displaySize.h).setBlendMode(Phaser.BlendModes.MULTIPLY);
        if (group === this.trees) {
          entity.body.setSize(entity.width * 0.4, entity.height * 0.3);
          entity.body.setOffset(entity.width * 0.3, entity.height * 0.7);
        }
        entity.refreshBody();
        entity.entityId = e.id;
      } else {
        entity.setPosition(e.x, e.y);
        entity.refreshBody();
      }
      entity.active = e.active;
      entity.setVisible(e.active);
    }
  }

  _syncCampfires(campfires) {
    const currentIds = new Set(campfires.map(c => c.id));
    for (const [id, cf] of this.networkCampfires) {
      if (!currentIds.has(id)) {
        cf.destroy();
        this.networkCampfires.delete(id);
      }
    }
    for (const c of campfires) {
      let cf = this.networkCampfires.get(c.id);
      if (!cf) {
        cf = this.campfires.create(c.x, c.y, 'campfire')
          .setDisplaySize(48, 48)
          .setBlendMode(Phaser.BlendModes.MULTIPLY);
        cf.refreshBody();
        this.networkCampfires.set(c.id, cf);
      }
      cf.setPosition(c.x, c.y);
      cf.refreshBody();
      cf.active = c.active;
      cf.setVisible(c.active);
    }
  }

  handleEvent(evt) {
    switch (evt.evt_type) {
      case BLE.EVENT_TYPES.GATHER:
        this._handleGatherEvent(evt);
        break;
      case BLE.EVENT_TYPES.CRAFT:
        this._handleCraftEvent(evt);
        break;
      case BLE.EVENT_TYPES.DAMAGE:
        if (evt.player_id === this.playerId) {
          this.game.events.emit('takeDamage');
        }
        break;
      case BLE.EVENT_TYPES.WIN:
        this.game.events.emit('win');
        break;
      case BLE.EVENT_TYPES.PLAYER_JOINED:
        break;
      case BLE.EVENT_TYPES.PLAYER_LEFT:
        const netPlayer = this.networkPlayers.get(evt.player_id);
        if (netPlayer) {
          netPlayer.sprite.destroy();
          this.networkPlayers.delete(evt.player_id);
        }
        break;
    }
  }

  _handleGatherEvent(evt) {
    const targetId = evt.target_id;
    const targetType = evt.item_id;
    let group;
    if (targetType === BLE.ITEM_IDS.WOOD) group = this.trees;
    else if (targetType === BLE.ITEM_IDS.STONE) group = this.rocks;
    else if (targetType === BLE.ITEM_IDS.RADIO) group = this.radios;
    if (group) {
      const entity = group.getChildren().find(e => e.entityId === targetId);
      if (entity) {
        entity.destroy();
      }
    }
  }

  _handleCraftEvent(evt) {
    const campfire = this.campfires.create(evt.x, evt.y, 'campfire')
      .setDisplaySize(48, 48)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
    campfire.refreshBody();
    campfire.entityId = evt.campfire_id;
    this.networkCampfires.set(evt.campfire_id, campfire);
  }

  setHostMode(isHost, playerId) {
    this.isHost = isHost;
    this.playerId = playerId;
  }

  update() {
    if (this.darkness && this.darknessAlpha < 0.85) {
      this.darknessAlpha += 0.0001;
      this.darkness.setAlpha(this.darknessAlpha);
    }

    this.player.body.setVelocity(0);
    const speed = 400;

    if (this.wasd.A.isDown) this.player.body.setVelocityX(-speed);
    else if (this.wasd.D.isDown) this.player.body.setVelocityX(speed);

    if (this.wasd.W.isDown) this.player.body.setVelocityY(-speed);
    else if (this.wasd.S.isDown) this.player.body.setVelocityY(speed);

    if (this.joystickData.x !== 0 || this.joystickData.y !== 0) {
      this.player.body.setVelocityX(this.joystickData.x * speed);
      this.player.body.setVelocityY(this.joystickData.y * speed);
    }
  }
}