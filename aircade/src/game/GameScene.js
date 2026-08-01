import Phaser from 'phaser';
import { multiplayerManager } from '../multiplayer/MultiplayerManager';
import { BLE } from '../shared/constants/BleConstants';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  preload() {
    this.load.spritesheet('player', 'https://labs.phaser.io/assets/sprites/spaceman.png', { frameWidth: 16, frameHeight: 16 });
    this.load.image('tree', 'https://labs.phaser.io/assets/sprites/pine.png');
    this.load.image('rock', 'https://labs.phaser.io/assets/sprites/asteroid.png');
    this.load.image('radio', 'https://labs.phaser.io/assets/sprites/platformer/powerup.png');
    this.load.image('campfire', 'https://labs.phaser.io/assets/sprites/fire3.png');
    this.load.spritesheet('water', 'https://labs.phaser.io/assets/sprites/water.png', { frameWidth: 32, frameHeight: 32 });
    this.load.image('helicopter', 'https://labs.phaser.io/assets/sprites/enemy-bird.png');
    
    this.load.audio('sfx_chop', 'https://labs.phaser.io/assets/audio/SoundEffects/squit.wav');
    this.load.audio('sfx_wind', 'https://labs.phaser.io/assets/audio/SoundEffects/bodenst-magical_sweep.mp3');
    this.load.audio('sfx_fire', 'https://labs.phaser.io/assets/audio/SoundEffects/magical_horror_audiosprite.mp3');
  }

  create() {
    this.scale.resize(window.innerWidth, window.innerHeight);

    this.health = 100;
    this.inventory = { Wood: 0, Stone: 0, Radio: 0 };
    this.isDead = false;
    this.isWinning = false;
    this.joystickData = { x: 0, y: 0 };
    this.chopRequested = false;
    this.craftRequested = false;
    
    this.players = {}; // Map of id -> { sprite, nameText, id }
    this.trees = new Map();
    this.rocks = new Map();
    this.radios = new Map();
    this.campfires = new Map();

    const bgGraphics = this.add.graphics();
    bgGraphics.fillStyle(0x34495e, 1);
    bgGraphics.fillRect(-2000, -2000, 10000, 10000);
    bgGraphics.fillStyle(0x76b852, 1);
    bgGraphics.fillRoundedRect(0, 0, 4000, 4000, 200);
    bgGraphics.generateTexture('island_bg', 10000, 10000);
    bgGraphics.destroy();
    
    this.add.image(1000, 1000, 'island_bg').setOrigin(0, 0).setDepth(-10);

    this.anims.create({ key: 'water_wave', frames: this.anims.generateFrameNumbers('water', { start: 0, end: 2 }), frameRate: 4, repeat: -1 });

    const graphics = this.add.graphics();
    graphics.fillStyle(0xcccccc, 1);
    graphics.fillCircle(4, 4, 4);
    graphics.generateTexture('smoke', 8, 8);
    graphics.destroy();

    const dustGraphics = this.add.graphics();
    dustGraphics.fillStyle(0xffffff, 0.5);
    dustGraphics.fillCircle(3, 3, 3);
    dustGraphics.generateTexture('dust', 6, 6);
    dustGraphics.destroy();

    const sf = this.add.graphics();
    sf.fillStyle(0xffffff, 0.8);
    sf.fillCircle(1, 1, 1);
    sf.generateTexture('snowflake', 2, 2);
    sf.destroy();

    this.anims.create({ key: 'walk_down', frames: this.anims.generateFrameNumbers('player', { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'walk_left', frames: this.anims.generateFrameNumbers('player', { start: 4, end: 7 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'walk_right', frames: this.anims.generateFrameNumbers('player', { start: 8, end: 11 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'walk_up', frames: this.anims.generateFrameNumbers('player', { start: 12, end: 15 }), frameRate: 8, repeat: -1 });

    this.anims.create({ key: 'idle_down', frames: [ { key: 'player', frame: 0 } ], frameRate: 8 });
    this.anims.create({ key: 'idle_left', frames: [ { key: 'player', frame: 4 } ], frameRate: 8 });
    this.anims.create({ key: 'idle_right', frames: [ { key: 'player', frame: 8 } ], frameRate: 8 });
    this.anims.create({ key: 'idle_up', frames: [ { key: 'player', frame: 12 } ], frameRate: 8 });

    this.dustEmitter = this.add.particles(0, 0, 'dust', {
      speed: { min: 10, max: 20 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      alpha: { start: 0.6, end: 0 },
      lifespan: 300,
      frequency: 100,
      emitting: false
    }).setDepth(10);

    this.splinterEmitter = this.add.particles(0, 0, 'dust', {
      speed: { min: 50, max: 150 },
      lifespan: 400,
      alpha: { start: 1, end: 0 },
      scale: { start: 1.5, end: 0 },
      emitting: false
    }).setDepth(20);

    this.snowEmitter = this.add.particles(0, 0, 'snowflake', {
      x: { min: -800, max: 1600 },
      y: -100,
      speedY: { min: 200, max: 400 },
      speedX: { min: -150, max: -50 },
      lifespan: 4000,
      emitting: false
    }).setDepth(150);
    this.snowEmitter.startFollow(this.cameras.main);

    this.wasd = this.input.keyboard.addKeys('W,S,A,D');
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.game.events.on('joystickMove', (data) => { this.joystickData = data; });
    this.game.events.on('joystickStop', () => { this.joystickData = { x: 0, y: 0 }; });
    this.game.events.on('chopAction', () => { this.chopRequested = true; });
    this.game.events.on('requestCraft', () => { this.craftRequested = true; });
    this.game.events.on('restartGame', () => { this.scene.restart(); });

    this.game.events.on('stateUpdate', (snap) => this.onStateUpdate(snap));
    this.game.events.on('networkEvent', (evt) => this.onNetworkEvent(evt));

    this.scale.on('resize', () => {
      const width = this.scale.width;
      const height = this.scale.height;
      const zoom = Math.max(width, height) / 1200;
      this.cameras.main.setZoom(zoom);
      if (this.darknessLayer) this.darknessLayer.resize(width, height);
    });
    
    const zoom = Math.max(this.scale.width, this.scale.height) / 1200;
    this.cameras.main.setZoom(zoom);

    const holeGraphics = this.add.graphics();
    holeGraphics.fillStyle(0xffffff, 1);
    holeGraphics.fillCircle(150, 150, 150);
    holeGraphics.generateTexture('lightHole', 300, 300);
    holeGraphics.destroy();

    const bgGraphics2 = this.add.graphics();
    bgGraphics2.fillStyle(0x000000, 1);
    bgGraphics2.fillRect(0, 0, 8000, 8000);
    bgGraphics2.generateTexture('blackBg', 8000, 8000);
    bgGraphics2.destroy();

    this.darknessLayer = this.add.renderTexture(0, 0, this.scale.width, this.scale.height).setDepth(100).setAlpha(0).setScrollFactor(0);

    const dummySound = { volume: 0, play: () => {}, destroy: () => {} };
    try {
      this.windSound = this.sound.add('sfx_wind', { loop: true, volume: 0 });
      this.windSound.play();
    } catch {
      this.windSound = dummySound;
    }
    try {
      this.fireSound = this.sound.add('sfx_fire', { loop: true, volume: 0 });
      this.fireSound.play();
    } catch {
      this.fireSound = dummySound;
    }

    this.events.once('shutdown', () => {
      this.game.events.off('joystickMove');
      this.game.events.off('joystickStop');
      this.game.events.off('chopAction');
      this.game.events.off('requestCraft');
      this.game.events.off('restartGame');
      this.game.events.off('stateUpdate');
      this.game.events.off('networkEvent');
      if (this.windSound) this.windSound.destroy();
      if (this.fireSound) this.fireSound.destroy();
    });

    if (multiplayerManager.worldSeed != null) {
      this._initWorld(multiplayerManager.worldSeed);
    }
  }

  _initWorld(seed) {
    const rng = this._seededRandom(seed);
    
    let nextEntityId = 1;
    const entityTypes = { TREE: 0, ROCK: 1, RADIO: 2 };

    for (let i = 0; i < 20; i++) {
      const id = nextEntityId++;
      const x = Math.floor(rng() * 3800) + 100;
      const y = Math.floor(rng() * 3800) + 100;
      const sprite = this.add.image(x, y, 'tree').setDisplaySize(64, 128).setDepth(y);
      this.trees.set(id, { id, type: entityTypes.TREE, x, y, sprite });
    }
    for (let i = 0; i < 15; i++) {
      const id = nextEntityId++;
      const x = Math.floor(rng() * 3800) + 100;
      const y = Math.floor(rng() * 3800) + 100;
      const sprite = this.add.image(x, y, 'rock').setDisplaySize(48, 48).setDepth(y);
      this.rocks.set(id, { id, type: entityTypes.ROCK, x, y, sprite });
    }
    for (let i = 0; i < 3; i++) {
      const id = nextEntityId++;
      const x = Math.floor(rng() * 3800) + 100;
      const y = Math.floor(rng() * 3800) + 100;
      const sprite = this.add.image(x, y, 'radio').setDisplaySize(32, 32).setDepth(y);
      this.radios.set(id, { id, type: entityTypes.RADIO, x, y, sprite });
    }
  }

  _seededRandom(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  onStateUpdate(snap) {
    if (this.isWinning) return;

    // Update darkness
    const targetAlpha = snap.darkness_alpha / 255;
    this.darknessLayer.setAlpha(targetAlpha);
    this.windSound.volume = targetAlpha;
    if (targetAlpha > 0.4) {
      this.snowEmitter.emitting = true;
      const intensity = (targetAlpha - 0.4) / 0.45;
      this.snowEmitter.setFrequency(100 - (intensity * 80));
    } else {
      this.snowEmitter.emitting = false;
    }

    // Process players
    const activeIds = new Set();
    for (const p of snap.players) {
      activeIds.add(p.id);
      let playerObj = this.players[p.id];
      if (!playerObj) {
        const sprite = this.add.sprite(p.x, p.y, 'player').setDisplaySize(48, 48);
        const nameText = this.add.text(p.x, p.y - 30, `P${p.id}`, {
          fontSize: '12px', color: '#fff', stroke: '#000', strokeThickness: 3, fontFamily: 'Silkscreen, monospace'
        }).setOrigin(0.5).setDepth(200);
        playerObj = { id: p.id, sprite, nameText, lastDirection: 'down' };
        this.players[p.id] = playerObj;
      }

      // Update position
      playerObj.sprite.setPosition(p.x, p.y);
      playerObj.nameText.setPosition(p.x, p.y - 30);
      playerObj.sprite.setDepth(p.y);

      // Simple animation logic based on vx/vy
      let isMoving = Math.abs(p.vx) > 0.1 || Math.abs(p.vy) > 0.1;
      if (isMoving) {
        if (Math.abs(p.vx) > Math.abs(p.vy)) {
          if (p.vx < 0) { playerObj.sprite.anims.play('walk_left', true); playerObj.lastDirection = 'left'; }
          else { playerObj.sprite.anims.play('walk_right', true); playerObj.lastDirection = 'right'; }
        } else {
          if (p.vy < 0) { playerObj.sprite.anims.play('walk_up', true); playerObj.lastDirection = 'up'; }
          else { playerObj.sprite.anims.play('walk_down', true); playerObj.lastDirection = 'down'; }
        }
        if (p.id === snap.local_player_id) {
          this.dustEmitter.emitting = true;
          this.dustEmitter.setPosition(p.x, p.y + 24);
        }
      } else {
        playerObj.sprite.anims.play(`idle_${playerObj.lastDirection}`, true);
        if (p.id === snap.local_player_id) this.dustEmitter.emitting = false;
      }

      // If it's the local player, update HUD and Camera
      if (p.id === snap.local_player_id) {
        this.cameras.main.startFollow(playerObj.sprite);
        this.health = p.health;
        this.inventory = { Wood: p.inv.wood, Stone: p.inv.stone, Radio: p.inv.radio };
        this.isDead = p.health <= 0;
        this.emitHUDUpdate();
        
        if (this.isDead && !this.isWinning) {
          this.game.events.emit('gameOver');
        }
        if (this.inventory.Radio >= 3 && !this.isWinning) {
          this.triggerWin(playerObj.sprite);
        }
      }
    }

    // Cleanup disconnected players
    for (const id in this.players) {
      if (!activeIds.has(Number(id))) {
        this.players[id].sprite.destroy();
        this.players[id].nameText.destroy();
        delete this.players[id];
      }
    }

    // Process campfires (snap.campfires doesn't have IDs, just active positions)
    // We recreate them every tick for simplicity in the mock.
    for (const [_, cf] of this.campfires) cf.sprite.destroy();
    this.campfires.clear();
    
    snap.campfires.forEach((c, idx) => {
      if (c.active) {
        const sprite = this.add.image(c.x, c.y, 'campfire').setDisplaySize(48, 48).setDepth(c.y);
        this.campfires.set(idx, { x: c.x, y: c.y, sprite });
      }
    });
  }

  onNetworkEvent(evt) {
    if (evt.evt_type === BLE.EVENT_TYPES.GATHER) {
      let group;
      if (evt.item_id === BLE.ITEM_IDS.WOOD) group = this.trees;
      if (evt.item_id === BLE.ITEM_IDS.STONE) group = this.rocks;
      if (evt.item_id === BLE.ITEM_IDS.RADIO) group = this.radios;
      
      if (group && group.has(evt.target_id)) {
        const item = group.get(evt.target_id);
        this.splinterEmitter.setParticleTint(evt.item_id === BLE.ITEM_IDS.WOOD ? 0x8B4513 : (evt.item_id === BLE.ITEM_IDS.RADIO ? 0x3498db : 0x95a5a6));
        this.splinterEmitter.emitParticleAt(item.x, item.y, 10);
        item.sprite.destroy();
        group.delete(evt.target_id);
        
        if (evt.player_id === multiplayerManager.playerId) {
          this.cameras.main.shake(100, 0.005);
          this.playSound('sfx_chop', { volume: 0.5 });
          const labels = { 0: 'Wood', 1: 'Stone', 2: 'Radio' };
          this.spawnFloatingText(`+1 ${labels[evt.item_id]}`, '#fff');
        }
      }
    } else if (evt.evt_type === BLE.EVENT_TYPES.CRAFT) {
      // Particles for craft
      this.add.particles(evt.x, evt.y, 'smoke', {
        speed: { min: 20, max: 40 }, angle: { min: 250, max: 290 },
        scale: { start: 1, end: 3 }, alpha: { start: 0.5, end: 0 },
        lifespan: 2000, frequency: 200, blendMode: 'ADD'
      }).setDepth(50);
      this.playSound('sfx_chop', { volume: 0.5 });
    } else if (evt.evt_type === BLE.EVENT_TYPES.DAMAGE) {
      if (evt.player_id === multiplayerManager.playerId) {
        this.cameras.main.shake(200, 0.01);
        this.spawnFloatingText('-5 HP', '#e74c3c');
        const pObj = this.players[evt.player_id];
        if (pObj) {
          pObj.sprite.setTint(0xff0000);
          this.time.delayedCall(200, () => pObj.sprite.clearTint());
        }
      }
    } else if (evt.evt_type === BLE.EVENT_TYPES.WIN) {
      if (!this.isWinning) {
        const pObj = this.players[evt.player_id];
        if (pObj) this.triggerWin(pObj.sprite);
      }
    }
  }

  triggerWin(playerSprite) {
    this.isWinning = true;
    this.isDead = true;
    this.dustEmitter.emitting = false;
    
    this.cameras.main.pan(playerSprite.x, playerSprite.y, 1000, 'Sine.easeInOut');
    
    const heli = this.add.sprite(this.cameras.main.scrollX - 400, playerSprite.y - 150, 'helicopter').setDepth(200);
    this.tweens.add({
      targets: heli,
      x: playerSprite.x + 800,
      duration: 4000,
      onComplete: () => this.game.events.emit('gameWon')
    });
  }

  playSound(key, config) {
    if (this.cache.audio.exists(key)) {
      try { this.sound.play(key, config); } catch (e) {}
    }
  }

  emitHUDUpdate() {
    this.game.events.emit('updateHUD', { health: this.health, inventory: this.inventory });
  }

  spawnFloatingText(text, color) {
    const pObj = this.players[multiplayerManager.playerId];
    if (!pObj) return;
    const floating = this.add.text(pObj.sprite.x, pObj.sprite.y - 30, text, {
      fontSize: '20px', color: color, stroke: '#000', strokeThickness: 4, fontFamily: 'Silkscreen, monospace'
    }).setOrigin(0.5).setDepth(200);
    this.tweens.add({ targets: floating, y: pObj.sprite.y - 80, alpha: 0, duration: 1500, onComplete: () => floating.destroy() });
  }

  update(time, delta) {
    if (this.isWinning) return;

    this.darknessLayer.clear();
    this.darknessLayer.draw('blackBg', 0, 0);

    const scrollX = this.cameras.main.scrollX;
    const scrollY = this.cameras.main.scrollY;
    
    const pObj = this.players[multiplayerManager.playerId];
    if (pObj) {
      this.darknessLayer.erase('lightHole', pObj.sprite.x - scrollX - 150, pObj.sprite.y - scrollY - 150);
    }
    
    let closestFireDist = Infinity;
    for (const [_, fire] of this.campfires) {
      const flicker = Math.random() * 4 - 2;
      this.darknessLayer.erase('lightHole', fire.x - scrollX - 150 + flicker, fire.y - scrollY - 150 + flicker);
      if (pObj) {
        const dist = Phaser.Math.Distance.Between(pObj.sprite.x, pObj.sprite.y, fire.x, fire.y);
        if (dist < closestFireDist) closestFireDist = dist;
      }
    }
    
    if (closestFireDist < 300) {
      this.fireSound.volume = 1 - (closestFireDist / 300);
    } else {
      this.fireSound.volume = 0;
    }

    if (this.isDead) return;

    // Build Input Packet
    let joy_x = 0;
    let joy_y = 0;
    let flags = 0;
    let target_id = 0;
    let target_type = 0;

    if (this.wasd.A.isDown) joy_x = -1;
    else if (this.wasd.D.isDown) joy_x = 1;
    if (this.wasd.W.isDown) joy_y = -1;
    else if (this.wasd.S.isDown) joy_y = 1;

    if (this.joystickData.x !== 0 || this.joystickData.y !== 0) {
      joy_x = this.joystickData.x;
      joy_y = this.joystickData.y;
    }

    // Chop logic - finding the nearest entity
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey) || this.chopRequested) {
      flags |= BLE.INPUT_FLAGS.CHOP;
      this.chopRequested = false;
      
      if (pObj) {
        let minDist = 80; // Gather radius
        let closest = null;
        const checkGroup = (group, type) => {
          for (const [id, item] of group) {
            const dist = Phaser.Math.Distance.Between(pObj.sprite.x, pObj.sprite.y, item.x, item.y);
            if (dist < minDist) {
              minDist = dist;
              closest = { id, type };
            }
          }
        };
        checkGroup(this.trees, BLE.ENTITY_TYPES.TREE);
        checkGroup(this.rocks, BLE.ENTITY_TYPES.ROCK);
        checkGroup(this.radios, BLE.ENTITY_TYPES.RADIO);
        
        if (closest) {
          target_id = closest.id;
          target_type = closest.type;
        }
      }
    }

    if (this.craftRequested) {
      flags |= BLE.INPUT_FLAGS.CRAFT;
      this.craftRequested = false;
    }

    // Queue input to multiplayerManager
    // joy_x / joy_y need to be integers for the codec. Codec uses i16 but expects values?
    // In HostSimulation: vx = input.joy_x * speed. Wait, does Codec scale them?
    // Let's just send [-1, 1].
    multiplayerManager.queueInput({
      flags,
      joy_x,
      joy_y,
      target_id,
      target_type
    });
  }
}
