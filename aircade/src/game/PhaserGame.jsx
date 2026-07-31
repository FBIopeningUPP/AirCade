import { useEffect } from 'react';
import Phaser from 'phaser';
import GameScene from './GameScene';

export default function PhaserGame({ gameRef }) {
  useEffect(() => {
    const config = {
      type: Phaser.AUTO,
      parent: 'phaser-container',
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: '100%',
        height: '100%'
      },
      physics: {
        default: 'arcade',
        arcade: { debug: false }
      },
      scene: [GameScene]
    };

    const game = new Phaser.Game(config);
    if (gameRef) gameRef.current = game;

    return () => {
      game.destroy(true);
    };
  }, [gameRef]);

  return <div id="phaser-container" style={{ width: '100vw', height: '100vh', position: 'absolute', top: 0, left: 0 }} />;
}
