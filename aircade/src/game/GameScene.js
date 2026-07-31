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
            break;
          }
        }
      }
    });

    this.game.events.on('craftCampfire', () => {
      this.campfires.create(this.player.x, this.player.y, 'campfire')
        .setDisplaySize(48, 48)
        .setBlendMode(Phaser.BlendModes.MULTIPLY)
        .refreshBody();
    });

    this.scale.on('resize', () => {
      const zoom = Math.max(this.scale.width, this.scale.height) / 1200;
      this.cameras.main.setZoom(zoom);
    });
    const zoom = Math.max(this.scale.width, this.scale.height) / 1200;
    this.cameras.main.setZoom(zoom);

    this.darkness = this.add.rectangle(0, 0, 4000, 4000, 0x000000).setOrigin(0, 0).setAlpha(0).setDepth(100);

    this.time.addEvent({ delay: 3000, loop: true, callback: () => {
      if (this.darkness.alpha > 0.5) {
        let isWarm = false;
        for (const fire of this.campfires.getChildren()) {
          if (Phaser.Math.Distance.Between(this.player.x, this.player.y, fire.x, fire.y) < 150) isWarm = true;
        }
        if (!isWarm) this.game.events.emit('takeDamage');
      }
    } });
  }

  update() {
    if (this.darkness && this.darkness.alpha < 0.85) {
      this.darkness.alpha += 0.0001;
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
