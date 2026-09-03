import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { migrateXiomToLaide } from './db';
import { taskStore } from './services/agent/task/taskStore';

Promise.all([
  migrateXiomToLaide(),
  taskStore.recoverInterruptedTasks().catch(console.error)
]).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
});
