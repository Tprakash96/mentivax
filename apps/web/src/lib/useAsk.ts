import { createContext, createElement, useContext, useState, type ReactNode } from 'react';
import type { AskAnswer } from '@mentivax/api-client';
import { useApi } from './api';

interface AskState {
  question: string;
  setQuestion: (q: string) => void;
  busy: boolean;
  result: AskAnswer | null;
  failed: boolean;
  ask: (question: string) => Promise<void>;
  reset: () => void;
}

/**
 * Asking a question, without the rendering.
 *
 * Shared through a provider rather than instantiated per component, because the
 * input lives in the top bar while the suggestion chips live on the home page —
 * two inputs and two answers for one question would be a worse experience than
 * having no chips at all.
 */
function useAskState(): AskState {
  const { api } = useApi();
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AskAnswer | null>(null);
  const [failed, setFailed] = useState(false);

  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 3 || busy) return;
    setQuestion(trimmed);
    setBusy(true);
    setFailed(false);
    try {
      setResult(await api.reports.ask({ question: trimmed }));
    } catch (e) {
      // The reason belongs in the console for whoever maintains this, not on
      // screen for a school accountant.
      console.error('Ask request failed', e);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setResult(null);
    setFailed(false);
    setQuestion('');
  };

  return { question, setQuestion, busy, result, failed, ask, reset };
}

const AskContext = createContext<AskState | null>(null);

export function AskProvider({ children }: { children: ReactNode }) {
  return createElement(AskContext.Provider, { value: useAskState() }, children);
}

export function useAsk(): AskState {
  const ctx = useContext(AskContext);
  if (!ctx) throw new Error('useAsk must be used within AskProvider');
  return ctx;
}
