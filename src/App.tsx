import { useBrowserPath } from './app/useBrowserPath';
import { ReadingRoom } from './components/ReadingRoom';
import { ResultPage } from './results/ResultPage';
import { getSessionIdFromPath } from './results/session';
import { useSpreadSessionRecord } from './results/useSpreadSessionRecord';

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

  return (
    <ReadingRoom
      onOpenResult={(sharePath) => {
        navigate(sharePath);
      }}
    />
  );
}
