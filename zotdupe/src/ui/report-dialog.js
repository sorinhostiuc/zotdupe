/*
 * ZotDupe — Report Dialog Controller
 *
 * Displays a summary of scan + merge results.
 * Receives data via window.arguments[0]:
 *   { stats, mergeLog, clusters }
 *
 * stats shape:
 *   { scanned, clusters, merges, nonDuplicates, skipped,
 *     extraFields, attachments, uniqueTags,
 *     scanTime, mergeTime }
 */

/* globals Components, IOUtils, ZotDupe */

var ZotDupeReport = {
  data: null,

  init() {
    // Receive report data passed when opening the dialog
    this.data = window.arguments && window.arguments[0];
    if (this.data) {
      this.renderReport();
    }
  },

  renderReport() {
    var s = this.data.stats || {};

    this._setText("zotdupe-stat-scanned", this._num(s.scanned));
    this._setText("zotdupe-stat-clusters", this._num(s.clusters));
    this._setText("zotdupe-stat-merges", this._num(s.merges));
    this._setText("zotdupe-stat-nondup", this._num(s.nonDuplicates));
    this._setText("zotdupe-stat-skipped", this._num(s.skipped));
    this._setText("zotdupe-stat-extra", this._num(s.extraFields));
    this._setText("zotdupe-stat-attachments", this._num(s.attachments));
    this._setText("zotdupe-stat-tags",
      this._num(s.uniqueTags) + " tag-uri unice");
    this._setText("zotdupe-stat-scantime", this._time(s.scanTime));
    this._setText("zotdupe-stat-mergetime", this._time(s.mergeTime));
  },

  /**
   * Export report as CSV via a file-picker save dialog.
   */
  async onExportCSV() {
    var fp = Components.classes["@mozilla.org/filepicker;1"]
      .createInstance(Components.interfaces.nsIFilePicker);
    fp.init(window, "Salvează raport CSV", fp.modeSave);
    fp.appendFilter("CSV", "*.csv");
    fp.defaultString = "zotdupe-report.csv";
    fp.defaultExtension = "csv";

    var result = await new Promise(resolve => fp.open(resolve));
    if (result === fp.returnOK || result === fp.returnReplace) {
      var csv = ZotDupe.exportCSV(this.data.clusters, this.data.mergeLog);
      await IOUtils.writeUTF8(fp.file.path, csv);
    }
  },

  onClose() {
    window.close();
  },

  // ── Helpers ──

  _setText(id, text) {
    var el = document.getElementById(id);
    if (el) {
      el.textContent = text;
    }
  },

  _num(val) {
    return val != null ? String(val) : "0";
  },

  _time(ms) {
    if (ms == null) return "0.0s";
    return (ms / 1000).toFixed(1) + "s";
  }
};
