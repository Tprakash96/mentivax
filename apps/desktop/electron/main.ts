/**
 * Electron main process for the Mentivax desktop shell.
 *
 * Creates the application window, loads either the web dev server
 * (ELECTRON_START_URL) or the packaged web build, builds a native menu with a
 * "Print receipt" action, and wires the 'print' IPC channel used by preload.
 */
import { app, BrowserWindow, ipcMain, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import * as path from 'node:path';

const isMac = process.platform === 'darwin';

let mainWindow: BrowserWindow | null = null;

/** Resolve the URL/file the window should load. */
function resolveContent(): { url?: string; file?: string } {
  const devUrl = process.env.ELECTRON_START_URL;
  if (devUrl) return { url: devUrl };

  // Packaged builds ship the web app under resources/web (see electron-builder
  // "extraResources"); running unpackaged we read the sibling web build.
  const file = app.isPackaged
    ? path.join(process.resourcesPath, 'web', 'index.html')
    : path.join(__dirname, '..', '..', 'web', 'dist', 'index.html');
  return { file };
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#F7F8F7',
    title: 'Mentivax',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const { url, file } = resolveContent();
  if (url) {
    void mainWindow.loadURL(url);
  } else if (file) {
    void mainWindow.loadFile(file);
  }

  // Open target=_blank / external links in the user's browser, not a new window.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    void shell.openExternal(target);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/** Print the currently focused window's contents (e.g. a fee receipt). */
function printFocused(): void {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
  win?.webContents.print();
}

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Mentivax',
      submenu: [
        ...(isMac ? [{ role: 'about' as const }, { type: 'separator' as const }] : []),
        {
          label: 'Print receipt',
          accelerator: 'CmdOrCtrl+P',
          click: () => printFocused(),
        },
        { type: 'separator' },
        isMac ? { role: 'quit' } : { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
            ]
          : [{ role: 'close' as const }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  ipcMain.on('print', () => printFocused());
  buildMenu();
  createWindow();

  app.on('activate', () => {
    // macOS: re-create a window when the dock icon is clicked and none are open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // On macOS apps stay active until the user quits explicitly (Cmd+Q).
  if (!isMac) app.quit();
});
