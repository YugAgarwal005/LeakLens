import React from 'react';
import ReactDOM from 'react-dom/client';
import OptionsApp from './OptionsApp';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <OptionsApp />
    </React.StrictMode>,
  );
}
