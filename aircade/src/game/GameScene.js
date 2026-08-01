import Phaser from 'phaser';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
    this.joystickData = { x: 0, y: 0 };
  }

  preload() {
    this.load.image('player', '/player.jpg');
    this.load.image('tree', 'https://labs.phaser.io/assets/sprites/tree.png');
    this.load.image('rock', '/rock.jpg');
    this.load.image('campfire', '/campfire.jpg');
    this.load.image('radio', '/radio_part.png');
    this.load.image('island', '/island_map.jpg');
  }

  create() {
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

    this.add.image(2000, 2000, 'island').setDisplaySize(4000, 4000).setDepth(-1);
    
    this.cameras.main.setBounds(-500, -500, 5000, 5000);
    this.physics.world.setBounds(0, 0, 4000, 4000);
    
    this.player = this.physics.add.sprite(400, 300, 'player').setDisplaySize(48, 48).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.player.body.setSize(this.player.width * 0.7, this.player.height * 0.7);
    this.player.body.setCollideWorldBounds(true);
    this.cameras.main.startFollow(this.player);

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

    this.trees = this.physics.add.staticGroup();
    for (let i = 0; i < 20; i++) {
      const x = Phaser.Math.Between(100, 3900);
      const y = Phaser.Math.Between(100, 3900);
      const tree = this.trees.create(x, y, 'tree').setDisplaySize(64, 128).setBlendMode(Phaser.BlendModes.MULTIPLY);
      tree.body.setSize(tree.width * 0.4, tree.height * 0.3);
      tree.body.setOffset(tree.width * 0.3, tree.height * 0.7);
    }
    this.physics.add.collider(this.player, this.trees);

    this.rocks = this.physics.add.staticGroup();
    for (let i = 0; i < 15; i++) {
      const x = Phaser.Math.Between(100, 3900);
      const y = Phaser.Math.Between(100, 3900);
      const rock = this.rocks.create(x, y, 'rock').setDisplaySize(48, 48).setBlendMode(Phaser.BlendModes.MULTIPLY);
      rock.refreshBody();
    }
    this.physics.add.collider(this.player, this.rocks);

    this.radios = this.physics.add.staticGroup();
    for (let i = 0; i < 3; i++) {
      const x = Phaser.Math.Between(100, 3900);
      const y = Phaser.Math.Between(100, 3900);
      const radio = this.radios.create(x, y, 'radio').setDisplaySize(32, 32);
      radio.refreshBody();
    }
    this.physics.add.collider(this.player, this.radios);

    this.campfires = this.physics.add.staticGroup();
    this.physics.add.collider(this.player, this.campfires);

    this.wasd = this.input.keyboard.addKeys('W,S,A,D');

    this.game.events.on('joystickMove', (data) => {
      this.joystickData = data;
    });
    this.game.events.on('joystickStop', () => {
      this.joystickData = { x: 0, y: 0 };
    });
    
    this.game.events.on('chopAction', () => {
      let gathered = false;
      
      for (const tree of this.trees.getChildren()) {
        if (tree.active) {
          const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, tree.x, tree.y);
          if (dist < 80) {
            tree.destroy();
            this.game.events.emit('itemGathered', 'Wood');
            this.spawnFloatingText('+1 Wood', '#2ecc71');
            gathered = true;
            break;
          }
        }
      }

      if (gathered) return;

      for (const rock of this.rocks.getChildren()) {
        if (rock.active) {
          const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, rock.x, rock.y);
          if (dist < 80) {
            rock.destroy();
            this.game.events.emit('itemGathered', 'Stone');
            this.spawnFloatingText('+1 Stone', '#95a5a6');
            gathered = true;
            break;
          }
        }
      }

      if (gathered) return;

      for (const radio of this.radios.getChildren()) {
        if (radio.active) {
          const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, radio.x, radio.y);
          if (dist < 80) {
            radio.destroy();
            this.game.events.emit('itemGathered', 'Radio');
            this.spawnFloatingText('+1 Radio', '#3498db');
            break;
          }
        }
      }
    });

    this.game.events.on('craftCampfire', () => {
      const fire = this.campfires.create(this.player.x, this.player.y, 'campfire')
        .setDisplaySize(48, 48)
        .setBlendMode(Phaser.BlendModes.MULTIPLY);
      fire.refreshBody();

      this.add.particles(fire.x, fire.y, 'smoke', {
        speed: { min: 20, max: 40 },
        angle: { min: 250, max: 290 },
        scale: { start: 1, end: 3 },
        alpha: { start: 0.5, end: 0 },
        lifespan: 2000,
        frequency: 200,
        blendMode: 'ADD'
      }).setDepth(50);
    });

    this.scale.on('resize', () => {
      const zoom = Math.max(this.scale.width, this.scale.height) / 1200;
      this.cameras.main.setZoom(zoom);
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
    bgGraphics.fillRect(0, 0, 4000, 4000);
    bgGraphics.generateTexture('blackBg', 4000, 4000);
    bgGraphics.destroy();

    this.darknessAlpha = 0;
    this.darknessDirection = 1;
    this.dayCount = 1;
    this.darknessLayer = this.add.renderTexture(0, 0, 4000, 4000).setDepth(100).setAlpha(0);

    this.time.addEvent({ delay: 3000, loop: true, callback: () => {
      if (this.darknessAlpha > 0.5) {
        let isWarm = false;
        for (const fire of this.campfires.getChildren()) {
          if (Phaser.Math.Distance.Between(this.player.x, this.player.y, fire.x, fire.y) < 150) isWarm = true;
        }
        if (!isWarm) {
          this.game.events.emit('takeDamage');
          this.cameras.main.shake(200, 0.01);
          this.spawnFloatingText('-5 HP', '#e74c3c');
        }
      }
    } });
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

  update() {
    this.darknessAlpha += 0.0001 * this.darknessDirection;
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

    this.darknessLayer.clear();
    this.darknessLayer.draw('blackBg', 0, 0);
    this.darknessLayer.erase('lightHole', this.player.x - 150, this.player.y - 150);
    for (const fire of this.campfires.getChildren()) {
      this.darknessLayer.erase('lightHole', fire.x - 150, fire.y - 150);
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

    if (this.player.body.velocity.x !== 0 || this.player.body.velocity.y !== 0) {
      this.dustEmitter.emitting = true;
    } else {
      this.dustEmitter.emitting = false;
    }
  }
}
