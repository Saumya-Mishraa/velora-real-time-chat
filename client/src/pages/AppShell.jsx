import React from "react";
import { CallProvider } from "../context/CallContext.jsx";
import { GroupCallProvider } from "../context/GroupCallContext.jsx";
import { LiveLocationProvider } from "../context/LiveLocationContext.jsx";
import { WatchTogetherProvider } from "../context/WatchTogetherContext.jsx";
import CallOverlay, { CallBar } from "../components/CallUI.jsx";
import GroupCallOverlay, { GroupCallBar } from "../components/GroupCallUI.jsx";
import Dashboard from "./Dashboard.jsx";

// Wraps the signed-in experience. Calls live here (above the Dashboard and
// its routes) so a call survives navigating between chats, Status, Moments
// and the call history, and so incoming calls ring anywhere in the app.
// Group calls, live-location sharing and Watch Together follow the same
// pattern: app-level providers, so they keep working across navigation.
const AppShell = () => (
  <CallProvider>
    <GroupCallProvider>
      <LiveLocationProvider>
        <WatchTogetherProvider>
          <div className="h-screen-safe flex flex-col bg-bg overflow-hidden">
            <CallBar />
            <GroupCallBar />
            <div className="flex-1 min-h-0">
              <Dashboard />
            </div>
          </div>
          <CallOverlay />
          <GroupCallOverlay />
        </WatchTogetherProvider>
      </LiveLocationProvider>
    </GroupCallProvider>
  </CallProvider>
);

export default AppShell;
