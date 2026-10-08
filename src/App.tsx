import { lazy, Suspense } from 'react';
import { useBrowserPath } from './app/useBrowserPath';
import { isPhoneDevice, readDeviceSignals } from './app/deviceClass';
import { ReadingRoom } from './components/ReadingRoom';
import { ResultPage } from './results/ResultPage';
import { getSessionIdFromPath } from './results/session';
import { useSpreadSessionRecord } from './results/useSpreadSessionRecord';

const DesktopReadingRoom = lazy(() =>
  import('./desktop/DesktopReadingRoom').then(({ DesktopReadingRoom }) => ({ default: DesktopReadingRoom }))
);

export default function App() {
  const { pathname, navigate } = useBrowserPath();
  const sessionId = getSessionIdFromPath(pathname);
  const sessionRecord = useSpreadSessionRecord(sessionId);

  if (sessionId) {
    return (
      <ResultPage
        error={sessionRecord.error}
        loading={sessionRecord.loading}
        onReturn={() => {
          navigate('/');
        }}
        session={sessionRecord.session}
        source={sessionRecord.source}
      />
    );
  }

  const onOpenResult = (sharePath: string) => navigate(sharePath);
  return isPhoneDevice(readDeviceSignals())
    ? <ReadingRoom onOpenResult={onOpenResult} />
    : <Suspense fallback={<main className="app-shell" aria-label="正在打开占卜空间" />}>
        <DesktopReadingRoom onOpenResult={onOpenResult} />
      </Suspense>;
}
