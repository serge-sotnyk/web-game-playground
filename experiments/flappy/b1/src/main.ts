import './style.css'
import Phaser from 'phaser'
import { GameScene } from './game/GameScene'
import { COLOR_BG } from './game/constants'
import { Viewport } from './viewport'

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing #${id}`)
  return element
}

const parent = requireElement('game')
const viewport = new Viewport(parent, requireElement('safe-probe'))
const initial = viewport.read()

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent,
  // The canvas is sized in *device* pixels and zoomed back down to CSS pixels,
  // which is how a Phaser 4 game gets a high-DPI backing store. See viewport.ts.
  width: Math.round(initial.width * initial.dpr),
  height: Math.round(initial.height * initial.dpr),
  backgroundColor: COLOR_BG,
  transparent: false,
  antialias: true,
  pixelArt: false,
  roundPixels: false,
  // Keep the console silent: no start-up banner, and no Phaser-owned
  // AudioContext (the game brings its own — see audio.ts).
  banner: false,
  audio: { noAudio: true },
  disableContextMenu: true,
  input: {
    keyboard: false,
    mouse: true,
    touch: true,
  },
  scale: {
    mode: Phaser.Scale.ScaleModes.NONE,
    zoom: 1 / initial.dpr,
    autoRound: false,
  },
  scene: [new GameScene(viewport)],
})

viewport.attach(game)

// A waiting service worker takes over on the next navigation; nothing here
// reloads the page, so an update can never interrupt a run in progress.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const url = `${import.meta.env.BASE_URL}sw.js`
    void navigator.serviceWorker.register(url).catch(() => undefined)
  })
}
