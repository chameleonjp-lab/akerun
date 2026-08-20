/**
 * Vault Tumbler Lab — 真鍮の機械製図室。
 * Babylon の正射影シーンへ、全画面の機構製図キャンバスを貼り付ける。
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { VaultWorld } from "./VaultWorld";

export type GameHandle = {
  scene: Scene;
  dispose: () => void;
};

export async function createGameScene(engine: Engine, canvas: HTMLCanvasElement, onStatusChange?: (status: string) => void): Promise<GameHandle> {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.025, 0.04, 0.055, 1);

  const camera = new FreeCamera("vault-camera", new Vector3(0, 0, -5), scene);
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.setTarget(Vector3.Zero());

  const screen = MeshBuilder.CreatePlane("vault-screen", { width: 2, height: 2 }, scene);
  const texture = new DynamicTexture("vault-interface", { width: 1280, height: 720 }, scene, false);
  texture.vScale = -1;
  texture.vOffset = 1;
  const material = new StandardMaterial("vault-interface-material", scene);
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.disableLighting = true;
  material.backFaceCulling = false;
  screen.material = material;

  const world = new VaultWorld(texture, canvas, onStatusChange);
  let lastWorldErrorAt = 0;
  scene.onBeforeRenderObservable.add(() => {
    const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
    camera.orthoLeft = -aspect;
    camera.orthoRight = aspect;
    camera.orthoTop = 1;
    camera.orthoBottom = -1;
    screen.scaling.x = aspect;
    try {
      world.update(engine.getDeltaTime() / 1000);
    } catch (error) {
      const now = performance.now();
      if (now - lastWorldErrorAt > 1500) {
        console.error("Vault Tumbler Lab frame recovered after a render error.", error);
        lastWorldErrorAt = now;
      }
      world.renderRecoveryOverlay();
    }
  });

  return {
    scene,
    dispose: () => {
      world.dispose();
      scene.dispose();
    },
  };
}
