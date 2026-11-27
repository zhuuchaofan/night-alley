import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH } from './game/balance.ts';
import { initPortraitHint } from './game/landscape.ts';
import { BestiaryScene } from './scenes/BestiaryScene.ts';
import { GameOverScene } from './scenes/GameOverScene.ts';
import { GameScene } from './scenes/GameScene.ts';
import { TitleScene } from './scenes/TitleScene.ts';

initPortraitHint();

new Phaser.Game({
  type: Phaser.CANVAS,
  parent: 'game-container',
  width: ARENA_WIDTH,
  height: ARENA_HEIGHT,
  backgroundColor: '#10182B',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  audio: { noAudio: true },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [TitleScene, GameScene, GameOverScene, BestiaryScene],
});
