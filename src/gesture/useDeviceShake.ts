import { useCallback, useEffect, useRef, useState } from 'react';
import { createShakeDetector } from './shakeDetector';

type MotionConstructor = typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> };
type ShakeStatus = 'off' | 'requesting' | 'on' | 'unavailable' | 'denied';

export function useDeviceShake(onShake: () => void, canShuffle: boolean) {
  const [status, setStatus] = useState<ShakeStatus>(() => {
    const Motion = window.DeviceMotionEvent as MotionConstructor | undefined;
    const touchDevice = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
    return touchDevice && window.isSecureContext && Motion && !Motion.requestPermission ? 'on' : 'off';
  });
  const [motionReceived, setMotionReceived] = useState(false);
  const callback = useRef(onShake);
  const allowed = useRef(canShuffle);
  const detector = useRef(createShakeDetector());
  callback.current = onShake;
  allowed.current = canShuffle;

  useEffect(() => { detector.current.reset(); }, [canShuffle]);

  const toggle = useCallback(async () => {
    if (status === 'on') { setStatus('off'); setMotionReceived(false); return; }
    if (status === 'requesting') return;
    const Motion = window.DeviceMotionEvent as MotionConstructor | undefined;
    if (!window.isSecureContext || !Motion) { setStatus('unavailable'); return; }
    try {
      setStatus('requesting');
      if (Motion.requestPermission && await Motion.requestPermission() !== 'granted') {
        setStatus('denied'); return;
      }
      detector.current.reset();
      setMotionReceived(false);
      setStatus('on');
    } catch { setStatus('denied'); }
  }, [status]);

  useEffect(() => {
    if (status !== 'on') return;
    let received = false;
    const timer = window.setTimeout(() => {
      if (!received) setStatus('unavailable');
    }, 3000);
    const onMotion = (event: DeviceMotionEvent) => {
      received = true;
      setMotionReceived(true);
      if (!allowed.current || document.hidden) { detector.current.reset(); return; }
      const acceleration = event.acceleration;
      const hasAcceleration = acceleration && [acceleration.x, acceleration.y, acceleration.z].every(
        (axis) => axis !== null && axis !== undefined
      ) && Math.hypot(acceleration.x!, acceleration.y!, acceleration.z!) > 0.2;
      const value = hasAcceleration ? acceleration : event.accelerationIncludingGravity;
      if (!value || value.x === null || value.y === null || value.z === null) return;
      if (detector.current.sample({ x: value.x, y: value.y, z: value.z, timestamp: performance.now() })) callback.current();
    };
    window.addEventListener('devicemotion', onMotion);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('devicemotion', onMotion);
      detector.current.reset();
    };
  }, [status]);

  const message = status === 'unavailable' ? '未收到运动数据，请检查浏览器权限；仍可轻点洗牌。'
    : status === 'denied' ? '未开启运动权限，仍可轻点洗牌。'
    : status === 'on' ? (canShuffle
      ? motionReceived ? '摇晃洗牌已开启 · 摇动手机即可重新洗牌' : '正在等待手机运动数据…'
      : '选牌期间暂停摇晃洗牌') : '';
  return { status, toggle, message };
}
