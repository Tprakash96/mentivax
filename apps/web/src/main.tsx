import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ApiProvider } from './lib/api';
import { ToastProvider } from './components/Toast';
import { App } from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ApiProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ApiProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
