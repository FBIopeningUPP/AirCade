import Phaser from 'phaser';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  init(data) {
    this.socket = data?.socket;
    this.roomData = data?.roomData;
    this.joystickData = { x: 0, y: 0 };
    this.otherPlayers = {};
  }

  preload() {
    this.load.spritesheet('player', '/player_sheet_aligned_fixed.png', { frameWidth: 256, frameHeight: 256 });
    this.load.image('grass', '/grass_tile.png');
    this.load.image('sand', '/sand_tile.png');
    this.load.spritesheet('water', '/water_sheet.png', { frameWidth: 64, frameHeight: 64 });
    this.load.image('tree', '/tree.png');
    this.load.image('rock', '/rock.png');
    this.load.image('campfire', '/campfire.png');
    this.load.image('radio', '/radio_part.png');
    this.load.image('helicopter', '/helicopter.png');
    this.load.audio('sfx_chop', ['sfx_chop.mp3', 'sfx_chop.wav', 'sfx_chop.ogg']);
    this.load.audio('sfx_wind', ['sfx_wind.mp3', 'sfx_wind.wav', 'sfx_wind.ogg']);
    this.load.audio('sfx_fire', ['sfx_fire.mp3', 'sfx_fire.wav', 'sfx_fire.ogg']);
  }

  create() {
    this.inventory = { Wood: 0, Stone: 0, Radio: 0 };
    this.health = 100;
    this.isDead = false;

    this.anims.create({ key: 'water_wave', frames: this.anims.generateFrameNumbers('water', { start: 0, end: 2 }), frameRate: 4, repeat: -1 });

    const tileSize = 64;
    const mapSizeTiles = 64;

    const map = this.make.tilemap({ tileWidth: tileSize, tileHeight: tileSize, width: mapSizeTiles, height: mapSizeTiles });
    const tsWater = map.addTilesetImage('water', 'water');
    const tsSand = map.addTilesetImage('sand', 'sand');
    const tsGrass = map.addTilesetImage('grass', 'grass');
    
    const waterLayer = map.createBlankLayer('waterLayer', tsWater).setDepth(-10);
    const sandLayer = map.createBlankLayer('sandLayer', tsSand).setDepth(-10);
    const grassLayer = map.createBlankLayer('grassLayer', tsGrass).setDepth(-10);

    for (let x = 0; x < mapSizeTiles; x++) {
      for (let y = 0; y < mapSizeTiles; y++) {
        if (x < 6 || x > 57 || y < 6 || y > 57) {
          waterLayer.putTileAt(0, x, y);
        } else if (x < 9 || x > 54 || y < 9 || y > 54) {
          sandLayer.putTileAt(0, x, y);
        } else {
          grassLayer.putTileAt(0, x, y);
        }
      }
    }

    this.waterLayer = waterLayer;
    this.waterFrame = 0;
    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        this.waterFrame = (this.waterFrame + 1) % 3;
        this.waterLayer.forEachTile(tile => {
          if (tile) tile.index = this.waterFrame;
        });
      }
    });

    const graphics = this.add.graphics();
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(4, 4, 4);
    graphics.generateTexture('smoke', 8, 8);
    graphics.destroy();

    const dustGraphics = this.add.graphics();
    dustGraphics.fillStyle(0x8B4513, 1);
    dustGraphics.fillCircle(3, 3, 3);
    dustGraphics.generateTexture('dust', 6, 6);
    dustGraphics.destroy();

    const sf = this.add.graphics();
    sf.fillStyle(0xffffff, 0.8);
    sf.fillRect(0,0,2,2);
    sf.generateTexture('snowflake', 2, 2);
    sf.destroy();

    this.cameras.main.setBounds(500, 500, 4096 - 1000, 4096 - 1000);
    this.physics.world.setBounds(500, 500, 4096 - 1000, 4096 - 1000);
    
    this.player = this.physics.add.sprite(4096 / 2, 4096 / 2, 'player').setDisplaySize(48, 48);
    this.player.body.setSize(this.player.width * 0.7, this.player.height * 0.7);
    this.player.body.setCollideWorldBounds(true);
    this.cameras.main.startFollow(this.player);

    this.anims.create({ key: 'walk_down', frames: this.anims.generateFrameNumbers('player', { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'walk_left', frames: this.anims.generateFrameNumbers('player', { start: 4, end: 7 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'walk_right', frames: this.anims.generateFrameNumbers('player', { start: 8, end: 11 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'walk_up', frames: this.anims.generateFrameNumbers('player', { start: 12, end: 15 }), frameRate: 8, repeat: -1 });

    this.anims.create({ key: 'idle_down', frames: [ { key: 'player', frame: 0 } ], frameRate: 8 });
    this.anims.create({ key: 'idle_left', frames: [ { key: 'player', frame: 4 } ], frameRate: 8 });
    this.anims.create({ key: 'idle_right', frames: [ { key: 'player', frame: 8 } ], frameRate: 8 });
    this.anims.create({ key: 'idle_up', frames: [ { key: 'player', frame: 12 } ], frameRate: 8 });

    this.lastDirection = 'down';
    this.player.anims.play('idle_down', true);

    this.otherPlayersGroup = this.physics.add.group();
    if (this.roomData && this.roomData.players) {
      this.roomData.players.forEach(p => {
        if (p.id !== this.roomData.myId) {
          this.spawnRemotePlayer(p);
        }
      });
    }

    if (this.socket) {
      this.socket.on('playerJoined', (p) => {
        if (p.id !== this.roomData.myId && !this.otherPlayers[p.id]) {
          this.spawnRemotePlayer(p);
        }
      });

      this.socket.on('playerLeft', (id) => {
        if (this.otherPlayers[id]) {
          this.otherPlayers[id].sprite.destroy();
          this.otherPlayers[id].nameText.destroy();
          delete this.otherPlayers[id];
        }
      });

      this.socket.on('playerMoved', (data) => {
        if (this.otherPlayers[data.id]) {
          const remote = this.otherPlayers[data.id];
          remote.sprite.setPosition(data.x, data.y);
          remote.sprite.anims.play(data.anim, true);
          remote.nameText.setPosition(data.x, data.y - 30);
        }
      });

      this.socket.on('resourceGathered', (data) => {
        // Find the resource by x/y
        let group;
        if (data.type === 'tree') group = this.trees;
        if (data.type === 'rock') group = this.rocks;
        if (data.type === 'radio') group = this.radios;
        
        if (group) {
          const item = group.getChildren().find(i => Math.abs(i.x - data.x) < 5 && Math.abs(i.y - data.y) < 5);
          if (item) {
            this.splinterEmitter.setParticleTint(data.type === 'tree' ? 0x8B4513 : 0x95a5a6);
            this.splinterEmitter.emitParticleAt(item.x, item.y, 10);
            item.destroy();
          }
        }
      });

      this.socket.on('craftCampfire', (data) => {
        this.spawnCampfire(data.x, data.y);
      });
    }

    this.dustEmitter = this.add.particles(0, 0, 'dust', {
      speed: { min: 10, max: 20 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      alpha: { start: 0.6, end: 0 },
      lifespan: 300,
      frequency: 100,
      emitting: false
    }).setDepth(10);
    this.dustEmitter.startFollow(this.player, 0, 24);

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

    const getSafeSpawn = (groupArray) => {
      let x, y, safe;
      do {
        safe = true;
        x = Phaser.Math.Between(600, 3496);
        y = Phaser.Math.Between(600, 3496);
        for (let g of groupArray) {
          if (g) {
            g.getChildren().forEach(item => {
              if (Phaser.Math.Distance.Between(x, y, item.x, item.y) < 100) safe = false;
            });
          }
        }
      } while (!safe);
      return { x, y };
    };

    // Helper to set a centered hitbox based on a proportion of the sprite size
    const setHitbox = (obj, proportion = 0.6) => {
      const w = obj.displayWidth * proportion;
      const h = obj.displayHeight * proportion;
      obj.body.setSize(w, h);
      obj.body.setOffset((obj.displayWidth - w) / 2, (obj.displayHeight - h) / 2);
    };

    this.trees = this.physics.add.staticGroup();
    for (let i = 0; i < 20; i++) {
      const pos = getSafeSpawn([this.trees, this.rocks, this.radios]);
      const tree = this.trees.create(pos.x, pos.y, 'tree').setDisplaySize(64, 128);
      setHitbox(tree, 0.6);
      tree.refreshBody();
    }
    this.physics.add.collider(this.player, this.trees);

    this.rocks = this.physics.add.staticGroup();
    for (let i = 0; i < 15; i++) {
      const pos = getSafeSpawn([this.trees, this.rocks, this.radios]);
      const rock = this.rocks.create(pos.x, pos.y, 'rock').setDisplaySize(48, 48);
      setHitbox(rock, 0.7);
      rock.refreshBody();
    }
    this.physics.add.collider(this.player, this.rocks);

    this.radios = this.physics.add.staticGroup();
    for (let i = 0; i < 3; i++) {
      const pos = getSafeSpawn([this.trees, this.rocks, this.radios]);
      const radio = this.radios.create(pos.x, pos.y, 'radio').setDisplaySize(32, 32);
      setHitbox(radio, 0.7);
      radio.refreshBody();
    }
    this.physics.add.collider(this.player, this.radios);

    this.campfires = this.physics.add.staticGroup();
    this.physics.add.collider(this.player, this.campfires);

    this.wasd = this.input.keyboard.addKeys('W,S,A,D');
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.game.events.on('joystickMove', (data) => {
      this.joystickData = data;
    });
    this.game.events.on('joystickStop', () => {
      this.joystickData = { x: 0, y: 0 };
    });
    
    this.game.events.on('chopAction', () => {
      if (this.isDead) return;

      // physics.overlap doesn't fire in event handlers (only in update loop).
      // Use manual distance check instead - reach radius of 80px.
      const REACH = 80;
      let gathered = false;

      // Check trees
      for (const tree of this.trees.getChildren()) {
        if (gathered) break;
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, tree.x, tree.y);
        if (dist < REACH) {
          this.splinterEmitter.setParticleTint(0x8B4513);
          this.splinterEmitter.emitParticleAt(tree.x, tree.y, 10);
          this.cameras.main.shake(100, 0.005);
          if (this.socket) this.socket.emit('resourceGathered', { type: 'tree', x: tree.x, y: tree.y });
          tree.destroy();
          this.inventory.Wood++;
          this.emitHUDUpdate();
          this.spawnFloatingText('+1 Wood', '#2ecc71');
          this.playSound('sfx_chop', { volume: 0.5 });
          gathered = true;
        }
      }

      if (gathered) return;

      // Check rocks
      for (const rock of this.rocks.getChildren()) {
        if (gathered) break;
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, rock.x, rock.y);
        if (dist < REACH) {
          this.splinterEmitter.setParticleTint(0x95a5a6);
          this.splinterEmitter.emitParticleAt(rock.x, rock.y, 10);
          this.cameras.main.shake(100, 0.005);
          if (this.socket) this.socket.emit('resourceGathered', { type: 'rock', x: rock.x, y: rock.y });
          rock.destroy();
          this.inventory.Stone++;
          this.emitHUDUpdate();
          this.spawnFloatingText('+1 Stone', '#95a5a6');
          this.playSound('sfx_chop', { volume: 0.5 });
          gathered = true;
        }
      }

      if (gathered) return;

      // Check radios
      for (const radio of this.radios.getChildren()) {
        if (gathered) break;
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, radio.x, radio.y);
        if (dist < REACH) {
          if (this.socket) this.socket.emit('resourceGathered', { type: 'radio', x: radio.x, y: radio.y });
          radio.destroy();
          this.inventory.Radio++;
          this.emitHUDUpdate();
          this.spawnFloatingText('+1 Radio', '#3498db');
          this.playSound('sfx_chop', { volume: 0.3 });
          gathered = true;
        }
      }
    });

    this.game.events.on('requestCraft', () => {
      if (this.isDead) return;
      if (this.inventory.Wood >= 2 && this.inventory.Stone >= 1) {
        this.inventory.Wood -= 2;
        this.inventory.Stone -= 1;
        this.emitHUDUpdate();
        
        if (this.socket) this.socket.emit('craftCampfire', { x: this.player.x, y: this.player.y });
        this.spawnCampfire(this.player.x, this.player.y);
      }
    });

    this.game.events.on('restartGame', () => {
      this.scene.restart();
    });

    this.scale.on('resize', () => {
      const width = this.scale.width;
      const height = this.scale.height;
      const zoom = Math.max(width, height) / 1200;
      this.cameras.main.setZoom(zoom);
      if (this.darknessLayer) {
        this.darknessLayer.resize(width, height);
      }
      if (this.minimap) {
        const mmSize = Math.min(200, width * 0.3);
        const mmX = width - mmSize - 20;
        this.minimap.setViewport(mmX, 20, mmSize, mmSize);
        if (this.borderGraphics) {
          this.borderGraphics.clear();
          this.borderGraphics.lineStyle(4, 0xffffff, 1);
          this.borderGraphics.strokeRect(mmX, 20, mmSize, mmSize);
        }
      }
    });
    const zoom = Math.max(this.scale.width, this.scale.height) / 1200;
    this.cameras.main.setZoom(zoom);

    const holeGraphics = this.add.graphics();
    holeGraphics.fillStyle(0xffffff, 1);
    holeGraphics.fillCircle(150, 150, 150);
    holeGraphics.generateTexture('lightHole', 300, 300);
    holeGraphics.destroy();

    const bgGraphics = this.add.graphics();
    bgGraphics.fillStyle(0x000000, 1);
    bgGraphics.fillRect(0, 0, 8000, 8000);
    bgGraphics.generateTexture('blackBg', 8000, 8000);
    bgGraphics.destroy();

    this.darknessAlpha = 0;
    this.darknessDirection = 1;
    this.dayCount = 1;
    this.darknessLayer = this.add.renderTexture(0, 0, this.scale.width, this.scale.height).setDepth(100).setAlpha(0).setScrollFactor(0);

    this.time.addEvent({ delay: 3000, loop: true, callback: () => {
      if (this.darknessAlpha > 0.5) {
        let isWarm = false;
        for (const fire of this.campfires.getChildren()) {
          if (Phaser.Math.Distance.Between(this.player.x, this.player.y, fire.x, fire.y) < 150) isWarm = true;
        }
        if (!isWarm && !this.isDead) {
          this.health = Math.max(0, this.health - 5);
          this.emitHUDUpdate();
          this.cameras.main.shake(200, 0.01);
          this.spawnFloatingText('-5 HP', '#e74c3c');
          this.player.setTint(0xff0000);
          this.time.delayedCall(200, () => this.player.clearTint());
          if (this.health <= 0) {
            this.isDead = true;
            this.game.events.emit('gameOver');
          }
        }
      }
    } });

    // Initial HUD update
    this.time.delayedCall(100, () => this.emitHUDUpdate());

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

    const initWidth = this.scale.width;
    const initMmSize = Math.min(200, initWidth * 0.3);
    const initMmX = initWidth - initMmSize - 20;

    this.minimap = this.cameras.add(initMmX, 20, initMmSize, initMmSize).setZoom(0.05).setName('mini');
    this.minimap.startFollow(this.player);
    this.minimap.ignore(this.darknessLayer);

    const borderGraphics = this.add.graphics();
    borderGraphics.lineStyle(4, 0xffffff, 1);
    borderGraphics.strokeRect(initMmX, 20, initMmSize, initMmSize);
    borderGraphics.setScrollFactor(0);
    this.minimap.ignore(borderGraphics);
    this.borderGraphics = borderGraphics;

    this.events.once('shutdown', () => {
      this.game.events.off('joystickMove');
      this.game.events.off('joystickStop');
      this.game.events.off('chopAction');
      this.game.events.off('requestCraft');
      this.game.events.off('restartGame');
      if (this.windSound) this.windSound.destroy();
      if (this.fireSound) this.fireSound.destroy();
      if (this.socket) {
        this.socket.off('playerJoined');
        this.socket.off('playerLeft');
        this.socket.off('playerMoved');
        this.socket.off('resourceGathered');
        this.socket.off('craftCampfire');
      }
    });
  }

  spawnCampfire(x, y) {
    const campfire = this.campfires.create(x, y, 'campfire').setDisplaySize(48, 48);
    const w = campfire.displayWidth * 0.6;
    const h = campfire.displayHeight * 0.6;
    campfire.body.setSize(w, h);
    campfire.body.setOffset((campfire.displayWidth - w) / 2, (campfire.displayHeight - h) / 2);
    campfire.refreshBody();

    this.add.particles(campfire.x, campfire.y, 'smoke', {
      speed: { min: 20, max: 40 },
      angle: { min: 250, max: 290 },
      scale: { start: 1, end: 3 },
      alpha: { start: 0.5, end: 0 },
      lifespan: 2000,
      frequency: 200,
      blendMode: 'ADD'
    }).setDepth(50);
  }

  spawnRemotePlayer(p) {
    const sprite = this.physics.add.sprite(p.x, p.y, 'player').setDisplaySize(48, 48);
    sprite.body.setSize(sprite.width * 0.7, sprite.height * 0.7);
    sprite.setCollideWorldBounds(true);
    sprite.anims.play(p.anim, true);
    
    const nameText = this.add.text(p.x, p.y - 30, p.name, {
      fontSize: '12px',
      color: '#fff',
      stroke: '#000',
      strokeThickness: 3,
      fontFamily: 'Silkscreen, monospace'
    }).setOrigin(0.5).setDepth(200);

    this.otherPlayersGroup.add(sprite);
    this.otherPlayers[p.id] = { sprite, nameText, id: p.id };
  }

  playSound(key, config) {
    if (this.cache.audio.exists(key)) {
      try {
        this.sound.play(key, config);
      } catch (e) {
        console.warn('Play sound failed for', key, e);
      }
    }
  }

  emitHUDUpdate() {
    this.game.events.emit('updateHUD', {
      health: this.health,
      inventory: this.inventory
    });
  }

  spawnFloatingText(text, color) {
    const floating = this.add.text(this.player.x, this.player.y - 30, text, {
      fontSize: '20px',
      color: color,
      stroke: '#000',
      strokeThickness: 4,
      fontFamily: 'Silkscreen, monospace'
    }).setOrigin(0.5).setDepth(200);

    this.tweens.add({
      targets: floating,
      y: this.player.y - 80,
      alpha: 0,
      duration: 1500,
      onComplete: () => floating.destroy()
    });
  }

  update(time, delta) {
    if (this.inventory.Radio >= 3) {
      if (!this.isWinning) {
        this.isWinning = true;
        this.isDead = true;
        this.player.body.setVelocity(0);
        this.dustEmitter.emitting = false;
        
        this.cameras.main.pan(this.player.x, this.player.y, 1000, 'Sine.easeInOut');
        
        const heli = this.add.sprite(this.cameras.main.scrollX - 400, this.player.y - 150, 'helicopter').setDepth(200);
        this.tweens.add({
          targets: heli,
          x: this.player.x + 800,
          duration: 4000,
          onComplete: () => this.game.events.emit('gameWon')
        });
      }
      return;
    }

    if (this.isDead) {
      this.player.body.setVelocity(0);
      this.dustEmitter.emitting = false;
      // Continue updating the darkness layer and particles even if dead
    }

    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.game.events.emit('chopAction');
    }

    this.darknessAlpha += (0.0001 / 16) * delta * this.darknessDirection;
    if (this.darknessAlpha >= 0.85) {
      this.darknessAlpha = 0.85;
      this.darknessDirection = -1;
    } else if (this.darknessAlpha <= 0) {
      this.darknessAlpha = 0;
      if (this.darknessDirection === -1) {
        this.darknessDirection = 1;
        this.dayCount++;
        this.game.events.emit('newDay', this.dayCount);
      }
    }
    this.darknessLayer.setAlpha(this.darknessAlpha);
    this.windSound.volume = this.darknessAlpha;

    if (this.darknessAlpha > 0.4) {
      this.snowEmitter.emitting = true;
      const intensity = (this.darknessAlpha - 0.4) / 0.45;
      this.snowEmitter.setFrequency(100 - (intensity * 80));
    } else {
      this.snowEmitter.emitting = false;
    }

    this.darknessLayer.clear();
    this.darknessLayer.draw('blackBg', 0, 0);

    const scrollX = this.cameras.main.scrollX;
    const scrollY = this.cameras.main.scrollY;

    this.darknessLayer.erase('lightHole', this.player.x - scrollX - 150, this.player.y - scrollY - 150);
    
    let closestFireDist = Infinity;
    for (const fire of this.campfires.getChildren()) {
      const flicker = Math.random() * 4 - 2;
      this.darknessLayer.erase('lightHole', fire.x - scrollX - 150 + flicker, fire.y - scrollY - 150 + flicker);
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, fire.x, fire.y);
      if (dist < closestFireDist) closestFireDist = dist;
    }
    
    if (closestFireDist < 300) {
      this.fireSound.volume = 1 - (closestFireDist / 300);
    } else {
      this.fireSound.volume = 0;
    }

    this.player.body.setVelocity(0);
    const speed = 400;
    let isMoving = false;

    if (this.wasd.A.isDown && !this.isDead) {
      this.player.body.setVelocityX(-speed);
      this.player.anims.play('walk_left', true);
      this.lastDirection = 'left';
      isMoving = true;
    } else if (this.wasd.D.isDown && !this.isDead) {
      this.player.body.setVelocityX(speed);
      this.player.anims.play('walk_right', true);
      this.lastDirection = 'right';
      isMoving = true;
    }

    if (this.wasd.W.isDown && !this.isDead) {
      this.player.body.setVelocityY(-speed);
      this.player.anims.play('walk_up', true);
      this.lastDirection = 'up';
      isMoving = true;
    } else if (this.wasd.S.isDown && !this.isDead) {
      this.player.body.setVelocityY(speed);
      this.player.anims.play('walk_down', true);
      this.lastDirection = 'down';
      isMoving = true;
    }

    if ((this.joystickData.x !== 0 || this.joystickData.y !== 0) && !this.isDead) {
      this.player.body.setVelocityX(this.joystickData.x * speed);
      this.player.body.setVelocityY(this.joystickData.y * speed);
      isMoving = true;
      if (Math.abs(this.joystickData.x) > Math.abs(this.joystickData.y)) {
        if (this.joystickData.x < 0) {
          this.player.anims.play('walk_left', true);
          this.lastDirection = 'left';
        } else {
          this.player.anims.play('walk_right', true);
          this.lastDirection = 'right';
        }
      } else {
        if (this.joystickData.y < 0) {
          this.player.anims.play('walk_up', true);
          this.lastDirection = 'up';
        } else {
          this.player.anims.play('walk_down', true);
          this.lastDirection = 'down';
        }
      }
    }

    if (!this.isDead) {
      if (isMoving) {
        this.dustEmitter.emitting = true;
        if (!this.stepTimer || time > this.stepTimer) {
          this.playSound('sfx_chop', { volume: 0.05, rate: 2 });
          this.stepTimer = time + 250;
        }
      } else {
        this.dustEmitter.emitting = false;
        this.player.anims.play(`idle_${this.lastDirection}`, true);
      }
      
      // Emit player movement to server
      if (this.socket) {
        const currentAnim = this.player.anims.currentAnim ? this.player.anims.currentAnim.key : `idle_${this.lastDirection}`;
        // Only send if changed position or animation significantly (throttling can be added later)
        this.socket.emit('playerMove', { x: this.player.x, y: this.player.y, anim: currentAnim });
      }
    }
  }
}
