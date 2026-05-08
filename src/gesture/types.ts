export type TrackingStatus =
  | 'booting'
  | 'requesting-camera'
  | 'camera-ready'
  | 'tracking'
  | 'lost'
  | 'error';

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D extends Point2D {
  z: number;
}

export interface HandPointer {
  normalized: Point3D;
  world: Point3D;
  pinchDistance: number;
  isPinching: boolean;
  pinchStarted: boolean;
  isShaking: boolean;
  horizontalVelocity: number;
  handedness: string;
  timestamp: number;
}

export interface HandTrackingFrame {
  status: TrackingStatus;
  pointer: HandPointer | null;
  message: string;
}
