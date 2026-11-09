import React from 'react';
import ReactDOM from 'react-dom/client';
import WarningApp from './WarningApp';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <WarningApp />
    </React.StrictMode>,
  );
}
