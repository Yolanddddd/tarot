import { lazy, Suspense, useCallback, useState } from 'react';
import { useBrowserPath } from './app/useBrowserPath';
import { isPhoneDevice, readDeviceSignals } from './app/deviceClass';
import { ReadingRoom } from './components/ReadingRoom';
import { ResultPage } from './results/ResultPage';
import { getSessionIdFromPath } from './results/session';
import { useSpreadSessionRecord } from './results/useSpreadSessionRecord';
import { DRAFT_KEY, QuestionPage } from './reading/QuestionPage';
import { RecommendationPage } from './reading/RecommendationPage';
import { attachSpreadResult, loadReadingSession, updateReadingSpread } from './reading/storage';
import type { ReadingSession } from './reading/types';
import type { SpreadSession } from './results/types';
import type { SpreadId } from './config/spreads';

const ACTIVE_READING_KEY = 'auratarot.active.reading.v1';

function initialReading(): ReadingSession | null {
  try { return loadReadingSession(sessionStorage.getItem(ACTIVE_READING_KEY) ?? ''); }
  catch { return null; }
}

const DesktopReadingRoom = lazy(() =>
  import('./desktop/DesktopReadingRoom').then(({ DesktopReadingRoom }) => ({ default: DesktopReadingRoom }))
);

export default function App() {
  const { pathname, navigate } = useBrowserPath();
  const [reading, setReading] = useState<ReadingSession | null>(initialReading);
  const sessionId = getSessionIdFromPath(pathname);
  const sessionRecord = useSpreadSessionRecord(sessionId);

  const onSpreadChange = useCallback((id: SpreadId) => {
    setReading((current) => current ? updateReadingSpread(current, id) : null);
  }, []);
  const onSessionCreated = useCallback((session: SpreadSession) => {
    if (reading) attachSpreadResult(reading, session.id);
  }, [reading]);

  if (sessionId) {
    return (
      <ResultPage
        error={sessionRecord.error}
        loading={sessionRecord.loading}
        onReturn={() => {
          navigate('/');
        }}
        onPrivateDeleted={() => {
          setReading(null);
          try { sessionStorage.removeItem(ACTIVE_READING_KEY); } catch { /* Ignore. */ }
        }}
        session={sessionRecord.session}
        source={sessionRecord.source}
      />
    );
  }

  if (pathname === '/recommendation') {
    return <RecommendationPage reading={reading} onSelectSpread={onSpreadChange}
      onContinue={() => {
        try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* Ignore. */ }
        navigate('/draw');
      }}
      onBack={() => {
        if (reading) {
          try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
            question: reading.question, background: reading.background, ownerId: reading.ownerId
          })); } catch { /* Draft persistence is optional. */ }
        }
        navigate('/');
      }} />;
  }

  if (pathname !== '/draw') {
    return <QuestionPage onStart={(next) => {
      setReading(next);
      try { sessionStorage.setItem(ACTIVE_READING_KEY, next.id); } catch { /* Ignore. */ }
      navigate('/recommendation');
    }} onDirectDraw={() => {
      setReading(null);
      try { sessionStorage.removeItem(ACTIVE_READING_KEY); } catch { /* Ignore. */ }
      navigate('/draw');
    }} />;
  }

  const onOpenResult = (sharePath: string) => navigate(sharePath);
  return isPhoneDevice(readDeviceSignals())
    ? <ReadingRoom onOpenResult={onOpenResult} reading={reading} onSpreadChange={onSpreadChange} onSessionCreated={onSessionCreated} />
    : <Suspense fallback={<main className="app-shell" aria-label="正在打开占卜空间" />}>
        <DesktopReadingRoom onOpenResult={onOpenResult} reading={reading} onSpreadChange={onSpreadChange} onSessionCreated={onSessionCreated} />
      </Suspense>;
}
