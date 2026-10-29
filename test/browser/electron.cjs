// Drives the harness page in Electron for run.ts: loads the URL in a hidden window, then evaluates
// each JSON line {id, expr} from stdin in the page and answers with a JSON line {id, value|error}.
const { app, BrowserWindow } = require('electron')
const readline = require('node:readline')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } })
  await win.loadURL(process.argv[process.argv.length - 1])
  const say = (m) => process.stdout.write(JSON.stringify(m) + '\n')
  say({ ready: true, versions: { electron: process.versions.electron, chrome: process.versions.chrome } })
  readline.createInterface({ input: process.stdin }).on('line', async (line) => {
    const { id, expr } = JSON.parse(line)
    try {
      say({ id, value: await win.webContents.executeJavaScript(expr) })
    } catch (e) {
      say({ id, error: String(e?.message ?? e) })
    }
  })
  process.stdin.on('end', () => app.quit())
})
