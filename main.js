// const { app, BrowserWindow } = require('electron')
// const path = require('path')
// const url = require('url')
// const {autoUpdater, AppUpdater} = require('electron-updater')

// let win;


// // autoupdater flags
// autoUpdater.autoDownload = true;
// autoUpdater.autoInstallOnAppQuit = true;

// app.on('ready',async  () => {
//     createWindow();
//     const logz = await autoUpdater.checkForUpdates()
//     console.log("checking... , ",logz)
// })

// /*New Update Available*/
// autoUpdater.on("update-available", (info) => {
//     console.log(`Update available. Current version ${app.getVersion()}`);
//     let pth = autoUpdater.downloadUpdate();
//     console.log(pth);
// });

// autoUpdater.on("update-not-available", (info) => {
//     console.log(`No update available. Current version ${app.getVersion()}`);
// });

// /*Download Completion Message*/
// autoUpdater.on("update-downloaded", (info) => {
//     console.log(`Update downloaded. Current version ${app.getVersion()}`);
// });

// autoUpdater.on("error", (info) => {
//     console.log(info);
// });

// function createWindow () {
//     win = new BrowserWindow({
//         width: 1000,
//         height: 800
//     })

//     win.loadURL(url.format({
//         pathname: path.join(__dirname, './www/index.html'),
//         protocol: 'file:',
//         slashes: true
//     }))
//     win.on('closed', () => {
//         win = null
//     })
// }



// app.on('window-all-closed', () => {
//     if (process.platform !== 'darwin') app.quit()
// })
// app.on('activate', () => {
//     if (win === null) {
//         createWindow();
//     }    
// })



const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
        },
    });
    mainWindow.loadFile('./www/index.html');
    mainWindow.on('closed', function () {
        mainWindow = null;
    });
    mainWindow.once('ready-to-show', () => {
        autoUpdater.checkForUpdatesAndNotify();
    });
}

app.on('ready', () => {
    createWindow();
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});

ipcMain.on('app_version', (event) => {
    event.sender.send('app_version', { version: app.getVersion() });
});

autoUpdater.on('update-available', () => {
    mainWindow.webContents.send('update_available');
});
autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update_downloaded');
});
ipcMain.on('restart_app', () => {
    autoUpdater.quitAndInstall();
});