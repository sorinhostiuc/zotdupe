/* eslint-env mozilla/bootstrap-script */
/* global Components, Services, Zotero, ChromeUtils */

/**
 * ZotDupe — Semantic Duplicate Detector for Zotero 7+
 *
 * Bootstrap lifecycle hooks for a Zotero 7 plugin (.xpi).
 * This file manages plugin startup/shutdown, chrome registration,
 * menu integration, and preference pane registration.
 */

var chromeHandle;

// Reference to loaded modules (populated during startup)
var ZotDupe;

const PREF_BRANCH = "extensions.zotdupe.";

/**
 * Called when the plugin is first installed.
 */
function install(data, reason) {
  // Nothing to do on first install — startup handles initialization.
}

/**
 * Called when the plugin is about to be removed.
 */
function uninstall(data, reason) {
  // Nothing to do on uninstall — shutdown handles cleanup.
}

/**
 * Called when the plugin is enabled or Zotero starts with the plugin enabled.
 * This is the main initialization entry point.
 */
async function startup({ id, version, resourceURI, rootURI }, reason) {
  // Load default preferences
  Services.scriptloader.loadSubScript(rootURI + "prefs.js");

  // Register the chrome resource mapping: chrome://zotdupe/content/...
  // Maps chrome://zotdupe/content/ -> rootURI + "src/"
  // So chrome://zotdupe/content/ui/config-dialog.xhtml -> src/ui/config-dialog.xhtml
  var aomStartup = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);
  var manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ["content", "zotdupe", rootURI + "src/"],
  ]);

  // Wait for Zotero to be fully initialized
  await Zotero.initializationPromise;

  // Initialize the ZotDupe global namespace
  ZotDupe = {};

  // Load core modules in dependency order
  Services.scriptloader.loadSubScript(rootURI + "src/utils/normalize.js");   // ZotDupe.Normalize
  Services.scriptloader.loadSubScript(rootURI + "src/legal-fingerprint.js"); // ZotDupe.LegalFingerprint
  Services.scriptloader.loadSubScript(rootURI + "src/blocker.js");           // ZotDupe.Blocker
  Services.scriptloader.loadSubScript(rootURI + "src/scanner.js");           // ZotDupe.Scanner
  Services.scriptloader.loadSubScript(rootURI + "src/scorer.js");            // ZotDupe.Scorer
  Services.scriptloader.loadSubScript(rootURI + "src/canonical.js");         // ZotDupe.Canonical
  Services.scriptloader.loadSubScript(rootURI + "src/merger.js");            // ZotDupe.Merger
  Services.scriptloader.loadSubScript(rootURI + "src/utils/minhash.js");     // ZotDupe.MinHash
  Services.scriptloader.loadSubScript(rootURI + "src/zotdupe.js");           // ZotDupe.scan, etc.

  // Register preference pane
  Zotero.PreferencePanes.register({
    pluginID: "zotdupe@zotero-plugins.org",
    src: rootURI + "prefs.xhtml",
    label: "ZotDupe",
    image: rootURI + "icons/zotdupe.svg",
  });

  // Attach to any already-open main windows
  var windows = Zotero.getMainWindows();
  for (var win of windows) {
    onMainWindowLoad({ window: win });
  }
}

/**
 * Called when the plugin is disabled or Zotero shuts down.
 * Must clean up everything — Zotero 7 requires complete teardown.
 */
function shutdown({ id, version, resourceURI, rootURI }, reason) {
  // Skip cleanup if Zotero is shutting down entirely
  if (reason === APP_SHUTDOWN) {
    return;
  }

  // Remove menu items from all open windows
  var windows = Zotero.getMainWindows();
  for (var win of windows) {
    onMainWindowUnload({ window: win });
  }

  // Clean up the ZotDupe global
  ZotDupe = null;

  // Unregister chrome resource
  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}

/**
 * Called for each main Zotero window that opens while the plugin is active.
 * Adds the Tools menu item.
 */
function onMainWindowLoad({ window: win }) {
  var doc = win.document;

  // Create the Tools menu item: "ZotDupe: Scan for Duplicates..."
  var menuItem = doc.createXULElement("menuitem");
  menuItem.id = "zotdupe-scan-menuitem";
  menuItem.setAttribute("data-l10n-id", "zotdupe-menu-label");
  menuItem.addEventListener("command", function () {
    win.openDialog(
      "chrome://zotdupe/content/ui/config-dialog.xhtml",
      "zotdupe-config",
      "chrome,centerscreen,resizable"
    );
  });

  // Append to the Tools menu (menu_ToolsPopup)
  var toolsMenu = doc.getElementById("menu_ToolsPopup");
  if (toolsMenu) {
    toolsMenu.appendChild(menuItem);
  }
}

/**
 * Called for each main Zotero window that closes while the plugin is active.
 * Removes the Tools menu item.
 */
function onMainWindowUnload({ window: win }) {
  var doc = win.document;
  var menuItem = doc.getElementById("zotdupe-scan-menuitem");
  if (menuItem) {
    menuItem.remove();
  }
}
