// Imported by src/lib/google.js, the only file that reads window.nineflowDesktop as it loads. In the phone app
// this installs the bridge (src/native/androidBridge.js) first. On the website and in the desktop app it does
// nothing. (It has to be an import of google.js itself: a dependency always runs before its importer, whereas
// a script tag or an import in main.jsx can lose the race when the bundler splits shared code into chunks.)
import { installAndroidBridge } from './androidBridge'
import { isNativeApp } from '../lib/platform'

if (isNativeApp()) installAndroidBridge()
