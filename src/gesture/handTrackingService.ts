import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult
} from '@mediapipe/tasks-vision';
import { runtimeConfig } from '../config/runtime';
import { mapNormalizedHandToWorld } from './coordinateMapper';
import type { HandTrackingFrame, Point3D } from './types';

const INDEX_FINGER_TIP = 8;
const MIDDLE_FINGER_MCP = 9;
const WRIST = 0;
const THUMB_TIP = 4;
const PINCH_DISTANCE_ENTER_THRESHOLD = 0.11;
const PINCH_DISTANCE_EXIT_THRESHOLD = 0.145;
const PINCH_RATIO_ENTER_THRESHOLD = 0.88;
const PINCH_RATIO_EXIT_THRESHOLD = 1.08;
const PINCH_HOLD_MS = 0;
const SHAKE_DIRECTION_DELTA = 0.014;
const SHAKE_WINDOW_MS = 720;
const SHAKE_DIRECTION_CHANGES_REQUIRED = 3;
const SHAKE_VELOCITY_THRESHOLD = 0.16;
const SHAKE_COOLDOWN_MS = 1150;
const SHAKE_BLOCK_AFTER_PINCH_MS = 320;

type FrameListener = (frame: HandTrackingFrame) => void;

export class HandTrackingService {
  private readonly emitFrame: FrameListener;
  private handLandmarker: HandLandmarker | null = null;
  private mediaStream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private frameRequest = 0;
  private lastVideoTime = -1;
  private stopped = false;
  private lastMotionSample:
    | {
        x: number;
        timestamp: number;
        direction: number;
      }
    | null = null;
  private directionChanges: number[] = [];
  private shakeCooldownUntil = 0;
  private shakeBlockedUntil = 0;
  private pinchState = {
    active: false,
    candidateSince: 0
  };

  constructor(listener: FrameListener) {
    this.emitFrame = listener;
  }

  async start() {
    this.stopped = false;
    this.emit({
      status: 'booting',
      pointer: null,
      message: '正在唤醒手势引擎...'
    });

    try {
      this.emit({
        status: 'requesting-camera',
        pointer: null,
        message: '请允许浏览器访问摄像头。'
      });

      const [video, handLandmarker] = await Promise.all([
        this.setupVideo(),
        this.setupLandmarker()
      ]);

      if (this.stopped) {
        video.pause();
        video.srcObject = null;
        handLandmarker.close();
        return;
      }

      this.video = video;
      this.handLandmarker = handLandmarker;

      this.emit({
        status: 'camera-ready',
        pointer: null,
        message: '摄像头已连接，请把一只手伸入画面并抬起食指。'
      });

      this.frameRequest = requestAnimationFrame(this.renderLoop);
    } catch (error) {
      this.cleanupResources();

      const message =
        error instanceof Error
          ? error.message
          : '手势引擎启动失败，请检查模型路径或浏览器权限。';

      this.emit({
        status: 'error',
        pointer: null,
        message
      });
    }
  }

  stop() {
    this.stopped = true;
    cancelAnimationFrame(this.frameRequest);
    this.cleanupResources();
  }

  private cleanupResources() {
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video = null;
    }

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }

    this.handLandmarker?.close();
    this.handLandmarker = null;
    this.resetMotionTracking();
  }

  private async setupLandmarker() {
    const vision = await FilesetResolver.forVisionTasks(
      runtimeConfig.mediapipe.wasmRoot
    );

    return HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: runtimeConfig.mediapipe.handModelPath
      },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.6
    });
  }

  private async setupVideo() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    this.mediaStream = stream;

    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;

    await video.play();

    return video;
  }

  private readonly renderLoop = () => {
    if (this.stopped || !this.video || !this.handLandmarker) {
      return;
    }

    if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const video = this.video;

      if (video.currentTime !== this.lastVideoTime) {
        const result = this.handLandmarker.detectForVideo(
          video,
          performance.now()
        );
        this.handleResult(result);
        this.lastVideoTime = video.currentTime;
      }
    }

    this.frameRequest = requestAnimationFrame(this.renderLoop);
  };

  private handleResult(result: HandLandmarkerResult) {
    const landmarks = result.landmarks[0];
    const handedness = result.handedness[0]?.[0]?.categoryName ?? 'Unknown';

    if (!landmarks) {
      this.resetMotionTracking();
      this.emit({
        status: 'lost',
        pointer: null,
        message: '已捕获画面，但暂时没有锁定到手势。'
      });
      return;
    }

    const indexFingerTip = landmarks[INDEX_FINGER_TIP];
    const middleFingerMcp = landmarks[MIDDLE_FINGER_MCP];
    const thumbTip = landmarks[THUMB_TIP];
    const wrist = landmarks[WRIST];

    if (!indexFingerTip || !thumbTip || !wrist) {
      this.resetMotionTracking();
      this.emit({
        status: 'lost',
        pointer: null,
        message: '手部关键点不完整，请把整只手放入镜头范围。'
      });
      return;
    }

    const normalized: Point3D = {
      x: indexFingerTip.x,
      y: indexFingerTip.y,
      z: indexFingerTip.z
    };
    const world = mapNormalizedHandToWorld(normalized);
    const pinchDistance = distance3D(indexFingerTip, thumbTip);
    const palmScale = middleFingerMcp
      ? distance3D(wrist, middleFingerMcp)
      : distance3D(wrist, indexFingerTip);
    const pinchRatio = pinchDistance / Math.max(palmScale, 0.001);
    const timestamp = performance.now();
    const pinchState = this.detectPinch(pinchDistance, pinchRatio, timestamp);
    const shakeAnchorX = getHandAnchorX(wrist.x, middleFingerMcp?.x);
    const shakeState = this.detectShake(
      shakeAnchorX,
      timestamp,
      pinchState.pinchStarted
    );

    this.emit({
      status: 'tracking',
      pointer: {
        normalized,
        world,
        pinchDistance,
        isPinching: pinchState.isPinching,
        pinchStarted: pinchState.pinchStarted,
        isShaking: shakeState.isShaking,
        horizontalVelocity: shakeState.horizontalVelocity,
        handedness,
        timestamp
      },
      message: '已锁定手部，请移动食指来驱动灵光。'
    });
  }

  private detectPinch(
    pinchDistance: number,
    pinchRatio: number,
    timestamp: number
  ) {
    const isInsideEnterBand =
      pinchDistance <= PINCH_DISTANCE_ENTER_THRESHOLD ||
      pinchRatio <= PINCH_RATIO_ENTER_THRESHOLD;
    const isOutsideExitBand =
      pinchDistance > PINCH_DISTANCE_EXIT_THRESHOLD &&
      pinchRatio > PINCH_RATIO_EXIT_THRESHOLD;

    if (this.pinchState.active) {
      if (isOutsideExitBand) {
        this.pinchState.active = false;
        this.pinchState.candidateSince = 0;
      }

      return {
        isPinching: this.pinchState.active,
        pinchStarted: false
      };
    }

    if (isInsideEnterBand) {
      if (this.pinchState.candidateSince === 0) {
        this.pinchState.candidateSince = timestamp;
      }

      if (timestamp - this.pinchState.candidateSince >= PINCH_HOLD_MS) {
        this.pinchState.active = true;
        this.pinchState.candidateSince = 0;
        this.shakeBlockedUntil = timestamp + SHAKE_BLOCK_AFTER_PINCH_MS;

        return {
          isPinching: true,
          pinchStarted: true
        };
      }
    } else {
      this.pinchState.candidateSince = 0;
    }

    return {
      isPinching: false,
      pinchStarted: false
    };
  }

  private detectShake(
    currentX: number,
    timestamp: number,
    blockShake: boolean
  ) {
    if (blockShake || timestamp < this.shakeBlockedUntil) {
      this.lastMotionSample = {
        x: currentX,
        timestamp,
        direction: 0
      };
      this.directionChanges = [];

      return {
        horizontalVelocity: 0,
        isShaking: false
      };
    }

    const previousSample = this.lastMotionSample;

    if (!previousSample) {
      this.lastMotionSample = {
        x: currentX,
        timestamp,
        direction: 0
      };

      return {
        horizontalVelocity: 0,
        isShaking: false
      };
    }

    const dx = currentX - previousSample.x;
    const deltaTime = Math.max(timestamp - previousSample.timestamp, 1);
    const horizontalVelocity = dx / (deltaTime / 1000);
    let direction = previousSample.direction;

    if (Math.abs(dx) >= SHAKE_DIRECTION_DELTA) {
      const nextDirection = Math.sign(dx);

      if (
        previousSample.direction !== 0 &&
        nextDirection !== 0 &&
        nextDirection !== previousSample.direction &&
        Math.abs(horizontalVelocity) >= SHAKE_VELOCITY_THRESHOLD
      ) {
        this.directionChanges.push(timestamp);
      }

      direction = nextDirection;
    }

    this.directionChanges = this.directionChanges.filter(
      (changeAt) => timestamp - changeAt <= SHAKE_WINDOW_MS
    );

    const isShaking =
      timestamp >= this.shakeCooldownUntil &&
      this.directionChanges.length >= SHAKE_DIRECTION_CHANGES_REQUIRED &&
      Math.abs(horizontalVelocity) >= SHAKE_VELOCITY_THRESHOLD * 0.5;

    if (isShaking) {
      this.shakeCooldownUntil = timestamp + SHAKE_COOLDOWN_MS;
      this.directionChanges = [];
    }

    this.lastMotionSample = {
      x: currentX,
      timestamp,
      direction
    };

    return {
      horizontalVelocity,
      isShaking
    };
  }

  private resetMotionTracking() {
    this.lastMotionSample = null;
    this.directionChanges = [];
    this.shakeCooldownUntil = 0;
    this.shakeBlockedUntil = 0;
    this.pinchState.active = false;
    this.pinchState.candidateSince = 0;
  }

  private emit(frame: HandTrackingFrame) {
    if (!this.stopped) {
      this.emitFrame(frame);
    }
  }
}

function distance3D(a: Point3D, b: Point3D) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function getHandAnchorX(wristX: number, middleFingerMcpX?: number) {
  if (typeof middleFingerMcpX === 'number') {
    return wristX * 0.55 + middleFingerMcpX * 0.45;
  }

  return wristX;
}
