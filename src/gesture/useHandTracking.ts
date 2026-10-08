import { useEffect, useState } from 'react';
import type { HandTrackingService } from './handTrackingService';
import type { HandTrackingFrame } from './types';

const initialFrame: HandTrackingFrame = {
  status: 'booting',
  pointer: null,
  message: '等待手势服务启动...'
};

export function useHandTracking(enabled = true) {
  const [frame, setFrame] = useState<HandTrackingFrame>(initialFrame);

  useEffect(() => {
    if (!enabled) { setFrame(initialFrame); return; }
    let service: HandTrackingService | null = null;
    let cancelled = false;
    void import('./handTrackingService').then(({ HandTrackingService }) => {
      if (cancelled) return;
      service = new HandTrackingService((nextFrame) => { if (!cancelled) setFrame(nextFrame); });
      void service.start();
    }).catch(() => {
      if (!cancelled) setFrame({ status: 'error', pointer: null, message: '手势暂未加载，可继续点击选牌。' });
    });

    return () => {
      cancelled = true;
      service?.stop();
    };
  }, [enabled]);

  return enabled ? frame : initialFrame;
}
