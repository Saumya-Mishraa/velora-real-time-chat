import React from "react";
import { CallProvider } from "../context/CallContext.jsx";
import CallOverlay, { CallBar } from "../components/CallUI.jsx";
import Dashboard from "./Dashboard.jsx";

// Wraps the signed-in experience. Calls live here (above the Dashboard and
// its routes) so a call survives navigating between chats, Status, Moments
// and the call history, and so incoming calls ring anywhere in the app.
const AppShell = () => (
  <CallProvider>
    <div className="h-screen-safe flex flex-col bg-bg overflow-hidden">
      <CallBar />
      <div className="flex-1 min-h-0">
        <Dashboard />
      </div>
    </div>
    <CallOverlay />
  </CallProvider>
);

export default AppShell;
