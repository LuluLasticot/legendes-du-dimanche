// Device probing (DOM). Kept apart from quality.ts so the heuristics stay testable.

import type * as THREE from 'three';
import type { DeviceInfo } from './quality.ts';

function gpuName(renderer: THREE.WebGLRenderer): string {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
  } catch {
    return '';
  }
}

export function probeDevice(renderer: THREE.WebGLRenderer): DeviceInfo {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  return {
    gpu: gpuName(renderer),
    mobile: coarse || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
    memory: nav.deviceMemory ?? 0,
    cores: navigator.hardwareConcurrency || 0,
    screenPx: Math.round(
      Math.min(screen.width || 800, screen.height || 800) * (window.devicePixelRatio || 1),
    ),
  };
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
