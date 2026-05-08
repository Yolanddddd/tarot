import { runtimeConfig } from '../config/runtime';
import type { Point3D } from './types';

const HORIZONTAL_SENSITIVITY = 1.8;
const VERTICAL_SENSITIVITY = 1.45;

export function mapNormalizedHandToWorld(point: Point3D): Point3D {
  const { x, y, z } = runtimeConfig.sceneBounds;
  const mirroredX = 1 - point.x;
  const mappedX = amplifyAroundCenter(mirroredX, HORIZONTAL_SENSITIVITY);
  const mappedY = amplifyAroundCenter(point.y, VERTICAL_SENSITIVITY);

  return {
    x: (mappedX - 0.5) * x * 2,
    y: (0.5 - mappedY) * y * 2,
    z: clamp(-point.z * 14 - 1.5, z.min, z.max)
  };
}

function amplifyAroundCenter(value: number, sensitivity: number) {
  return clamp((value - 0.5) * sensitivity + 0.5, 0, 1);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
