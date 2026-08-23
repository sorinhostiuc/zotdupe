/**
 * ZotDupe Results Panel — UI logic
 *
 * Displays detected duplicate clusters, allows filtering, searching,
 * canonical selection via radio buttons, per-cluster merge / non-duplicate
 * actions, and batch "auto-merge all sure" functionality.
 *
 * Receives data through window.arguments[0]:
 *   { clusters, stats, zoteroItems }
 *
 * clusters[i] = {
 *     ids:           [itemID, ...],
 *     items:         [plainItem, ...],
 *     score:         0.0–1.0,
 *     classification:"sure" | "probable" | "possible",
 *     matchType:     string,
 *     canonicalId:   itemID
 * }
 */

var _io = window.arguments ? window.arguments[0] : null;
var Zotero = _io ? _io.Zotero : (typeof Zotero !== 'undefined' ? Zotero : null);
var ZotDupe = _io ? _io.ZotDupe : (typeof ZotDupe !== 'undefined' ? ZotDupe : null);

var ZotDupeResults = {

    // ── State ──────────────────────────────────────────────────
    clusters: [],
    stats: {},
    zoteroItems: {},
    resolvedCount: 0,
    totalCount: 0,
    currentFilter: 'all',
    searchQuery: '',
    resolvedSet: new Set(),   // indices of resolved clusters
    excludedItems: {},        // clusterIndex -> Set of excluded item IDs

    // ── Common Zotero item types for the type-change dropdown ─
    ITEM_TYPES: [
        { value: 'journalArticle', label: 'Journal Article' },
        { value: 'book', label: 'Book' },
        { value: 'bookSection', label: 'Book Section' },
        { value: 'conferencePaper', label: 'Conference Paper' },
        { value: 'thesis', label: 'Thesis' },
        { value: 'report', label: 'Report' },
        { value: 'preprint', label: 'Preprint' },
        { value: 'webpage', label: 'Webpage' },
        { value: 'document', label: 'Document' },
        { value: 'patent', label: 'Patent' },
        { value: 'letter', label: 'Letter' },
        { value: 'manuscript', label: 'Manuscript' },
        { value: 'presentation', label: 'Presentation' },
        { value: 'statute', label: 'Statute' },
        { value: 'bill', label: 'Bill' },
        { value: 'case', label: 'Case' },
        { value: 'hearing', label: 'Hearing' },
    ],

    // ── Emoji map for item types ──────────────────────────────
    TYPE_ICONS: {
        journalArticle:  '\uD83D\uDCF0',   // newspaper
        book:            '\uD83D\uDCD5',   // closed book
        bookSection:     '\uD83D\uDCD6',   // open book
        conferencePaper: '\uD83C\uDFE4',   // building
        thesis:          '\uD83C\uDF93',   // graduation cap
        report:          '\uD83D\uDCCB',   // clipboard
        webpage:         '\uD83C\uDF10',   // globe
        patent:          '\u2696\uFE0F',   // balance scale
        statute:         '\u2696\uFE0F',
        case:            '\u2696\uFE0F',
        bill:            '\u2696\uFE0F',
        hearing:         '\u2696\uFE0F',
        letter:          '\u2709\uFE0F',   // envelope
        preprint:        '\uD83D\uDCC4',   // page facing up
        manuscript:      '\uD83D\uDCDC',   // scroll
        presentation:    '\uD83D\uDCCA',   // bar chart
        default:         '\uD83D\uDCC4'    // page facing up
    },

    // ===========================================================
    // init — entry point, called on window load
    // ===========================================================
    init: function () {
        try {
            var args = (window.arguments && window.arguments[0]) || {};
            var scanResult = args.scanResult || {};
            this.clusters    = scanResult.clusters || args.clusters || [];
            this.stats       = scanResult.stats    || args.stats   || {};
            this.zoteroItems = args.zoteroItems  || {};
            this.totalCount  = this.clusters.length;
            this.resolvedCount = 0;
            this.resolvedSet = new Set();
            this.currentFilter = 'all';
            this.searchQuery = '';

            this.renderStats(this.stats);
            this.renderFilterCounts();
            this.renderClusters(this.clusters, 'all');
            this.updateBottomBar();
        } catch (e) {
            if (typeof Components !== 'undefined') {
                Components.utils.reportError('ZotDupeResults.init: ' + e);
            }
        }
    },

    // ===========================================================
    // renderStats — update the five stat cards
    // ===========================================================
    renderStats: function (stats) {
        var scanned  = stats.itemsScanned || 0;
        var clusters = this.clusters.length;
        var sure     = 0;
        var probable = 0;
        var possible = 0;
        for (var i = 0; i < this.clusters.length; i++) {
            var cl = this.clusters[i].classification;
            if (cl === 'sure')          sure++;
            else if (cl === 'probable') probable++;
            else                        possible++;
        }

        this._setText('stat-scanned',  scanned);
        this._setText('stat-clusters', clusters);
        this._setText('stat-sure',     sure);
        this._setText('stat-probable', probable);
        this._setText('stat-possible', possible);
    },

    // ===========================================================
    // renderFilterCounts — update chip counters
    // ===========================================================
    renderFilterCounts: function () {
        var counts = { all: 0, sure: 0, probable: 0, possible: 0 };
        for (var i = 0; i < this.clusters.length; i++) {
            if (this.resolvedSet.has(i)) continue;
            counts.all++;
            var cl = this.clusters[i].classification;
            if (counts[cl] !== undefined) counts[cl]++;
        }
        document.getElementById('chip-all').textContent      = counts.all;
        document.getElementById('chip-sure').textContent     = counts.sure;
        document.getElementById('chip-probable').textContent = counts.probable;
        document.getElementById('chip-possible').textContent = counts.possible;
        document.getElementById('auto-merge-count').textContent = counts.sure;
    },

    // ===========================================================
    // renderClusters — build visible cluster cards
    // ===========================================================
    renderClusters: function (clusters, filter) {
        var container = document.getElementById('zotdupe-cluster-list');
        container.innerHTML = '';

        var query = this.searchQuery.toLowerCase().trim();
        var rendered = 0;

        for (var i = 0; i < clusters.length; i++) {
            if (this.resolvedSet.has(i)) continue;
            if (filter !== 'all' && clusters[i].classification !== filter) continue;
            if (query && !this._clusterMatchesQuery(clusters[i], query)) continue;

            container.appendChild(this.renderClusterCard(clusters[i], i));
            rendered++;
        }

        if (rendered === 0) {
            var empty = document.createElement('div');
            empty.className = 'zotdupe-empty';
            empty.textContent = 'No clusters matching the current filters.';
            container.appendChild(empty);
        }
    },

    // ===========================================================
    // renderClusterCard — build HTML for a single cluster
    // ===========================================================
    renderClusterCard: function (cluster, index) {
        var card = document.createElement('div');
        card.className = 'zotdupe-cluster-card ' + (cluster.classification || 'possible');
        card.id = 'cluster-card-' + index;

        // -- Header --
        var header = document.createElement('div');
        header.className = 'cluster-header';

        var label = document.createElement('span');
        label.className = 'cluster-label';
        label.textContent = 'Cluster #' + (index + 1);
        header.appendChild(label);

        var scoreBadge = document.createElement('span');
        scoreBadge.className = 'score-badge ' + (cluster.classification || 'possible');
        scoreBadge.textContent = (cluster.score != null)
            ? (cluster.score >= 1 ? '1.0' : cluster.score.toFixed(2).replace(/^0/, ''))
            : '?';
        header.appendChild(scoreBadge);

        if (cluster.matchType) {
            var mt = document.createElement('span');
            mt.className = 'match-type';
            mt.textContent = cluster.matchType;
            header.appendChild(mt);
        }

        var countBadge = document.createElement('span');
        countBadge.className = 'item-count-badge';
        countBadge.textContent = (cluster.items ? cluster.items.length : cluster.ids.length) + ' items';
        header.appendChild(countBadge);

        card.appendChild(header);

        // -- Item rows --
        var itemsDiv = document.createElement('div');
        itemsDiv.className = 'cluster-items';

        var items = cluster.items || [];
        var radioName = 'canonical-' + index;

        for (var j = 0; j < items.length; j++) {
            var item = items[j];
            var itemId = cluster.ids ? cluster.ids[j] : (item.id || j);
            var isCanonical = (itemId === cluster.canonicalId) ||
                              (String(itemId) === String(cluster.canonicalId));

            var row = document.createElement('div');
            row.className = 'cluster-item-row';

            // Include checkbox (only shown for clusters with 3+ items)
            if (items.length > 2) {
                var checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = true;
                checkbox.className = 'include-checkbox';
                checkbox.setAttribute('data-cluster', String(index));
                checkbox.setAttribute('data-item-id', String(itemId));
                if (isCanonical) {
                    checkbox.disabled = true;
                    checkbox.title = 'Canonical item is always included';
                }
                (function (ci, iid, cb) {
                    cb.addEventListener('change', function () {
                        ZotDupeResults.onIncludeChange(ci, iid, cb.checked);
                    });
                })(index, itemId, checkbox);
                row.appendChild(checkbox);
            }

            // Radio
            var radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = radioName;
            radio.value = String(itemId);
            if (isCanonical) radio.checked = true;
            row.appendChild(radio);

            // Type icon
            var icon = document.createElement('span');
            icon.className = 'item-type-icon';
            var iType = item.itemType || 'default';
            icon.textContent = this.TYPE_ICONS[iType] || this.TYPE_ICONS['default'];
            row.appendChild(icon);

            // Title
            var title = document.createElement('span');
            title.className = 'item-title';
            title.textContent = item.title || '(no title)';
            title.title = item.title || '';
            row.appendChild(title);

            // Authors
            var authors = document.createElement('span');
            authors.className = 'item-authors';
            authors.textContent = this._formatAuthors(item);
            authors.title = this._formatAuthors(item);
            row.appendChild(authors);

            // Year
            var year = document.createElement('span');
            year.className = 'item-year';
            year.textContent = this._extractYear(item.date) || '—';
            row.appendChild(year);

            // ItemType button (opens native picker)
            var typeBtn = document.createElement('button');
            typeBtn.className = 'item-type-btn';
            var typeLabel = iType;
            for (var t = 0; t < this.ITEM_TYPES.length; t++) {
                if (this.ITEM_TYPES[t].value === iType) { typeLabel = this.ITEM_TYPES[t].label; break; }
            }
            typeBtn.textContent = typeLabel;
            typeBtn.title = 'Change item type';
            (function (ci, ji, btn) {
                btn.addEventListener('click', function () {
                    ZotDupeResults._pickItemType(ci, ji, btn);
                });
            })(index, j, typeBtn);
            row.appendChild(typeBtn);

            // DOI badge
            if (item.DOI) {
                var doiBadge = document.createElement('span');
                doiBadge.className = 'item-doi-badge';
                doiBadge.textContent = 'DOI';
                doiBadge.title = item.DOI;
                row.appendChild(doiBadge);
            }

            // PDF badge
            if (item.hasPDF || item.attachmentCount) {
                var pdfBadge = document.createElement('span');
                pdfBadge.className = 'item-pdf-badge';
                pdfBadge.textContent = 'PDF';
                row.appendChild(pdfBadge);
            }

            // Canonical recommendation label
            if (isCanonical) {
                var recLabel = document.createElement('span');
                recLabel.className = 'canonical-label';
                recLabel.textContent = '(RECOMMENDED)';
                row.appendChild(recLabel);
            }

            // -- Per-item action buttons --
            var itemActions = document.createElement('span');
            itemActions.className = 'item-actions';

            // Lookup button (OpenAlex)
            var btnLookup = document.createElement('button');
            btnLookup.className = 'btn-item-lookup';
            btnLookup.textContent = '\uD83D\uDD0D';
            btnLookup.title = 'Lookup in OpenAlex';
            (function (ci, ji) {
                btnLookup.addEventListener('click', function () {
                    ZotDupeResults.onLookup(ci, ji);
                });
            })(index, j);
            itemActions.appendChild(btnLookup);

            // Delete button (trash)
            var btnDelete = document.createElement('button');
            btnDelete.className = 'btn-item-delete';
            btnDelete.textContent = '\uD83D\uDDD1';
            btnDelete.title = 'Move to Trash';
            (function (ci, ji) {
                btnDelete.addEventListener('click', function () {
                    ZotDupeResults.onDeleteItem(ci, ji);
                });
            })(index, j);
            itemActions.appendChild(btnDelete);

            row.appendChild(itemActions);

            itemsDiv.appendChild(row);

            // Lookup panel placeholder (hidden by default)
            var lookupPanel = document.createElement('div');
            lookupPanel.className = 'lookup-panel';
            lookupPanel.id = 'lookup-panel-' + index + '-' + j;
            lookupPanel.style.display = 'none';
            itemsDiv.appendChild(lookupPanel);
        }

        card.appendChild(itemsDiv);

        // -- Action buttons --
        var actions = document.createElement('div');
        actions.className = 'cluster-actions';

        var btnMerge = document.createElement('button');
        btnMerge.className = 'btn-merge';
        btnMerge.textContent = 'Merge';
        btnMerge.onclick = function () { ZotDupeResults.onMerge(index); };
        actions.appendChild(btnMerge);

        var btnNonDup = document.createElement('button');
        btnNonDup.className = 'btn-non-dup';
        btnNonDup.textContent = 'Non-duplicate';
        btnNonDup.onclick = function () { ZotDupeResults.onNonDuplicate(index); };
        actions.appendChild(btnNonDup);

        var btnDetail = document.createElement('button');
        btnDetail.className = 'btn-detail';
        btnDetail.textContent = 'Show differences';
        btnDetail.onclick = function () { ZotDupeResults.onDetail(index); };
        actions.appendChild(btnDetail);

        var btnDeleteCluster = document.createElement('button');
        btnDeleteCluster.className = 'btn-delete-cluster';
        btnDeleteCluster.textContent = 'Delete all';
        btnDeleteCluster.title = 'Move all items in this cluster to Trash';
        btnDeleteCluster.onclick = function () { ZotDupeResults.onDeleteCluster(index); };
        actions.appendChild(btnDeleteCluster);

        card.appendChild(actions);

        return card;
    },

    // ===========================================================
    // Filter / search handlers
    // ===========================================================
    onFilterChange: function (filter) {
        this.currentFilter = filter;

        // Update active chip styling
        var chips = document.querySelectorAll('.zotdupe-chip');
        for (var i = 0; i < chips.length; i++) {
            var chipFilter = chips[i].getAttribute('data-filter');
            if (chipFilter === filter) {
                chips[i].classList.add('active');
            } else {
                chips[i].classList.remove('active');
            }
        }

        this.renderClusters(this.clusters, filter);
    },

    onSearch: function (query) {
        this.searchQuery = query || '';
        this.renderClusters(this.clusters, this.currentFilter);
    },

    // ===========================================================
    // Include/exclude handler for checkboxes
    // ===========================================================
    onIncludeChange: function (clusterIndex, itemId, included) {
        if (!this.excludedItems[clusterIndex]) {
            this.excludedItems[clusterIndex] = new Set();
        }
        if (included) {
            this.excludedItems[clusterIndex].delete(itemId);
        } else {
            this.excludedItems[clusterIndex].add(itemId);
        }

        // Update the row styling
        var card = document.getElementById('cluster-card-' + clusterIndex);
        if (card) {
            var rows = card.querySelectorAll('.cluster-item-row');
            for (var r = 0; r < rows.length; r++) {
                var cb = rows[r].querySelector('.include-checkbox');
                if (cb && String(cb.getAttribute('data-item-id')) === String(itemId)) {
                    if (included) {
                        rows[r].classList.remove('item-excluded');
                    } else {
                        rows[r].classList.add('item-excluded');
                    }
                }
            }
        }
    },

    /**
     * Build a filtered cluster containing only included items.
     */
    _getFilteredCluster: function (cluster, clusterIndex, canonicalId) {
        var excluded = this.excludedItems[clusterIndex];
        if (!excluded || excluded.size === 0) return cluster;

        var filteredIds = [];
        var filteredItems = [];
        for (var i = 0; i < cluster.ids.length; i++) {
            var id = cluster.ids[i];
            if (!excluded.has(id)) {
                filteredIds.push(id);
                if (cluster.items[i]) filteredItems.push(cluster.items[i]);
            }
        }

        return {
            ids: filteredIds,
            items: filteredItems,
            score: cluster.score,
            classification: cluster.classification,
            matchType: cluster.matchType,
            canonicalId: canonicalId
        };
    },

    // ===========================================================
    // Merge action
    // ===========================================================
    onMerge: async function (clusterIndex) {
        var cluster = this.clusters[clusterIndex];
        if (!cluster) return;

        // Find the selected canonical item from the radio buttons
        var radios = document.querySelectorAll('input[name="canonical-' + clusterIndex + '"]');
        var selectedId = null;
        for (var i = 0; i < radios.length; i++) {
            if (radios[i].checked) {
                selectedId = parseInt(radios[i].value, 10);
                break;
            }
        }

        if (!selectedId) {
            selectedId = cluster.canonicalId;
        }

        // Build filtered cluster (excluding unchecked items)
        var filteredCluster = this._getFilteredCluster(cluster, clusterIndex, selectedId);

        // Need at least 2 items to merge
        if (filteredCluster.ids.length < 2) {
            this._resolveCluster(clusterIndex);
            return;
        }

        try {
            if (typeof ZotDupe !== 'undefined' && ZotDupe.mergeCluster) {
                await ZotDupe.mergeCluster(filteredCluster, selectedId, this.zoteroItems);
            }
        } catch (e) {
            if (typeof Zotero !== 'undefined') {
                Zotero.logError('ZotDupeResults.onMerge error: ' + e);
            }
        }

        // Mark resolved and refresh
        this._resolveCluster(clusterIndex);
    },

    // ===========================================================
    // Non-duplicate action
    // ===========================================================
    onNonDuplicate: async function (clusterIndex) {
        var cluster = this.clusters[clusterIndex];
        if (!cluster) return;

        try {
            // Mark all pairs in this cluster as non-duplicate using item keys
            if (typeof ZotDupe !== 'undefined' && ZotDupe.markNonDuplicate) {
                var items = cluster.items || [];
                var keys = [];
                for (var k = 0; k < items.length; k++) {
                    if (items[k].key) keys.push(items[k].key);
                }
                for (var i = 0; i < keys.length; i++) {
                    for (var j = i + 1; j < keys.length; j++) {
                        ZotDupe.markNonDuplicate(keys[i], keys[j]);
                    }
                }
            }
        } catch (e) {
            if (typeof Components !== 'undefined') {
                Components.utils.reportError('ZotDupeResults.onNonDuplicate error: ' + e);
            }
        }

        this._resolveCluster(clusterIndex);
    },

    // ===========================================================
    // Detail — open merge-preview dialog
    // ===========================================================
    onDetail: async function (clusterIndex) {
        var cluster = this.clusters[clusterIndex];
        if (!cluster) return;

        var dialogArgs = {
            Zotero: Zotero,
            ZotDupe: ZotDupe,
            cluster: cluster,
            zoteroItems: this.zoteroItems,
            clusterIndex: clusterIndex,
            result: null
        };

        try {
            window.openDialog(
                'chrome://zotdupe/content/ui/merge-preview.xhtml',
                'zotdupe-merge-preview',
                'chrome,dialog,centerscreen,modal,resizable=yes,width=720,height=560',
                dialogArgs
            );
        } catch (e) {
            if (typeof Components !== 'undefined') {
                Components.utils.reportError('ZotDupeResults.onDetail error: ' + e);
            }
            return;
        }

        // Handle the result from the modal dialog
        var result = dialogArgs.result;
        if (!result || !result.merged) return;

        // Build filtered cluster excluding items the user unchecked
        var filteredCluster = cluster;
        if (result.excludedIds && result.excludedIds.length > 0) {
            var excludedSet = new Set(result.excludedIds);
            var filteredIds = [];
            var filteredItems = [];
            for (var i = 0; i < cluster.ids.length; i++) {
                if (!excludedSet.has(cluster.ids[i])) {
                    filteredIds.push(cluster.ids[i]);
                    if (cluster.items[i]) filteredItems.push(cluster.items[i]);
                }
            }
            filteredCluster = {
                ids: filteredIds,
                items: filteredItems,
                score: cluster.score,
                classification: cluster.classification,
                matchType: cluster.matchType,
                canonicalId: cluster.canonicalId
            };
        }

        if (filteredCluster.ids.length < 2) {
            this._resolveCluster(clusterIndex);
            return;
        }

        try {
            if (typeof ZotDupe !== 'undefined' && ZotDupe.mergeCluster) {
                await ZotDupe.mergeCluster(
                    filteredCluster,
                    cluster.canonicalId,
                    this.zoteroItems,
                    result.fieldSelections || null
                );
            }
        } catch (e) {
            if (typeof Zotero !== 'undefined') {
                Zotero.logError('ZotDupeResults.onDetail merge error: ' + e);
            }
        }

        this._resolveCluster(clusterIndex);
    },

    // ===========================================================
    // Auto-merge all sure clusters
    // ===========================================================
    onAutoMergeAllSure: async function () {
        var btn = document.getElementById('btn-auto-merge');
        if (btn) btn.disabled = true;

        for (var i = 0; i < this.clusters.length; i++) {
            if (this.resolvedSet.has(i)) continue;
            if (this.clusters[i].classification !== 'sure') continue;

            try {
                var cluster = this.clusters[i];
                var canonicalId = cluster.canonicalId;
                if (typeof ZotDupe !== 'undefined' && ZotDupe.mergeCluster) {
                    await ZotDupe.mergeCluster(cluster, canonicalId, this.zoteroItems);
                }
                this._resolveCluster(i);
            } catch (e) {
                if (typeof Components !== 'undefined') {
                    Components.utils.reportError('ZotDupeResults.onAutoMergeAllSure error on cluster ' + i + ': ' + e);
                }
            }
        }

        if (btn) btn.disabled = false;
    },

    // ===========================================================
    // Library Search — find items by keyword, create manual cluster
    // ===========================================================
    // -- Library search: inline panel --
    _libSearchMatches: [],

    onLibrarySearch: function () {
        var panel = document.getElementById('zotdupe-lib-search-panel');
        if (panel.style.display !== 'none') {
            this.onLibSearchClose();
            return;
        }
        panel.style.display = '';
        var input = document.getElementById('lib-search-input');
        input.value = '';
        input.focus();
        document.getElementById('lib-search-results').innerHTML = '';
        document.getElementById('lib-search-status').style.display = 'none';
        document.getElementById('lib-search-actions').style.display = 'none';
        this._libSearchMatches = [];

        // Allow Enter key to trigger search
        var self = this;
        input.onkeydown = function (e) {
            if (e.key === 'Enter') { self.onLibSearchGo(); }
        };
    },

    onLibSearchClose: function () {
        document.getElementById('zotdupe-lib-search-panel').style.display = 'none';
        this._libSearchMatches = [];
    },

    onLibSearchGo: async function () {
        var input = document.getElementById('lib-search-input');
        var keywords = (input.value || '').trim().toLowerCase();
        if (!keywords) return;

        var terms = keywords.split(/\s+/);
        var resultsDiv = document.getElementById('lib-search-results');
        var statusDiv = document.getElementById('lib-search-status');
        var actionsDiv = document.getElementById('lib-search-actions');

        resultsDiv.innerHTML = '';
        statusDiv.textContent = 'Searching\u2026';
        statusDiv.style.display = '';
        actionsDiv.style.display = 'none';
        this._libSearchMatches = [];

        try {
            var libID = Zotero.Libraries.userLibraryID;
            var allItems = await Zotero.Items.getAll(libID);
            var matches = [];

            for (var i = 0; i < allItems.length; i++) {
                var item = allItems[i];
                if (!item.isRegularItem || !item.isRegularItem()) continue;
                if (item.deleted) continue;

                var searchText = '';
                try { searchText += (item.getField('title') || '') + ' '; } catch (e) {}
                try { searchText += (item.getField('shortTitle') || '') + ' '; } catch (e) {}
                try { searchText += (item.getField('abstractNote') || '') + ' '; } catch (e) {}
                try { searchText += (item.getField('extra') || '') + ' '; } catch (e) {}
                try { searchText += (item.getField('DOI') || '') + ' '; } catch (e) {}
                try { searchText += (item.getField('publicationTitle') || '') + ' '; } catch (e) {}
                try { searchText += (item.getField('date') || '') + ' '; } catch (e) {}
                var creators = item.getCreators ? item.getCreators() : [];
                for (var c = 0; c < creators.length; c++) {
                    searchText += (creators[c].firstName || '') + ' ' + (creators[c].lastName || '') + ' ';
                }
                var tags = item.getTags ? item.getTags() : [];
                for (var t = 0; t < tags.length; t++) {
                    searchText += (tags[t].tag || '') + ' ';
                }
                searchText = searchText.toLowerCase();

                var allMatch = true;
                for (var k = 0; k < terms.length; k++) {
                    if (searchText.indexOf(terms[k]) === -1) { allMatch = false; break; }
                }
                if (allMatch) matches.push(item);
            }

            this._libSearchMatches = matches;

            if (matches.length === 0) {
                statusDiv.textContent = 'No items found for "' + keywords + '".';
                return;
            }

            statusDiv.textContent = matches.length + ' items found. Select items to include in cluster:';

            for (var m = 0; m < matches.length; m++) {
                var row = document.createElement('label');
                row.className = 'lib-search-row';

                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'lib-search-cb';
                cb.setAttribute('data-idx', m);
                var self = this;
                cb.addEventListener('change', function () { self._updateLibSearchCount(); });
                row.appendChild(cb);

                var info = document.createElement('span');
                info.className = 'lib-search-item-info';

                var title = '';
                try { title = matches[m].getField('title') || '(untitled)'; } catch (e) {}
                var yr = '';
                try { yr = matches[m].getField('date') || ''; } catch (e) {}
                yr = yr ? yr.substring(0, 4) : '';
                var authorStr = '';
                var crs = matches[m].getCreators ? matches[m].getCreators() : [];
                if (crs.length > 0) authorStr = crs[0].lastName || '';
                if (crs.length > 1) authorStr += ' et al.';
                var typeName = '';
                try { typeName = Zotero.ItemTypes.getName(matches[m].itemTypeID) || ''; } catch (e) {}

                var titleSpan = document.createElement('span');
                titleSpan.className = 'lib-search-title';
                titleSpan.textContent = title;
                info.appendChild(titleSpan);

                var metaSpan = document.createElement('span');
                metaSpan.className = 'lib-search-meta';
                var metaParts = [];
                if (authorStr) metaParts.push(authorStr);
                if (yr) metaParts.push(yr);
                if (typeName) metaParts.push(typeName);
                metaSpan.textContent = metaParts.join(' · ');
                info.appendChild(metaSpan);

                row.appendChild(info);
                resultsDiv.appendChild(row);
            }

            actionsDiv.style.display = '';
            this._updateLibSearchCount();

        } catch (e) {
            statusDiv.textContent = 'Search error: ' + e;
            Zotero.logError('[ZotDupe] Library search error: ' + e);
        }
    },

    _updateLibSearchCount: function () {
        var cbs = document.querySelectorAll('.lib-search-cb:checked');
        var countEl = document.getElementById('lib-search-selected-count');
        countEl.textContent = cbs.length + ' selected';
        var btn = document.getElementById('lib-search-create-cluster');
        btn.disabled = cbs.length < 2;
    },

    onLibSearchCreateCluster: function () {
        var cbs = document.querySelectorAll('.lib-search-cb:checked');
        if (cbs.length < 2) return;

        var selectedItems = [];
        for (var i = 0; i < cbs.length; i++) {
            var idx = parseInt(cbs[i].getAttribute('data-idx'), 10);
            selectedItems.push(this._libSearchMatches[idx]);
        }

        var clusterIds = [];
        var clusterItems = [];
        for (var s = 0; s < selectedItems.length; s++) {
            var si = selectedItems[s];
            clusterIds.push(si.id);
            this.zoteroItems[si.id] = si;

            var plain = { title: '', itemType: '', date: '', DOI: '', creators: [] };
            try { plain.title = si.getField('title') || ''; } catch (e) {}
            try { plain.itemType = Zotero.ItemTypes.getName(si.itemTypeID) || ''; } catch (e) {}
            try { plain.date = si.getField('date') || ''; } catch (e) {}
            try { plain.DOI = si.getField('DOI') || ''; } catch (e) {}
            try { plain.publicationTitle = si.getField('publicationTitle') || ''; } catch (e) {}
            try { plain.language = si.getField('language') || ''; } catch (e) {}
            var crs = si.getCreators ? si.getCreators() : [];
            plain.creators = crs.map(function (cr) {
                return { firstName: cr.firstName || '', lastName: cr.lastName || '' };
            });
            clusterItems.push(plain);
        }

        var queryText = document.getElementById('lib-search-input').value.trim();
        var newCluster = {
            ids: clusterIds,
            items: clusterItems,
            score: 0.50,
            classification: 'possible',
            matchType: 'Manual search: ' + queryText,
            canonicalId: clusterIds[0]
        };

        var newIndex = this.clusters.length;
        this.clusters.push(newCluster);
        this.totalCount = this.clusters.length;

        var container = document.getElementById('zotdupe-cluster-list');
        var card = this.renderClusterCard(newCluster, newIndex);
        container.appendChild(card);

        this.renderFilterCounts();
        this.updateBottomBar();

        // Close search panel and scroll to new cluster
        this.onLibSearchClose();
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },

    // ===========================================================
    // Close — open report dialog, then close window
    // ===========================================================
    onClose: function () {
        try {
            window.openDialog(
                'chrome://zotdupe/content/ui/report-dialog.xhtml',
                'zotdupe-report',
                'chrome,dialog,centerscreen,modal,width=480,height=380',
                {
                    Zotero: Zotero,
                    ZotDupe: ZotDupe,
                    totalClusters: this.totalCount,
                    resolved: this.resolvedCount,
                    remaining: this.totalCount - this.resolvedCount,
                    stats: this.stats
                }
            );
        } catch (e) {
            // Report dialog may not exist yet — just close
        }
        window.close();
    },

    // ===========================================================
    // Change item type
    // ===========================================================
    onChangeType: async function (clusterIndex, itemIndex, newType) {
        var cluster = this.clusters[clusterIndex];
        if (!cluster) return;
        var itemId = cluster.ids[itemIndex];
        var zotItem = this.zoteroItems[itemId];
        if (!zotItem) return;

        try {
            var newTypeID = Zotero.ItemTypes.getID(newType);
            if (newTypeID && zotItem.itemTypeID !== newTypeID) {
                zotItem.itemTypeID = newTypeID;
                await zotItem.saveTx();
                // Update plain item
                if (cluster.items[itemIndex]) {
                    cluster.items[itemIndex].itemType = newType;
                }
                // Re-render this cluster card
                this._rerenderClusterCard(clusterIndex);
            }
        } catch (e) {
            Zotero.logError('[ZotDupe] Type change error: ' + e);
        }
    },

    _pickItemType: function (clusterIndex, itemIndex, btn) {
        var cluster = this.clusters[clusterIndex];
        if (!cluster) return;
        var currentType = (cluster.items[itemIndex] && cluster.items[itemIndex].itemType) || '';

        var labels = [];
        var values = [];
        var selectedIdx = { value: 0 };
        for (var t = 0; t < this.ITEM_TYPES.length; t++) {
            labels.push(this.ITEM_TYPES[t].label);
            values.push(this.ITEM_TYPES[t].value);
            if (this.ITEM_TYPES[t].value === currentType) {
                selectedIdx.value = t;
            }
        }

        var ps = typeof Services !== 'undefined' && Services.prompt
            ? Services.prompt
            : Components.classes['@mozilla.org/embedcomp/prompt-service;1']
                .getService(Components.interfaces.nsIPromptService);

        var ok = ps.select(
            window, 'Change Item Type', 'Select the new item type:', labels, selectedIdx
        );
        if (ok && values[selectedIdx.value] !== currentType) {
            this.onChangeType(clusterIndex, itemIndex, values[selectedIdx.value]);
        }
    },

    // ===========================================================
    // Delete item (move to trash)
    // ===========================================================
    onDeleteItem: async function (clusterIndex, itemIndex) {
        var cluster = this.clusters[clusterIndex];
        if (!cluster) return;
        var itemId = cluster.ids[itemIndex];
        var zotItem = this.zoteroItems[itemId];
        if (!zotItem) return;

        var itemTitle = (cluster.items[itemIndex] && cluster.items[itemIndex].title) || '';
        var shortTitle = itemTitle.length > 50 ? itemTitle.substring(0, 50) + '\u2026' : itemTitle;

        // Confirm before deleting
        if (!confirm('Move "' + shortTitle + '" to Trash?')) return;

        try {
            zotItem.deleted = true;
            await zotItem.saveTx();

            // Remove from cluster data
            cluster.ids.splice(itemIndex, 1);
            cluster.items.splice(itemIndex, 1);
            delete this.zoteroItems[itemId];

            // If only 1 item left, auto-resolve
            if (cluster.ids.length <= 1) {
                this._resolveCluster(clusterIndex);
            } else {
                // Re-select canonical if deleted was canonical
                if (itemId === cluster.canonicalId || String(itemId) === String(cluster.canonicalId)) {
                    cluster.canonicalId = cluster.ids[0];
                }
                this._rerenderClusterCard(clusterIndex);
            }
        } catch (e) {
            Zotero.logError('[ZotDupe] Delete error: ' + e);
        }
    },

    onDeleteCluster: async function (clusterIndex) {
        var cluster = this.clusters[clusterIndex];
        if (!cluster) return;

        var count = cluster.ids.length;
        if (!confirm('Move all ' + count + ' items in this cluster to Trash?')) return;

        try {
            for (var i = 0; i < cluster.ids.length; i++) {
                var zotItem = this.zoteroItems[cluster.ids[i]];
                if (zotItem) {
                    zotItem.deleted = true;
                    await zotItem.saveTx();
                }
            }
            this._resolveCluster(clusterIndex);
        } catch (e) {
            Zotero.logError('[ZotDupe] Delete cluster error: ' + e);
        }
    },

    // ===========================================================
    // OpenAlex lookup
    // ===========================================================
    onLookup: function (clusterIndex, itemIndex) {
        var panelId = 'lookup-panel-' + clusterIndex + '-' + itemIndex;
        var panel = document.getElementById(panelId);
        if (!panel) return;

        // Toggle visibility
        if (panel.style.display !== 'none') {
            panel.style.display = 'none';
            return;
        }

        var cluster = this.clusters[clusterIndex];
        var item = cluster.items[itemIndex];
        this._renderLookupPanel(panel, clusterIndex, itemIndex, item);
        panel.style.display = 'block';
    },

    _renderLookupPanel: function (panel, clusterIndex, itemIndex, item) {
        panel.innerHTML = '';

        var bar = document.createElement('div');
        bar.className = 'lookup-search-bar';

        // Search type selector
        var searchType = document.createElement('select');
        searchType.className = 'lookup-search-type';
        var types = [
            { value: 'auto', label: 'Auto (DOI or Title)' },
            { value: 'doi', label: 'DOI' },
            { value: 'title', label: 'Title' },
            { value: 'author', label: 'Author + Title' }
        ];
        for (var t = 0; t < types.length; t++) {
            var opt = document.createElement('option');
            opt.value = types[t].value;
            opt.textContent = types[t].label;
            searchType.appendChild(opt);
        }
        bar.appendChild(searchType);

        // Search input
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'lookup-search-input';
        input.value = item.DOI || item.title || '';
        input.placeholder = 'Enter DOI, title, or author\u2026';
        bar.appendChild(input);

        // Search button
        var btnSearch = document.createElement('button');
        btnSearch.className = 'lookup-search-btn';
        btnSearch.textContent = 'Search';
        bar.appendChild(btnSearch);

        // Close button
        var btnClose = document.createElement('button');
        btnClose.className = 'lookup-close-btn';
        btnClose.textContent = '\u2715';
        btnClose.title = 'Close';
        btnClose.addEventListener('click', function () { panel.style.display = 'none'; });
        bar.appendChild(btnClose);

        panel.appendChild(bar);

        // Results area
        var resultsDiv = document.createElement('div');
        resultsDiv.className = 'lookup-results';
        resultsDiv.textContent = 'Click Search to query OpenAlex.';
        panel.appendChild(resultsDiv);

        var self = this;
        btnSearch.addEventListener('click', function () {
            var query = input.value.trim();
            var sType = searchType.value;
            if (!query) return;
            resultsDiv.textContent = 'Searching OpenAlex\u2026';
            self._searchAllSources(query, sType, item, resultsDiv, clusterIndex, itemIndex);
        });

        // Auto-search on open if item has DOI or title
        if (item.DOI || item.title) {
            resultsDiv.textContent = 'Searching OpenAlex\u2026';
            this._searchAllSources(item.DOI || item.title, 'auto', item, resultsDiv, clusterIndex, itemIndex);
        }
    },

    /**
     * Cascading search: OpenAlex → PubMed → CrossRef.
     * Displays results as they come in from each source.
     */
    _searchAllSources: async function (query, searchType, item, container, clusterIndex, itemIndex) {
        var allResults = [];
        var self = this;

        // 1) OpenAlex
        try {
            container.textContent = 'Searching OpenAlex\u2026';
            var oaResults = await this._searchOpenAlex(query, searchType, item);
            if (oaResults && oaResults.length > 0) {
                allResults = allResults.concat(oaResults);
                this._displayLookupResults(container, allResults, clusterIndex, itemIndex);
            }
        } catch (e) {
            // OpenAlex failed — continue
        }

        // 2) PubMed (if OpenAlex found nothing or errored)
        if (allResults.length === 0) {
            try {
                container.textContent = 'OpenAlex: no results. Searching PubMed\u2026';
                var pmResults = await this._searchPubMed(query, searchType, item);
                if (pmResults && pmResults.length > 0) {
                    allResults = allResults.concat(pmResults);
                    this._displayLookupResults(container, allResults, clusterIndex, itemIndex);
                }
            } catch (e) {
                // PubMed failed — continue
            }
        }

        // 3) CrossRef (if still nothing)
        if (allResults.length === 0) {
            try {
                container.textContent = 'PubMed: no results. Searching CrossRef\u2026';
                var crResults = await this._searchCrossRef(query, searchType, item);
                if (crResults && crResults.length > 0) {
                    allResults = allResults.concat(crResults);
                    this._displayLookupResults(container, allResults, clusterIndex, itemIndex);
                }
            } catch (e) {
                // CrossRef also failed
            }
        }

        // Also append PubMed + CrossRef results even when OpenAlex found something,
        // so the user has more options to pick from
        if (allResults.length > 0 && allResults[0]._source === 'OpenAlex') {
            try {
                var pmExtra = await this._searchPubMed(query, searchType, item);
                if (pmExtra && pmExtra.length > 0) {
                    allResults = allResults.concat(pmExtra);
                    this._displayLookupResults(container, allResults, clusterIndex, itemIndex);
                }
            } catch (e) {}
            try {
                var crExtra = await this._searchCrossRef(query, searchType, item);
                if (crExtra && crExtra.length > 0) {
                    allResults = allResults.concat(crExtra);
                    this._displayLookupResults(container, allResults, clusterIndex, itemIndex);
                }
            } catch (e) {}
        }

        if (allResults.length === 0) {
            container.textContent = 'No results found in OpenAlex, PubMed, or CrossRef.';
        }
    },

    // ── OpenAlex search ──
    _searchOpenAlex: async function (query, searchType, item) {
        var url;
        var baseUrl = 'https://api.openalex.org/works';
        var mailParam = '&mailto=zotdupe@hostiuc.com';

        if (searchType === 'auto') {
            if (query.match(/^10\.\d{4,}/)) {
                url = baseUrl + '?filter=doi:' + encodeURIComponent(query) + '&per_page=5' + mailParam;
            } else {
                url = baseUrl + '?search=' + encodeURIComponent(query) + '&per_page=5' + mailParam;
            }
        } else if (searchType === 'doi') {
            url = baseUrl + '?filter=doi:' + encodeURIComponent(query) + '&per_page=5' + mailParam;
        } else if (searchType === 'title') {
            url = baseUrl + '?search=' + encodeURIComponent(query) + '&per_page=5' + mailParam;
        } else if (searchType === 'author') {
            var titlePart = item && item.title ? item.title : '';
            var combined = query + ' ' + titlePart;
            url = baseUrl + '?search=' + encodeURIComponent(combined.trim()) + '&per_page=5' + mailParam;
        } else {
            url = baseUrl + '?search=' + encodeURIComponent(query) + '&per_page=5' + mailParam;
        }

        var response = await Zotero.HTTP.request('GET', url);
        var data = JSON.parse(response.responseText);
        var results = data.results || [];
        for (var i = 0; i < results.length; i++) results[i]._source = 'OpenAlex';
        return results;
    },

    // ── PubMed search (NCBI E-Utilities) ──
    _searchPubMed: async function (query, searchType, item) {
        var term;
        if (searchType === 'doi' || (searchType === 'auto' && query.match(/^10\.\d{4,}/))) {
            term = query + '[doi]';
        } else if (searchType === 'author') {
            var titlePart = item && item.title ? item.title : '';
            term = query + '[au] AND ' + titlePart + '[ti]';
        } else {
            term = query;
        }

        // Step 1: esearch to get PMIDs
        var searchUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi'
            + '?db=pubmed&retmode=json&retmax=5&term=' + encodeURIComponent(term);
        var searchResp = await Zotero.HTTP.request('GET', searchUrl);
        var searchData = JSON.parse(searchResp.responseText);
        var idList = (searchData.esearchresult && searchData.esearchresult.idlist) || [];
        if (idList.length === 0) return [];

        // Step 2: esummary to get metadata
        var summaryUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi'
            + '?db=pubmed&retmode=json&id=' + idList.join(',');
        var summaryResp = await Zotero.HTTP.request('GET', summaryUrl);
        var summaryData = JSON.parse(summaryResp.responseText);
        var uids = (summaryData.result && summaryData.result.uids) || [];

        var results = [];
        for (var i = 0; i < uids.length; i++) {
            var pm = summaryData.result[uids[i]];
            if (!pm) continue;

            // Extract DOI from articleids
            var doi = '';
            if (pm.articleids) {
                for (var a = 0; a < pm.articleids.length; a++) {
                    if (pm.articleids[a].idtype === 'doi') {
                        doi = pm.articleids[a].value;
                        break;
                    }
                }
            }

            // Build authors in OpenAlex-compatible format
            var authorships = [];
            if (pm.authors) {
                for (var au = 0; au < pm.authors.length; au++) {
                    authorships.push({
                        author: { display_name: pm.authors[au].name || '' }
                    });
                }
            }

            // Normalize to OpenAlex-like shape
            results.push({
                _source: 'PubMed',
                display_name: pm.title || '',
                title: pm.title || '',
                publication_year: pm.pubdate ? parseInt(pm.pubdate, 10) || null : null,
                doi: doi ? 'https://doi.org/' + doi : '',
                type: 'article',
                authorships: authorships,
                primary_location: {
                    source: { display_name: pm.fulljournalname || pm.source || '' }
                },
                biblio: {
                    volume: pm.volume || '',
                    issue: pm.issue || '',
                    first_page: pm.pages ? pm.pages.split('-')[0] : '',
                    last_page: pm.pages && pm.pages.indexOf('-') > -1 ? pm.pages.split('-')[1] : ''
                },
                language: pm.lang ? pm.lang[0] : '',
                abstract_inverted_index: null, // PubMed summary doesn't include abstract
                ids: { pmid: uids[i] }
            });
        }
        return results;
    },

    // ── CrossRef search ──
    _searchCrossRef: async function (query, searchType, item) {
        var url;
        var baseUrl = 'https://api.crossref.org/works';

        if (searchType === 'doi' || (searchType === 'auto' && query.match(/^10\.\d{4,}/))) {
            // Direct DOI lookup
            url = baseUrl + '/' + encodeURIComponent(query);
            var resp = await Zotero.HTTP.request('GET', url);
            var data = JSON.parse(resp.responseText);
            if (data.message) {
                return [this._normalizeCrossRefItem(data.message)];
            }
            return [];
        }

        // Text search
        if (searchType === 'author') {
            var titlePart = item && item.title ? item.title : '';
            url = baseUrl + '?query=' + encodeURIComponent(query + ' ' + titlePart) + '&rows=5';
        } else {
            url = baseUrl + '?query=' + encodeURIComponent(query) + '&rows=5';
        }

        var response = await Zotero.HTTP.request('GET', url);
        var resData = JSON.parse(response.responseText);
        var items = (resData.message && resData.message.items) || [];
        var results = [];
        for (var i = 0; i < Math.min(items.length, 5); i++) {
            results.push(this._normalizeCrossRefItem(items[i]));
        }
        return results;
    },

    /**
     * Normalize a CrossRef work item to OpenAlex-like shape.
     */
    _normalizeCrossRefItem: function (cr) {
        var title = '';
        if (cr.title && cr.title.length > 0) title = cr.title[0];

        var doi = cr.DOI || '';

        var year = null;
        if (cr.published && cr.published['date-parts'] && cr.published['date-parts'][0]) {
            year = cr.published['date-parts'][0][0];
        } else if (cr['published-print'] && cr['published-print']['date-parts'] && cr['published-print']['date-parts'][0]) {
            year = cr['published-print']['date-parts'][0][0];
        }

        var pubDate = '';
        var dateParts = null;
        if (cr.published && cr.published['date-parts']) dateParts = cr.published['date-parts'][0];
        else if (cr['published-print'] && cr['published-print']['date-parts']) dateParts = cr['published-print']['date-parts'][0];
        if (dateParts) {
            pubDate = dateParts[0] ? String(dateParts[0]) : '';
            if (dateParts[1]) pubDate += '-' + String(dateParts[1]).padStart(2, '0');
            if (dateParts[2]) pubDate += '-' + String(dateParts[2]).padStart(2, '0');
        }

        var authorships = [];
        if (cr.author) {
            for (var i = 0; i < cr.author.length; i++) {
                var au = cr.author[i];
                var displayName = ((au.given || '') + ' ' + (au.family || '')).trim();
                authorships.push({
                    author: {
                        display_name: displayName,
                        orcid: au.ORCID || ''
                    }
                });
            }
        }

        var venue = '';
        if (cr['container-title'] && cr['container-title'].length > 0) {
            venue = cr['container-title'][0];
        }

        // Map CrossRef type to OpenAlex-like type
        var typeMap = {
            'journal-article': 'article',
            'book-chapter': 'book-chapter',
            'book': 'book',
            'proceedings-article': 'article',
            'dissertation': 'dissertation',
            'posted-content': 'preprint',
            'report': 'report',
            'monograph': 'book'
        };

        return {
            _source: 'CrossRef',
            display_name: title,
            title: title,
            publication_year: year,
            publication_date: pubDate,
            doi: doi ? 'https://doi.org/' + doi : '',
            type: typeMap[cr.type] || cr.type || 'article',
            authorships: authorships,
            primary_location: {
                source: { display_name: venue }
            },
            biblio: {
                volume: cr.volume || '',
                issue: cr.issue || '',
                first_page: cr.page ? cr.page.split('-')[0] : '',
                last_page: cr.page && cr.page.indexOf('-') > -1 ? cr.page.split('-')[1] : ''
            },
            language: cr.language || '',
            abstract_inverted_index: null,
            _abstract_text: cr.abstract || '' // CrossRef returns plain text abstract
        };
    },

    _displayLookupResults: function (container, results, clusterIndex, itemIndex) {
        container.innerHTML = '';
        if (!results || results.length === 0) {
            container.textContent = 'No results found.';
            return;
        }

        for (var i = 0; i < results.length; i++) {
            var work = results[i];
            var card = document.createElement('div');
            card.className = 'lookup-result-card';

            // Source badge + Title line
            var titleLine = document.createElement('div');
            titleLine.className = 'lookup-result-title-line';

            if (work._source) {
                var srcBadge = document.createElement('span');
                srcBadge.className = 'lookup-source-badge lookup-source-' + work._source.toLowerCase();
                srcBadge.textContent = work._source;
                titleLine.appendChild(srcBadge);
            }

            var titleEl = document.createElement('span');
            titleEl.className = 'lookup-result-title';
            titleEl.textContent = work.display_name || work.title || '(no title)';
            titleLine.appendChild(titleEl);
            card.appendChild(titleLine);

            // Meta line: authors, year, type, DOI, PMID
            var meta = document.createElement('div');
            meta.className = 'lookup-result-meta';
            var parts = [];
            if (work.authorships && work.authorships.length > 0) {
                var authors = work.authorships.slice(0, 3).map(function (a) {
                    return a.author ? a.author.display_name : '';
                }).filter(Boolean).join(', ');
                if (work.authorships.length > 3) authors += ' et al.';
                parts.push(authors);
            }
            if (work.publication_year) parts.push(String(work.publication_year));
            if (work.type) parts.push(work.type);
            if (work.doi) parts.push(work.doi.replace('https://doi.org/', ''));
            if (work.ids && work.ids.pmid) parts.push('PMID:' + work.ids.pmid);
            meta.textContent = parts.join(' \u00B7 ');
            card.appendChild(meta);

            // Venue
            if (work.primary_location && work.primary_location.source &&
                work.primary_location.source.display_name) {
                var venue = document.createElement('div');
                venue.className = 'lookup-result-venue';
                venue.textContent = work.primary_location.source.display_name;
                card.appendChild(venue);
            }

            // Apply button
            var btnApply = document.createElement('button');
            btnApply.className = 'lookup-apply-btn';
            btnApply.textContent = 'Apply to item';
            (function (w, ci, ii) {
                btnApply.addEventListener('click', function () {
                    ZotDupeResults._applyOpenAlexResult(ci, ii, w);
                });
            })(work, clusterIndex, itemIndex);
            card.appendChild(btnApply);

            container.appendChild(card);
        }
    },

    _applyOpenAlexResult: async function (clusterIndex, itemIndex, work) {
        var cluster = this.clusters[clusterIndex];
        if (!cluster) return;
        var itemId = cluster.ids[itemIndex];
        var zotItem = this.zoteroItems[itemId];
        var plainItem = cluster.items[itemIndex];
        if (!zotItem || !plainItem) return;

        try {
            // Map OpenAlex type to Zotero type
            var typeMap = {
                'article': 'journalArticle',
                'book-chapter': 'bookSection',
                'book': 'book',
                'dissertation': 'thesis',
                'dataset': 'document',
                'preprint': 'preprint',
                'report': 'report',
                'review': 'journalArticle',
                'letter': 'letter',
                'editorial': 'journalArticle',
                'paratext': 'document',
                'other': 'document'
            };

            // Apply type
            if (work.type && typeMap[work.type]) {
                var newTypeID = Zotero.ItemTypes.getID(typeMap[work.type]);
                if (newTypeID) {
                    zotItem.itemTypeID = newTypeID;
                    plainItem.itemType = typeMap[work.type];
                }
            }

            // Apply title
            if (work.display_name) {
                zotItem.setField('title', work.display_name);
                plainItem.title = work.display_name;
            }

            // Apply DOI
            if (work.doi) {
                var doi = work.doi.replace('https://doi.org/', '');
                try { zotItem.setField('DOI', doi); } catch (e) {}
                plainItem.DOI = doi;
            }

            // Apply date
            if (work.publication_date) {
                zotItem.setField('date', work.publication_date);
                plainItem.date = work.publication_date;
            }

            // Apply publication venue
            if (work.primary_location && work.primary_location.source) {
                var venueName = work.primary_location.source.display_name;
                if (venueName) {
                    try { zotItem.setField('publicationTitle', venueName); } catch (e) {}
                    plainItem.publicationTitle = venueName;
                }
            }

            // Apply volume/issue/pages from biblio
            if (work.biblio) {
                if (work.biblio.volume) {
                    try { zotItem.setField('volume', work.biblio.volume); } catch (e) {}
                }
                if (work.biblio.issue) {
                    try { zotItem.setField('issue', work.biblio.issue); } catch (e) {}
                }
                if (work.biblio.first_page) {
                    var pages = work.biblio.first_page;
                    if (work.biblio.last_page && work.biblio.last_page !== work.biblio.first_page) {
                        pages += '-' + work.biblio.last_page;
                    }
                    try { zotItem.setField('pages', pages); } catch (e) {}
                }
            }

            // Apply language
            if (work.language) {
                try { zotItem.setField('language', work.language); } catch (e) {}
                plainItem.language = work.language;
            }

            // Apply abstract (inverted index from OpenAlex, or plain text from CrossRef/PubMed)
            if (work.abstract_inverted_index) {
                var abstract = this._reconstructAbstract(work.abstract_inverted_index);
                if (abstract) {
                    try { zotItem.setField('abstractNote', abstract); } catch (e) {}
                }
            } else if (work._abstract_text) {
                try { zotItem.setField('abstractNote', work._abstract_text); } catch (e) {}
            }

            // Apply PMID (store in Extra field if from PubMed)
            if (work.ids && work.ids.pmid) {
                var extra = zotItem.getField('extra') || '';
                if (extra.indexOf('PMID:') === -1) {
                    extra = (extra ? extra + '\n' : '') + 'PMID: ' + work.ids.pmid;
                    try { zotItem.setField('extra', extra); } catch (e) {}
                }
            }

            // Apply URL
            if (work.doi) {
                try { zotItem.setField('url', work.doi); } catch (e) {}
                plainItem.url = work.doi;
            }

            // Apply authors
            if (work.authorships && work.authorships.length > 0) {
                var creators = [];
                for (var a = 0; a < work.authorships.length; a++) {
                    var auth = work.authorships[a];
                    if (auth.author && auth.author.display_name) {
                        var name = auth.author.display_name;
                        var parts = name.split(' ');
                        var lastName = parts.pop();
                        var firstName = parts.join(' ');
                        creators.push({
                            creatorType: 'author',
                            firstName: firstName,
                            lastName: lastName
                        });
                    }
                }
                if (creators.length > 0) {
                    zotItem.setCreators(creators);
                    plainItem.creators = creators.map(function (c) {
                        return { firstName: c.firstName, lastName: c.lastName };
                    });
                }
            }

            await zotItem.saveTx();

            // Re-render cluster card
            this._rerenderClusterCard(clusterIndex);

        } catch (e) {
            Zotero.logError('[ZotDupe] Apply OpenAlex result error: ' + e);
        }
    },

    _reconstructAbstract: function (invertedIndex) {
        if (!invertedIndex) return '';
        var words = [];
        for (var word in invertedIndex) {
            if (!invertedIndex.hasOwnProperty(word)) continue;
            var positions = invertedIndex[word];
            for (var i = 0; i < positions.length; i++) {
                words[positions[i]] = word;
            }
        }
        return words.join(' ');
    },

    /**
     * Re-render a single cluster card in-place.
     */
    _rerenderClusterCard: function (clusterIndex) {
        var cluster = this.clusters[clusterIndex];
        if (!cluster) return;
        var oldCard = document.getElementById('cluster-card-' + clusterIndex);
        if (!oldCard) return;
        var newCard = this.renderClusterCard(cluster, clusterIndex);
        oldCard.parentNode.replaceChild(newCard, oldCard);
    },

    // ===========================================================
    // Internal helpers
    // ===========================================================

    /**
     * Mark a cluster as resolved: remove from view, update counts.
     */
    _resolveCluster: function (index) {
        this.resolvedSet.add(index);
        this.resolvedCount++;

        // Animate out the card
        var card = document.getElementById('cluster-card-' + index);
        if (card) {
            card.classList.add('resolved');
            var self = this;
            setTimeout(function () {
                if (card.parentNode) card.parentNode.removeChild(card);
                // Check if empty
                var container = document.getElementById('zotdupe-cluster-list');
                if (container && container.children.length === 0) {
                    self.renderClusters(self.clusters, self.currentFilter);
                }
            }, 350);
        }

        this.renderFilterCounts();
        this.updateBottomBar();
    },

    /**
     * Update the bottom bar resolved counter.
     */
    updateBottomBar: function () {
        var label = document.getElementById('zotdupe-resolved-label');
        if (label) {
            label.textContent = 'Clusters resolved: ' + this.resolvedCount + '/' + this.totalCount;
        }
    },

    /**
     * Check whether a cluster matches a search query (by title or author).
     */
    _clusterMatchesQuery: function (cluster, query) {
        var items = cluster.items || [];
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item.title && item.title.toLowerCase().indexOf(query) !== -1) return true;
            var authStr = this._formatAuthors(item).toLowerCase();
            if (authStr.indexOf(query) !== -1) return true;
        }
        return false;
    },

    /**
     * Format authors string from a plain item object.
     */
    _formatAuthors: function (item) {
        if (!item) return '';
        if (item.firstCreator) return item.firstCreator;
        if (item.creators && item.creators.length > 0) {
            var names = [];
            for (var i = 0; i < Math.min(item.creators.length, 3); i++) {
                var c = item.creators[i];
                if (c.lastName) {
                    names.push(c.lastName + (c.firstName ? ' ' + c.firstName.charAt(0) + '.' : ''));
                } else if (c.name) {
                    names.push(c.name);
                }
            }
            var result = names.join(', ');
            if (item.creators.length > 3) result += ' et al.';
            return result;
        }
        return '';
    },

    /**
     * Extract a 4-digit year from a date string.
     */
    _extractYear: function (dateStr) {
        if (!dateStr) return '';
        var m = String(dateStr).match(/(\d{4})/);
        return m ? m[1] : '';
    },

    /**
     * Set text content for the number element inside a stat card.
     */
    _setText: function (cardId, value) {
        var card = document.getElementById(cardId);
        if (!card) return;
        var numEl = card.querySelector('.stat-number');
        if (numEl) numEl.textContent = String(value);
    }
};
