// ============================================================
//  Artboards 1.5
//  Author: Joao Victor Malz
//  Copyright: (c) 2026 Joao Victor Malz
//  Created for use at The Sign Pack
//
//  One palette, two tabs:
//   - Create: creates artboards fitted to the selected arts, in visual order
//     (top-to-bottom, left-to-right), and names them S#, OP A, Presentation X...
//     or, for signs with options, S1 OPA, S1 OPB, S2 OPA... (a sign = a row, a
//     column or a group).
//   - Rename: batch renames artboards. Modes: build new names (prefix, separator,
//     numbering, padding, suffix), add to the current names, or find and replace.
//     Choose all artboards, the ones that contain the selected art, or a range.
//     "Preview on this file" and a check before renaming list the changes.
// ============================================================


#target illustrator
#targetengine "signpack_artboards"
var TSP_ASSET_SELF = ($.global.__SELF_OVERRIDE ? $.global.__SELF_OVERRIDE : $.fileName);

// ---- Code sent to Illustrator travels as plain hex digits (4 per character): no quotes, backslashes or line
//      breaks for the transport to damage ("Expected: )" errors on some computers) ----
function spSendCode(src) {
    src = String(src);
    var h = "";
    for (var i = 0; i < src.length; i++) {
        var x = src.charCodeAt(i).toString(16);
        while (x.length < 4) x = "0" + x;
        h += x;
    }
    return 'eval((function(h){var r="";for(var i=0;i+4<=h.length;i+=4)r+=String.fromCharCode(parseInt(h.substring(i,i+4),16));return r;})("' + h + '"));';
}

(function () {
    // ---- UI Kit: logo, popups and standard sizes live in ONE shared file ----
    // Needs "UI_Kit_x.x.jsx" in the same folder as this script (the highest version
    // is used). If it is missing the script still works: plain system popups, no logo.
    var UIK_SELF = "";
    try { UIK_SELF = $.fileName; } catch (eUS) {}
    var UIK_CACHE = null;
    function uik() {
        if (UIK_CACHE) return UIK_CACHE;
        var kit = null;
        try {
            var folder = new File(UIK_SELF).parent;
            var files = folder.getFiles();
            var best = null, bestV = null;
            for (var i = 0; i < files.length; i++) {
                if (!(files[i] instanceof File)) continue;
                var m = decodeURI(files[i].name).match(/^UI[ _]Kit(?:[ _]*v?(\d+(?:\.\d+)*))?\.jsx$/i);
                if (!m) continue;
                var v = (m[1] || "0").split(".");
                var newer = !bestV;
                for (var n = 0; !newer && n < 4; n++) {
                    var x = parseInt(v[n] || "0", 10), y = parseInt(bestV[n] || "0", 10);
                    if (x !== y) { newer = (x > y); break; }
                }
                if (newer) { best = files[i]; bestV = v; }
            }
            if (best) {
                $.global.__SIGNPACK_LOADING_UI = true;
                $.global.__SIGNPACK_UIKIT = null;
                try { $.evalFile(best); } catch (eKit) {}
                $.global.__SIGNPACK_LOADING_UI = false;
                kit = $.global.__SIGNPACK_UIKIT;
            }
        } catch (eFind) {}
        if (!kit || !kit.spAlert) {
            kit = {
                version: "none", missing: true, TITLE_SIZE: 15, MARGINS: 16, SPACING: 10,
                pos: function () { return [90, 140]; },
                spAlert: function (message) { alert(message); },
                spConfirm: function (message) { return confirm(message); },
                addLogo: function () { return null; },
                popupDefs: "function spAlert(message, title) { alert(message); }\nfunction spConfirm(message, title, yesText) { return confirm(message); }\n"
            };
            try {
                if (!$.global.__SIGNPACK_UIKIT_WARNED) {
                    $.global.__SIGNPACK_UIKIT_WARNED = true;
                    alert("The UI Kit file was not found.\n\nPut \"UI_Kit_x.x.jsx\" in the same folder as this script to get the logo and the dark popups. The script works without it.");
                }
            } catch (eWarn) {}
        }
        UIK_CACHE = kit;
        return kit;
    }
    function spAlert(message, title) { uik().spAlert(message, title); }
    function spConfirm(message, title, yesText) { return uik().spConfirm(message, title, yesText); }
    function addLogo(parent, w) { return uik().addLogo(parent, w); }

    // ---- Look: dark grey window, white text, green accents ----
    // STYLED_UI = false gives the plain system look back (use it if the labels are hard to read).
    var STYLED_UI = true;
    var TSP_BG = [43 / 255, 43 / 255, 43 / 255, 1];          // window background, #2B2B2B
    var TSP_GREEN = [34 / 255, 164 / 255, 56 / 255, 1];      // company green
    var TSP_GREEN_HI = [52 / 255, 184 / 255, 76 / 255, 1];   // lighter green (hover, panel titles)
    var TITLE_PNG = "art_title_png.png";
    function paintWin(w) {
        if (!STYLED_UI) return;
        try { w.graphics.backgroundColor = w.graphics.newBrush(w.graphics.BrushType.SOLID_COLOR, TSP_BG); } catch (ePw) {}
    }
    // White text everywhere, green panel titles. Controls marked keepColor are left alone.
    function paintStyle(ctl) {
        if (!STYLED_UI) return;
        try {
            var g = ctl.graphics;
            var t = ctl.type;
            if (t === "statictext" || t === "checkbox" || t === "radiobutton" || t === "panel" || t === "edittext" || t === "listbox") {
                if (!ctl.keepColor) g.foregroundColor = g.newPen(g.PenType.SOLID_COLOR, (t === "panel") ? TSP_GREEN_HI : [1, 1, 1, 1], 1);
            }
        } catch (ePs) {}
        try {
            if (ctl.children) { for (var pi = 0; pi < ctl.children.length; pi++) paintStyle(ctl.children[pi]); }
        } catch (ePc) {}
    }
    // Pictures are real PNG files in the assets folder next to this script (nothing is written to Temp).
    function assetFile(name) {
        try {
            var f = new File(File(TSP_ASSET_SELF).parent.fsName + "/assets/" + name);
            return f.exists ? f : null;
        } catch (eAf) { return null; }
    }
    // Button pictures (the text is part of the picture, so it is always centered).
    function btnImage(key, data) {
        try {
            var f = assetFile(data);
            if (f && f.length > 50) return ScriptUI.newImage(f);
        } catch (eBi) {}
        return null;
    }
    function btnSet(def) {
        return { n: btnImage(def.key + "_n", def.n), h: btnImage(def.key + "_h", def.h2), p: btnImage(def.key + "_p", def.p), d: btnImage(def.key + "_d", def.d), w: def.w, hgt: def.h };
    }
    // Green rounded main button. A second set (alt) can be used with btn.useAlt(true), e.g. Create / Rename.
    // If anything fails, the button stays native.
    function styleGreenButton(btn, def, altDef) {
        if (!STYLED_UI) return;
        try {
            var sets = [btnSet(def)];
            if (altDef) sets.push(btnSet(altDef));
            if (!sets[0].n || (altDef && !sets[1].n)) return;
            var cur = 0;
            btn.preferredSize = [def.w, def.h];
            btn.useAlt = function (on) { cur = (on && altDef) ? 1 : 0; try { btn.notify("onDraw"); } catch (eUa) {} };
            btn.onDraw = function (stt) {
                var gb = this.graphics;
                var bw = this.size.width, bh = this.size.height;
                var s = sets[cur];
                gb.newPath(); gb.rectPath(0, 0, bw, bh);
                gb.fillPath(gb.newBrush(gb.BrushType.SOLID_COLOR, TSP_BG));
                var im = s.n;
                if (!this.enabled) { if (s.d) im = s.d; }
                else { try { if (stt && stt.leftButtonPressed && s.p) im = s.p; else if (stt && stt.mouseOver && s.h) im = s.h; } catch (eSt) {} }
                gb.drawImage(im, 0, 0, bw, bh);
            };
            var redrawBtn = function () { try { btn.notify("onDraw"); } catch (eNd) {} };
            btn.addEventListener("mouseover", redrawBtn);
            btn.addEventListener("mouseout", redrawBtn);
            btn.addEventListener("mousedown", redrawBtn);
            btn.addEventListener("mouseup", redrawBtn);
        } catch (eGb) {}
    }
    // Logo: The Sign Pack wordmark from the UI Kit on the styled window, the old logo otherwise.
    function addHeaderLogo(parent, w) {
        if (STYLED_UI) {
            try { var im = uik().addWordmark ? uik().addWordmark(parent) : null; if (im) return im; } catch (eWm) {}
        }
        return addLogo(parent, w);
    }
    // Title as a small picture (bold capitals), because the window font cannot be set bold/bigger reliably.
    function addHeaderTitle(parent, fallbackText) {
        var im = null;
        if (STYLED_UI) {
            try {
                var tf = assetFile(TITLE_PNG);
                if (tf && tf.length > 50) im = parent.add("image", undefined, tf);
            } catch (eTi) { im = null; }
        }
        if (!im) {
            im = parent.add("statictext", undefined, fallbackText);
            try { im.graphics.font = ScriptUI.newFont("dialog", "BOLD", uik().TITLE_SIZE); } catch (eFt) {}
        }
        im.alignment = ["right", "center"];
        return im;
    }
    function addAccentLine(w) {
        if (!STYLED_UI) return;
        try {
            var ln = w.add("group");
            ln.alignment = ["fill", "top"];
            ln.preferredSize = [10, 4];
            ln.graphics.backgroundColor = ln.graphics.newBrush(ln.graphics.BrushType.SOLID_COLOR, TSP_GREEN);
        } catch (eAl) {}
    }
    var BTN_CREATE = { key: "create", w: 76, h: 28, n: "art_create_n.png", h2: "art_create_h2.png", p: "art_create_p.png", d: "art_create_d.png" };
    var BTN_RENAME = { key: "rename", w: 76, h: 28, n: "art_rename_n.png", h2: "art_rename_h2.png", p: "art_rename_p.png", d: "art_rename_d.png" };
    var TAB_CREATE = { key: "tabc", w: 84, h: 28, s: "art_tabc_s.png", u: "art_tabc_u.png", uh: "art_tabc_uh.png" };
    var TAB_RENAME = { key: "tabr", w: 84, h: 28, s: "art_tabr_s.png", u: "art_tabr_u.png", uh: "art_tabr_uh.png" };
    // Tab button: green when selected, grey when not. The text is part of the pictures.
    // Returns true when the pictures loaded (otherwise the button stays a plain native one).
    function styleTabButton(btn, def) {
        if (!STYLED_UI) return false;
        try {
            var imS = btnImage(def.key + "_s", def.s), imU = btnImage(def.key + "_u", def.u), imH = btnImage(def.key + "_uh", def.uh);
            if (!imS || !imU) return false;
            btn.sel = false;
            btn.preferredSize = [def.w, def.h];
            btn.onDraw = function (stt) {
                var gb = this.graphics;
                var bw = this.size.width, bh = this.size.height;
                gb.newPath(); gb.rectPath(0, 0, bw, bh);
                gb.fillPath(gb.newBrush(gb.BrushType.SOLID_COLOR, TSP_BG));
                var im = this.sel ? imS : imU;
                if (!this.sel) { try { if (stt && stt.mouseOver && imH) im = imH; } catch (eTs) {} }
                gb.drawImage(im, 0, 0, bw, bh);
            };
            var redrawTab = function () { try { btn.notify("onDraw"); } catch (eTd) {} };
            btn.addEventListener("mouseover", redrawTab);
            btn.addEventListener("mouseout", redrawTab);
            btn.addEventListener("mousedown", redrawTab);
            btn.addEventListener("mouseup", redrawTab);
            return true;
        } catch (eTb) { return false; }
    }


    // ------------------ SETTINGS ------------------
    var SMALL_ITEM_AREA_RATIO = 0.04;   // "small loose item" filter threshold
    var ROW_TOLERANCE_PT = 15;          // visual-row grouping tolerance
    // ----------------------------------------------

    // ---- Small helpers for Rename. They are also sent to Illustrator's main engine (as text)
    //      together with the main function, so keep them self-contained. ----
    function abPad(n, padding) {
        var str = String(n);
        while (str.length < padding) str = "0" + str;
        return str;
    }
    // Joins the parts that are not empty; the separator goes only BETWEEN parts.
    function abJoin(parts, sep) {
        var out = "";
        for (var i = 0; i < parts.length; i++) {
            if (parts[i] === "" || parts[i] === null || parts[i] === undefined) continue;
            if (out !== "" && sep) out += sep;
            out += parts[i];
        }
        return out;
    }
    function abReplaceAll(str, find, rep, matchCase) {
        str = String(str); find = String(find); rep = String(rep);
        if (find === "") return str;
        var hay = matchCase ? str : str.toLowerCase();
        var needle = matchCase ? find : find.toLowerCase();
        var out = "", pos = 0, at;
        while ((at = hay.indexOf(needle, pos)) >= 0) {
            out += str.substring(pos, at) + rep;
            pos = at + find.length;
        }
        return out + str.substring(pos);
    }
    var AB_HELPER_TEXT = String(abPad) + String.fromCharCode(10) + String(abJoin) + String.fromCharCode(10) + String(abReplaceAll) + String.fromCharCode(10);

    function createArtboardsDoc(nameMode, skipSmall, areaRatio, rowTol, keepExisting, groupMode) {
        try {
            if (app.documents.length === 0) { spAlert("No document is open. Open a file and try again."); return; }
            var doc = app.activeDocument;
            var sel = doc.selection;
            if (!sel || sel.length === 0) {
                spAlert("Nothing is selected." + String.fromCharCode(10) + String.fromCharCode(10) + "Select the art first (one piece, or one group, for each artboard you want), then press Create.");
                return;
            }

            // ---- Signs with options: S1 OPA, S1 OPB, S2 OPA ... (groupMode: rows / cols / groups) ----
            if (nameMode === "signopts") {
                (function () {
                    var NL = String.fromCharCode(10);
                    function lettersFor(index) {
                        var letters = "";
                        var n = index;
                        do {
                            letters = String.fromCharCode(65 + (n % 26)) + letters;
                            n = Math.floor(n / 26) - 1;
                        } while (n >= 0);
                        return letters;
                    }
                    function areaOf(b) { return (b[2] - b[0]) * (b[1] - b[3]); }
                    function dropSmall(list) {
                        if (!skipSmall || list.length < 2) return { kept: list, skipped: 0 };
                        var mx = 0, q;
                        for (q = 0; q < list.length; q++) if (areaOf(list[q].bounds) > mx) mx = areaOf(list[q].bounds);
                        var kept = [];
                        for (q = 0; q < list.length; q++) if (areaOf(list[q].bounds) >= mx * areaRatio) kept.push(list[q]);
                        if (kept.length === 0) return { kept: list, skipped: 0 };
                        return { kept: kept, skipped: list.length - kept.length };
                    }
                    function byRead(a, b) {            // top to bottom, then left to right
                        var yDiff = b.bounds[1] - a.bounds[1];
                        if (Math.abs(yDiff) < rowTol) return a.bounds[0] - b.bounds[0];
                        return yDiff;
                    }
                    // Clusters items into rows ("row") or columns ("col"): an item joins the
                    // current cluster when its centre falls inside the cluster's span.
                    function cluster(items, axis) {
                        var list = items.slice(0);
                        if (axis === "row") list.sort(function (a, b) { return b.bounds[1] - a.bounds[1]; });
                        else list.sort(function (a, b) { return a.bounds[0] - b.bounds[0]; });
                        var out = [];
                        for (var i = 0; i < list.length; i++) {
                            var it = list[i], lo, hi;
                            if (axis === "row") { lo = it.bounds[3]; hi = it.bounds[1]; } else { lo = it.bounds[0]; hi = it.bounds[2]; }
                            var c = (lo + hi) / 2;
                            var g = out.length ? out[out.length - 1] : null;
                            if (g && c >= g.lo - rowTol && c <= g.hi + rowTol) {
                                g.items.push(it);
                                if (lo < g.lo) g.lo = lo;
                                if (hi > g.hi) g.hi = hi;
                            } else {
                                out.push({ lo: lo, hi: hi, items: [it] });
                            }
                        }
                        var result = [];
                        for (var j = 0; j < out.length; j++) {
                            if (axis === "row") out[j].items.sort(function (a, b) { return a.bounds[0] - b.bounds[0]; });
                            else out[j].items.sort(function (a, b) { return b.bounds[1] - a.bounds[1]; });
                            result.push(out[j].items);
                        }
                        return result;
                    }

                    var signs = [];      // each sign = array of { bounds }
                    var skippedAll = 0, i, k;
                    if (groupMode === "groups") {
                        var roots = [];
                        for (i = 0; i < sel.length; i++) {
                            var root = sel[i], kids = [];
                            var isGroup = false;
                            try { isGroup = (root.typename === "GroupItem" && !root.clipped); } catch (eG) {}
                            if (isGroup) {
                                for (k = 0; k < root.pageItems.length; k++) {
                                    var ch = root.pageItems[k];
                                    var skipCh = false;
                                    try { if (ch.guides || ch.hidden) skipCh = true; } catch (eCh) {}
                                    if (!skipCh) kids.push({ bounds: ch.visibleBounds });
                                }
                            }
                            if (kids.length < 2) kids = [{ bounds: root.visibleBounds }];
                            else { var ds = dropSmall(kids); kids = ds.kept; skippedAll += ds.skipped; }
                            kids.sort(byRead);
                            roots.push({ bounds: root.visibleBounds, options: kids });
                        }
                        roots.sort(byRead);
                        for (i = 0; i < roots.length; i++) signs.push(roots[i].options);
                    } else {
                        var items = [];
                        for (i = 0; i < sel.length; i++) {
                            var bb = sel[i].visibleBounds;
                            if (bb) items.push({ bounds: bb });
                        }
                        var dsAll = dropSmall(items);
                        items = dsAll.kept;
                        skippedAll = dsAll.skipped;
                        signs = cluster(items, groupMode === "cols" ? "col" : "row");
                    }
                    if (signs.length === 0) { spAlert("The script could not measure the selected art." + String.fromCharCode(10) + String.fromCharCode(10) + "Select visible art (not empty groups or guides) and try again."); return; }

                    // Numbering: continue after the highest S number when keeping existing artboards
                    var existingCount = doc.artboards.length;
                    var firstSign = 1;
                    if (keepExisting) {
                        var maxS = 0;
                        for (i = 0; i < existingCount; i++) {
                            var mm = String(doc.artboards[i].name).match(/^S(\d+)/i);
                            if (mm && parseInt(mm[1], 10) > maxS) maxS = parseInt(mm[1], 10);
                        }
                        firstSign = maxS + 1;
                    }
                    var flat = [], summary = [], total = 0;
                    for (i = 0; i < signs.length; i++) {
                        var sName = "S" + (firstSign + i);
                        var opts = signs[i];
                        summary.push(sName + ": " + (opts.length === 1 ? "1 artboard" : opts.length + " options"));
                        for (k = 0; k < opts.length; k++) {
                            flat.push({ bounds: opts[k].bounds, name: (opts.length === 1) ? sName : (sName + " OP" + lettersFor(k)) });
                            total++;
                        }
                    }
                    var shown = summary.slice(0, 14).join(NL);
                    if (summary.length > 14) shown += NL + "... and " + (summary.length - 14) + " more signs";
                    var how = (groupMode === "cols") ? "columns" : (groupMode === "groups" ? "groups" : "rows");
                    if (!spConfirm(signs.length + " sign(s), " + total + " artboard(s) (grouped by " + how + "):" + NL + NL + shown +
                                   NL + NL + (keepExisting ? "Existing artboards are kept." : "Existing artboards will be deleted.") + NL + "Create them?",
                                   "Artboards - check the grouping", "Create")) return;

                    for (i = 0; i < flat.length; i++) doc.artboards.add(flat[i].bounds);
                    var startIdx = 0;
                    if (keepExisting) startIdx = existingCount;
                    else {
                        for (i = existingCount - 1; i >= 0; i--) {
                            try { doc.artboards[i].remove(); } catch (eDel3) {}
                        }
                    }
                    for (i = 0; i < flat.length; i++) {
                        try { doc.artboards[startIdx + i].name = flat[i].name; } catch (eNm) {}
                    }
                    app.redraw();
                    var msg2 = total + " artboard(s) created for " + signs.length + " sign(s)" + (keepExisting ? " (existing artboards kept)." : ".");
                    if (skippedAll > 0) msg2 += NL + skippedAll + " small loose item(s) skipped.";
                    spAlert(msg2);
                })();
                return;
            }

            // TRUE bounds: visibleBounds, recursive through nested clip masks
            function getRealBounds(item) {
                if (item.hidden) return null;
                if (item.typename === "PathItem" && item.guides) return null;
                if (item.typename === "GroupItem") {
                    if (item.clipped) {
                        for (var c = 0; c < item.pageItems.length; c++) {
                            var pi = item.pageItems[c];
                            if (pi.typename === "PathItem" && pi.clipping) return pi.visibleBounds;
                            if (pi.typename === "CompoundPathItem" &&
                                pi.pathItems.length > 0 && pi.pathItems[0].clipping) return pi.visibleBounds;
                        }
                    }
                    var u = null;
                    for (var g = 0; g < item.pageItems.length; g++) {
                        var cb = getRealBounds(item.pageItems[g]);
                        if (!cb) continue;
                        if (!u) { u = [cb[0], cb[1], cb[2], cb[3]]; }
                        else {
                            if (cb[0] < u[0]) u[0] = cb[0];
                            if (cb[1] > u[1]) u[1] = cb[1];
                            if (cb[2] > u[2]) u[2] = cb[2];
                            if (cb[3] < u[3]) u[3] = cb[3];
                        }
                    }
                    if (u) return u;
                }
                return item.visibleBounds;
            }

            // "OP A" ... "OP Z", then "OP AA", "OP AB", ... (0-based index)
            function letterFor(index) {
                var letters = "";
                var n = index;
                do {
                    letters = String.fromCharCode(65 + (n % 26)) + letters;
                    n = Math.floor(n / 26) - 1;
                } while (n >= 0);
                return letters;
            }

            // 1. Measure everything
            var itemsArray = [];
            var maxArea = 0;
            for (var i = 0; i < sel.length; i++) {
                var bounds = getRealBounds(sel[i]);
                if (!bounds) continue;
                var aW = bounds[2] - bounds[0];
                var aH = bounds[1] - bounds[3];
                var area = aW * aH;
                if (area > maxArea) maxArea = area;
                itemsArray.push({ bounds: bounds, area: area });
            }
            if (itemsArray.length === 0) {
                spAlert("The script could not measure the selected art." + String.fromCharCode(10) + String.fromCharCode(10) + "Select visible art (not empty groups or guides) and try again.");
                return;
            }

            // 2. Optionally drop small loose items
            var skipped = 0;
            if (skipSmall && itemsArray.length > 1 && maxArea > 0) {
                var kept = [];
                for (var s = 0; s < itemsArray.length; s++) {
                    if (itemsArray[s].area >= maxArea * areaRatio) kept.push(itemsArray[s]);
                    else skipped++;
                }
                if (kept.length > 0) itemsArray = kept;
                else skipped = 0;
            }

            // 3. Sort visually (Top-to-Bottom, Left-to-Right)
            itemsArray.sort(function (a, b) {
                var yDiff = b.bounds[1] - a.bounds[1];
                if (Math.abs(yDiff) < rowTol) return a.bounds[0] - b.bounds[0];
                return yDiff;
            });

            var existingCount = doc.artboards.length; // BEFORE any changes

            if (nameMode === "presentation") {
                // Insert each new artboard at the FRONT, in visual order,
                // so the final front-to-back order matches the sort order
                for (var j = 0; j < itemsArray.length; j++) {
                    try {
                        doc.artboards.insert(itemsArray[j].bounds, j);
                    } catch (eIns) {
                        // Fallback if .insert() isn't available on this
                        // Illustrator version: appends instead of fronting
                        doc.artboards.add(itemsArray[j].bounds);
                    }
                }
                // Rename the new front artboards 1..N
                for (var n = 0; n < itemsArray.length; n++) {
                    try { doc.artboards[n].name = "Presentation " + (n + 1); } catch (eName) {}
                }
                // Old artboards are now pushed to the back - delete them
                // unless "keep existing" is checked
                if (!keepExisting) {
                    for (var k = doc.artboards.length - 1; k >= itemsArray.length; k--) {
                        try { doc.artboards[k].remove(); } catch (eDel) {}
                    }
                }
            } else {
                // S# / OP # modes: new artboards are appended after
                // whatever is already there
                for (var j2 = 0; j2 < itemsArray.length; j2++) {
                    doc.artboards.add(itemsArray[j2].bounds);
                }

                var newStartIdx, startNum;
                if (keepExisting) {
                    // New ones sit after the existing ones; number
                    // continuing from the TOTAL so nothing collides
                    newStartIdx = existingCount;
                    startNum = existingCount + 1;
                } else {
                    // Standard behavior: delete the old ones, new ones
                    // become the whole list, numbered from 1
                    for (var k2 = existingCount - 1; k2 >= 0; k2--) {
                        try { doc.artboards[k2].remove(); } catch (eDel2) {}
                    }
                    newStartIdx = 0;
                    startNum = 1;
                }

                for (var n2 = 0; n2 < itemsArray.length; n2++) {
                    var abIdx = newStartIdx + n2;
                    try {
                        doc.artboards[abIdx].name = (nameMode === "signs")
                            ? ("S" + (startNum + n2))
                            : ("OP " + letterFor(startNum + n2 - 1));
                    } catch (eName2) {}
                }
            }

            app.redraw();

            var msg = itemsArray.length + " artboard(s) created in visual order" +
                      (keepExisting ? " (existing artboards kept)." : ".");
            if (skipped > 0) msg += String.fromCharCode(10) + skipped + " small loose item(s) skipped.";
            spAlert(msg);
        } catch (eAll) {
            spAlert("Something went wrong while creating the artboards." + String.fromCharCode(10) + String.fromCharCode(10) + "Details: " + eAll + String.fromCharCode(10) + String.fromCharCode(10) + "Check the artboards in your file before trying again.");
        }
    }

    // Runs in Illustrator's MAIN engine via BridgeTalk (the helpers above are sent with it).
    // The palette only collects the settings - all document access, the check list
    // and the repeated-name warning happen here. With o.dry it only returns the preview text.
    function renameArtboardsDoc(o) {
        var step = "starting";
        var NL = String.fromCharCode(10);
        function fail(msg) {
            if (o.dry) return msg;
            spAlert(msg);
            return "";
        }
        try {
            if (app.documents.length === 0) return fail("No document open.");
            var doc = app.activeDocument;
            var total = doc.artboards.length;
            var i, k;

            // 1. Which artboards
            step = "choosing the artboards";
            var picked = [];
            if (o.scope === "range") {
                var seen = {};
                var parts = String(o.range).replace(/\s+/g, "").split(",");
                for (i = 0; i < parts.length; i++) {
                    if (parts[i] === "") continue;
                    var m = parts[i].match(/^(\d+)(?:-(\d+))?$/);
                    if (!m) return fail("The range \"" + o.range + "\" is not valid. Use numbers like 1-4, 7.");
                    var ra = parseInt(m[1], 10), rb = m[2] ? parseInt(m[2], 10) : ra;
                    if (rb < ra) { var tmp = ra; ra = rb; rb = tmp; }
                    for (k = ra; k <= rb; k++) {
                        if (k >= 1 && k <= total && !seen["n" + k]) { seen["n" + k] = true; picked.push(k - 1); }
                    }
                }
                picked.sort(function (x, y) { return x - y; });
            } else if (o.scope === "selection") {
                var sel = doc.selection;
                if (!sel || sel.length === 0) return fail("Select the art first: the artboards that contain it are the ones renamed.");
                for (i = 0; i < total; i++) {
                    var ar = doc.artboards[i].artboardRect, hit = false;
                    for (k = 0; k < sel.length && !hit; k++) {
                        var sb = null;
                        try { sb = sel[k].visibleBounds; } catch (eB) {}
                        if (sb && sb[0] < ar[2] && sb[2] > ar[0] && sb[3] < ar[1] && sb[1] > ar[3]) hit = true;
                    }
                    if (hit) picked.push(i);
                }
            } else {
                for (i = 0; i < total; i++) picked.push(i);
            }
            if (picked.length === 0) return fail("No artboards match.");

            // 2. New names (numbers follow the panel order)
            step = "building the new names";
            var changes = [];
            for (i = 0; i < picked.length; i++) {
                var from = String(doc.artboards[picked[i]].name);
                var to;
                if (o.mode === "find") {
                    to = abReplaceAll(from, o.find, o.replace, o.matchCase);
                } else if (o.mode === "add") {
                    to = abJoin([o.prefix, from, o.suffix], o.separator);
                } else {
                    to = abJoin([o.prefix, o.includeNum ? abPad(o.start + i, o.padding) : "", o.suffix], o.separator);
                    if (to === "") to = "Artboard " + (picked[i] + 1);
                }
                if (to !== from) changes.push({ idx: picked[i], from: from, to: to });
            }
            if (changes.length === 0) return fail("Nothing to change: the names are already like that.");

            // 3. Repeated names across the whole file after renaming
            step = "checking the names";
            var newName = {};
            for (i = 0; i < changes.length; i++) newName["n" + changes[i].idx] = changes[i].to;
            var tally = {}, dup = 0, key;
            for (i = 0; i < total; i++) {
                var fin = (newName["n" + i] !== undefined) ? newName["n" + i] : String(doc.artboards[i].name);
                tally["n_" + fin] = (tally["n_" + fin] ? tally["n_" + fin] : 0) + 1;
            }
            for (key in tally) if (tally[key] > 1) dup++;
            function line(c) { return c.from + "  ->  " + c.to; }
            var head = changes.length + " of " + total + " artboard(s) will be renamed:" + NL + NL;
            var warn = (dup > 0) ? (NL + NL + "Warning: " + dup + " name(s) will be used by more than one artboard.") : "";

            // Preview only (the palette shows it): first 3 and the last one
            if (o.dry) {
                var pl = [];
                var pShow = (changes.length <= 5) ? changes.length : 3;
                for (i = 0; i < pShow; i++) pl.push(line(changes[i]));
                if (changes.length > 5) { pl.push("..."); pl.push(line(changes[changes.length - 1])); }
                return head + pl.join(NL) + warn;
            }

            // The check before renaming: first 6 and the last one
            step = "asking for confirmation";
            var lines = [];
            var shown = (changes.length <= 8) ? changes.length : 6;
            for (i = 0; i < shown; i++) lines.push(line(changes[i]));
            if (changes.length > 8) { lines.push("..."); lines.push(line(changes[changes.length - 1])); }
            if (!spConfirm(head + lines.join(NL) + warn, "Rename artboards - check the names", "Rename")) return "";

            step = "renaming";
            for (i = 0; i < changes.length; i++) {
                try { doc.artboards[changes[i].idx].name = changes[i].to; } catch (eName) {}
            }
            app.redraw();
            spAlert(changes.length + (changes.length === 1 ? " artboard was renamed." : " artboards were renamed."));
            return "";
        } catch (eAll) {
            return fail("Something went wrong while " + step + "." + NL + NL + "Details: " + eAll + (eAll.line ? " (line " + eAll.line + ")" : "") + NL + NL + "Check the artboard names in your file before trying again.");
        }
    }



    // ---- Palette (UI only - no document access happens here) ----
    try {
        if ($.global.__abWin && $.global.__abWin instanceof Window) {
            $.global.__abWin.close();
        }
    } catch (ePrev) {}

    var win = new Window("palette", "Artboards 1.5");
    $.global.__abWin = win;
    paintWin(win);   // dark grey first: the UI Kit picks the white logo on a dark window
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.margins = uik().MARGINS;
    win.spacing = uik().SPACING;

    var logoRow = win.add("group");
    logoRow.alignment = ["fill", "top"];
    logoRow.alignChildren = ["left", "center"];
    logoRow.spacing = 10;
    logoRow.margins = 0;
    addHeaderLogo(logoRow, win);
    var logoSpacer = logoRow.add("group");
    logoSpacer.alignment = ["fill", "center"];
    addHeaderTitle(logoRow, "Artboards");
    addAccentLine(win);

    // Two tab buttons and two pages in a stack (the native tab panel cannot be painted dark).
    var tabBar = win.add("group");
    tabBar.orientation = "row";
    tabBar.alignment = ["left", "top"];
    tabBar.spacing = 6;
    var tabBtnC = tabBar.add("button", undefined, "Create");
    var tabBtnR = tabBar.add("button", undefined, "Rename");
    var tabStack = win.add("group");
    tabStack.orientation = "stack";
    tabStack.alignment = ["fill", "top"];
    tabStack.alignChildren = ["fill", "top"];
    var tabCreate = tabStack.add("group");
    var tabRename = tabStack.add("group");
    tabCreate.orientation = "row";
    tabCreate.alignChildren = ["fill", "top"];
    tabCreate.margins = [0, 4, 0, 0];
    tabCreate.spacing = 12;
    tabRename.orientation = "row";
    tabRename.alignChildren = ["fill", "top"];
    tabRename.margins = [0, 4, 0, 0];
    tabRename.spacing = 12;
    function colGroup(parent) {
        var g = parent.add("group");
        g.orientation = "column"; g.alignChildren = ["fill", "top"]; g.alignment = ["fill", "top"]; g.spacing = 8;
        return g;
    }
    function colPanel(parent, title) {
        var pn = parent.add("panel", undefined, title);
        pn.orientation = "column"; pn.alignChildren = ["left", "top"]; pn.margins = [12, 16, 12, 12]; pn.spacing = 6;
        return pn;
    }
    var cL = colGroup(tabCreate), cR = colGroup(tabCreate);
    var rL = colGroup(tabRename), rR = colGroup(tabRename);
    var tabs = { selection: null, onChange: null };

    // ================= CREATE TAB =================
    var pnl = cL.add("panel", undefined, "Artboard names");
    pnl.orientation = "column";
    pnl.alignChildren = ["left", "top"];
    pnl.margins = 12;
    pnl.spacing = 8;

    var rbSigns   = pnl.add("radiobutton", undefined, "S1, S2, S3\u2026   (multiple signs)");
    var rbOptions = pnl.add("radiobutton", undefined, "OP A, OP B, OP C\u2026   (multiple options)");
    var rbPres    = pnl.add("radiobutton", undefined, "Presentation 1, Presentation 2\u2026   (moved to front)");
    var rbSignOpts = pnl.add("radiobutton", undefined, "S1 OPA, S1 OPB, S2 OPA\u2026   (signs with options)");
    rbSigns.value = true;

    var grpBy = cL.add("group");
    grpBy.orientation = "row";
    grpBy.margins = [24, 0, 0, 0];
    grpBy.add("statictext", undefined, "Signs with options - one sign is a:");
    var rbByRow = grpBy.add("radiobutton", undefined, "Row");
    var rbByCol = grpBy.add("radiobutton", undefined, "Column");
    var rbByGrp = grpBy.add("radiobutton", undefined, "Group");
    rbByRow.value = true;
    rbByRow.helpTip = "Each row of art is one sign; the pieces in the row are its options (left to right).";
    rbByCol.helpTip = "Each column of art is one sign; the pieces in the column are its options (top to bottom).";
    rbByGrp.helpTip = "For mixed layouts: group each sign's options first (Ctrl+G) and select the groups. Each group is a sign; the items inside are its options.";
    function syncBy() {
        var on = rbSignOpts.value;
        rbByRow.enabled = on; rbByCol.enabled = on; rbByGrp.enabled = on;
    }
    rbSigns.onClick = syncBy; rbOptions.onClick = syncBy; rbPres.onClick = syncBy; rbSignOpts.onClick = syncBy;
    syncBy();

    var pnlOpts = colPanel(cR, "Options");
    var chkSkipSmall = pnlOpts.add("checkbox", undefined, "Skip small loose items (stray texts, forgotten pieces)");
    chkSkipSmall.value = true;

    var chkKeepExisting = pnlOpts.add("checkbox", undefined, "Keep existing artboards (don't delete them)");
    chkKeepExisting.value = false;

    var info = pnlOpts.add("statictext", undefined,
        "Standard: deletes existing artboards and creates one per selected art, in visual order. Check the box above to keep them.",
        { multiline: true });
    info.preferredSize = [300, 50];

    // ================= RENAME TAB =================
    tabRename.spacing = 6;
    var modeGroup = rL.add("group");
    modeGroup.add("statictext", undefined, "Mode:");
    var ddMode = modeGroup.add("dropdownlist", undefined, [
        "Build new names (prefix + number + suffix)",
        "Add to the current names (prefix / suffix)",
        "Find and replace in the names"
    ]);
    ddMode.selection = 0;
    ddMode.preferredSize.width = 300;

    var scopePnl = rL.add("panel", undefined, "Artboards to rename");
    scopePnl.orientation = "column";
    scopePnl.alignChildren = ["left", "top"];
    scopePnl.margins = [12, 14, 12, 10];
    scopePnl.spacing = 4;
    var rbScopeAll = scopePnl.add("radiobutton", undefined, "All artboards");
    var rbScopeSel = scopePnl.add("radiobutton", undefined, "Only the ones that contain the selected art");
    var rangeRow = scopePnl.add("group");
    var rbScopeRange = rangeRow.add("radiobutton", undefined, "Only these numbers:");
    var rangeInput = rangeRow.add("edittext", undefined, "");
    rangeInput.characters = 14;
    rbScopeAll.value = true;
    rbScopeSel.helpTip = "Select art in the file first. Every artboard that the selection touches is renamed.";
    rangeInput.helpTip = "Numbers as shown in the Artboards panel, e.g. 1-4, 7, 9-10";

    var pnlBuild = colPanel(rL, "New names");
    var prefixGroup = pnlBuild.add("group");
    prefixGroup.add("statictext", undefined, "Prefix:");
    var prefixInput = prefixGroup.add("edittext", undefined, "");
    prefixInput.characters = 25;

    var sepGroup = pnlBuild.add("group");
    sepGroup.add("statictext", undefined, "Separator:");
    var separatorInput = sepGroup.add("edittext", undefined, "_");
    separatorInput.characters = 5;

    var numberingGroup = pnlBuild.add("group");
    numberingGroup.orientation = "row";
    var numberingCheckbox = numberingGroup.add("checkbox", undefined, "Include numbering");
    numberingCheckbox.value = true;

    var startNumGroup = pnlBuild.add("group");
    startNumGroup.add("statictext", undefined, "Start at:");
    var startNumInput = startNumGroup.add("edittext", undefined, "1");
    startNumInput.characters = 5;

    var paddingGroup = pnlBuild.add("group");
    paddingGroup.add("statictext", undefined, "Padding:");
    var paddingInput = paddingGroup.add("edittext", undefined, "2");
    paddingInput.characters = 5;

    var suffixGroup = pnlBuild.add("group");
    suffixGroup.add("statictext", undefined, "Suffix:");
    var suffixInput = suffixGroup.add("edittext", undefined, "");
    suffixInput.characters = 25;

    var pnlFind = colPanel(rR, "Find and replace");
    var findGroup = pnlFind.add("group");
    findGroup.add("statictext", undefined, "Find:");
    var findInput = findGroup.add("edittext", undefined, "");
    findInput.characters = 20;
    var replaceGroup = pnlFind.add("group");
    replaceGroup.add("statictext", undefined, "Replace with:");
    var replaceInput = replaceGroup.add("edittext", undefined, "");
    replaceInput.characters = 20;
    var caseCheckbox = pnlFind.add("checkbox", undefined, "Match case");
    caseCheckbox.value = false;
    findInput.helpTip = "Matches pieces of a name: \"op\" also matches the start of \"Option\".";

    var previewGroup = rR.add("panel", undefined, "Preview");
    previewGroup.orientation = "column";
    previewGroup.alignment = ["fill", "top"];
    previewGroup.alignChildren = ["fill", "top"];
    previewGroup.margins = [12, 16, 12, 12];
    var previewText = previewGroup.add("edittext", undefined, "", { multiline: true, readonly: true });
    previewText.preferredSize = [330, 110];
    var previewBtn = previewGroup.add("button", undefined, "Preview on this file");
    previewBtn.alignment = ["left", "top"];
    previewBtn.helpTip = "Reads the open file and shows how many artboards change, the first 3 and the last one.";

    function modeKey() {
        var i = ddMode.selection ? ddMode.selection.index : 0;
        return (i === 1) ? "add" : (i === 2) ? "find" : "build";
    }
    function readRename() {
        var start = parseInt(startNumInput.text, 10);
        if (isNaN(start) || start < 0) start = 1;
        var padding = parseInt(paddingInput.text, 10);
        if (isNaN(padding) || padding < 0) padding = 0;
        return {
            mode: modeKey(),
            scope: rbScopeRange.value ? "range" : (rbScopeSel.value ? "selection" : "all"),
            range: rangeInput.text,
            prefix: prefixInput.text,
            separator: separatorInput.text,
            includeNum: numberingCheckbox.value,
            start: start,
            padding: padding,
            suffix: suffixInput.text,
            find: findInput.text,
            replace: replaceInput.text,
            matchCase: caseCheckbox.value
        };
    }
    // What is missing before this can run (empty = fine)
    function renameProblem(r) {
        if (r.mode === "build" && !r.prefix && !r.includeNum && !r.suffix) return "Type a prefix or a suffix, or turn on numbering, so there is something to build the names from.";
        if (r.mode === "add" && !r.prefix && !r.suffix) return "Type a prefix or a suffix to add to the current names.";
        if (r.mode === "find" && r.find === "") return "Type the text to find.";
        if (r.scope === "range" && r.range.replace(/\s+/g, "") === "") return "Type the artboard numbers to rename, for example 1-4, 7.";
        return "";
    }
    function renameOptText(r, dry) {
        return "{mode:\"" + r.mode + "\", scope:\"" + r.scope + "\", range:\"" + escArg(r.range) +
               "\", prefix:\"" + escArg(r.prefix) + "\", separator:\"" + escArg(r.separator) + "\", includeNum:" + (r.includeNum ? "true" : "false") +
               ", start:" + r.start + ", padding:" + r.padding + ", suffix:\"" + escArg(r.suffix) + "\", find:\"" + escArg(r.find) +
               "\", replace:\"" + escArg(r.replace) + "\", matchCase:" + (r.matchCase ? "true" : "false") + ", dry:" + (dry ? "true" : "false") + "}";
    }

    var txtStatus = null;
    var okBtn = null;
    function refreshOk() {
        try {
            if (!txtStatus || !okBtn) return;
            if (tabs.selection === tabRename) {
                var prob = renameProblem(readRename());
                okBtn.enabled = (prob === "");
                txtStatus.text = prob !== "" ? prob : "Tip: press \"Preview on this file\" to see the real new names. You are asked to confirm before anything is renamed.";
            } else {
                okBtn.enabled = true;
                txtStatus.text = "Select the art in Illustrator first, then press Create.";
            }
        } catch (eOk) {}
    }

    // Example names built from the settings (the real list is on the Preview button and the check before renaming)
    function updatePreview() {
        try {
            var r = readRename();
            var examples = [], i;
            if (r.mode === "find") {
                if (r.find === "") examples.push("(type the text to find)");
                else for (i = 1; i <= 3; i++) examples.push("Artboard " + i + "  ->  " + abReplaceAll("Artboard " + i, r.find, r.replace, r.matchCase));
            } else {
                for (i = 0; i < 3; i++) {
                    var mid = (r.mode === "add") ? ("Artboard " + (i + 1)) : (r.includeNum ? abPad(r.start + i, r.padding) : "");
                    var nm = abJoin([r.prefix, mid, r.suffix], r.separator);
                    examples.push(nm === "" ? ("Artboard " + (i + 1)) : nm);
                }
                if (r.mode === "add") examples[0] = "Artboard 1  ->  " + examples[0];
            }
            previewText.text = examples.join("\r");
        } catch (ePv) {
            previewText.text = "Example error: " + ePv;
        }
        refreshOk();
    }

    // Turns on only the fields the chosen mode uses.
    function syncRename() {
        try {
            var m = modeKey();
            var build = (m === "build"), add = (m === "add"), find = (m === "find");
            prefixInput.enabled = build || add;
            separatorInput.enabled = build || add;
            suffixInput.enabled = build || add;
            numberingCheckbox.enabled = build;
            startNumInput.enabled = build;
            paddingInput.enabled = build;
            findInput.enabled = find;
            replaceInput.enabled = find;
            caseCheckbox.enabled = find;
            rangeInput.enabled = rbScopeRange.value;
        } catch (eSy) {}
        updatePreview();
    }

    previewBtn.onClick = function () {
        var r = readRename();
        var problem = renameProblem(r);
        if (problem) { previewText.text = problem; return; }
        previewText.text = "Reading the file...";
        var bt = new BridgeTalk();
        bt.target = "illustrator";
        bt.body = spSendCode(POPUP_DEFS + AB_HELPER_TEXT + "(" + String(renameArtboardsDoc) + ")(" + renameOptText(r, true) + ");");
        bt.onResult = function (res) {
            try { previewText.text = String(res.body).replace(/\r?\n/g, "\r"); } catch (eR) { previewText.text = "Preview error: " + eR; }
        };
        bt.onError = function (er) {
            try { previewText.text = "Could not read the file: " + (er && er.body ? er.body : er); } catch (eE) {}
        };
        bt.send();
    };

    ddMode.onChange = syncRename;
    rbScopeAll.onClick = syncRename; rbScopeSel.onClick = syncRename; rbScopeRange.onClick = syncRename;
    prefixInput.onChanging = updatePreview;
    separatorInput.onChanging = updatePreview;
    numberingCheckbox.onClick = updatePreview;
    startNumInput.onChanging = updatePreview;
    paddingInput.onChanging = updatePreview;
    suffixInput.onChanging = updatePreview;
    findInput.onChanging = updatePreview;
    replaceInput.onChanging = updatePreview;
    caseCheckbox.onClick = updatePreview;
    syncRename();

    // Short grey line above the buttons: says why Rename is greyed out, or what to do next.
    txtStatus = win.add("statictext", undefined, "");
    txtStatus.alignment = ["fill", "top"];
    txtStatus.preferredSize.width = 700;

    // ================= BUTTONS =================
    var btns = win.add("group");
    btns.alignment = "right";
    okBtn = btns.add("button", undefined, "Create");
    var cancelBtn = btns.add("button", undefined, "Close");
    cancelBtn.onClick = function () { win.close(); };

    styleTabButton(tabBtnC, TAB_CREATE);
    styleTabButton(tabBtnR, TAB_RENAME);
    tabs.onChange = function () {
        var isRen = (tabs.selection === tabRename);
        okBtn.text = isRen ? "Rename" : "Create";
        if (okBtn.useAlt) okBtn.useAlt(isRen);
        refreshOk();
    };
    function selectTab(t) {
        tabs.selection = t;
        tabCreate.visible = (t === tabCreate);
        tabRename.visible = (t === tabRename);
        tabBtnC.sel = (t === tabCreate);
        tabBtnR.sel = (t === tabRename);
        try { tabBtnC.notify("onDraw"); tabBtnR.notify("onDraw"); } catch (eSel) {}
        tabs.onChange();
    }
    tabBtnC.onClick = function () { selectTab(tabCreate); };
    tabBtnR.onClick = function () { selectTab(tabRename); };
    rangeInput.onChanging = updatePreview;
    paintStyle(win);
    styleGreenButton(okBtn, BTN_CREATE, BTN_RENAME);
    selectTab(tabCreate);

    // ---------- tooltips ----------
    tabBtnC.helpTip = "Make new artboards around the art you select in Illustrator.";
    tabBtnR.helpTip = "Change the names of the artboards that are already in the file.";
    rbSigns.helpTip = "One artboard per selected sign, named S1, S2, S3...";
    rbOptions.helpTip = "One artboard per selected option of ONE sign, named OP A, OP B, OP C...";
    rbPres.helpTip = "Artboards named Presentation 1, Presentation 2... and moved to the front of the list.";
    rbSignOpts.helpTip = "For several signs that each have options: S1 OPA, S1 OPB, S2 OPA... Choose below how the art is laid out.";
    chkSkipSmall.helpTip = "Ignores very small loose pieces (stray text, forgotten bits) so they do not get an artboard of their own.";
    chkKeepExisting.helpTip = "OFF: all current artboards are deleted first. ON: they stay and the new ones are added.";
    ddMode.helpTip = "Build: names made from a prefix, a number and a suffix. Add: keeps the current names and adds a prefix or suffix. Find and replace: changes text inside the current names.";
    rbScopeAll.helpTip = "Rename every artboard in the file.";
    prefixInput.helpTip = "Text at the start of the name.";
    separatorInput.helpTip = "Put between the prefix, the number and the suffix, for example _ or a space.";
    numberingCheckbox.helpTip = "Adds a number to each name, counting up in artboard order.";
    startNumInput.helpTip = "The first number, for example 1.";
    paddingInput.helpTip = "How many digits the number has. 2 gives 01, 02, 03... and 0 gives no leading zeros.";
    suffixInput.helpTip = "Text at the end of the name.";
    replaceInput.helpTip = "What to put in place of the text found. Leave it empty to delete the found text.";
    caseCheckbox.helpTip = "ON: \"OP\" and \"op\" are different. OFF: they count as the same.";
    okBtn.helpTip = "Create: makes the artboards from the selected art. Rename: renames the artboards after you confirm the list.";
    cancelBtn.helpTip = "Closes this window.";

    // The Illustrator-side code needs the popup functions too (it runs in another engine).
    var POPUP_DEFS = uik().popupDefs;

    function escArg(s) {
        return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }

    okBtn.onClick = function () {
        var bt = new BridgeTalk();
        bt.target = "illustrator";
        if (tabs.selection === tabRename) {
            var r = readRename();
            var problem = renameProblem(r);
            if (problem) { spAlert(problem); return; }
            bt.body = spSendCode(POPUP_DEFS + AB_HELPER_TEXT + "(" + String(renameArtboardsDoc) + ")(" + renameOptText(r, false) + ");");
        } else {
            var mode = rbPres.value ? "presentation" : (rbSignOpts.value ? "signopts" : (rbOptions.value ? "options" : "signs"));
            var by = rbByCol.value ? "cols" : (rbByGrp.value ? "groups" : "rows");
            bt.body = spSendCode(POPUP_DEFS + "(" + String(createArtboardsDoc) + ')("' + mode + '", ' +
                      (chkSkipSmall.value ? "true" : "false") + ", " +
                      SMALL_ITEM_AREA_RATIO + ", " +
                      ROW_TOLERANCE_PT + ", " +
                      (chkKeepExisting.value ? "true" : "false") + ', "' + by + '");');
        }
        bt.send();
    };

    win.location = uik().pos();
    win.show();

})();
