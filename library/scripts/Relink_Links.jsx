// ============================================================
//  Relink Links 1.0
//  Author: Joao Victor Malz
//  Copyright: (c) 2026 Joao Victor Malz
//  Created for use at The Sign Pack
//
//  Relinks the linked images and placed documents (PDF, AI, PNG, JPG...) of the open
//  file, more reliably than the Links panel:
//   - Lists every link with its status (OK / Missing) and the folder it points to.
//   - "Search folder...": pick a folder; the script searches it and all its subfolders
//     for each link by file name and relinks what it finds. It relinks the selected
//     links, or the missing ones if nothing is selected. If several files fit, you
//     choose; each question is asked once.
//   - Optional looser match: same name with another extension or version (_v2, _v3...).
//   - "Relink selected to a file...": one file for the selected links.
//   - Embedded images: an embedded image has no link to repoint, so it is replaced:
//     select it in the list, give a file or search a folder, and the file is placed in
//     the same spot (same stacking position, centered, fitted inside the old size, same
//     opacity) and the old image is removed. Linked by default; an option embeds it
//     again. Rotated, skewed or flipped images keep their transform (it is copied and
//     checked; if the check fails, the old image is kept and the reason is shown).
//   - DPI column: the resolution of each image at its size in the file (72 / scale);
//     "[LOW]" under 150; "vector" for placed PDF / AI / EPS / SVG files.
//   - After each relink the script checks that the link really changed, and reports
//     what was relinked, not found, skipped or failed.
//   - "Keep each image's position and size" (on): the image goes back to the old
//     center and fits inside the old size, so a new file does not jump or resize.
// ============================================================

#target illustrator
var TSP_ASSET_SELF = ($.global.__SELF_OVERRIDE ? $.global.__SELF_OVERRIDE : $.fileName);

// Message handed back to Sign Pack Tools (the status bar shows it): SUCCESS: / WARNING: / ERROR:
var TSP_NAME = "Relink Links 1.0";
var SCRIPT_TITLE = "Relink Links 1.0";
var TSP_RESULT = "";

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
    var TITLE_PNG = "relink_title_png.png";
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
    var BTN_SEARCH = { key: "search", w: 124, h: 28, n: "relink_search_n.png", h2: "relink_search_h2.png", p: "relink_search_p.png", d: "relink_search_d.png" };

    // ------------------ SETTINGS ------------------
    var MAX_FILES = 60000;      // the folder search stops after this many files
    var MAX_SHOWN_NAMES = 12;   // names listed in the result popup
    // ----------------------------------------------

    if (app.documents.length === 0) {
        spAlert("No document is open. Open a file and try again.");
        TSP_RESULT = "ERROR: " + TSP_NAME + ": no document is open.";
        return;
    }
    var doc = app.activeDocument;

    var totalRelinked = 0, totalFailed = 0, totalNotFound = 0;

    // ---------------- helpers ----------------
    function trimStr(t) { return String(t).replace(/^\s+|\s+$/g, ""); }
    function lowKey(t) { return "k_" + String(t).toLowerCase(); }
    function fileNameOf(f) { try { return decodeURI(f.name); } catch (e) { return String(f.name); } }
    function samePath(a, b) {
        return String(a).replace(/\\/g, "/").toLowerCase() === String(b).replace(/\\/g, "/").toLowerCase();
    }
    // name without extension and without a trailing version like _v2, -v3, " v4", _v2.1
    function baseKey(name) {
        var n = String(name).replace(/\.[^.]*$/, "").toLowerCase();
        var m = n.replace(/[\s_\-]*v\d+(\.\d+)*$/, "");
        return (m === "") ? n : m;
    }

    // Resolution of an image at its size in the file (same formula as the Preflight and
    // Check Image Quality: 72 / scale). Vector files (PDF, AI, EPS, SVG) have none.
    var DPI_LOW = 150;
    function ppiText(it, fileName) {
        if (/\.(pdf|ai|ait|eps|svg|svgz)$/i.test(String(fileName))) return "vector";
        var sf = 1;
        try { if (doc.scaleFactor) sf = doc.scaleFactor; } catch (eSf) {}
        try {
            var m = it.matrix;
            var sx = Math.sqrt(m.mValueA * m.mValueA + m.mValueB * m.mValueB) * sf;
            var sy = Math.sqrt(m.mValueC * m.mValueC + m.mValueD * m.mValueD) * sf;
            var px = sx > 0 ? Math.round(72 / sx) : 0;
            var py = sy > 0 ? Math.round(72 / sy) : 0;
            if (px <= 0 && py <= 0) return "";
            var low = Math.min(px > 0 ? px : py, py > 0 ? py : px);
            var t = (px > 0 && py > 0 && Math.abs(px - py) > 1) ? (px + " x " + py) : String(px > 0 ? px : py);
            return (low < DPI_LOW ? "[LOW] " : "") + t;
        } catch (eP) {}
        return "";
    }

    // Every linked (placed) file in the document, plus the embedded images when asked.
    function readLinks(includeEmbedded) {
        var rows = [];
        var n = doc.placedItems.length;
        for (var i = 0; i < n; i++) {
            var it = doc.placedItems[i];
            var row = { item: it, name: "", path: "", ok: false, readable: false, embedded: false, srcName: "" };
            try {
                var f = it.file;
                if (f) {
                    row.name = fileNameOf(f);
                    row.path = String(f.fsName);
                    row.ok = f.exists;
                    row.readable = true;
                }
            } catch (eF) {}
            if (row.name === "") {
                try { row.name = String(it.name); } catch (eN) {}
            }
            if (row.name === "") row.name = "(unknown link)";
            row.dpi = ppiText(it, row.name);
            rows.push(row);
        }
        if (includeEmbedded) {
            var rn = doc.rasterItems.length;
            for (var k = 0; k < rn; k++) {
                var ri = doc.rasterItems[k];
                var erow = { item: ri, name: "", path: "", ok: true, readable: true, embedded: true, srcName: "" };
                try { erow.srcName = trimStr(ri.name); } catch (eRn) {}
                var label = (erow.srcName !== "") ? erow.srcName : "Embedded image";
                try {
                    var eb = ri.geometricBounds;
                    label += "  (" + ((eb[2] - eb[0]) / 72).toFixed(1) + " x " + ((eb[1] - eb[3]) / 72).toFixed(1) + " in";
                    try { label += ", layer " + ri.layer.name; } catch (eLy) {}
                    label += ")";
                } catch (eRb) {}
                erow.name = label;
                erow.dpi = ppiText(ri, "");
                rows.push(erow);
            }
        }
        return rows;
    }

    // ---------------- folder search ----------------
    function scanFolder(root) {
        var idx = { byName: {}, byBase: {}, count: 0, capped: false };
        var win = new Window("palette", SCRIPT_TITLE);
        paintWin(win);
        win.orientation = "column";
        win.margins = 16;
        var txt = win.add("statictext", undefined, "Searching the folder...");
        txt.preferredSize.width = 420;
        var txt2 = win.add("statictext", undefined, "");
        txt2.preferredSize.width = 420;
        paintStyle(win);
        win.center();
        win.show();
        win.update();

        var stack = [root];
        while (stack.length > 0 && !idx.capped) {
            var folder = stack.pop();
            var items = [];
            try { items = folder.getFiles(); } catch (eG) { items = []; }
            for (var i = 0; i < items.length; i++) {
                var f = items[i];
                var nm = fileNameOf(f);
                if (nm.charAt(0) === "." || nm.charAt(0) === "$") continue;
                if (f instanceof Folder) { stack.push(f); continue; }
                if (nm.charAt(0) === "~" || /\.tmp$/i.test(nm)) continue;
                var kn = lowKey(nm);
                if (!idx.byName[kn]) idx.byName[kn] = [];
                idx.byName[kn].push(f);
                var kb = lowKey(baseKey(nm));
                if (!idx.byBase[kb]) idx.byBase[kb] = [];
                idx.byBase[kb].push(f);
                idx.count++;
                if (idx.count >= MAX_FILES) { idx.capped = true; break; }
                if (idx.count % 250 === 0) {
                    txt.text = "Searching the folder...  " + idx.count + " files";
                    txt2.text = decodeURI(folder.name);
                    win.update();
                }
            }
        }
        win.close();
        return idx;
    }

    // Files in the index that fit a link. Exact name first; if none, optionally the same
    // base name (ignoring extension and version).
    function candidatesFor(row, idx, loose) {
        var list = [];
        var viaBase = false;
        if (row.embedded) {
            // an embedded image has no path: use its own name (if it has one), ignoring extension and version
            if (row.srcName !== "") { list = idx.byBase[lowKey(baseKey(row.srcName))] || []; viaBase = true; }
        } else {
            list = idx.byName[lowKey(row.name)] || [];
        }
        if (list.length === 0 && loose && !row.embedded) {
            list = idx.byBase[lowKey(baseKey(row.name))] || [];
            viaBase = true;
        }
        var out = [];
        var hadSelf = false;
        for (var i = 0; i < list.length; i++) {
            if (row.path !== "" && samePath(list[i].fsName, row.path)) { hadSelf = true; continue; }   // the link itself
            var dup = false;
            for (var j = 0; j < out.length; j++) { if (samePath(out[j].fsName, list[i].fsName)) { dup = true; break; } }
            if (!dup) out.push(list[i]);
        }
        return { files: out, viaBase: viaBase, hadSelf: hadSelf };
    }

    // Small window to choose between several matching files. Returns a File or null (skip).
    function chooseFile(row, files, root) {
        var dlg = new Window("dialog", SCRIPT_TITLE);
        paintWin(dlg);
        dlg.orientation = "column";
        dlg.alignChildren = ["fill", "top"];
        dlg.margins = 16;
        dlg.spacing = 10;
        var head = dlg.add("statictext", undefined, "More than one file fits \"" + row.name + "\". Pick the one to use:", { multiline: true });
        head.preferredSize.width = 560;
        var lb = dlg.add("listbox", undefined, [], { multiselect: false });
        lb.preferredSize = [560, 180];
        var rootPath = String(root.fsName);
        for (var i = 0; i < files.length; i++) {
            var p = String(files[i].fsName);
            var shown = (p.toLowerCase().indexOf(rootPath.toLowerCase()) === 0) ? p.substring(rootPath.length) : p;
            var li = lb.add("item", shown);
            li.fileIndex = i;
        }
        lb.selection = 0;
        var bg = dlg.add("group");
        bg.alignment = ["left", "top"];
        var useBtn = bg.add("button", undefined, "Use this one", { name: "ok" });
        var skipBtn = bg.add("button", undefined, "Skip", { name: "cancel" });
        var result = null;
        useBtn.onClick = function () { if (lb.selection) result = files[lb.selection.fileIndex]; dlg.close(); };
        skipBtn.onClick = function () { result = null; dlg.close(); };
        lb.onDoubleClick = useBtn.onClick;
        paintStyle(dlg);
        dlg.center();
        dlg.show();
        return result;
    }

    // ---------------- relinking ----------------
    // Scales the item to fit inside the box gb ([left, top, right, bottom]) and centers it there.
    function fitInto(it, gb) {
        var nb = it.geometricBounds;
        var ow = gb[2] - gb[0], oh = gb[1] - gb[3];
        var nw = nb[2] - nb[0], nh = nb[1] - nb[3];
        if (!(ow > 0 && oh > 0 && nw > 0 && nh > 0)) return;
        var s = Math.min(ow / nw, oh / nh) * 100;
        if (Math.abs(s - 100) > 0.01) it.resize(s, s, true, true, true, true, s, Transformation.CENTER);
        nb = it.geometricBounds;
        var dx = (gb[0] + gb[2]) / 2 - (nb[0] + nb[2]) / 2;
        var dy = (gb[1] + gb[3]) / 2 - (nb[1] + nb[3]) / 2;
        if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) it.translate(dx, dy);
    }

    // An embedded image has no link to repoint: the file is placed in its spot (same stacking
    // position, same center, fitted inside the old size, same opacity) and the old image is removed.
    function replaceEmbedded(row, f, embedNew) {
        var old = row.item;
        var gb = null;
        try { gb = old.geometricBounds; } catch (eB) { return "could not read the image"; }
        // The old image's transform (rotation, scale, skew, flip). A plain, unrotated image needs
        // nothing; otherwise the same transform is copied onto the new image and then checked.
        var L = null;
        try {
            var m = old.matrix;
            var plain = (Math.abs(m.mValueB) < 0.0001 && Math.abs(m.mValueC) < 0.0001 && m.mValueA * m.mValueD > 0);
            if (!plain) {
                L = app.getIdentityMatrix();
                L.mValueA = m.mValueA; L.mValueB = m.mValueB; L.mValueC = m.mValueC; L.mValueD = m.mValueD;
                L.mValueTX = 0; L.mValueTY = 0;
            }
        } catch (eM) { return "could not read the image's transform (" + eM.message + ")"; }
        var box = gb;
        if (L) {
            // the old image's box before the transform: turn a copy back and measure it
            var dup = null;
            try {
                dup = old.duplicate();
                dup.transform(app.invertMatrix(L), true, true, true, true, 1, Transformation.CENTER);
                var ub = dup.geometricBounds;
                var cx = (gb[0] + gb[2]) / 2, cy = (gb[1] + gb[3]) / 2;
                var hw = (ub[2] - ub[0]) / 2, hh = (ub[1] - ub[3]) / 2;
                box = [cx - hw, cy + hh, cx + hw, cy - hh];
            } catch (eD) {
                try { if (dup) dup.remove(); } catch (eD2) {}
                return "could not measure the transformed image (" + eD.message + ")";
            }
            try { dup.remove(); } catch (eD3) {}
        }
        var np = null;
        try {
            np = doc.placedItems.add();
            np.file = f;
        } catch (eAdd) {
            try { if (np) np.remove(); } catch (eRm) {}
            return "Illustrator could not place the file (" + eAdd.message + ")";
        }
        var now = null;
        try { now = np.file; } catch (eNow2) {}
        if (!now || !now.exists || fileNameOf(now).toLowerCase() !== fileNameOf(f).toLowerCase()) {
            try { np.remove(); } catch (eRm2) {}
            return "the file could not be placed";
        }
        try {
            np.move(old, ElementPlacement.PLACEAFTER);
            fitInto(np, box);
            if (L) {
                // A placed file keeps its vertical axis flipped (native matrix [1 0 0 -1]); an embedded
                // image does not. In that case the old transform is converted (sign of b and c) before
                // it is applied, and the new matrix is converted back before it is compared.
                var n0 = np.matrix;
                var flipY = (n0.mValueA * n0.mValueD < 0);
                var Lapp = app.getIdentityMatrix();
                Lapp.mValueA = L.mValueA; Lapp.mValueD = L.mValueD;
                Lapp.mValueB = flipY ? -L.mValueB : L.mValueB;
                Lapp.mValueC = flipY ? -L.mValueC : L.mValueC;
                Lapp.mValueTX = 0; Lapp.mValueTY = 0;
                np.transform(Lapp, true, true, true, true, 1, Transformation.CENTER);
                // check: the new image must have the same rotation / skew / flip as the old one
                var nmx = np.matrix, omx = old.matrix;
                var nA = nmx.mValueA, nB = nmx.mValueB;
                var nC = flipY ? -nmx.mValueC : nmx.mValueC;
                var nD = flipY ? -nmx.mValueD : nmx.mValueD;
                var nd = Math.sqrt(Math.abs(nA * nD - nB * nC));
                var od = Math.sqrt(Math.abs(omx.mValueA * omx.mValueD - omx.mValueB * omx.mValueC));
                if (nd > 0 && od > 0) {
                    var diff = Math.abs(nA / nd - omx.mValueA / od) + Math.abs(nB / nd - omx.mValueB / od) +
                               Math.abs(nC / nd - omx.mValueC / od) + Math.abs(nD / nd - omx.mValueD / od);
                    if (diff > 0.02) {
                        var f3 = function (mm) { return "[" + mm.mValueA.toFixed(3) + " " + mm.mValueB.toFixed(3) + " " + mm.mValueC.toFixed(3) + " " + mm.mValueD.toFixed(3) + "]"; };
                        throw new Error("the rotation could not be copied, replace it by hand. old=" + f3(omx) + " new=" + f3(nmx) + " native=" + f3(n0) + " L=" + f3(L));
                    }
                }
            }
            try { np.opacity = old.opacity; } catch (eOp) {}
            try { np.blendingMode = old.blendingMode; } catch (eBl) {}
            if (embedNew) np.embed();
            old.remove();
        } catch (eFin) {
            try { np.remove(); } catch (eRm3) {}
            return "could not finish (" + eFin.message + "), the old image was kept";
        }
        return "";
    }

    // Puts the new file on the item, checks the link really changed and, if asked, puts the
    // item back in the old box (same center, fitted inside the old size).
    // Returns "" when it worked, otherwise the reason.
    function relinkOne(row, f, keepGeom) {
        if (row.embedded) return replaceEmbedded(row, f, chkEmbedNew.value);
        var it = row.item;
        var gb = null;
        try { gb = it.geometricBounds; } catch (eB) {}
        try { it.file = f; } catch (eSet) { return "Illustrator refused it (" + eSet.message + ")"; }
        var now = null;
        try { now = it.file; } catch (eNow) {}
        if (!now || !now.exists || fileNameOf(now).toLowerCase() !== fileNameOf(f).toLowerCase()) {
            return "the link did not change";
        }
        if (keepGeom && gb) {
            try { fitInto(it, gb); } catch (eFit) { return "relinked, but the size could not be restored (" + eFit.message + ")"; }
        }
        return "";
    }

    function listNames(arr) {
        var out = "", n = Math.min(arr.length, MAX_SHOWN_NAMES);
        for (var i = 0; i < n; i++) out += "\n   " + arr[i];
        if (arr.length > n) out += "\n   ... and " + (arr.length - n) + " more";
        return out;
    }

    // ---------------- window ----------------
    var win = new Window("dialog", SCRIPT_TITLE);
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
    addHeaderTitle(logoRow, "Relink Links");
    addAccentLine(win);

    var summary = win.add("statictext", undefined, "");
    summary.preferredSize.width = 700;

    var lb = win.add("listbox", undefined, [], {
        multiselect: true, numberOfColumns: 4, showHeaders: true,
        columnTitles: ["Link", "Status", "DPI", "Folder it points to"], columnWidths: [230, 75, 85, 330]
    });
    lb.preferredSize = [720, 250];

    var optPnl = win.add("panel", undefined, "Options");
    optPnl.orientation = "column";
    optPnl.alignChildren = ["left", "top"];
    optPnl.margins = [14, 16, 14, 10];
    optPnl.spacing = 6;
    var chkOnlyMissing = optPnl.add("checkbox", undefined, "Show only the missing links");
    chkOnlyMissing.value = false;
    var chkLoose = optPnl.add("checkbox", undefined, "If the exact name is not found, also match the same name with another extension or version (_v2, _v3...)");
    chkLoose.value = false;
    var chkAll = optPnl.add("checkbox", undefined, "Search folder: also relink links that are not missing (when nothing is selected in the list)");
    chkAll.value = false;
    var chkKeep = optPnl.add("checkbox", undefined, "Keep each image's position and size (fit it inside the old box)");
    chkKeep.value = true;
    var chkEmbedded = optPnl.add("checkbox", undefined, "List the embedded images too (they can be replaced by a linked file)");
    chkEmbedded.value = true;
    var chkEmbedNew = optPnl.add("checkbox", undefined, "Embedded images: embed the new file instead of linking it");
    chkEmbedNew.value = false;
    chkEmbedded.helpTip = "An embedded image has no link to repoint. Select it in the list and give a file (or search a folder): the file is placed in the same spot, fitted inside the old size, and the old embedded image is removed. Rotated, skewed or flipped images keep their transform; if that cannot be copied, the old image is kept.\nIf you selected images in the document before opening this window, they start selected in the list.";
    chkEmbedNew.helpTip = "Off: the replacement is a linked file.\nOn: the replacement is embedded again.";
    chkOnlyMissing.helpTip = "Hides the links that are fine, so only the broken ones are listed.";
    chkLoose.helpTip = "Off: only a file with exactly the same name is used.\nOn: if there is none, a file with the same name but another extension or version is also accepted (logo_v2.png can become logo_v3.png or logo.ai). If several fit, you choose.";
    chkAll.helpTip = "Off: 'Search folder' only touches the missing links (embedded images only when selected).\nOn: with nothing selected, every link is pointed at the file with the same name found in the chosen folder (for example when copying a project to a new folder).";
    chkKeep.helpTip = "On: after relinking, the image goes back to the old center and fits inside the old size, so a new file with other dimensions does not jump or change size.\nOff: the image keeps whatever Illustrator gives it.";

    var note = win.add("statictext", undefined,
        "Search folder: relinks the links selected in the list; if none are selected, the missing ones. Embedded images are only replaced when selected.", { multiline: true });
    note.preferredSize.width = 700;

    var btnGrp = win.add("group");
    btnGrp.orientation = "row";
    btnGrp.alignment = ["fill", "top"];
    var left = btnGrp.add("group");
    left.alignment = ["left", "center"];
    var btnSearch = left.add("button", undefined, "Search folder...");
    var btnFile = left.add("button", undefined, "Relink selected to a file...");
    var btnMissing = left.add("button", undefined, "Select missing");
    var btnEmb = left.add("button", undefined, "Select embedded");
    var spacer = btnGrp.add("group");
    spacer.alignment = ["fill", "center"];
    spacer.preferredSize.width = 20;
    var right = btnGrp.add("group");
    right.alignment = ["right", "center"];
    var btnClose = right.add("button", undefined, "Close", { name: "cancel" });
    btnSearch.helpTip = "Pick a folder. The script looks in it and in every folder inside it for each link by file name, and relinks what it finds.";
    btnFile.helpTip = "Pick one file and point every selected link at it.";
    btnMissing.helpTip = "Selects all the missing links in the list.";
    btnEmb.helpTip = "Selects all the embedded images in the list.";

    var rows = [];

    function refresh() {
        rows = readLinks(chkEmbedded.value);
        var missing = 0, embCount = 0;
        for (var i = 0; i < rows.length; i++) { if (rows[i].embedded) embCount++; else if (!rows[i].ok) missing++; }
        var linkCount = rows.length - embCount;
        summary.text = linkCount + " link" + (linkCount === 1 ? "" : "s") + " in this file: " +
                       (linkCount - missing) + " OK, " + missing + " missing" +
                       (chkEmbedded.value ? ". Embedded images: " + embCount + "." : ".");
        lb.removeAll();
        for (var r = 0; r < rows.length; r++) {
            if (chkOnlyMissing.value && rows[r].ok && !rows[r].embedded) continue;
            var li = lb.add("item", rows[r].name);
            li.subItems[0].text = rows[r].embedded ? "Embedded" : (rows[r].ok ? "OK" : "Missing");
            li.subItems[1].text = rows[r].dpi;
            var folderText = rows[r].path;
            try { if (folderText !== "") folderText = decodeURI(new File(folderText).parent.fsName); } catch (eP) {}
            li.subItems[2].text = folderText;
            li.rowIndex = r;
        }
    }
    chkOnlyMissing.onClick = refresh;
    chkEmbedded.onClick = refresh;

    function selectedRows() {
        var out = [];
        var sel = lb.selection;
        if (!sel) return out;
        if (!(sel instanceof Array)) sel = [sel];
        for (var i = 0; i < sel.length; i++) out.push(rows[sel[i].rowIndex]);
        return out;
    }

    btnEmb.onClick = function () {
        var picks = [];
        for (var i = 0; i < lb.items.length; i++) if (rows[lb.items[i].rowIndex].embedded) picks.push(lb.items[i]);
        lb.selection = picks.length ? picks : null;
    };

    btnMissing.onClick = function () {
        var picks = [];
        for (var i = 0; i < lb.items.length; i++) if (!rows[lb.items[i].rowIndex].ok) picks.push(lb.items[i]);
        lb.selection = picks.length ? picks : null;
    };

    function showResult(done, notFound, failed, skipped) {
        var msg = "";
        msg += "Relinked: " + done.length + (done.length ? listNames(done) : "");
        if (notFound.length) msg += "\n\nNot found in the folder: " + notFound.length + listNames(notFound);
        if (skipped.length) msg += "\n\nSkipped: " + skipped.length + listNames(skipped);
        if (failed.length) msg += "\n\nCould not relink: " + failed.length + listNames(failed);
        spAlert(msg, SCRIPT_TITLE);
    }

    btnSearch.onClick = function () {
        if (rows.length === 0) { spAlert("This file has no linked images or documents."); return; }
        var targets = selectedRows();
        if (targets.length === 0) {
            for (var i = 0; i < rows.length; i++) if (!rows[i].embedded && (!rows[i].ok || chkAll.value)) targets.push(rows[i]);
        }
        if (targets.length === 0) { spAlert("Nothing to relink: no link is missing. Select links or embedded images in the list, or tick \"also relink links that are not missing\"."); return; }

        try { Folder.current = doc.fullName.parent; } catch (eCur) {}
        var root = Folder.selectDialog("Pick the folder to search (its subfolders are searched too)");
        if (!root) return;

        var idx = scanFolder(root);
        var done = [], notFound = [], failed = [], skipped = [];
        var choice = {};   // answers already given, per link path, so each question is asked once
        for (var t = 0; t < targets.length; t++) {
            var row = targets[t];
            var ck = "k_" + (row.path !== "" ? row.path.toLowerCase() : row.name.toLowerCase());
            var pick = null;
            if (choice.hasOwnProperty(ck)) {
                pick = choice[ck];
            } else {
                var c = candidatesFor(row, idx, chkLoose.value);
                if (c.files.length === 0) pick = c.hadSelf ? "same" : false;   // false = not found
                else if (c.files.length === 1) pick = c.files[0];
                else pick = chooseFile(row, c.files, root);              // null = skipped
                choice[ck] = pick;
            }
            if (pick === "same") continue;                      // already points at the file in that folder
            if (pick === false) { notFound.push(row.name); continue; }
            if (pick === null) { skipped.push(row.name); continue; }
            var why = relinkOne(row, pick, chkKeep.value);
            if (why === "") done.push(row.name + "  ->  " + fileNameOf(pick));
            else failed.push(row.name + " (" + why + ")");
        }
        totalRelinked += done.length;
        totalNotFound += notFound.length;
        totalFailed += failed.length;
        refresh();
        if (idx.capped) spAlert("The search stopped after " + MAX_FILES + " files. Pick a smaller folder if something was not found.");
        showResult(done, notFound, failed, skipped);
    };

    btnFile.onClick = function () {
        var targets = selectedRows();
        if (targets.length === 0) { spAlert("Select one or more links in the list first."); return; }
        try { Folder.current = doc.fullName.parent; } catch (eCur2) {}
        var f = File.openDialog("Pick the file the selected links should point to");
        if (!f) return;
        if (targets.length > 1 && !spConfirm("Point all " + targets.length + " selected links at \"" + fileNameOf(f) + "\"?", SCRIPT_TITLE, "Yes")) return;
        var done = [], failed = [];
        for (var t = 0; t < targets.length; t++) {
            var why = relinkOne(targets[t], f, chkKeep.value);
            if (why === "") done.push(targets[t].name + "  ->  " + fileNameOf(f));
            else failed.push(targets[t].name + " (" + why + ")");
        }
        totalRelinked += done.length;
        totalFailed += failed.length;
        refresh();
        showResult(done, [], failed, []);
    };

    btnClose.onClick = function () { win.close(); };

    // images selected in the document before the window opened start selected in the list
    var preSig = {};
    try {
        var ds = doc.selection;
        for (var q = 0; q < ds.length; q++) {
            var tn = ds[q].typename;
            if (tn === "RasterItem" || tn === "PlacedItem") {
                var sb = ds[q].geometricBounds;
                preSig[tn + ":" + Math.round(sb[0] * 100) + ":" + Math.round(sb[1] * 100) + ":" + Math.round(sb[2] * 100) + ":" + Math.round(sb[3] * 100)] = true;
            }
        }
    } catch (eDS) {}
    refresh();
    try {
        var preSel = [];
        for (var li2 = 0; li2 < lb.items.length; li2++) {
            var it2 = rows[lb.items[li2].rowIndex].item;
            var b2 = it2.geometricBounds;
            if (preSig[it2.typename + ":" + Math.round(b2[0] * 100) + ":" + Math.round(b2[1] * 100) + ":" + Math.round(b2[2] * 100) + ":" + Math.round(b2[3] * 100)]) preSel.push(lb.items[li2]);
        }
        if (preSel.length) lb.selection = preSel;
    } catch (ePre) {}
    if (rows.length === 0) {
        spAlert("This file has no linked or embedded images.");
        TSP_RESULT = "WARNING: " + TSP_NAME + ": no links in this file.";
        return;
    }
    paintStyle(win);
    styleGreenButton(btnSearch, BTN_SEARCH);
    win.location = uik().pos();
    win.show();

    if (totalFailed > 0) {
        TSP_RESULT = "WARNING: " + TSP_NAME + ": " + totalRelinked + " relinked, " + totalFailed + " failed" + (totalNotFound ? ", " + totalNotFound + " not found" : "") + ".";
    } else if (totalNotFound > 0) {
        TSP_RESULT = "WARNING: " + TSP_NAME + ": " + totalRelinked + " relinked, " + totalNotFound + " not found.";
    } else if (totalRelinked > 0) {
        TSP_RESULT = "SUCCESS: " + TSP_NAME + ": " + totalRelinked + " link" + (totalRelinked === 1 ? "" : "s") + " relinked.";
    } else {
        TSP_RESULT = "SUCCESS: " + TSP_NAME + ": opened, nothing relinked.";
    }

})();

// last value of the file = what Sign Pack Tools shows in its status bar
(TSP_RESULT === "" ? ("WARNING: " + TSP_NAME + ": cancelled.") : TSP_RESULT);
