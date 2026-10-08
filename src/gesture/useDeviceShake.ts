import { useCallback, useEffect, useRef, useState } from 'react';
import { createShakeDetector } from './shakeDetector';

type MotionConstructor = typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> };
type ShakeStatus = 'off' | 'requesting' | 'on' | 'unavailable' | 'denied';

export function useDeviceShake(onShake: () => void, canShuffle: boolean) {
  const [status, setStatus] = useState<ShakeStatus>('off');
  const callback = useRef(onShake);
  const allowed = useRef(canShuffle);
  const detector = useRef(createShakeDetector());
  callback.current = onShake;
  allowed.current = canShuffle;

  useEffect(() => { detector.current.reset(); }, [canShuffle]);

  const toggle = useCallback(async () => {
    if (status === 'on') { setStatus('off'); return; }
    if (status === 'requesting') return;
    const Motion = window.DeviceMotionEvent as MotionConstructor | undefined;
    if (!window.isSecureContext || !Motion) { setStatus('unavailable'); return; }
    try {
      setStatus('requesting');
      if (Motion.requestPermission && await Motion.requestPermission() !== 'granted') {
        setStatus('denied'); return;
      }
      setStatus('on');
    } catch { setStatus('denied'); }
  }, [status]);

  useEffect(() => {
    if (status !== 'on') return;
    const onMotion = (event: DeviceMotionEvent) => {
      if (!allowed.current || document.hidden) { detector.current.reset(); return; }
      const value = event.accelerationIncludingGravity ?? event.acceleration;
      if (!value || value.x === null || value.y === null || value.z === null) return;
      if (detector.current.sample({ x: value.x, y: value.y, z: value.z, timestamp: performance.now() })) callback.current();
    };
    window.addEventListener('devicemotion', onMotion);
    return () => { window.removeEventListener('devicemotion', onMotion); detector.current.reset(); };
  }, [status]);

  const message = status === 'unavailable' ? '当前浏览器不支持摇晃洗牌，请轻点洗牌按钮。'
    : status === 'denied' ? '未开启运动权限，仍可轻点洗牌。'
    : status === 'on' ? (canShuffle ? '摇晃洗牌已开启' : '选牌期间暂停摇晃洗牌') : '';
  return { status, toggle, message };
}
