import React from 'react';
import ReactDOM from 'react-dom/client';
import OnboardingApp from './OnboardingApp';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <OnboardingApp />
    </React.StrictMode>,
  );
}
