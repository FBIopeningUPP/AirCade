import { useEffect } from 'react';
import Phaser from 'phaser';
import GameScene from './GameScene';

export default function PhaserGame({ gameRef, socket, roomData }) {
  useEffect(() => {
    const config = {
      type: Phaser.AUTO,
      parent: 'phaser-container',
      pixelArt: true,
      resolution: 1, // Fixed at 1 for pixel art to prevent massive renderTexture scaling bugs on high-DPI screens
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

    // Wait for the scene to be added before starting it with data
    game.events.once('ready', () => {
      game.scene.start('GameScene', { socket, roomData });
    });

    return () => {
      game.destroy(true);
    };
  }, [gameRef, socket, roomData]);

  return <div id="phaser-container" className={`fade-wrapper`} style={{ width: '100vw', height: '100vh', position: 'absolute', top: 0, left: 0 }} />;
}
