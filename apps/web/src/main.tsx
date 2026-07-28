import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { ApiProvider } from './lib/api';
import { ToastProvider } from './components/Toast';
import { App } from './App';
import './styles.css';

// A data router (createBrowserRouter) so pages can use useBlocker to guard
// unsaved changes. App keeps its own descendant <Routes> for the actual pages.
const router = createBrowserRouter([{ path: '*', element: <App /> }]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ApiProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </ApiProvider>
  </React.StrictMode>,
);
