import { useEffect, useState } from 'react';
import { firebaseReady } from './firebase.js';
import { CreditFooter, SetupMissing, StarWarpBackground } from './components/AppChrome.jsx';
import { AdminView } from './pages/Admin.jsx';
import { EventInfoPage } from './pages/EventInfoPage.jsx';
import { GameMasterView } from './pages/GameMaster.jsx';
import { PublicCalendar } from './pages/PublicCalendar.jsx';

export function App() {
  const [route, setRoute] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setRoute(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setRoute(path);
  };

  if (!firebaseReady) {
    return (
      <>
        <StarWarpBackground />
        <div className="app-content">
          <SetupMissing />
          <CreditFooter />
        </div>
      </>
    );
  }

  let page;
  if (route.startsWith('/event/')) {
    page = <EventInfoPage eventId={decodeURIComponent(route.replace('/event/', ''))} navigate={navigate} />;
  } else if (route.startsWith('/admin')) {
    page = <AdminView navigate={navigate} />;
  } else if (route.startsWith('/gm')) {
    page = <GameMasterView navigate={navigate} />;
  } else {
    page = <PublicCalendar navigate={navigate} />;
  }

  return (
    <>
      <StarWarpBackground />
      <div className="app-content">
        {page}
        <CreditFooter />
      </div>
    </>
  );
}
