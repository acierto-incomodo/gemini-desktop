const { app, BrowserWindow, screen, Tray, Menu, nativeImage, ipcMain, shell, globalShortcut } = require('electron');
const { join } = require('path');
const fs = require('fs');

let tray = null;
let win = null;
let shortcutEnabled = false; // Estado del atajo de teclado
const appURL = 'https://gemini.google.com';

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.bounds;

  // Log geometry information for easier debugging
  console.log(`Primary Screen Geometry - Width: ${width} Height: ${height} X: ${x} Y: ${y}`);

  const icon = nativeImage.createFromPath(join(__dirname, 'icon.png'));
  const smallIcon = icon.resize({ width: 16, height: 16 }); // Redimensionar el icono

  win = new BrowserWindow({
    width: width * 0.6,
    height: height * 0.8,
    x: x + ((width - (width * 0.6)) / 2),
    y: y + ((height - (height * 0.8)) / 2),
    icon: icon,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: true,
      sandbox: false
    }
  });

  win.removeMenu();

  win.on('close', (event) => {
    event.preventDefault();
    win.hide();
  });

  tray = new Tray(icon);

  // Configurar el evento de clic izquierdo en el Tray
  tray.on('click', () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
    }
  });

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide Gemini',
      icon: smallIcon, // Usar el icono redimensionado
      click: () => {
        if (win.isVisible()) {
          win.hide();
        } else {
          win.show();
        }
      }
    },
    {
      label: 'Enable Alt+Space Shortcut',
      type: 'checkbox',
      checked: shortcutEnabled,
      click: (menuItem) => {
        shortcutEnabled = menuItem.checked;
        if (shortcutEnabled) {
          globalShortcut.register('Alt+Space', () => {
            if (win.isVisible()) {
              win.hide();
            } else {
              win.show();
            }
          });
          console.log('Shortcut Alt+Space enabled');
        } else {
          globalShortcut.unregister('Alt+Space');
          console.log('Shortcut Alt+Space disabled');
        }
      }
    },
    { type: 'separator' },
    { label: 'About',
      click: () => {
        console.log("About clicked");
        createAboutWindow();
      }
    },
    { label: 'Quit',
      click: () => {
        console.log("Quit clicked, Exiting");
        app.exit();
      }
    },
  ]);

  tray.setToolTip('Gemini');
  tray.setContextMenu(contextMenu);

  ipcMain.on('log-message', (event, message) => {
    console.log('Log from preload: ', message);
  });

  // Open links with default browser
  ipcMain.on('open-external-link', (event, url) => {
    console.log('open-external-link: ', url);
    shell.openExternal(url);
  });

  // Listen for network status updates from the renderer process
  ipcMain.on('network-status', (event, isOnline) => {
    console.log(`Network status: ${isOnline ? 'online' : 'offline'}`);
    console.log("network-status changed: " + isOnline);
    if (isOnline) {
      win.loadURL(appURL);
    } else {
      win.loadFile('offline.html');
    }
  });

  win.loadURL(appURL);

  // Link clicks open new windows, let's force them to open links in
  // the default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    console.log('windowOpenHandler: ', url);
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Ensure we're a single instance app
const firstInstance = app.requestSingleInstanceLock();

if (!firstInstance) {
  app.quit();
} else {
  app.on("second-instance", (event) => {
    console.log("second-instance");
    win.show();
  });
}

function createAboutWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.bounds;

  const aboutWindow = new BrowserWindow({
    width: 500,
    height: 300,
    x: x + ((width - 500) / 2),
    y: y + ((height - 500) / 2),
    title: 'About',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    modal: true,  // Make the About window modal
    parent: win  // Set the main window as parent
  });

  aboutWindow.loadFile('about.html');
  aboutWindow.removeMenu();

  // Read version from package.json
  const packageJson = JSON.parse(fs.readFileSync(join(__dirname, 'package.json')));
  const appVersion = packageJson.version;
  const appDescription = packageJson.description;
  const appTitle = packageJson.title;
  const appBugsUrl = packageJson.bugs.url;
  const appHomePage = packageJson.homepage;
  const appAuthor = packageJson.author;

  // Send version to the About window
  aboutWindow.webContents.on('did-finish-load', () => {
    console.log("did-finish-load", appTitle);
    aboutWindow.webContents.send('app-version', appVersion);
    aboutWindow.webContents.send('app-description', appDescription);
    aboutWindow.webContents.send('app-title', appTitle);
    aboutWindow.webContents.send('app-bugs-url', appBugsUrl);
    aboutWindow.webContents.send('app-homepage', appHomePage);
    aboutWindow.webContents.send('app-author', appAuthor);
  });
  // Link clicks open new windows, let's force them to open links in
  // the default browser
  aboutWindow.webContents.setWindowOpenHandler(({url}) => {
    console.log('windowOpenHandler: ', url);
    shell.openExternal(url);
    return { action: 'deny' }
  });
}

ipcMain.on('get-app-metadata', (event) => {
    const packageJson = JSON.parse(fs.readFileSync(join(__dirname, 'package.json')));
    const appVersion = packageJson.version;
    const appDescription = packageJson.description;
    const appTitle = packageJson.title;
    const appBugsUrl = packageJson.bugs.url;
    const appHomePage = packageJson.homepage;
    const appAuthor = packageJson.author;
    event.sender.send('app-version', appVersion);
    event.sender.send('app-description', appDescription);
    event.sender.send('app-title', appTitle);
    event.sender.send('app-bugs-url', appBugsUrl);
    event.sender.send('app-homepage', appHomePage);
    event.sender.send('app-author', appAuthor);
});

app.whenReady().then(() => {
  createWindow();

  app.on('will-quit', () => {
    globalShortcut.unregisterAll(); // Asegurarse de liberar los atajos al salir
  });
});

app.on('window-all-closed', () => {
  console.log("window-all-closed");
});

app.on('activate', () => {
  console.log("ACTIVATE");
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
