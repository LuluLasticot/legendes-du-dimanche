// Placeholder player figure (greybox): limbs are segments between the engine's points (feet,
// head and, for keepers, hands), so what you see is exactly what the simulation uses for contacts.
// Replaced by the rigged, animated character later in Phase 1.

import * as THREE from 'three';

interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FigureKit {
  readonly shirt: number;
  readonly shorts: number;
  readonly gloves: boolean;
}

export const KEEPER_KIT: FigureKit = { shirt: 0xd4ff3a, shorts: 0x1b1f24, gloves: true };
export const OPPONENT_KIT: FigureKit = { shirt: 0xc4302b, shorts: 0xf2f2ee, gloves: false };
export const HOME_KIT: FigureKit = { shirt: 0x0f5132, shorts: 0xf4f1e8, gloves: false };

const UP = new THREE.Vector3(0, 1, 0);

/** A unit cylinder along +Y, stretched between two points each frame. */
class Limb {
  readonly mesh: THREE.Mesh;
  private readonly mid = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();

  constructor(radius: number, material: THREE.Material) {
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 8), material);
    this.mesh.castShadow = true;
  }

  set(a: THREE.Vector3, b: THREE.Vector3): void {
    this.dir.subVectors(b, a);
    const length = this.dir.length();
    this.mid.addVectors(a, b).multiplyScalar(0.5);
    this.mesh.position.copy(this.mid);
    this.mesh.scale.set(1, Math.max(1e-3, length), 1);
    if (length > 1e-6) this.mesh.quaternion.setFromUnitVectors(UP, this.dir.divideScalar(length));
  }
}

const lerp3 = (
  out: THREE.Vector3,
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  t: number,
): THREE.Vector3 => out.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);

export class PlayerFigure {
  readonly group = new THREE.Group();
  private readonly torso: Limb;
  private readonly legL: Limb;
  private readonly legR: Limb;
  private readonly armL: Limb;
  private readonly armR: Limb;
  private readonly head: THREE.Mesh;
  private readonly gloveL: THREE.Mesh;
  private readonly gloveR: THREE.Mesh;
  private readonly feet = new THREE.Vector3();
  private readonly top = new THREE.Vector3();
  private readonly hands = new THREE.Vector3();
  private readonly hip = new THREE.Vector3();
  private readonly neck = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();

  private readonly hasHands: boolean;

  constructor(kitStyle: FigureKit = KEEPER_KIT, skinColour = 0xc58c64) {
    const kit = new THREE.MeshStandardMaterial({ color: kitStyle.shirt, roughness: 0.7 });
    const shorts = new THREE.MeshStandardMaterial({ color: kitStyle.shorts, roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: skinColour, roughness: 0.8 });
    const gloves = kitStyle.gloves
      ? new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.6 })
      : skin;
    this.hasHands = kitStyle.gloves;
    this.torso = new Limb(0.19, kit);
    this.legL = new Limb(0.085, shorts);
    this.legR = new Limb(0.085, shorts);
    this.armL = new Limb(0.06, kit);
    this.armR = new Limb(0.06, kit);
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), skin);
    this.gloveL = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), gloves);
    this.gloveR = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), gloves);
    this.head.castShadow = true;
    this.group.add(
      this.torso.mesh,
      this.legL.mesh,
      this.legR.mesh,
      this.armL.mesh,
      this.armR.mesh,
      this.head,
      this.gloveL,
      this.gloveR,
    );
  }

  /**
   * Poses the figure between two engine states (`alpha` from the frame clock). Without hands
   * (outfield players), the arms hang along the body.
   */
  update(
    previous: { readonly feet: Point; readonly head: Point; readonly hands?: Point },
    current: { readonly feet: Point; readonly head: Point; readonly hands?: Point },
    alpha: number,
  ): void {
    lerp3(this.feet, previous.feet, current.feet, alpha);
    lerp3(this.top, previous.head, current.head, alpha);
    if (previous.hands && current.hands) lerp3(this.hands, previous.hands, current.hands, alpha);
    else this.hands.lerpVectors(this.feet, this.top, 0.5);

    // Body axis feet → head; hip and neck along it.
    this.hip.lerpVectors(this.feet, this.top, 0.42);
    this.neck.lerpVectors(this.feet, this.top, 0.86);
    this.torso.set(this.hip, this.neck);
    this.head.position.lerpVectors(this.feet, this.top, 0.97).addScaledVector(UP, 0.05);

    // Sideways direction (perpendicular to the body in the vertical plane facing the ball).
    this.tmpA.subVectors(this.top, this.feet).normalize();
    this.side.set(0, 0, 1).addScaledVector(this.tmpA, -this.tmpA.z).normalize();
    if (this.side.lengthSq() < 1e-6) this.side.set(0, 0, 1);

    const hipWidth = 0.12;
    this.legL.set(
      this.tmpA.copy(this.feet).addScaledVector(this.side, -hipWidth),
      this.tmpB.copy(this.hip).addScaledVector(this.side, -hipWidth * 0.8),
    );
    this.legR.set(
      this.tmpA.copy(this.feet).addScaledVector(this.side, hipWidth),
      this.tmpB.copy(this.hip).addScaledVector(this.side, hipWidth * 0.8),
    );

    const shoulder = 0.2;
    const glove = this.hasHands ? 0.1 : 0.26;
    this.gloveL.position.copy(this.hands).addScaledVector(this.side, -glove);
    this.gloveR.position.copy(this.hands).addScaledVector(this.side, glove);
    this.armL.set(
      this.tmpA.copy(this.neck).addScaledVector(this.side, -shoulder),
      this.gloveL.position,
    );
    this.armR.set(
      this.tmpA.copy(this.neck).addScaledVector(this.side, shoulder),
      this.gloveR.position,
    );
  }
}
