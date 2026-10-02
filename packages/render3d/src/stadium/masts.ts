// Floodlight masts a scene places itself (the pack opening puts them where its flares shine):
// a pole and a head of lamps each, one draw call for the poles and one for the heads. Each mast
// has its own power, so they can switch on one by one.

import * as THREE from 'three';

const HEAD_VS = /* glsl */ `
attribute float aLevel;
varying vec2 vUv; varying float vLevel;
void main(){
  vUv = uv; vLevel = aLevel;
  gl_Position = projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position, 1.);
}
`;
const HEAD_FS = /* glsl */ `
varying vec2 vUv; varying float vLevel;
void main(){
  // Four by three lamps in a dark frame; a lit lamp is far brighter than white (it blooms).
  vec2 g = vUv*vec2(4., 3.);
  vec2 f = fract(g) - .5;
  float lamp = smoothstep(.36, .3, length(f));
  float hot = exp(-dot(f, f)*18.);
  vec3 off = vec3(.05, .055, .06);
  vec3 on = vec3(1., .93, .8)*(3. + 6.*hot);
  vec3 col = mix(vec3(.025), mix(off, on, vLevel), lamp);
  gl_FragColor = vec4(col, 1.);
}
`;

export class FloodlightMasts {
  readonly group = new THREE.Group();
  /** Power of each mast, 0 (off) to 1. */
  readonly levels: number[];
  private readonly poles: THREE.InstancedMesh;
  private readonly heads: THREE.InstancedMesh;
  private readonly levelAttribute: THREE.InstancedBufferAttribute;
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();

  constructor(count: number) {
    this.levels = new Array<number>(count).fill(1);
    this.poles = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.22, 0.4, 1, 8).translate(0, 0.5, 0),
      new THREE.MeshStandardMaterial({ color: 0x2b302e, roughness: 0.8, metalness: 0.4 }),
      count,
    );
    const head = new THREE.PlaneGeometry(4, 3);
    this.levelAttribute = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    this.levelAttribute.setUsage(THREE.DynamicDrawUsage);
    head.setAttribute('aLevel', this.levelAttribute);
    this.heads = new THREE.InstancedMesh(
      head,
      new THREE.ShaderMaterial({ vertexShader: HEAD_VS, fragmentShader: HEAD_FS }),
      count,
    );
    for (const mesh of [this.poles, this.heads]) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    this.group.add(this.poles, this.heads);
  }

  /**
   * Puts mast `i` with its head at `head` (world), on the ground at `groundY`, facing `target`;
   * `size` scales the head and the pole's girth (a narrow screen wants smaller ones).
   */
  place(i: number, head: THREE.Vector3, groundY: number, target: THREE.Vector3, size = 1): void {
    this.scale.set(size, Math.max(1, head.y - 1.2 * size - groundY), size);
    this.matrix.compose(
      new THREE.Vector3(head.x, groundY, head.z),
      this.quaternion.identity(),
      this.scale,
    );
    this.poles.setMatrixAt(i, this.matrix);
    this.matrix.lookAt(head, target, THREE.Object3D.DEFAULT_UP);
    // lookAt aims −z at the target: turn the plane's face (+z) towards it.
    this.matrix.multiply(
      new THREE.Matrix4().makeRotationY(Math.PI).scale(this.scale.set(size, size, 1)),
    );
    this.matrix.setPosition(head);
    this.heads.setMatrixAt(i, this.matrix);
  }

  update(): void {
    this.levels.forEach((level, i) => this.levelAttribute.setX(i, level));
    this.levelAttribute.needsUpdate = true;
    this.poles.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }

  /** Mean power of the masts (how much light falls on the ground). */
  get power(): number {
    return this.levels.reduce((sum, l) => sum + l, 0) / Math.max(1, this.levels.length);
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const mesh of [this.poles, this.heads]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }
  }
}
