/**
 * Preload script. Runs in an isolated context with access to Node/Electron
 * primitives and exposes a minimal, safe `window.mentivax` API to the web app
 * via contextBridge. Nothing else from Node leaks into the renderer.
 */
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  /** Host platform, e.g. 'darwin' | 'win32' | 'linux'. */
  platform: process.platform,
  /** Ask the main process to print the focused window (e.g. a receipt). */
  print: (): void => ipcRenderer.send('print'),
};

contextBridge.exposeInMainWorld('mentivax', api);

export type MentivaxBridge = typeof api;
