#target illustrator
var TSP_ASSET_SELF = ($.global.__SELF_OVERRIDE ? $.global.__SELF_OVERRIDE : $.fileName);

// Message handed back to Sign Pack Tools (the status bar shows it): SUCCESS: / WARNING: / ERROR:
var TSP_NAME = "Export Production Files 3.3";
var TSP_RESULT = "";

// ============================================================
//  Export Production Files 3.3
//  Author: Joao Victor Malz
//  Copyright: (c) 2026 Joao Victor Malz
//  Created for use at The Sign Pack
//
//  Exports each artboard (or all selected ones as one combined file) to
//  PDF, and optionally .ai, .eps, .png and .svg, from a clean copy of the
//  open file. Your open file is never changed.
//
//  Before exporting one set of files per artboard, the longest full file path is
//  checked (Windows stops at 260 characters). Over 250 = nothing is exported and the
//  message lists the artboards. If something fails, the error says which step and which
//  artboard it was on.
//
//  Combined mode: the PDF is saved straight from a copy of the whole document using
//  Illustrator's own artboard range (e.g. "1,4,6"). .ai / .eps need content stripped to
//  the chosen artboards, so every item that does not overlap a chosen artboard (plus the
//  chosen bleed) is deleted from one prepared copy. No content is copied between documents.
//
//  Lessons kept (reasons are next to the code):
//   - PDF compatibility must be ACROBAT7 or higher (Large Canvas).
//   - EPS compatibility must be left unset (Large Canvas).
//   - The edge check uses a small tolerance for float noise.
//
//  MAINTENANCE NOTE: this script relies on Illustrator's own 'selectallinartboard' menu
//  command to isolate each artboard's content. Adobe has changed this command's behavior
//  between versions before. After ANY Illustrator update, spot-check one exported PDF
//  against the source file before trusting a batch.
// ============================================================

function exportProductionFilesV2() {
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
    function addLogo(parent, w) { return uik().addLogo(parent, w); }

    // ---- Look: dark grey window, white text, green accents (2.6) ----
    // STYLED_UI = false gives the plain system look back (use it if the labels are hard to read).
    var STYLED_UI = true;
    var TSP_BG = [43 / 255, 43 / 255, 43 / 255, 1];          // window background, #2B2B2B
    var TSP_GREEN = [34 / 255, 164 / 255, 56 / 255, 1];      // company green
    var TSP_GREEN_HI = [52 / 255, 184 / 255, 76 / 255, 1];   // lighter green (hover, panel titles)
    var TSP_GREEN_LO = [24 / 255, 128 / 255, 42 / 255, 1];   // darker green (click)
    var TITLE_PNG = "epf_title_png.png";
    function paintWin(w) {
        if (!STYLED_UI) return;
        try { w.graphics.backgroundColor = w.graphics.newBrush(w.graphics.BrushType.SOLID_COLOR, TSP_BG); } catch (ePw) {}
    }
    // White text everywhere, green panel titles. Controls marked keepColor (the red warnings) are left alone.
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
    // Green rounded main button. The text is part of the pictures (normal, hover, click, disabled), so it
    // is always centered; the window font and DPI cannot move it. If anything fails, the button stays native.
    function btnImage(key, data) {
        try {
            var f = assetFile(data);
            if (f && f.length > 50) return ScriptUI.newImage(f);
        } catch (eBi) {}
        return null;
    }
    function styleGreenButton(btn, def) {
        if (!STYLED_UI) return;
        try {
            var imN = btnImage(def.key + "_n", def.n), imH = btnImage(def.key + "_h", def.h2);
            var imP = btnImage(def.key + "_p", def.p), imD = btnImage(def.key + "_d", def.d);
            if (!imN) return;
            btn.preferredSize = [def.w, def.h];
            btn.onDraw = function (stt) {
                var gb = this.graphics;
                var bw = this.size.width, bh = this.size.height;
                gb.newPath(); gb.rectPath(0, 0, bw, bh);
                gb.fillPath(gb.newBrush(gb.BrushType.SOLID_COLOR, TSP_BG));
                var im = imN;
                if (!this.enabled) { if (imD) im = imD; }
                else { try { if (stt && stt.leftButtonPressed && imP) im = imP; else if (stt && stt.mouseOver && imH) im = imH; } catch (eSt) {} }
                gb.drawImage(im, 0, 0, bw, bh);
            };
            var redrawBtn = function () { try { btn.notify("onDraw"); } catch (eNd) {} };
            btn.addEventListener("mouseover", redrawBtn);
            btn.addEventListener("mouseout", redrawBtn);
            btn.addEventListener("mousedown", redrawBtn);
            btn.addEventListener("mouseup", redrawBtn);
        } catch (eGb) {}
    }
    var BTN_EXPORT_FILES = { key: "export_files", w: 111, h: 28, n: "epf_export_files_n.png", h2: "epf_export_files_h2.png", p: "epf_export_files_p.png", d: "epf_export_files_d.png" };
    var BTN_EXPORT = { key: "export", w: 76, h: 28, n: "epf_export_n.png", h2: "epf_export_h2.png", p: "epf_export_p.png", d: "epf_export_d.png" };
    // Logo: The Sign Pack wordmark from the UI Kit on the styled window, the old logo otherwise.
    function addHeaderLogo(parent, w) {
        if (STYLED_UI) {
            try { var im = uik().addWordmark ? uik().addWordmark(parent) : null; if (im) return im; } catch (eWm) {}
        }
        return addLogo(parent, w);
    }
    // Title as a small picture (bold capitals), because the window font cannot be set bold/bigger reliably.
    function addHeaderTitle(parent) {
        var im = null;
        if (STYLED_UI) {
            try {
                var tf = assetFile(TITLE_PNG);
                if (tf && tf.length > 50) im = parent.add("image", undefined, tf);
            } catch (eTi) { im = null; }
        }
        if (!im) {
            im = parent.add("statictext", undefined, "Export Production Files");
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
    function makePanel(parent, title) {
        var pn = parent.add("panel", undefined, title);
        pn.orientation = "column"; pn.alignChildren = ["fill", "top"]; pn.margins = [12, 16, 12, 12]; pn.spacing = 6;
        return pn;
    }

    if (app.documents.length === 0) {
        styledAlert("Please open a document first.");
        TSP_RESULT = "ERROR: " + TSP_NAME + ": no document is open.";
        return;
    }

    var doc = app.activeDocument;
    var originalFilePath = "";

    try {
        if (!doc.saved) doc.save();
        originalFilePath = doc.fullName.fsName;
    } catch (e) {
        styledAlert("Please save your original .ai file first.");
        TSP_RESULT = "ERROR: " + TSP_NAME + ": save the file first.";
        return;
    }

    var docName = doc.name.replace(/\.[^\.]+$/, '');
    var cleanDocName = docName.replace(/[\/\\:*?"<>|]/g, '-');
    var pdfPresets = app.PDFPresetsList;

    // ---------- small helpers ----------
    var PREF_PREFIX = "TheSignPack_";
    function readPref(key) {
        try { return app.preferences.getStringPreference(PREF_PREFIX + key) || ""; } catch (e) { return ""; }
    }
    function writePref(key, val) {
        try { app.preferences.setStringPreference(PREF_PREFIX + key, String(val)); } catch (e) {}
    }
    function sanitizeName(s) {
        return s.replace(/[\/\\:*?"<>|]/g, '-');
    }
    // Windows silently strips trailing spaces/periods from names, so trim
    // them up front to keep the collision checks honest.
    function cleanAbName(name, idx) {
        var n = sanitizeName(name).replace(/[\s.]+$/, '');
        return (n === "") ? ("Artboard " + (idx + 1)) : n;
    }

    // Replaces the native confirm() dialog, which is an OS-native alert and
    // doesn't pick up Illustrator's dark theme the way the rest of this
    // script's ScriptUI windows automatically do. This one is itself a
    // ScriptUI "dialog", so it matches. Message lines are centered; pass
    // "\n" in message for line breaks same as a normal confirm() call.
    function styledConfirm(message, title) {
        var dlg = new Window("dialog", title || "Confirm");
        dlg.orientation = "column";
        dlg.alignChildren = ["fill", "top"];
        dlg.margins = 20;
        dlg.spacing = 18;

        var msgText = dlg.add("statictext", undefined, message, { multiline: true });
        msgText.alignment = ["fill", "top"];
        msgText.justify = "center";
        msgText.preferredSize.width = 360;

        var btnGroup = dlg.add("group");
        btnGroup.alignment = ["center", "top"];
        btnGroup.spacing = 15;
        var btnYes = btnGroup.add("button", undefined, "Yes", { name: "ok" });
        btnYes.preferredSize.width = 90;
        var btnNo = btnGroup.add("button", undefined, "No", { name: "cancel" });
        btnNo.preferredSize.width = 90;

        var result = false;
        btnYes.onClick = function () { result = true; dlg.close(); };
        btnNo.onClick = function () { result = false; dlg.close(); };

        dlg.center();
        dlg.show();
        return result;
    }

    // ---------- Illustrator-style message windows ----------
    // Short display path: drops everything up to and including the OneDrive
    // library folder, e.g.
    //   C:\Users\x\OneDrive - The Sign Pack\Library Name\Client_1\Project\Final
    //   -> Client_1\Project\Final
    // No OneDrive folder in the path: drops C:\Users\<name>\ instead.
    function shortenPath(fsPath) {
        try {
            var p = decodeURI(String(fsPath)).replace(/\//g, "\\");
            var parts = p.split("\\");
            var od = -1;
            for (var i = 0; i < parts.length; i++) {
                if (/^onedrive/i.test(parts[i])) { od = i; break; }
            }
            if (od !== -1 && od + 2 < parts.length) return parts.slice(od + 2).join("\\");
            var us = -1;
            for (var j = 0; j < parts.length; j++) {
                if (/^users$/i.test(parts[j])) { us = j; break; }
            }
            if (us !== -1 && us + 2 < parts.length) return parts.slice(us + 2).join("\\");
            return p;
        } catch (eSP) { return String(fsPath); }
    }

    function styledAlert(message, title) {
        try {
            var dlg = new Window("dialog", title || "Export Production Files 3.3");
            dlg.orientation = "column";
            dlg.alignChildren = ["fill", "top"];
            dlg.margins = 20;
            dlg.spacing = 18;
            var msgText = dlg.add("statictext", undefined, String(message), { multiline: true });
            msgText.alignment = ["fill", "top"];
            msgText.justify = "center";
            msgText.preferredSize.width = 380;
            var bg = dlg.add("group");
            bg.alignment = ["center", "top"];
            var ok = bg.add("button", undefined, "OK", { name: "ok" });
            ok.preferredSize.width = 90;
            ok.onClick = function () { dlg.close(); };
            dlg.center();
            dlg.show();
        } catch (eAl) {
            alert(message);
        }
    }

    // Result window: big heading, centered lines, then titled sections.
    // sections = [{ title: "...", items: ["...", ...] }]
    function showResultDialog(heading, lines, sections, folderFsName) {
        try {
            var dlg = new Window("dialog", "Export Production Files 3.3");
            dlg.orientation = "column";
            dlg.alignChildren = ["center", "top"];
            dlg.margins = [40, 30, 40, 30];
            dlg.spacing = 14;

            var head = dlg.add("statictext", undefined, heading);
            head.alignment = ["center", "top"];
            try { head.graphics.font = ScriptUI.newFont("dialog", "BOLD", 22); } catch (eF) {}

            for (var i = 0; i < lines.length; i++) {
                var ln = dlg.add("statictext", undefined, lines[i]);
                ln.alignment = ["center", "top"];
            }
            if (folderFsName) {
                var fl = dlg.add("statictext", undefined, "Saved in: " + shortenPath(folderFsName));
                fl.alignment = ["center", "top"];
                fl.helpTip = folderFsName;
            }

            var MAX_SHOWN = 40;
            for (var s = 0; s < sections.length; s++) {
                var sec = sections[s];
                if (!sec.items || sec.items.length === 0) continue;
                var gap = dlg.add("statictext", undefined, "");
                gap.preferredSize.height = 2;
                var t = dlg.add("statictext", undefined, sec.title);
                t.alignment = ["center", "top"];
                try { t.graphics.font = ScriptUI.newFont("dialog", "BOLD", 12); } catch (eF2) {}
                // the items go side by side, separated by commas, wrapping onto a new line after ~60 characters
                var rowLines = [], cur = "";
                for (var k = 0; k < sec.items.length && k < MAX_SHOWN; k++) {
                    var piece = String(sec.items[k]);
                    if (cur === "") cur = piece;
                    else if ((cur + ", " + piece).length <= 60) cur += ", " + piece;
                    else { rowLines.push(cur + ","); cur = piece; }
                }
                if (cur !== "") rowLines.push(cur);
                for (var rl = 0; rl < rowLines.length; rl++) {
                    var row = dlg.add("statictext", undefined, rowLines[rl]);
                    row.alignment = ["center", "top"];
                }
                if (sec.items.length > MAX_SHOWN) {
                    var more = dlg.add("statictext", undefined, "\u2026and " + (sec.items.length - MAX_SHOWN) + " more");
                    more.alignment = ["center", "top"];
                }
            }

            var bg = dlg.add("group");
            bg.alignment = ["center", "top"];
            if (folderFsName) {
                var openBtn = bg.add("button", undefined, "Open Folder");
                openBtn.preferredSize.width = 120;
                openBtn.onClick = function () { try { new Folder(folderFsName).execute(); } catch (eOF) {} };
            }
            var ok = bg.add("button", undefined, "Close", { name: "ok" });
            ok.preferredSize.width = 120;
            ok.onClick = function () { dlg.close(); };
            dlg.center();
            dlg.show();
        } catch (eRes) {
            var fb = heading + "\n" + lines.join("\n");
            for (var q = 0; q < sections.length; q++) {
                if (sections[q].items && sections[q].items.length) fb += "\n\n" + sections[q].title + "\n" + sections[q].items.join("\n");
            }
            alert(fb);
        }
    }

    // ---------- main window ----------

    var win = new Window("dialog", "Export Production Files 3.3");
    paintWin(win);   // dark grey first: the UI Kit picks the white logo on a dark window
    win.orientation = "column"; win.alignChildren = ["fill", "top"]; win.margins = uik().MARGINS; win.spacing = uik().SPACING;

    var logoRow = win.add("group");
    logoRow.alignment = ["fill", "top"];
    logoRow.alignChildren = ["left", "center"];
    logoRow.spacing = 10;
    logoRow.margins = 0;
    addHeaderLogo(logoRow, win);
    var logoSpacer = logoRow.add("group");
    logoSpacer.alignment = ["fill", "center"];
    var logoTitle = addHeaderTitle(logoRow);
    addAccentLine(win);
    var chkWide = { value: true };   // the wide layout is the only layout (the tall one was removed)

    // Client profiles. Picking one fills in its defaults (only fields that are set).
    // The list comes from Clients_x.x.json in the same folder as this script; add clients there.
    // ---- Data files: JSON first (an old .jsx copy stays as a backup) ----
    function spCmpVer(a, b) {
        var len = (a.length > b.length) ? a.length : b.length;
        for (var n = 0; n < len; n++) {
            var x = parseInt(a[n] || "0", 10), y = parseInt(b[n] || "0", 10);
            if (x !== y) return (x > y) ? 1 : -1;
        }
        return 0;
    }
    function spBefore(x, y) {
        var c = spCmpVer(x.ver, y.ver);
        if (c !== 0) return c > 0;
        return x.isJson && !y.isJson;
    }
    // Finds "<base> x.x.json" (and, if withJsx, ".jsx") next to the script.
    // Highest version first; with the same version the .json goes first.
    function spFindData(scriptPath, base, withJsx) {
        var list = [];
        try {
            var rx = new RegExp("^" + base + "(?:[ _]*v?(\\d+(?:\\.\\d+)*))?\\.(json" + (withJsx ? "|jsx" : "") + ")$", "i");
            var files = new File(scriptPath).parent.getFiles();
            for (var i = 0; i < files.length; i++) {
                if (!(files[i] instanceof File)) continue;
                var nm = decodeURI(files[i].name);
                var m = nm.match(rx);
                if (!m) continue;
                list.push({ file: files[i], name: nm, ver: (m[1] || "0").split("."), isJson: (m[2].toLowerCase() === "json") });
            }
        } catch (eFind) {}
        for (var a = 1; a < list.length; a++) {
            var cur = list[a], b = a - 1;
            while (b >= 0 && spBefore(cur, list[b])) { list[b + 1] = list[b]; b--; }
            list[b + 1] = cur;
        }
        return list;
    }
    function spReadJson(f) {
        f.encoding = "UTF-8";
        if (!f.open("r")) throw new Error("the file could not be opened");
        var txt = f.read();
        f.close();
        if (txt.charCodeAt(0) === 0xFEFF) txt = txt.substr(1);
        txt = txt.replace(/^\s+/, "");
        if (txt.charAt(0) !== "{") throw new Error("it does not look like a JSON file");
        return eval("(" + txt + ")");
    }
    function spIsArray(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
    // Problem text for one sign type (or, with partial, for an override that lists only some fields). "" = fine.
    function spTypeProblem(st, nm, partial) {
        var okCut = { req: 1, no: 1 }, okBox = { nostroke: 1, stroke: 1, no: 1 };
        function has(k) { return !partial || st[k] !== undefined; }
        if (!st || typeof st !== "object") return nm + ": not a valid entry.";
        if (!partial && (typeof st.label !== "string" || st.label === "")) return nm + ": missing label.";
        if (has("bleed") && st.bleed !== null && typeof st.bleed !== "number") return nm + ": bleed must be a number or null.";
        if (has("cut") && st.cut !== null && !okCut[st.cut]) return nm + ": cut must be \"req\", \"no\" or null.";
        if (has("bbox") && !okBox[st.bbox]) return nm + ": bbox must be \"nostroke\", \"stroke\" or \"no\".";
        if (has("outline") && typeof st.outline !== "boolean") return nm + ": outline must be true or false.";
        if (st.notes !== undefined && !spIsArray(st.notes)) return nm + ": notes must be a list of texts.";
        if (st.addNotes !== undefined && !spIsArray(st.addNotes)) return nm + ": addNotes must be a list of texts.";
        return "";
    }

    // ---- Client profiles (Clients_x.x.json, optional) ----
    // A client lists only what is DIFFERENT from The Sign Pack standard. If the file is
    // missing or broken, the built-in standard profiles are used (and a broken file is reported once).
    function spClientDefaults() {
        return [
            { label: "The Sign Pack - Production", mode: "production", settings: {}, "export": { preset: "", bleed: "none" }, signTypes: {} },
            { label: "The Sign Pack - Design", "for": ["preflight"], mode: "design", settings: {}, signTypes: {} }
        ];
    }
    // forScript: "preflight" | "helper" | "export". Returns { version, source, clients, problem }.
    function loadClients(scriptPath, forScript, quiet) {
        var problems = [], raw = null, ver = "built-in", src = "built-in";
        var cands = spFindData(scriptPath, "Clients", false);
        if (cands.length > 0) {
            try {
                raw = spReadJson(cands[0].file);
                if (!raw || !spIsArray(raw.clients) || raw.clients.length === 0) {
                    problems.push(cands[0].name + " has no clients list.");
                    raw = null;
                } else {
                    ver = raw.version ? String(raw.version) : cands[0].ver.join(".");
                    src = "json";
                }
            } catch (eRead) {
                problems.push("Could not read " + cands[0].name + ": " + eRead);
                raw = null;
            }
        }
        function build(list, report) {
            var out = [], seen = {};
            for (var i = 0; i < list.length; i++) {
                var c = list[i];
                if (!c || typeof c.label !== "string" || c.label === "") { if (report) problems.push("Client #" + (i + 1) + ": missing label."); continue; }
                if (c.enabled === false) continue;
                var only = spIsArray(c["for"]) ? c["for"] : null;
                if (only) {
                    var okFor = false;
                    for (var k = 0; k < only.length; k++) if (String(only[k]).toLowerCase() === forScript) okFor = true;
                    if (!okFor) continue;
                }
                if (seen[c.label]) { if (report) problems.push("Client \"" + c.label + "\" is listed twice (the first one is used)."); continue; }
                seen[c.label] = true;
                var sts = {}, ov = (c.signTypes && typeof c.signTypes === "object") ? c.signTypes : {};
                for (var tn in ov) {
                    var pr = spTypeProblem(ov[tn], c.label + " / " + tn, true);
                    if (pr) { if (report) problems.push(pr); } else sts[tn] = ov[tn];
                }
                out.push({
                    label: c.label,
                    mode: (c.mode === "design") ? "design" : "production",
                    settings: (c.settings && typeof c.settings === "object") ? c.settings : {},
                    exp: (c["export"] && typeof c["export"] === "object") ? c["export"] : {},
                    signTypes: sts
                });
            }
            return out;
        }
        var clients = raw ? build(raw.clients, true) : [];
        if (clients.length === 0) {
            if (raw) problems.push("No usable client was found in the file.");
            clients = build(spClientDefaults(), false);
            ver = "built-in";
            src = "built-in";
        }
        if (problems.length > 0 && !quiet) {
            try {
                if (!$.global.__SIGNPACK_CLIENTS_WARNED) {
                    $.global.__SIGNPACK_CLIENTS_WARNED = true;
                    uik().spAlert("The Clients file has a problem:\n\n- " + problems.join("\n- ") + "\n\nThe entries with problems are skipped. If nothing usable is left, the standard The Sign Pack profiles are used.", "Clients file problem");
                }
            } catch (eWarn) {}
        }
        return { version: ver, source: src, clients: clients, problem: problems.join("\n") };
    }
    function findClientByLabel(list, label) {
        for (var i = 0; i < list.length; i++) if (list[i].label === label) return list[i];
        return null;
    }
    // The sign type as this client wants it: the standard entry with the client's changes on top.
    function applyClientToType(t, client) {
        var ov = (client && client.signTypes) ? client.signTypes[t.label] : null;
        if (!ov) return t;
        var r = {}, k;
        for (k in t) r[k] = t[k];
        for (k in ov) {
            if (k === "addNotes" || k === "label") continue;
            r[k] = ov[k];
        }
        if (ov.addNotes && ov.addNotes.length) r.notes = (r.notes || []).concat(ov.addNotes);
        return r;
    }
    var CLIENTS = loadClients(UIK_SELF, "export", false).clients;
    var clientNames = [];
    for (var cn = 0; cn < CLIENTS.length; cn++) clientNames.push(CLIENTS[cn].label);
    var cols = win.add("group");
    cols.orientation = "row"; cols.alignChildren = ["fill", "top"]; cols.spacing = 14;
    var grpClient = win.add("group");
    grpClient.alignment = ["center", "top"];
    grpClient.add("statictext", undefined, "Client:");
    var ddClient = grpClient.add("dropdownlist", undefined, clientNames);
    ddClient.preferredSize.width = 200;
    ddClient.selection = 0;
    try {
        var savedClient = readPref("Client");
        for (var cs = 0; cs < clientNames.length; cs++) if (clientNames[cs] === savedClient) ddClient.selection = cs;
    } catch (eCl) {}

    // Three columns, five topics (each topic is its own panel)
    function makeCol() {
        var g = cols.add("group");
        g.orientation = "column"; g.alignChildren = ["fill", "top"]; g.spacing = 10;
        return g;
    }
    var colA = makeCol(), colB = makeCol(), colC = makeCol();
    var pnlSave = makePanel(colA, "1. Where to save");
    var pnlName = makePanel(colA, "2. File name");
    var pnlFormats = makePanel(colB, "3. Formats");
    var pnlBleed = makePanel(colC, "4. Bleed");
    var pnlAb = makePanel(colC, "5. Artboards (this file has " + doc.artboards.length + ")");

    // ----- left column -----
    pnlFormats.add("statictext", undefined, "PDF preset (a PDF is always saved):");
    var dropdownPresets = pnlFormats.add("dropdownlist", undefined, pdfPresets);

    var savedPreset = readPref("LastPDFPreset");
    var presetIndex = 0;
    for (var p = 0; p < pdfPresets.length; p++) {
        if (pdfPresets[p] === savedPreset) {
            presetIndex = p;
            break;
        }
    }
    dropdownPresets.selection = presetIndex;
    dropdownPresets.preferredSize.width = 300;

    var grpFolder = pnlSave.add("group");
    var btnFolder = grpFolder.add("button", undefined, "Browse...");
    var txtFolder = grpFolder.add("edittext", undefined, doc.path.fsName); txtFolder.characters = 26;
    var chkRememberFolder = pnlSave.add("checkbox", undefined, "Remember output folder");
    chkRememberFolder.value = false;

    function pickFolderBig(startFolder) {
        // Uses the big Save As window (shows the files, has New folder); the folder you are in
        // when you click Save is the one chosen. Falls back to the small folder window.
        try {
            var probe = new File(startFolder.fsName + "/Choose this folder");
            var f = probe.saveDlg("Open the output folder, then click Save");
            if (!f) return null;
            return f.parent;
        } catch (ePick) {
            return Folder.selectDialog("Select destination folder", startFolder);
        }
    }
    btnFolder.onClick = function () {
        var startFolder = new Folder(txtFolder.text !== "" ? txtFolder.text : doc.path.fsName);
        if (!startFolder.exists) startFolder = new Folder(doc.path.fsName);
        var selectedFolder = pickFolderBig(startFolder);
        if (selectedFolder) txtFolder.text = selectedFolder.fsName;
    };

    var grpNameHead = pnlName.add("group");
    grpNameHead.orientation = "row";
    var btnSmartName = grpNameHead.add("button", undefined, "Smart name");
    var btnSameVersion = grpNameHead.add("button", undefined, "Same version");
    var txtCustomName = pnlName.add("edittext", undefined, cleanDocName + " ");
    txtCustomName.characters = 30;

    var firstAbName = cleanAbName(doc.artboards[0].name, 0);
    var txtPreview = pnlName.add("statictext", undefined, "Preview: " + txtCustomName.text + firstAbName + ".pdf");
    txtPreview.preferredSize.width = 270; // Forces the preview box to be wide enough

    var txtSmartNote = pnlName.add("statictext", undefined, "");
    txtSmartNote.preferredSize.width = 270;

    txtCustomName.onChanging = function () { updatePreview(); };

    // Smart name: project number (digits at the start of the file name), the
    // project's production folder, and the next free version in it.
    // The project folder is found by walking UP from the open file to the folder
    // whose name starts with the project number (e.g. 126080_110292); the
    // production folder is then looked for inside it (up to 3 levels down):
    // "Final Production Files" first, otherwise any "Production Files".
    function startsWithProject(nm, proj) {
        return nm.indexOf(proj) === 0 && !/^\d/.test(nm.substr(proj.length));
    }
    function findProductionFolder(proj) {
        try {
            var cur = doc.path;
            var projFolder = null;
            for (var up = 0; up < 10 && cur; up++) {
                if (startsWithProject(decodeURI(cur.name), proj)) { projFolder = cur; break; }
                cur = cur.parent;
            }
            if (!projFolder) return null;
            var best = null, any = null;
            function walk(fld, depth) {
                if (depth > 3) return;
                var kids = fld.getFiles();
                for (var k = 0; k < kids.length; k++) {
                    if (!(kids[k] instanceof Folder)) continue;
                    var nm = decodeURI(kids[k].name);
                    if (/^final\s+production\s+files?$/i.test(nm)) { if (!best) best = kids[k]; }
                    else if (/production\s+files?/i.test(nm)) { if (!any) any = kids[k]; }
                    walk(kids[k], depth + 1);
                }
            }
            walk(projFolder, 1);
            return best || any;
        } catch (eFp) { return null; }
    }
    // Highest _v<N> already in a folder for this project (0 if none).
    var DEFAULT_MIDDLE = "Production Files";
    function scanNaming(folderPath, proj) {
        var res = { last: 0 };
        try {
            var fld = new Folder(folderPath);
            var fl = fld.exists ? fld.getFiles() : [];
            var rxV = new RegExp("^" + proj + ".*?_v(\\d+)", "i");
            for (var sf = 0; sf < fl.length; sf++) {
                var mv = decodeURI(fl[sf].name).match(rxV);
                if (!mv) continue;
                var vn = parseInt(mv[1], 10);
                if (vn > res.last) res.last = vn;
            }
        } catch (eSn) {}
        return res;
    }
    btnSmartName.onClick = function () {
        var pm = docName.match(/^(\d{4,})/);
        if (!pm) {
            styledAlert("Could not find a project number at the start of the file name.");
            return;
        }
        var proj = pm[1];
        var prodFolder = findProductionFolder(proj);
        if (prodFolder) {
            txtFolder.text = prodFolder.fsName;
            txtSmartNote.text = "Production folder found: " + shortenPath(prodFolder.fsName);
        } else {
            txtSmartNote.text = "No production folder found - using the folder above.";
        }
        var found = scanNaming(txtFolder.text, proj);
        var last = found.last;
        // "Same version" re-uses the highest version already in the folder (overwrites it); otherwise the next one.
        txtCustomName.text = proj + "_" + DEFAULT_MIDDLE + "_v" + ((smartSameVersion && last > 0) ? last : (last + 1)) + " ";
        updatePreview();
    };

    // Second click on Smart name goes back to the name and folder from before the first click.
    var smartApplyOnce = btnSmartName.onClick;
    var smartUndo = null;
    var smartSameVersion = false;
    function smartClick(same) {
        smartSameVersion = same;
        try { btnSmartName.onClick(); } finally { smartSameVersion = false; }
    }
    btnSmartName.onClick = function () {
        if (smartUndo) {
            txtCustomName.text = smartUndo.name;
            txtFolder.text = smartUndo.folder;
            txtSmartNote.text = "";
            smartUndo = null;
            updatePreview();
            return;
        }
        var before = { name: txtCustomName.text, folder: txtFolder.text };
        smartApplyOnce();
        if (txtCustomName.text !== before.name || txtFolder.text !== before.folder) smartUndo = before;
    };
    btnSameVersion.onClick = function () { smartClick(true); };

    function updatePreview() {
        var grp = (typeof chkGrouped !== "undefined" && chkGrouped.value);
        if ((typeof chkCombined !== "undefined" && chkCombined.value) || grp) {
            var combinedPreviewName = sanitizeName(txtCustomName.text).replace(/[\s.]+$/, '');
            if (combinedPreviewName === "") combinedPreviewName = cleanDocName;
            txtPreview.text = "Preview: " + combinedPreviewName + (grp ? "_grouped" : "") + ".pdf (combined)";
            return;
        }
        var currentText = sanitizeName(txtCustomName.text);
        if (currentText === "") currentText = cleanDocName + " ";
        var suffix = (typeof chkIncludeArtboardName !== "undefined" && !chkIncludeArtboardName.value)
            ? "" : firstAbName;
        txtPreview.text = "Preview: " + currentText + suffix + ".pdf";
    }

    var chkIncludeArtboardName = pnlName.add("checkbox", undefined, "Include the artboard name in the file name");
    chkIncludeArtboardName.value = false;
    chkIncludeArtboardName.onClick = function () { updatePreview(); };

    pnlFormats.add("statictext", undefined, "PDF options:");
    var chkPreserveEdit = pnlFormats.add("checkbox", undefined, "PDF: keep Illustrator editing capabilities");
    chkPreserveEdit.value = true;

    var chkDisableView = pnlFormats.add("checkbox", undefined, "PDF: do not open it after saving");
    chkDisableView.value = false;

    var lblAlsoSave = pnlFormats.add("statictext", undefined, "Also save as:");
    var chkSaveAi = pnlFormats.add("checkbox", undefined, ".ai file");
    chkSaveAi.value = true;

    var grpAiOpt = pnlFormats.add("group");
    grpAiOpt.margins = [20, 0, 0, 0];
    var chkAiPdfCompatible = grpAiOpt.add("checkbox", undefined, "AI: make it PDF-compatible");
    chkAiPdfCompatible.value = false;   // off by default

    var chkSaveEps = pnlFormats.add("checkbox", undefined, ".eps file");
    chkSaveEps.value = true;

    var chkSavePng = pnlFormats.add("checkbox", undefined, ".png (300 ppi, transparent)");
    chkSavePng.value = false;

    var chkSaveSvg = pnlFormats.add("checkbox", undefined, ".svg file");
    chkSaveSvg.value = false;

    // ----- right column -----
    pnlSave.add("statictext", undefined, "Subfolders:");
    var FOLDER_MODE_OPTIONS = ["No subfolders", "One folder per artboard", "One folder per file type"];
    var dropdownFolderMode = pnlSave.add("dropdownlist", undefined, FOLDER_MODE_OPTIONS);
    dropdownFolderMode.selection = 0; // default: no subfolders
    dropdownFolderMode.preferredSize.width = 260;

    var chkOpenFolder = pnlSave.add("checkbox", undefined, "Open the output folder when done");
    chkOpenFolder.value = false;

    pnlBleed.add("statictext", undefined, "Art inside this will not trigger the edge warning.");
    var grpBleed = pnlBleed.add("group");
    grpBleed.orientation = "row";
    var rbBleedNone = grpBleed.add("radiobutton", undefined, "No Bleed");
    var rbBleed125 = grpBleed.add("radiobutton", undefined, "0.125\"");
    var rbBleedCustom = grpBleed.add("radiobutton", undefined, "Custom");
    var txtBleed = grpBleed.add("edittext", undefined, "0.125");
    txtBleed.characters = 6;
    grpBleed.add("statictext", undefined, "in");
    rbBleedNone.value = true;

    function refreshBleedUI() {
        txtBleed.enabled = rbBleedCustom.value;
    }
    rbBleedNone.onClick = refreshBleedUI;
    rbBleed125.onClick = refreshBleedUI;
    rbBleedCustom.onClick = refreshBleedUI;

    // Independent of the warning tolerance above - its own amount, and it
    // can be turned on regardless of what the warning is set to.
    var grpPdfBleed = pnlBleed.add("group");
    grpPdfBleed.orientation = "row";
    var chkPdfBleed = grpPdfBleed.add("checkbox", undefined, "Add bleed to PDF only");
    chkPdfBleed.value = false;
    var txtPdfBleed = grpPdfBleed.add("edittext", undefined, "0.125");
    txtPdfBleed.characters = 6;
    grpPdfBleed.add("statictext", undefined, "in");

    function refreshPdfBleedUI() {
        txtPdfBleed.enabled = chkPdfBleed.value;
    }
    chkPdfBleed.onClick = refreshPdfBleedUI;

    // Marks (PDF only): standard Illustrator trim and registration marks, outside the artboard
    var grpPdfMarks = pnlBleed.add("group");
    grpPdfMarks.orientation = "row";
    var chkTrimMarks = grpPdfMarks.add("checkbox", undefined, "Trim marks on the PDF");
    chkTrimMarks.value = false;
    var chkRegMarks = grpPdfMarks.add("checkbox", undefined, "Registration marks on the PDF");
    chkRegMarks.value = false;
    chkTrimMarks.helpTip = "Adds trim marks outside the artboard in the PDF (0.25 pt). Only the PDF is changed.";
    chkRegMarks.helpTip = "Adds registration marks outside the artboard in the PDF. Only the PDF is changed.";

    var abTotalCount = doc.artboards.length;
    var grpAbMode = pnlAb.add("group");
    grpAbMode.orientation = "row";
    var rbAbAll = grpAbMode.add("radiobutton", undefined, "All artboards");
    var rbAbSel = grpAbMode.add("radiobutton", undefined, "Selected");
    rbAbAll.value = true;

    var grpAbButtons = pnlAb.add("group");
    grpAbButtons.orientation = "row";
    var btnAbSelectAll = grpAbButtons.add("button", undefined, "Select All");
    var btnAbSelectNone = grpAbButtons.add("button", undefined, "Select None");

    var abListItems = [];
    for (var abi = 0; abi < abTotalCount; abi++) {
        abListItems.push((abi + 1) + " - " + cleanAbName(doc.artboards[abi].name, abi));
    }
    var listAb = pnlAb.add("listbox", undefined, abListItems, { multiselect: true });
    listAb.preferredSize = [260, 150]; // fixed height, scrolls internally when it overflows

    var txtAbCount = pnlAb.add("statictext", undefined, "0 of " + abTotalCount + " selected");

    function updateAbCount() {
        var sel = listAb.selection;
        var n = sel ? (sel instanceof Array ? sel.length : 1) : 0;
        txtAbCount.text = n + " of " + abTotalCount + " selected";
    }
    function refreshArtboardUI() {
        var enable = rbAbSel.value;
        listAb.enabled = enable;
        btnAbSelectAll.enabled = enable;
        btnAbSelectNone.enabled = enable;
        updateAbCount();
    }
    rbAbAll.onClick = refreshArtboardUI;
    rbAbSel.onClick = refreshArtboardUI;
    listAb.onChange = updateAbCount;
    btnAbSelectAll.onClick = function () {
        for (var sa = 0; sa < listAb.items.length; sa++) listAb.items[sa].selected = true;
        updateAbCount();
    };
    btnAbSelectNone.onClick = function () {
        for (var sn = 0; sn < listAb.items.length; sn++) listAb.items[sn].selected = false;
        updateAbCount();
    };

    var chkCombined = pnlAb.add("checkbox", undefined, "Export selected artboards as one combined file");
    chkCombined.value = false;

    // Same as the combined file, but "_grouped" is added at the end of the name (.pdf, .ai and .eps).
    var chkGrouped = pnlAb.add("checkbox", undefined, "Same, with _grouped at the end of the name");
    chkGrouped.value = false;

    function refreshCombinedUI() {
        var combined = chkCombined.value || chkGrouped.value;
        // Custom File Name stays editable in combined mode now too - it's
        // just the artboard-name toggle that's irrelevant here, since a
        // combined export is one file, not one per artboard.
        chkIncludeArtboardName.enabled = !combined;
        updatePreview();
    }
    chkCombined.onClick = function () { if (chkCombined.value) chkGrouped.value = false; refreshCombinedUI(); };
    chkGrouped.onClick = function () { if (chkGrouped.value) chkCombined.value = false; refreshCombinedUI(); };

    ddClient.onChange = function () {
        if (!ddClient.selection) return;
        var c = CLIENTS[ddClient.selection.index];
        var ce = c.exp || {};
        if (ce.preset) {
            for (var cp = 0; cp < pdfPresets.length; cp++) {
                if (pdfPresets[cp] === ce.preset) { dropdownPresets.selection = cp; break; }
            }
        }
        if (ce.bleed === "none") { rbBleedNone.value = true; }
        else if (ce.bleed === "125") { rbBleed125.value = true; }
        else if (ce.bleed === "custom") { rbBleedCustom.value = true; if (ce.bleedCustom) txtBleed.text = String(ce.bleedCustom); }
        refreshBleedUI();
    };

    // ---------- load remembered settings ----------
    if (readPref("RememberSettings") === "1") {
        var rv;
        rv = readPref("SaveAi");       if (rv !== "") chkSaveAi.value = (rv === "1");
        rv = readPref("SaveEps");      if (rv !== "") chkSaveEps.value = (rv === "1");
        rv = readPref("SavePng");      if (rv !== "") chkSavePng.value = (rv === "1");
        rv = readPref("SaveSvg");      if (rv !== "") chkSaveSvg.value = (rv === "1");
        rv = readPref("NoOpen");       if (rv !== "") chkDisableView.value = (rv === "1");
        rv = readPref("IncludeAbName"); if (rv !== "") chkIncludeArtboardName.value = (rv === "1");
        rv = readPref("PdfBleed");     if (rv !== "") chkPdfBleed.value = (rv === "1");
        rv = readPref("TrimMarks");    if (rv !== "") chkTrimMarks.value = (rv === "1");
        rv = readPref("RegMarks");     if (rv !== "") chkRegMarks.value = (rv === "1");
        rv = readPref("OpenFolder");   if (rv !== "") chkOpenFolder.value = (rv === "1");
        rv = readPref("Combined");     if (rv !== "") chkCombined.value = (rv === "1");
        rv = readPref("Grouped");      if (rv !== "") chkGrouped.value = (rv === "1");
        if (chkCombined.value && chkGrouped.value) chkGrouped.value = false;
        rv = parseInt(readPref("FolderMode"), 10);
        if (!isNaN(rv) && rv >= 0 && rv < FOLDER_MODE_OPTIONS.length) dropdownFolderMode.selection = rv;
        rv = readPref("BleedMode");
        if (rv === "125") { rbBleedNone.value = false; rbBleed125.value = true; }
        else if (rv === "custom") { rbBleedNone.value = false; rbBleedCustom.value = true; }
        rv = readPref("BleedCustom");  if (rv !== "") txtBleed.text = rv;
        rv = readPref("PdfBleedCustom"); if (rv !== "") txtPdfBleed.text = rv;
    }
    if (readPref("RememberFolder") === "1") {
        var savedFolder = readPref("OutputFolder");
        if (savedFolder !== "" && new Folder(savedFolder).exists) txtFolder.text = savedFolder;
        chkRememberFolder.value = true;
    }
    refreshBleedUI();
    refreshPdfBleedUI();
    refreshArtboardUI();
    refreshCombinedUI();
    updatePreview();

    // Static warning, always visible - no path-matching logic (that attempt
    // had a separator-mismatch bug and wasn't worth chasing further here).
    // Simpler and always correct to just always remind you saving .ai can
    // overwrite your source file.
    function makeBold(ctrl) {
        try {
            var f = ctrl.graphics.font;
            ctrl.graphics.font = ScriptUI.newFont(f.name, ScriptUI.FontStyle.BOLD, f.size);
        } catch (eBold) {}
    }

    var txtAiOverwriteWarning = win.add("statictext", undefined,
        "Existing files with the same name are overwritten. Saving .ai overwrites this file if the name and folder match.");
    txtAiOverwriteWarning.alignment = ["center", "top"];
    txtAiOverwriteWarning.keepColor = true;
    try {
        txtAiOverwriteWarning.graphics.foregroundColor =
            txtAiOverwriteWarning.graphics.newPen(txtAiOverwriteWarning.graphics.PenType.SOLID_COLOR, [1, 0.35, 0.3], 1);
    } catch (eWarnColor) {}
    makeBold(txtAiOverwriteWarning);
    var txtOverwrite = txtAiOverwriteWarning;

    var warningGroup = win.add("group");
    warningGroup.orientation = "column";
    warningGroup.alignChildren = ["center", "top"];
    warningGroup.spacing = 2;
    warningGroup.margins = [0, 2, 0, 0];
    warningGroup.add("statictext", undefined, "Processing runs in the background. Illustrator may look frozen, but it has not crashed.");
    warningGroup.add("statictext", undefined, "Please check your output folder before closing.");

    var grpOpts = win.add("group");
    grpOpts.orientation = "row"; grpOpts.alignment = ["center", "top"]; grpOpts.spacing = 24;
    var chkRemember = grpOpts.add("checkbox", undefined, "Remember settings");
    chkRemember.value = (readPref("RememberSettings") === "1");

    var chkAlwaysAdv = grpOpts.add("checkbox", undefined, "Always open this advanced window (skip the simple one)");
    chkAlwaysAdv.value = (readPref("AlwaysAdvanced") === "1");
    chkAlwaysAdv.helpTip = "ON: the script opens straight on this window. OFF: it opens the simple window first, which has an Advanced... button for this one.";
    chkAlwaysAdv.onClick = function () { writePref("AlwaysAdvanced", chkAlwaysAdv.value ? "1" : "0"); };

    // Bottom row: on the left a short line that says why Export Files is greyed out, or what will happen;
    // on the right the buttons.
    var grpBottom = win.add("group");
    grpBottom.orientation = "row"; grpBottom.alignment = ["fill", "top"]; grpBottom.alignChildren = ["left", "center"];
    var txtStatus = grpBottom.add("statictext", undefined, "");
    txtStatus.alignment = ["fill", "center"];
    txtStatus.preferredSize.width = 520;

    var grpButtons = grpBottom.add("group"); grpButtons.alignment = ["right", "center"];
    var btnExport = grpButtons.add("button", undefined, "Export Files");
    var btnCancel = grpButtons.add("button", undefined, "Close");
    paintStyle(win);
    styleGreenButton(btnExport, BTN_EXPORT_FILES);

    // ---------- tooltips (hover over a control to read them) ----------
    dropdownPresets.helpTip = "The Adobe PDF preset used for the PDF files. Pick the one your printer or the job asks for.";
    btnFolder.helpTip = "Choose the folder where the exported files will be saved.";
    txtFolder.helpTip = "Folder where the files will be saved. You can also paste a path here.";
    chkRememberFolder.helpTip = "Use this folder again the next time the script opens.";
    btnSameVersion.helpTip = "Like Smart name, but keeps the latest version number already in the folder (for example _v1 stays _v1), so the files of that version are overwritten. Click it again to go back.";
    btnSmartName.helpTip = "Reads the project number at the start of the document name, looks for the project's \"Final Production Files\" folder, and names the file <project>_v<next number>. Click it again to go back to the previous name and folder.";
    txtCustomName.helpTip = "Text at the start of every file name. The artboard name is added after it when that option is on.";
    chkSaveAi.helpTip = "Also saves an .ai copy of each exported artboard.";
    chkSaveEps.helpTip = "Also saves an .eps copy of each exported artboard.";
    chkSavePng.helpTip = "Also saves a transparent .png (300 ppi) of each exported artboard.";
    chkSaveSvg.helpTip = "Also saves an .svg of each exported artboard.";
    chkDisableView.helpTip = "Stops the exported PDFs from opening in Acrobat or another viewer after export.";
    chkIncludeArtboardName.helpTip = "Adds the artboard name after the custom file name. Keep it ON when exporting several artboards, or the files would share one name.";
    chkPreserveEdit.helpTip = "Lets the PDF be reopened and edited in Illustrator. Usually makes the file bigger.";
    chkAiPdfCompatible.helpTip = "Saves the .ai file so other programs can open it as a PDF. Usually makes the file bigger.";
    chkOpenFolder.helpTip = "Opens the output folder when the export finishes.";
    dropdownFolderMode.helpTip = "How the exported files are organized inside the output folder.";
    rbBleedNone.helpTip = "No bleed. Art that goes past the artboard edge will trigger the edge warning.";
    rbBleed125.helpTip = "Art up to 0.125 in past the artboard edge is accepted without a warning.";
    rbBleedCustom.helpTip = "Use your own bleed amount, in inches.";
    txtBleed.helpTip = "Custom bleed in inches, for example 0.25.";
    chkPdfBleed.helpTip = "Makes the PDF page bigger by this amount on every side. Only the PDF is changed.";
    txtPdfBleed.helpTip = "PDF bleed in inches, for example 0.125.";
    rbAbAll.helpTip = "Export every artboard in this document.";
    rbAbSel.helpTip = "Export only the artboards you pick in the list.";
    btnAbSelectAll.helpTip = "Pick every artboard in the list.";
    btnAbSelectNone.helpTip = "Clear the list.";
    listAb.helpTip = "Click to pick one artboard. Hold Ctrl (Cmd on Mac) or Shift to pick more.";
    chkCombined.helpTip = "Puts all picked artboards into ONE multi-page file instead of one file per artboard.";
    chkGrouped.helpTip = "Same as the combined file (one file with all the picked artboards), but the name ends with _grouped on the .pdf, .ai and .eps.";
    chkRemember.helpTip = "Saves the options on this window and loads them next time.";
    ddClient.helpTip = "A client profile fills in that client's usual PDF preset and bleed. You can still change them after.";
    btnExport.helpTip = "Exports the files with the settings above.";
    btnCancel.helpTip = "Closes this window without exporting.";

    // ---------- status line + Export button state ----------
    function numOk(t) { var v = parseFloat(t); return !(isNaN(v) || v < 0); }
    function exportProblem() {
        if (txtFolder.text === "") return "Choose an output folder to continue.";
        if (!(new Folder(txtFolder.text)).exists) return "That folder does not exist. Use Browse... to pick another one.";
        if (!dropdownPresets.selection) return "No PDF preset found. Install or pick a PDF preset first.";
        if (rbBleedCustom.value && !numOk(txtBleed.text)) return "Custom bleed must be a number in inches, for example 0.25.";
        if (chkPdfBleed.value && !numOk(txtPdfBleed.text)) return "PDF bleed must be a number in inches, for example 0.125.";
        if (rbAbSel.value) {
            var sel = listAb.selection;
            var n = sel ? (sel instanceof Array ? sel.length : 1) : 0;
            if (n === 0) return "Pick at least one artboard in the list, or switch to All artboards.";
        }
        return "";
    }
    function refreshStatus() {
        var prob = "";
        try { prob = exportProblem(); } catch (e1) { prob = ""; }
        btnExport.enabled = (prob === "");
        if (prob !== "") {
            txtStatus.text = prob;
        } else {
            var n2 = abTotalCount;
            if (rbAbSel.value) { var sl = listAb.selection; n2 = sl ? (sl instanceof Array ? sl.length : 1) : 0; }
            txtStatus.text = "Ready: " + n2 + " artboard" + (n2 === 1 ? "" : "s") + " will be exported.";
        }
    }
    // Keep each control's own handler and run the status refresh after it.
    function hookStatus(ctrl, evt) {
        var old = ctrl[evt];
        ctrl[evt] = function () {
            var r;
            if (old) r = old.apply(this, arguments);
            refreshStatus();
            return r;
        };
    }
    hookStatus(txtFolder, "onChanging");
    hookStatus(txtFolder, "onChange");
    hookStatus(btnFolder, "onClick");
    hookStatus(dropdownPresets, "onChange");
    hookStatus(ddClient, "onChange");
    hookStatus(rbBleedNone, "onClick");
    hookStatus(rbBleed125, "onClick");
    hookStatus(rbBleedCustom, "onClick");
    hookStatus(txtBleed, "onChanging");
    hookStatus(chkPdfBleed, "onClick");
    hookStatus(chkTrimMarks, "onClick");
    hookStatus(chkRegMarks, "onClick");
    hookStatus(txtPdfBleed, "onChanging");
    hookStatus(rbAbAll, "onClick");
    hookStatus(rbAbSel, "onClick");
    hookStatus(listAb, "onChange");
    hookStatus(btnAbSelectAll, "onClick");
    hookStatus(btnAbSelectNone, "onClick");
    refreshStatus();

    btnCancel.onClick = function () { win.close(); };

    btnExport.onClick = function () {
        if (txtFolder.text === "") { styledAlert("Please choose a folder to save the files in."); return; }
        var destFolder = new Folder(txtFolder.text);
        if (!destFolder.exists) { styledAlert("That folder could not be found. It may have been moved or renamed.\n\nUse Browse... to pick another folder."); return; }

        if (!dropdownPresets.selection) { styledAlert("No PDF preset is selected. If the list is empty, no PDF presets are installed in Illustrator."); return; }
        var presetName = dropdownPresets.selection.text;

        // ----- bleed -----
        var bleedInches = 0;
        var bleedMode = "none";
        if (rbBleed125.value) {
            bleedInches = 0.125;
            bleedMode = "125";
        } else if (rbBleedCustom.value) {
            bleedMode = "custom";
            bleedInches = parseFloat(txtBleed.text);
            if (isNaN(bleedInches) || bleedInches < 0) {
                styledAlert("The custom bleed must be a number in inches, for example 0.25.");
                return;
            }
        }
        var bleedPts = bleedInches * 72;

        // Fully independent of the warning tolerance above: its own
        // amount, usable regardless of what the warning is set to.
        var pdfBleedInches = 0;
        if (chkPdfBleed.value) {
            pdfBleedInches = parseFloat(txtPdfBleed.text);
            if (isNaN(pdfBleedInches) || pdfBleedInches < 0) {
                styledAlert("The PDF bleed must be a number in inches, for example 0.125.");
                return;
            }
        }
        var pdfBleedPts = pdfBleedInches * 72;
        var usePdfBleed = chkPdfBleed.value && pdfBleedPts > 0;
        var useTrimMarks = chkTrimMarks.value, useRegMarks = chkRegMarks.value;
        // Adds the marks to a PDF save options object (PDF only)
        function addPdfMarks(o) {
            if (useTrimMarks) {
                try { o.trimMarks = true; } catch (eTm) {}
                try { o.trimMarkWeight = PDFTrimMarkWeight.TRIMMARKWEIGHT025; } catch (eTw) {}
            }
            if (useRegMarks) { try { o.registrationMarks = true; } catch (eRm) {} }
        }

        // ----- artboard selection -----
        var abIndices = [];
        if (rbAbSel.value) {
            var abSel = listAb.selection;
            if (!abSel) {
                styledAlert("No artboard is picked. Pick one or more in the list, or choose \"All artboards\".");
                return;
            }
            var abSelArr = (abSel instanceof Array) ? abSel : [abSel];
            for (var si = 0; si < abSelArr.length; si++) abIndices.push(abSelArr[si].index);
            abIndices.sort(function (a, b) { return a - b; });
        } else {
            for (var ai = 0; ai < doc.artboards.length; ai++) abIndices.push(ai);
        }
        var total = abIndices.length;

        var includeArtboardName = chkIncludeArtboardName.value;
        var folderMode = dropdownFolderMode.selection ? dropdownFolderMode.selection.index : 0;
        // 0 = no subfolders, 1 = per artboard, 2 = per file type

        var combinedMode = chkCombined.value || chkGrouped.value;
        var groupedSuffix = chkGrouped.value ? "_grouped" : "";

        if (!combinedMode && !includeArtboardName && total > 1) {
            var proceedAnyway = styledConfirm(
                "Artboard names are OFF and " + total + " artboards will be exported.\n\n" +
                "Every exported file will share the same name and will overwrite each other \u2014 " +
                "only the last artboard's files will remain.\n\nContinue anyway?",
                "Filename Collision Warning"
            );
            if (!proceedAnyway) return;
        }

        // Duplicate artboard names (Illustrator allows this) produce the
        // same collision even with the toggle ON, so check separately.
        if (!combinedMode && includeArtboardName) {
            var abNameCounts = {};
            var abDupes = [];
            for (var da = 0; da < total; da++) {
                var dupNm = cleanAbName(doc.artboards[abIndices[da]].name, abIndices[da]);
                if (abNameCounts[dupNm]) {
                    abNameCounts[dupNm]++;
                    if (abNameCounts[dupNm] === 2) abDupes.push(dupNm);
                } else {
                    abNameCounts[dupNm] = 1;
                }
            }
            if (abDupes.length > 0) {
                var proceedDupe = styledConfirm(
                    "Some artboards share the same name after cleanup:\n\n" + abDupes.join(", ") +
                    "\n\nFiles for these artboards will overwrite each other during export.\n\nContinue anyway?",
                    "Duplicate Artboard Names"
                );
                if (!proceedDupe) return;
            }
        }

        // ----- save preferences (only after validation passed) -----
        writePref("LastPDFPreset", presetName);
        writePref("RememberSettings", chkRemember.value ? "1" : "0");
        if (chkRemember.value) {
            writePref("SaveAi", chkSaveAi.value ? "1" : "0");
            writePref("SaveEps", chkSaveEps.value ? "1" : "0");
            writePref("SavePng", chkSavePng.value ? "1" : "0");
            writePref("SaveSvg", chkSaveSvg.value ? "1" : "0");
            writePref("NoOpen", chkDisableView.value ? "1" : "0");
            writePref("IncludeAbName", chkIncludeArtboardName.value ? "1" : "0");
            writePref("PdfBleed", chkPdfBleed.value ? "1" : "0");
            writePref("TrimMarks", chkTrimMarks.value ? "1" : "0");
            writePref("RegMarks", chkRegMarks.value ? "1" : "0");
            writePref("OpenFolder", chkOpenFolder.value ? "1" : "0");
            writePref("Combined", chkCombined.value ? "1" : "0");
            writePref("Grouped", chkGrouped.value ? "1" : "0");
            writePref("FolderMode", folderMode);
            writePref("BleedMode", bleedMode);
            writePref("BleedCustom", txtBleed.text);
            writePref("PdfBleedCustom", txtPdfBleed.text);
        }
        if (ddClient.selection) writePref("Client", ddClient.selection.text);
        writePref("RememberFolder", chkRememberFolder.value ? "1" : "0");
        if (chkRememberFolder.value) writePref("OutputFolder", destFolder.fsName);

        var customNameInput = sanitizeName(txtCustomName.text);
        var saveAi = chkSaveAi.value;
        var saveEps = chkSaveEps.value;
        var savePng = chkSavePng.value;
        var saveSvg = chkSaveSvg.value;
        var preventOpening = chkDisableView.value;
        var preserveEdit = chkPreserveEdit.value;
        var aiPdfCompatible = chkAiPdfCompatible.value;
        var openFolderWhenDone = chkOpenFolder.value;
        var exportedCount = 0;
        var curStep = "";   // what the export was doing (shown if an error stops it)
        var cancelRequested = false;

        try { win.close(); } catch (eWc) {}   // (the simple window runs this without showing this window)

        // Lightweight progress palette. Uses a text-drawn bar instead of
        // ScriptUI's native progressbar, which renders as solid black and
        // never visibly fills under Illustrator's dark UI theme.
        var PROG_BAR_SEGMENTS = 24;
        var progWin = new Window("palette", "Exporting\u2026");
        progWin.orientation = "column";
        progWin.alignChildren = ["fill", "top"];
        progWin.margins = 16;
        progWin.spacing = 10;
        var progStatus = progWin.add("statictext", undefined, "Preparing\u2026");
        progStatus.preferredSize.width = 380;
        progStatus.justify = "center";
        // Native progress bar (same as Standardize PDFs). If it can't be created,
        // fall back to the old text-drawn bar.
        var progBar = null, progBarText = null;
        try {
            progBar = progWin.add("progressbar", undefined, 0, Math.max(total, 1));
            progBar.preferredSize.width = 380;
        } catch (eNative) {
            progBar = null;
            progBarText = progWin.add("statictext", undefined, "");
            progBarText.preferredSize.width = 380;
            progBarText.justify = "center";
        }
        var btnProgCancel = progWin.add("button", undefined, "Cancel");
        btnProgCancel.alignment = ["center", "top"];
        // Stops between artboards, not mid-artboard. Illustrator may not
        // register the click while it is busy inside an artboard.
        btnProgCancel.onClick = function () {
            cancelRequested = true;
            try {
                btnProgCancel.enabled = false;
                progStatus.text = "Cancelling after the current artboard\u2026";
                progWin.update();
            } catch (eCancel) {}
        };
        progWin.show();

        // Pumps the UI so a queued Cancel click gets noticed sooner during
        // the slower combined-mode steps, instead of only being picked up
        // once an entire artboard finishes. Doesn't stop anything by
        // itself - it just gives Illustrator a chance to run the button's
        // onClick handler, which sets cancelRequested for the next check.
        // Speed (3.1): the progress window refreshes every call, but the
        // (slow) Illustrator redraw runs at most once per second.
        var lastRedrawMs = 0;
        function pumpUI() {
            try { progWin.update(); } catch (ePump) {}
            try {
                var nowMs = new Date().getTime();
                if (nowMs - lastRedrawMs > 1000) { app.redraw(); lastRedrawMs = new Date().getTime(); }
            } catch (ePump2) {}
        }

        function updateProgress(current, label) {
            try {
                var pct = total > 0 ? Math.round((Math.min(current, total) / total) * 100) : 0;
                progStatus.text = "Exporting " + current + " of " + total + " (" + pct + "%): " + label;
                if (progBar) {
                    progBar.value = Math.min(current, total);
                    // Illustrator is busy between artboards, so the native bar often
                    // doesn't repaint on its own. Hiding/showing it forces a redraw.
                    try { progBar.visible = false; progBar.visible = true; } catch (eVis) {}
                    try { progWin.layout.layout(true); } catch (eLay) {}
                } else if (progBarText) {
                    var filled = Math.round((current / total) * PROG_BAR_SEGMENTS);
                    if (filled > PROG_BAR_SEGMENTS) filled = PROG_BAR_SEGMENTS;
                    var bar = "";
                    for (var bs = 0; bs < PROG_BAR_SEGMENTS; bs++) {
                        bar += (bs < filled) ? "\u25A0" : "\u25A1";
                    }
                    progBarText.text = bar;
                }
                progWin.update();
                app.redraw();
            } catch (eProg) {}
        }

        function getOrCreateFolder(parentFolder, name) {
            var f = new Folder(parentFolder.fsName + "/" + name);
            if (!f.exists) f.create();
            return f;
        }

        var originalFile = new File(originalFilePath);
        var prevInteractionLevel = app.userInteractionLevel;
        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

        function fastUnlock(layers) {
            var len = layers.length;
            for (var L = 0; L < len; L++) {
                var layer = layers[L];
                if (layer.locked) layer.locked = false;
                if (!layer.visible) layer.visible = true;
                if (layer.layers.length > 0) fastUnlock(layer.layers);
            }
        }

        // Combined mode only (AI/EPS side): deletes every item that
        // doesn't overlap ANY of the given target artboard rects, walking
        // layers directly - no selection commands involved at all, so
        // there's nothing for a menu command's own quirks to get wrong.
        // Each item's true bounds (see getTrueBounds, below) are checked
        // against every target rect directly; an item is kept the moment
        // it overlaps just one of them. Guides and other items with no
        // real bounds are left alone either way, same as elsewhere in
        // this script. Layer names/structure are never touched.
        function stripToTargets(layers, targetRects) {
            for (var sl2 = 0; sl2 < layers.length; sl2++) {
                var sLayer = layers[sl2];
                var sItems = sLayer.pageItems;
                for (var si3 = sItems.length - 1; si3 >= 0; si3--) {
                    var sBounds = getTrueBounds(sItems[si3]);
                    if (!sBounds) continue;
                    var sKeep = false;
                    for (var st = 0; st < targetRects.length; st++) {
                        var sr = targetRects[st];
                        var sOutside = (sBounds[2] < sr[0] - BLEED_EPSILON || sBounds[0] > sr[2] + BLEED_EPSILON ||
                                        sBounds[1] < sr[3] - BLEED_EPSILON || sBounds[3] > sr[1] + BLEED_EPSILON);
                        if (!sOutside) { sKeep = true; break; }
                    }
                    if (!sKeep) {
                        try { sItems[si3].remove(); } catch (eStrip) {}
                    }
                }
                if (sLayer.layers.length > 0) stripToTargets(sLayer.layers, targetRects);
            }
        }

        var layerCleanupFailures = [];
        function removeEmptyLayers(layers) {
            for (var l = layers.length - 1; l >= 0; l--) {
                var currentLayer = layers[l];
                if (currentLayer.layers.length > 0) {
                    removeEmptyLayers(currentLayer.layers);
                }
                if (currentLayer.pageItems.length === 0 && currentLayer.layers.length === 0) {
                    try { currentLayer.remove(); } catch (e) {
                        // Remember which layers refused to go so the final
                        // message can say so instead of hiding it
                        try { layerCleanupFailures.push(currentLayer.name); } catch (e2) {}
                    }
                }
            }
        }

        // True bounds of an item, respecting clipping masks. A clipped
        // group's own geometricBounds ignores the mask and reports the
        // full extent of whatever is inside it (e.g. an oversized image
        // clipped down to a small shape) - that would produce false
        // bleed warnings, so clipped groups use the clip path's own
        // bounds instead.
        function getTrueBounds(item) {
            if (!item || item.hidden) return null;
            if (item.typename === "PathItem" && item.guides) return null;

            if (item.typename === "GroupItem") {
                if (item.clipped) {
                    for (var c = 0; c < item.pageItems.length; c++) {
                        var pi = item.pageItems[c];
                        if (pi.typename === "PathItem" && pi.clipping) {
                            return pi.geometricBounds;
                        }
                        if (pi.typename === "CompoundPathItem" &&
                            pi.pathItems.length > 0 && pi.pathItems[0].clipping) {
                            return pi.geometricBounds;
                        }
                    }
                }
                var u = null;
                for (var g = 0; g < item.pageItems.length; g++) {
                    var cb = getTrueBounds(item.pageItems[g]);
                    if (!cb) continue;
                    if (!u) {
                        u = [cb[0], cb[1], cb[2], cb[3]];
                    } else {
                        if (cb[0] < u[0]) u[0] = cb[0];
                        if (cb[1] > u[1]) u[1] = cb[1];
                        if (cb[2] > u[2]) u[2] = cb[2];
                        if (cb[3] < u[3]) u[3] = cb[3];
                    }
                }
                return u;
            }
            return item.geometricBounds;
        }

        // A clip path's geometricBounds and the artboard's own artboardRect
        // can disagree by a razor-thin amount (seen: ~1e-12pt) even when
        // they're meant to be the exact same edge - a floating-point
        // rounding quirk, worse on Large Canvas docs. BLEED_EPSILON (0.05pt)
        // absorbs that noise without masking any real overhang.
        var BLEED_EPSILON = 0.05;

        // One pass over each layer's TOP-LEVEL items (getTrueBounds handles
        // everything nested inside them, clipped or not). Fills res with:
        //   total    - items that have visible bounds
        //   outside  - items entirely outside the artboard (isolation
        //              should have deleted these, so this means it failed)
        //   overhang - items that cross the artboard edge by more than
        //              the bleed zone (bleedRect)
        // rects are [left, top, right, bottom].
        function analyzeIsolation(layers, abRect, bleedRect, res) {
            for (var la = 0; la < layers.length; la++) {
                var layer = layers[la];
                var items = layer.pageItems;
                for (var b = 0; b < items.length; b++) {
                    var tb = getTrueBounds(items[b]);
                    if (!tb) continue;
                    res.total++;
                    var overlaps = !(tb[2] < abRect[0] - BLEED_EPSILON || tb[0] > abRect[2] + BLEED_EPSILON ||
                                     tb[1] < abRect[3] - BLEED_EPSILON || tb[3] > abRect[1] + BLEED_EPSILON);
                    if (!overlaps) { res.outside++; continue; }
                    var insideBleed = (tb[0] >= bleedRect[0] - BLEED_EPSILON && tb[2] <= bleedRect[2] + BLEED_EPSILON &&
                                       tb[1] <= bleedRect[1] + BLEED_EPSILON && tb[3] >= bleedRect[3] - BLEED_EPSILON);
                    if (!insideBleed) res.overhang++;
                }
                if (layer.layers.length > 0) analyzeIsolation(layer.layers, abRect, bleedRect, res);
            }
        }

        // Combined mode only: same idea as analyzeIsolation, but for use
        // BEFORE anything has been stripped out of the shared document -
        // it only counts items that actually overlap this one artboard in
        // the first place, ignoring everything else in the file entirely.
        // analyzeIsolation can't be reused here as-is: it counts every
        // item it's given as "total" and treats non-overlapping ones as an
        // isolation failure, which is the wrong question to ask against a
        // document that hasn't been isolated yet - virtually everything in
        // the file would look "outside" and "empty" would never fire
        // correctly.
        function analyzeCombinedArtboard(layers, rawRect, bleedRect, res) {
            for (var la2 = 0; la2 < layers.length; la2++) {
                var layer2 = layers[la2];
                var items2 = layer2.pageItems;
                for (var b2 = 0; b2 < items2.length; b2++) {
                    var tb2 = getTrueBounds(items2[b2]);
                    if (!tb2) continue;
                    var overlaps2 = !(tb2[2] < rawRect[0] - BLEED_EPSILON || tb2[0] > rawRect[2] + BLEED_EPSILON ||
                                      tb2[1] < rawRect[3] - BLEED_EPSILON || tb2[3] > rawRect[1] + BLEED_EPSILON);
                    if (!overlaps2) continue;
                    res.total++;
                    var insideBleed2 = (tb2[0] >= bleedRect[0] - BLEED_EPSILON && tb2[2] <= bleedRect[2] + BLEED_EPSILON &&
                                        tb2[1] <= bleedRect[1] + BLEED_EPSILON && tb2[3] >= bleedRect[3] - BLEED_EPSILON);
                    if (!insideBleed2) res.overhang++;
                }
                if (layer2.layers.length > 0) analyzeCombinedArtboard(layer2.layers, rawRect, bleedRect, res);
            }
        }

        // ---------- PNG / SVG (one artboard per document) ----------
        var PNG_PPI = 300;
        var PNG_MAX_PX = 16000;
        var pngWritten = 0, svgWritten = 0;
        var pngReduced = [];
        var extraFailures = [];
        var largeCanvasSeen = false;

        function exportExtras(d, baseName, pngFolder, svgFolder, label) {
            if (savePng) {
                try {
                    var sf = 1;
                    try { sf = d.scaleFactor; if (!sf || sf <= 0) sf = 1; } catch (eSf) { sf = 1; }
                    if (sf !== 1) largeCanvasSeen = true;
                    var abR = d.artboards[0].artboardRect;
                    var wDoc = abR[2] - abR[0];
                    var hDoc = abR[1] - abR[3];
                    var scale = (PNG_PPI / 72) * 100;
                    var effPpi = PNG_PPI;
                    var maxPx = Math.max(wDoc, hDoc) * sf * scale / 100;
                    if (maxPx > PNG_MAX_PX) {
                        scale = scale * PNG_MAX_PX / maxPx;
                        effPpi = Math.round(scale / 100 * 72);
                    }
                    var po = new ExportOptionsPNG24();
                    po.antiAliasing = true;
                    po.artBoardClipping = true;
                    po.transparency = true;
                    po.horizontalScale = scale;
                    po.verticalScale = scale;
                    d.exportFile(new File(pngFolder.fsName + "/" + baseName + ".png"), ExportType.PNG24, po);
                    pngWritten++;
                    if (effPpi < PNG_PPI) pngReduced.push(label + " (about " + effPpi + " ppi)");
                } catch (ePng) {
                    extraFailures.push("PNG: " + label);
                }
            }
            if (saveSvg) {
                try {
                    var so = new ExportOptionsSVG();
                    try { so.DTD = SVGDTDVersion.SVG1_1; } catch (e1) {}
                    try { so.cssProperties = SVGCSSPropertyLocation.PRESENTATIONATTRIBUTES; } catch (e2) {}
                    try { so.documentEncoding = SVGDocumentEncoding.UTF8; } catch (e3) {}
                    try { so.fontType = SVGFontType.OUTLINEFONT; } catch (e4) {}
                    try { so.embedRasterImages = true; } catch (e5) {}
                    try { so.coordinatePrecision = 3; } catch (e6) {}
                    try { so.compressed = false; } catch (e7) {}
                    try { so.includeFileInfo = false; } catch (e8) {}
                    try { so.includeUnusedStyles = false; } catch (e9) {}
                    try { so.includeVariablesAndDatasets = false; } catch (e10) {}
                    try { so.preserveEditability = false; } catch (e11) {}
                    try { so.optimizeForSVGViewer = false; } catch (e12) {}
                    d.exportFile(new File(svgFolder.fsName + "/" + baseName + ".svg"), ExportType.SVG, so);
                    svgWritten++;
                } catch (eSvg) {
                    extraFailures.push("SVG: " + label);
                }
            }
        }

        // Declared outside the try so the error handler can clean them up.
        // Documents are tracked by reference (not by name): after saveAs
        // Illustrator renames the document, so a name check misses it.
        var masterTempFile = null;
        var tempAiFile = null;
        var masterDoc = null;
        var tempDoc = null;
        var mergedTempFile = null;
        var mergedDoc = null;

        // Temporary build files go to the Windows Temp folder (not the output folder: OneDrive sync and
        // leftovers there kept the folder "in use"). useTempFolder turns false only if Illustrator will not
        // open the copy from Temp.
        var useTempFolder = true;
        function tmpFile(name) {
            return new File((useTempFolder ? (Folder.temp.fsName + "/__epf_") : (destFolder.fsName + "/")) + name);
        }
        // Closes and deletes the temp files a run that was interrupted may have left behind
        var STALE_RX = /^(__epf_)?(_master_temp_build|_combined_(pdf|content|extra)_build|_temp_\d+)\.ai$/i;
        function removeStaleTemps() {
            try {
                for (var sd = app.documents.length - 1; sd >= 0; sd--) {
                    try {
                        var sdName = app.documents[sd].fullName.name;
                        if (STALE_RX.test(decodeURI(sdName))) app.documents[sd].close(SaveOptions.DONOTSAVECHANGES);
                    } catch (eSd) {}
                }
            } catch (eSd2) {}
            try { app.activeDocument = doc; } catch (eSd3) {}
            var folders = [destFolder, Folder.temp];
            for (var sf = 0; sf < folders.length; sf++) {
                try {
                    var found = folders[sf].getFiles(function (ff) { return (ff instanceof File) && STALE_RX.test(decodeURI(ff.name)); });
                    for (var sx = 0; sx < found.length; sx++) { try { found[sx].remove(); } catch (eSr) {} }
                } catch (eSf) {}
            }
        }

        function cleanupTempFiles() {
            try { if (tempDoc) tempDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eC1) {}
            tempDoc = null;
            try { if (masterDoc) masterDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eC2) {}
            masterDoc = null;
            try { if (mergedDoc) mergedDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eC2b) {}
            mergedDoc = null;
            try { app.activeDocument = doc; } catch (eC3) {}
            try { if (tempAiFile && tempAiFile.exists) tempAiFile.remove(); } catch (eC4) {}
            try { if (masterTempFile && masterTempFile.exists) masterTempFile.remove(); } catch (eC5) {}
            try { if (mergedTempFile && mergedTempFile.exists) mergedTempFile.remove(); } catch (eC6) {}
            // Also force this off in case an older build of this script
            // (or anything else) left it on - the current combined-mode
            // build no longer uses it at all, see the merge step below.
            try { app.pasteRemembersLayers = false; } catch (eC7) {}
        }

        try {
            removeStaleTemps();
            masterTempFile = tmpFile("_master_temp_build.ai");
            originalFile.copy(masterTempFile);
            try {
                masterDoc = app.open(masterTempFile);
            } catch (eMo) {
                // Illustrator would not open the copy from the Temp folder: use the output folder like before
                try { if (masterTempFile.exists) masterTempFile.remove(); } catch (eMr) {}
                useTempFolder = false;
                masterTempFile = tmpFile("_master_temp_build.ai");
                originalFile.copy(masterTempFile);
                masterDoc = app.open(masterTempFile);
            }

            fastUnlock(masterDoc.layers);
            try { app.executeMenuCommand('unlockAll'); } catch (e) {}
            try { app.executeMenuCommand('showAll'); } catch (e) {}

            try {
                var tFrames = masterDoc.textFrames;
                if (tFrames.length > 0) {
                    for (var t = tFrames.length - 1; t >= 0; t--) {
                        try { tFrames[t].createOutline(); } catch (e) {}
                    }
                }
            } catch (e) {}

            // Embed every linked file (PDF and AI saveAs have no
            // "embed links" flag - the only way to guarantee no
            // missing-link references is to embed them in the doc
            // itself, once, here, before any per-artboard copies
            // are made. EPS also gets its own embedLinkedFiles flag
            // below as a second layer of safety.
            var linkEmbedFailures = [];
            var bleedFailures = [];      // art crosses the edge past the bleed zone
            var isolationFailures = [];  // art left entirely outside the artboard
            var emptyArtboards = [];     // nothing left on the artboard
            var skippedAiOverwrites = []; // .ai save declined at the overwrite pop-up

            // Pop-up confirmation right before a .ai save that would land on
            // the exact same path as the file currently open. aiFile is
            // already a File object (built the same way the real save target
            // is), so its .fsName is OS-normalized the same way
            // originalFilePath is - no manual path-joining here, so no
            // separator mismatch to worry about. app.userInteractionLevel is
            // DONTDISPLAYALERTS for the whole export (so Illustrator's own
            // warnings don't interrupt a batch) - that also affects
            // ExtendScript's own confirm()/alert(), so it's restored just
            // long enough to show this one, then put back.
            function confirmAiOverwrite(aiFile) {
                try {
                    if (aiFile.fsName.toLowerCase() !== originalFilePath.toLowerCase()) return true;
                } catch (eCmp) { return true; }
                var levelBefore = app.userInteractionLevel;
                app.userInteractionLevel = UserInteractionLevel.DISPLAYALERTS;
                var proceed = styledConfirm(
                    "This will overwrite your original file:\n" + aiFile.fsName + "\n\nContinue?",
                    "Overwrite Original File?"
                );
                app.userInteractionLevel = levelBefore;
                return proceed;
            }
            var pdfBleedFailed = false;
            try {
                var placed = masterDoc.placedItems;
                for (var pI = placed.length - 1; pI >= 0; pI--) {
                    try { placed[pI].embed(); }
                    catch (eEmbed) {
                        try { linkEmbedFailures.push(placed[pI].name); } catch (eN) {}
                    }
                }
            } catch (ePlaced) {}

            // The master is only a temporary working file (deleted after the export), so it
            // is saved without the PDF-compatible data, which is the slow part of a normal
            // save. Falls back to the normal save if that fails. Everything delivered is
            // saved later with its own options.
            try {
                var masterSaveOpts = new IllustratorSaveOptions();
                masterSaveOpts.pdfCompatible = false;
                masterDoc.saveAs(masterTempFile, masterSaveOpts);
            } catch (eMs) {
                masterDoc.save();
            }
            masterDoc.close(SaveOptions.DONOTSAVECHANGES);
            masterDoc = null;

            var combinedBaseName = "";
            var combinedFilesWritten = [];

            if (combinedMode) {
                // ---------- combined build, rewritten: no isolation, no ----------
                // per-artboard temp copies, no merging content between
                // documents. See the header note for why the previous
                // approach (build a shared document, copy each artboard's
                // isolated content into it one at a time) kept leaking
                // content from other artboards - four different fixes
                // aimed at that mechanism all failed, which was the sign
                // to stop patching it and remove it instead.
                // Uses the Custom File Name field when one was entered,
                // same trimming normal mode applies - falls back to the
                // document's own name only when the field is left blank.
                combinedBaseName = customNameInput.replace(/[\s.]+$/, '');
                if (combinedBaseName === "") combinedBaseName = cleanDocName;
                combinedBaseName += groupedSuffix;

                function isSelectedArtboardIndex(idx) {
                    for (var sia = 0; sia < abIndices.length; sia++) {
                        if (abIndices[sia] === idx) return true;
                    }
                    return false;
                }

                var pdfDestFolderC = (folderMode === 2) ? getOrCreateFolder(destFolder, "PDF") : destFolder;
                var aiDestFolderC = (folderMode === 2) ? getOrCreateFolder(destFolder, "AI") : destFolder;
                var epsDestFolderC = (folderMode === 2) ? getOrCreateFolder(destFolder, "EPS") : destFolder;

                // ---- PDF: Illustrator's own multi-artboard save, directly ----
                // on a prepared (but otherwise untouched) copy of the whole
                // document. Its own artboardRange can take a comma-separated
                // list of specific artboards, not just a contiguous range,
                // and each resulting page only ever shows what's actually
                // inside that artboard's own box - the same mechanism normal
                // mode's own single-artboard PDF export already relies on.
                // No isolation step needed here at all.
                if (!cancelRequested) {
                    updateProgress(1, "combined PDF");
                    mergedTempFile = tmpFile("_combined_pdf_build.ai");
                    masterTempFile.copy(mergedTempFile);
                    mergedDoc = app.open(mergedTempFile);

                    var pdfRangeParts = [];
                    for (var pr = 0; pr < total; pr++) pdfRangeParts.push(abIndices[pr] + 1);

                    var pdfTargetFileC = new File(pdfDestFolderC.fsName + "/" + combinedBaseName + ".pdf");
                    var pdfSaveOptsC = new PDFSaveOptions();
                    pdfSaveOptsC.pDFPreset = presetName;
                    pdfSaveOptsC.preserveEditability = preserveEdit;
                    pdfSaveOptsC.acrobatLayers = true;
                    pdfSaveOptsC.compatibility = PDFCompatibility.ACROBAT7;
                    pdfSaveOptsC.artboardRange = pdfRangeParts.join(",");
                    pdfSaveOptsC.viewAfterSaving = !preventOpening;
                    if (usePdfBleed) {
                        try { pdfSaveOptsC.bleedLink = true; } catch (eBLc) {}
                        try {
                            pdfSaveOptsC.bleedOffsetRect = [pdfBleedPts, pdfBleedPts, pdfBleedPts, pdfBleedPts];
                        } catch (eBRc) { pdfBleedFailed = true; }
                    }
                    addPdfMarks(pdfSaveOptsC);
                    mergedDoc.saveAs(pdfTargetFileC, pdfSaveOptsC);
                    combinedFilesWritten.push(combinedBaseName + ".pdf");

                    mergedDoc.close(SaveOptions.DONOTSAVECHANGES);
                    mergedDoc = null;
                    mergedTempFile.remove();
                    mergedTempFile = null;
                }

                // ---- AI / EPS: these two formats have no "just these ----
                // artboards" option (an .ai file always holds the whole
                // document; an .eps is always one flattened page of
                // whatever the document contains), so this is the one
                // place content still needs to be stripped down. Done once,
                // directly, on a single document: delete every item that
                // doesn't overlap ANY selected artboard, then remove the
                // artboards that weren't picked. No selection commands
                // involved in the deletion - each item's own true bounds
                // are checked directly, so there's nothing for a menu
                // command's quirks to get wrong.
                if (!cancelRequested) {
                    updateProgress(total, "combined AI/EPS");
                    mergedTempFile = tmpFile("_combined_content_build.ai");
                    masterTempFile.copy(mergedTempFile);
                    mergedDoc = app.open(mergedTempFile);

                    // Expanded by the chosen bleed amount (same value used
                    // for the overhang warning below) - not just the bare
                    // artboard box - so art that intentionally sits in the
                    // bleed zone, and doesn't happen to touch the artboard's
                    // own edge, isn't mistaken for stray content and
                    // stripped out.
                    var targetRects = [];
                    for (var tr = 0; tr < total; tr++) {
                        var rawTarget = mergedDoc.artboards[abIndices[tr]].artboardRect;
                        targetRects.push([
                            rawTarget[0] - bleedPts,
                            rawTarget[1] + bleedPts,
                            rawTarget[2] + bleedPts,
                            rawTarget[3] - bleedPts
                        ]);
                    }

                    // Bleed/isolation warnings per selected artboard,
                    // before anything gets deleted - same checks normal
                    // mode already runs, just against this one document.
                    for (var wa = 0; wa < total; wa++) {
                        try {
                            var wIdx = abIndices[wa];
                            var wName = cleanAbName(doc.artboards[wIdx].name, wIdx);
                            var wRaw = mergedDoc.artboards[wIdx].artboardRect;
                            var wBleedRect = [
                                wRaw[0] - bleedPts, wRaw[1] + bleedPts,
                                wRaw[2] + bleedPts, wRaw[3] - bleedPts
                            ];
                            var wAnalysis = { total: 0, outside: 0, overhang: 0 };
                            analyzeCombinedArtboard(mergedDoc.layers, wRaw, wBleedRect, wAnalysis);
                            if (wAnalysis.overhang > 0) bleedFailures.push(wName);
                            if (wAnalysis.total === 0) emptyArtboards.push(wName);
                        } catch (eW) {}
                    }

                    stripToTargets(mergedDoc.layers, targetRects);
                    removeEmptyLayers(mergedDoc.layers);

                    // Remove every artboard that wasn't selected. The ones
                    // that remain keep their original name and position -
                    // neither was ever touched.
                    for (var ra4 = mergedDoc.artboards.length - 1; ra4 >= 0; ra4--) {
                        if (!isSelectedArtboardIndex(ra4)) {
                            try { mergedDoc.artboards[ra4].remove(); } catch (eRa4) {}
                        }
                    }

                    if (saveAi) {
                        var aiTargetFileC = new File(aiDestFolderC.fsName + "/" + combinedBaseName + ".ai");
                        if (confirmAiOverwrite(aiTargetFileC)) {
                            var aiSaveOptsC = new IllustratorSaveOptions();
                            aiSaveOptsC.pdfCompatible = aiPdfCompatible;
                            mergedDoc.saveAs(aiTargetFileC, aiSaveOptsC);
                            combinedFilesWritten.push(combinedBaseName + ".ai");
                        } else {
                            skippedAiOverwrites.push(combinedBaseName);
                        }
                    }

                    if (saveEps) {
                        var epsTargetFileC = new File(epsDestFolderC.fsName + "/" + combinedBaseName + ".eps");
                        var epsSaveOptsC = new EPSSaveOptions();
                        epsSaveOptsC.cmykPostScript = (mergedDoc.documentColorSpace === DocumentColorSpace.CMYK);
                        epsSaveOptsC.embedAllFonts = false;
                        epsSaveOptsC.preview = EPSPreview.COLORTIFF;
                        try { epsSaveOptsC.postScript = PostScriptLevelEnum.LEVEL3; } catch (ePSc) {}
                        try { epsSaveOptsC.compatibleGradientPrinting = true; } catch (eGPc) {}
                        try { epsSaveOptsC.embedLinkedFiles = true; } catch (eELc) {}
                        mergedDoc.saveAs(epsTargetFileC, epsSaveOptsC);
                        combinedFilesWritten.push(combinedBaseName + ".eps");
                    }

                    mergedDoc.close(SaveOptions.DONOTSAVECHANGES);
                    mergedDoc = null;
                    mergedTempFile.remove();
                    mergedTempFile = null;
                }

                // ---- PNG / SVG: one file per selected artboard. Same direct ----
                // stripping used for AI / EPS above, done once per artboard on
                // a fresh copy, then that copy is cut down to one artboard.
                if (!cancelRequested && (savePng || saveSvg)) {
                    var pngDestC = (folderMode === 2) ? getOrCreateFolder(destFolder, "PNG") : destFolder;
                    var svgDestC = (folderMode === 2) ? getOrCreateFolder(destFolder, "SVG") : destFolder;
                    var exPrefix = (customNameInput !== "") ? customNameInput : (cleanDocName + " ");
                    for (var ex = 0; ex < total; ex++) {
                        if (cancelRequested) break;
                        var exIdx = abIndices[ex];
                        var exName = cleanAbName(doc.artboards[exIdx].name, exIdx);
                        updateProgress(total, "PNG / SVG " + exName);
                        mergedTempFile = tmpFile("_combined_extra_build.ai");
                        masterTempFile.copy(mergedTempFile);
                        mergedDoc = app.open(mergedTempFile);
                        var exRaw = mergedDoc.artboards[exIdx].artboardRect;
                        stripToTargets(mergedDoc.layers, [[exRaw[0] - bleedPts, exRaw[1] + bleedPts, exRaw[2] + bleedPts, exRaw[3] - bleedPts]]);
                        removeEmptyLayers(mergedDoc.layers);
                        for (var exr = mergedDoc.artboards.length - 1; exr >= 0; exr--) {
                            if (exr !== exIdx) {
                                try { mergedDoc.artboards[exr].remove(); } catch (eExr) {}
                            }
                        }
                        var exBase = (exPrefix + exName).replace(/[\s.]+$/, '');
                        if (exBase === "") exBase = exName;
                        exportExtras(mergedDoc, exBase, pngDestC, svgDestC, exName);
                        mergedDoc.close(SaveOptions.DONOTSAVECHANGES);
                        mergedDoc = null;
                        mergedTempFile.remove();
                        mergedTempFile = null;
                        pumpUI();
                    }
                }

                exportedCount = cancelRequested ? 0 : total;
            } else {
                // ---------- normal mode: one set of files per artboard ----------
                // Check the longest file path first (Windows limit is 260 characters)
                var MAX_PATH_LEN = 250;
                var longPaths = [];
                for (var pk = 0; pk < total; pk++) {
                    var pAbName = cleanAbName(doc.artboards[abIndices[pk]].name, abIndices[pk]);
                    var pPrefix = (customNameInput !== "") ? customNameInput : (cleanDocName + " ");
                    var pBase = includeArtboardName ? (pPrefix + pAbName) : pPrefix;
                    pBase = pBase.replace(/[\s.]+$/, '');
                    if (pBase === "") pBase = pAbName;
                    var pFolder = destFolder.fsName;
                    if (folderMode === 1) pFolder += "/" + pAbName;
                    else if (folderMode === 2) pFolder += "/" + "PNG";
                    var pLen = (pFolder + "/" + pBase + ".pdf").length;
                    if (pLen > MAX_PATH_LEN) longPaths.push(pAbName + " (" + pLen + " characters)");
                }
                if (longPaths.length > 0) {
                    var lpShow = longPaths.slice(0, 5).join("\n   ");
                    if (longPaths.length > 5) lpShow += "\n   ... and " + (longPaths.length - 5) + " more";
                    throw new Error("The file paths are too long for Windows (limit about 260 characters, checked at " + MAX_PATH_LEN + "). Nothing was exported.\n\n   " + lpShow +
                        "\n\nChoose a shorter output folder (for example C:\\Export) or shorten the file / artboard names.");
                }

                for (var k = 0; k < total; k++) {
                    if (cancelRequested) break;

                    var i = abIndices[k];
                    var abName = doc.artboards[i].name;
                    var cleanArtboardName = cleanAbName(abName, i);
                    updateProgress(k + 1, abName);

                    var prefix = (customNameInput !== "") ? customNameInput : (cleanDocName + " ");
                    var baseFileName = includeArtboardName
                        ? (prefix + cleanArtboardName)
                        : prefix;
                    baseFileName = baseFileName.replace(/[\s.]+$/, '');
                    if (baseFileName === "") baseFileName = cleanArtboardName;

                    // Per-artboard folder mode: everything for this sign goes
                    // into its own subfolder, named after the artboard itself
                    // (independent of the include-artboard-name toggle above).
                    var artboardDestFolder = destFolder;
                    if (folderMode === 1) {
                        artboardDestFolder = getOrCreateFolder(destFolder, cleanArtboardName);
                    }

                    tempAiFile = tmpFile("_temp_" + i + ".ai");
                    masterTempFile.copy(tempAiFile);

                    curStep = "Artboard \"" + cleanArtboardName + "\": opening the temporary copy";
                    tempDoc = app.open(tempAiFile);

                    tempDoc.selection = null;
                    tempDoc.artboards.setActiveArtboardIndex(i);

                    try {
                        app.executeMenuCommand('selectallinartboard');
                        app.executeMenuCommand('hide');
                        app.executeMenuCommand('selectall');
                        app.executeMenuCommand('clear');
                        app.executeMenuCommand('showAll');
                    } catch (e) {}

                    // Check what's left against this artboard's bounds. The
                    // bleed zone is expected art and won't get clipped by the
                    // RIP, so only genuine overhang past the bleed is flagged.
                    // Anything entirely outside the artboard, or an artboard
                    // with nothing left on it, means isolation went wrong.
                    try {
                        var rawBounds = tempDoc.artboards[i].artboardRect;
                        var bleedRect = [
                            rawBounds[0] - bleedPts, // left
                            rawBounds[1] + bleedPts, // top
                            rawBounds[2] + bleedPts, // right
                            rawBounds[3] - bleedPts  // bottom
                        ];
                        var analysis = { total: 0, outside: 0, overhang: 0 };
                        analyzeIsolation(tempDoc.layers, rawBounds, bleedRect, analysis);
                        if (analysis.overhang > 0) bleedFailures.push(cleanArtboardName);
                        if (analysis.outside > 0) isolationFailures.push(cleanArtboardName);
                        if (analysis.total === 0) emptyArtboards.push(cleanArtboardName);
                    } catch (eBleed) {}

                    removeEmptyLayers(tempDoc.layers);

                    var abCount = tempDoc.artboards.length;
                    for (var a = abCount - 1; a >= 0; a--) {
                        if (a !== i) {
                            try { tempDoc.artboards[a].remove(); } catch (e) {}
                        }
                    }

                    var pdfDestFolder = (folderMode === 2) ? getOrCreateFolder(destFolder, "PDF") : artboardDestFolder;
                    var pdfTargetFile = new File(pdfDestFolder.fsName + "/" + baseFileName + ".pdf");
                    var pdfSaveOpts = new PDFSaveOptions();
                    pdfSaveOpts.pDFPreset = presetName;
                    pdfSaveOpts.preserveEditability = preserveEdit;
                    pdfSaveOpts.acrobatLayers = true;
                    // ACROBAT7 (PDF 1.6) or higher - PDF's UserUnit key, which
                    // records a Large Canvas document's true 10x scale, isn't
                    // supported before PDF 1.6. With ACROBAT6, Acrobat and other
                    // spec-compliant readers showed the PDF 10x too small.
                    pdfSaveOpts.compatibility = PDFCompatibility.ACROBAT7;
                    pdfSaveOpts.artboardRange = "1";
                    pdfSaveOpts.viewAfterSaving = !preventOpening;
                    if (usePdfBleed) {
                        // PDF-only bleed: same amount on all four sides. Empty
                        // bleed area stays blank (no artwork is created).
                        try { pdfSaveOpts.bleedLink = true; } catch (eBL) {}
                        try {
                            pdfSaveOpts.bleedOffsetRect = [pdfBleedPts, pdfBleedPts, pdfBleedPts, pdfBleedPts];
                        } catch (eBR) { pdfBleedFailed = true; }
                    }

                    addPdfMarks(pdfSaveOpts);
                    curStep = "Artboard \"" + cleanArtboardName + "\": saving the PDF to " + pdfTargetFile.fsName + " (" + pdfTargetFile.fsName.length + " characters)";
                    tempDoc.saveAs(pdfTargetFile, pdfSaveOpts);
                    pumpUI();

                    if (saveAi) {
                        var aiDestFolder = (folderMode === 2) ? getOrCreateFolder(destFolder, "AI") : artboardDestFolder;
                        var aiTargetFile = new File(aiDestFolder.fsName + "/" + baseFileName + ".ai");
                        if (confirmAiOverwrite(aiTargetFile)) {
                            var aiSaveOpts = new IllustratorSaveOptions();
                            aiSaveOpts.pdfCompatible = aiPdfCompatible;
                            curStep = "Artboard \"" + cleanArtboardName + "\": saving the AI to " + aiTargetFile.fsName + " (" + aiTargetFile.fsName.length + " characters)";
                            tempDoc.saveAs(aiTargetFile, aiSaveOpts);
                            pumpUI();
                        } else {
                            skippedAiOverwrites.push(cleanArtboardName);
                        }
                    }

                    if (saveEps) {
                        var epsDestFolder = (folderMode === 2) ? getOrCreateFolder(destFolder, "EPS") : artboardDestFolder;
                        var epsTargetFile = new File(epsDestFolder.fsName + "/" + baseFileName + ".eps");
                        var epsSaveOpts = new EPSSaveOptions();
                        epsSaveOpts.cmykPostScript = (tempDoc.documentColorSpace === DocumentColorSpace.CMYK);
                        epsSaveOpts.embedAllFonts = false; // text is already outlined by this point
                        epsSaveOpts.preview = EPSPreview.COLORTIFF;
                        // compatibility intentionally left unset - Illustrator
                        // defaults to the current/modern format, same as a
                        // manual File > Save As. Hardcoding the legacy
                        // Compatibility.ILLUSTRATOR10 made EPS exports come
                        // out scaled down 10x on Large Canvas documents.
                        try { epsSaveOpts.postScript = PostScriptLevelEnum.LEVEL3; } catch (ePS) {}
                        try { epsSaveOpts.compatibleGradientPrinting = true; } catch (eGP) {}
                        try { epsSaveOpts.embedLinkedFiles = true; } catch (eEL) {}
                        curStep = "Artboard \"" + cleanArtboardName + "\": saving the EPS to " + epsTargetFile.fsName + " (" + epsTargetFile.fsName.length + " characters)";
                        tempDoc.saveAs(epsTargetFile, epsSaveOpts);
                    }

                    if (savePng || saveSvg) {
                        var pngDestFolder = (folderMode === 2) ? getOrCreateFolder(destFolder, "PNG") : artboardDestFolder;
                        var svgDestFolder = (folderMode === 2) ? getOrCreateFolder(destFolder, "SVG") : artboardDestFolder;
                        curStep = "Artboard \"" + cleanArtboardName + "\": exporting the PNG / SVG";
                        exportExtras(tempDoc, baseFileName, pngDestFolder, svgDestFolder, cleanArtboardName);
                        pumpUI();
                    }

                    tempDoc.close(SaveOptions.DONOTSAVECHANGES);
                    tempDoc = null;
                    tempAiFile.remove();
                    tempAiFile = null;

                    // Speed (3.1): garbage-collect every 5th artboard, not every one.
                    if ((exportedCount + 1) % 5 === 0) $.gc();

                    app.activeDocument = doc;
                    exportedCount++;
                }
            }

            try { masterTempFile.remove(); } catch (eMtr) {}
            masterTempFile = null;
            cleanupTempFiles();   // belt and braces: nothing may stay open or on disk after the export

            app.userInteractionLevel = prevInteractionLevel;
            try { app.activeDocument = doc; } catch (eAD) {}

            var doneHead, doneLines = [], doneSections = [];
            if (combinedMode) {
                if (cancelRequested) {
                    doneHead = "Cancelled.";
                    doneLines.push(exportedCount + " of " + total + " artboards merged before stopping.");
                } else if (combinedFilesWritten.length > 0) {
                    doneHead = "Done.";
                    doneLines.push(exportedCount + " artboard(s) combined into:");
                    for (var cf = 0; cf < combinedFilesWritten.length; cf++) doneLines.push(combinedFilesWritten[cf]);
                } else {
                    doneHead = "Nothing was exported.";
                }
            } else {
                if (cancelRequested) {
                    doneHead = "Cancelled.";
                    doneLines.push(exportedCount + " of " + total + " artboards exported before stopping.");
                } else {
                    doneHead = "Done.";
                    doneLines.push(exportedCount + " artboard" + (exportedCount === 1 ? "" : "s") + " exported.");
                }
            }
            if (pngWritten > 0) doneLines.push(pngWritten + " PNG file" + (pngWritten === 1 ? "" : "s") + " saved.");
            if (svgWritten > 0) doneLines.push(svgWritten + " SVG file" + (svgWritten === 1 ? "" : "s") + " saved.");
            if (pngReduced.length > 0) {
                doneSections.push({ title: "Note: PNG was scaled down (over " + PNG_MAX_PX + " px) for:", items: pngReduced });
            }
            if (extraFailures.length > 0) {
                doneSections.push({ title: "Warning: these PNG / SVG exports failed:", items: extraFailures });
            }
            if (largeCanvasSeen && (pngWritten > 0 || svgWritten > 0)) {
                doneLines.push("Note: Large Canvas file - check the PNG / SVG size.");
            }
            if (layerCleanupFailures.length > 0) {
                doneSections.push({ title: "Note: " + layerCleanupFailures.length + " empty layer(s) could not be removed during cleanup:", items: [layerCleanupFailures.join(", ")] });
            }
            if (linkEmbedFailures.length > 0) {
                doneSections.push({ title: "Note: " + linkEmbedFailures.length + " linked file(s) could not be embedded (likely still linked in the export):", items: linkEmbedFailures });
            }
            if (pdfBleedFailed) {
                doneLines.push("Note: the PDF bleed setting could not be applied by this version of Illustrator.");
            }
            if (skippedAiOverwrites.length > 0) {
                doneSections.push({ title: "Note: .ai save skipped (declined at the overwrite pop-up) for:", items: skippedAiOverwrites });
            }
            if (isolationFailures.length > 0) {
                doneSections.push({ title: "Warning: art was left outside the artboard, so isolation may have failed on:", items: isolationFailures.concat(["Check these PDFs against the source file."]) });
            }
            if (emptyArtboards.length > 0) {
                doneSections.push({ title: "Warning: nothing was left on these artboards after isolation (empty, or isolation failed):", items: emptyArtboards });
            }
            if (bleedFailures.length > 0) {
                doneSections.push({ title: "Warning: art extends past the artboard edge and may be clipped on:", items: bleedFailures });
            }
            try { progWin.close(); } catch (ePc1) {}
            if (openFolderWhenDone) {
                try { destFolder.execute(); } catch (eOpen) {}
            }
            if (cancelRequested) TSP_RESULT = "WARNING: " + TSP_NAME + ": cancelled after " + exportedCount + " of " + total + " artboards.";
            else if (doneHead === "Nothing was exported.") TSP_RESULT = "WARNING: " + TSP_NAME + ": nothing was exported.";
            else TSP_RESULT = "SUCCESS: " + TSP_NAME + ": done, " + exportedCount + " artboard" + (exportedCount === 1 ? "" : "s") + " exported.";
            showResultDialog(doneHead, doneLines, doneSections, destFolder.fsName);
        } catch (error) {
            app.userInteractionLevel = prevInteractionLevel;
            cleanupTempFiles();
            try { progWin.close(); } catch (ePc2) {}
            TSP_RESULT = "ERROR: " + TSP_NAME + ": " + error.message;
            styledAlert("The export stopped because of an error:\n" + error.message +
                  (curStep !== "" && !/too long for Windows/.test(error.message) ? "\n\nWhat it was doing: " + curStep : "") +
                  "\n\nFiles exported before the error: " + exportedCount + " of " + total + " artboards." +
                  "\nTemporary files were cleaned up. Fix the problem and run the export again.");
        }
    };
    // ---- Window position: always the standard spot (90, 140), kept on screen ----
    function placeWindow() {
        try {
            var sc = $.screens[0];
            var sw = sc.right - sc.left, sh = sc.bottom - sc.top;
            var ww = win.bounds.width, wh = win.bounds.height;
            var wx = 90, wy = 140;
            if (wx + ww > sw - 10) wx = Math.max(10, sw - ww - 10);
            if (wy + wh > sh - 40) wy = Math.max(10, sh - wh - 40);
            win.location = [wx, wy];
        } catch (ePos) {}
    }
    // Illustrator re-centers dialogs when they open, so the position is set after it shows.
    win.onShow = function () { placeWindow(); };

    // ---------- simple window: pick a preset and a folder, then export ----------
    // Returns "export", "advanced" or "" (closed). Everything not shown here uses plain defaults:
    // all artboards, PDF only, no bleed, the artboard name in each file name.
    var simpleName = "", simpleCombined = false, simpleAbName = false, simpleFolders = false, simpleTrim = false, simpleReg = false;
    function showSimple() {
        var choice = "";
        var sw = new Window("dialog", "Export Production Files 3.3");
        paintWin(sw);   // dark grey first: the UI Kit picks the white logo on a dark window
        sw.orientation = "column"; sw.alignChildren = ["fill", "top"]; sw.margins = uik().MARGINS; sw.spacing = uik().SPACING;
        var lr = sw.add("group");
        lr.alignment = ["fill", "top"]; lr.alignChildren = ["left", "center"]; lr.spacing = 10; lr.margins = 0;
        addHeaderLogo(lr, sw);
        var lrSpacer = lr.add("group");
        lrSpacer.alignment = ["fill", "center"];
        addHeaderTitle(lr);
        addAccentLine(sw);

        // Two columns: preset and folder on the left; file name and options on the right.
        var sCols = sw.add("group");
        sCols.orientation = "row"; sCols.alignChildren = ["fill", "top"]; sCols.spacing = 14;
        var sColL = sCols.add("group");
        sColL.orientation = "column"; sColL.alignChildren = ["fill", "top"]; sColL.spacing = 10;
        var sColR = sCols.add("group");
        sColR.orientation = "column"; sColR.alignChildren = ["fill", "top"]; sColR.spacing = 10;
        var pnlS1 = makePanel(sColL, "1. Preset and folder");
        var pnlS2 = makePanel(sColR, "2. File name");
        var pnlS3 = makePanel(sColR, "3. Options");

        pnlS1.add("statictext", undefined, "PDF preset:");
        var ddP = pnlS1.add("dropdownlist", undefined, pdfPresets);
        ddP.preferredSize.width = 340;
        if (dropdownPresets.selection) ddP.selection = dropdownPresets.selection.index;

        pnlS1.add("statictext", undefined, "Output folder:");
        var fr = pnlS1.add("group");
        fr.alignment = ["left", "top"];
        var bF = fr.add("button", undefined, "Browse...");
        // The project's production folder is found automatically (unless an output folder is remembered).
        var pmI = docName.match(/^(\d{4,})/);
        var projInit = pmI ? pmI[1] : "";
        var folderInit = txtFolder.text;
        if (projInit !== "" && !chkRememberFolder.value) {
            try { var pfI = findProductionFolder(projInit); if (pfI) folderInit = pfI.fsName; } catch (ePf) {}
        }
        // Shows a short version of the path (from the client folder on); the full path is the tooltip.
        var folderVal = folderInit;
        // Two single-line texts in a centered column (a multi-line text box does not center its lines reliably).
        var gF = pnlS1.add("group");
        gF.orientation = "column"; gF.alignment = ["left", "top"]; gF.alignChildren = ["left", "top"]; gF.spacing = 0;
        var lblF = gF.add("statictext", undefined, "");
        var lblF2 = gF.add("statictext", undefined, "");
        lblF.justify = "left"; lblF2.justify = "left";
        lblF.preferredSize.width = 330; lblF2.preferredSize.width = 330;
        var cRem = pnlS1.add("checkbox", undefined, "Remember output folder");
        cRem.value = chkRememberFolder.value;

        var nh = pnlS2.add("group");
        nh.alignment = ["left", "top"];
        nh.orientation = "row";
        nh.add("statictext", undefined, "Project #:");
        var tProj = nh.add("edittext", undefined, projInit);
        tProj.characters = 9;
        nh.add("statictext", undefined, "Version:");
        var tVer = nh.add("edittext", undefined, "1");
        tVer.characters = 4;
        var bSame = pnlS2.add("button", undefined, "Same version");
        bSame.alignment = ["left", "top"];
        var pvLine = pnlS2.add("statictext", undefined, "");
        pvLine.alignment = ["left", "top"];
        pvLine.preferredSize = [330, 18];
        pvLine.justify = "left";
        var verTouched = false;   // true once the version was typed by hand
        var sameOn = false;       // true while "Same version" is active
        var cComb = pnlS3.add("checkbox", undefined, "All artboards in one PDF (a single combined file)");
        cComb.value = chkCombined.value;
        var cAb = pnlS3.add("checkbox", undefined, "Add the artboard name to the file name (S1, S2...)");
        cAb.value = (abTotalCount > 1);   // on when there are several artboards, off for a single one
        var cFold = pnlS3.add("checkbox", undefined, "Put each artboard in its own folder (S1 in a folder called S1)");
        cFold.value = false;
        var cTrim = pnlS3.add("checkbox", undefined, "Trim marks on the PDF");
        cTrim.value = false;
        var cReg = pnlS3.add("checkbox", undefined, "Registration marks on the PDF");
        cReg.value = false;
        // Fix a file in place: the files are named exactly like the open file (no artboard name, no project/version).
        var bName = pnlS2.add("button", undefined, "Use this file's name");
        bName.alignment = ["left", "top"];
        bName.preferredSize.width = 230;      // wide enough for both labels (the text changes when clicked)
        var useFile = false;
        var abBefore = cAb.value;
        var folderBefore = "";          // the output folder before "Use this file's name" was turned on
        var folderPicked = false;       // true if Browse was used while that button was on

        var note = sw.add("statictext", undefined,
            "Exports a PDF, an .ai and an .eps for each file, with no bleed. Use Advanced... for anything else.");
        note.alignment = ["center", "top"];
        var warnOver = sw.add("statictext", undefined, "Existing files with the same name are overwritten. Saving .ai overwrites the open file if the name and folder match.");
        warnOver.alignment = ["center", "top"];
        warnOver.keepColor = true;
        try { warnOver.graphics.foregroundColor = warnOver.graphics.newPen(warnOver.graphics.PenType.SOLID_COLOR, [1, 0.35, 0.3], 1); } catch (eWc2) {}
        makeBold(warnOver);
        var warnAi = warnOver;

        // Bottom row: the status line on the left, the buttons on the right.
        var sBottom = sw.add("group");
        sBottom.orientation = "row"; sBottom.alignment = ["fill", "top"]; sBottom.alignChildren = ["left", "center"];
        var st = sBottom.add("statictext", undefined, "", { multiline: true });
        st.alignment = ["fill", "center"];
        st.preferredSize = [420, 34];

        var bg = sBottom.add("group");
        bg.alignment = ["right", "center"]; bg.spacing = 10;
        var bGo = bg.add("button", undefined, "Export", { name: "ok" });
        bGo.preferredSize.width = 100;
        var bAdv = bg.add("button", undefined, "Advanced...");
        bAdv.preferredSize.width = 110;
        var bClose = bg.add("button", undefined, "Close", { name: "cancel" });
        bClose.preferredSize.width = 80;
        paintStyle(sw);
        styleGreenButton(bGo, BTN_EXPORT);

        // Highest _v<N> already in the folder for this project (0 if none).
        function lastVersionIn(folderPath, proj) { return scanNaming(folderPath, proj).last; }
        // From the folder above the project folder onward, e.g. Converge_237\126542_Job name\Final Production Files.
        // If the project folder is not in the path, the last three folders are shown.
        function shortFolder(fsPath, proj) {
            try {
                var sep = ($.os.indexOf("Windows") !== -1) ? "\\" : "/";
                var parts = decodeURI(String(fsPath)).replace(/\\/g, "/").split("/");
                var clean = [];
                for (var sp = 0; sp < parts.length; sp++) if (parts[sp] !== "") clean.push(parts[sp]);
                var pi = -1;
                if (proj) {
                    for (var k = clean.length - 1; k >= 0; k--) {
                        if (clean[k].indexOf(proj) === 0 && !/^\d/.test(clean[k].substr(proj.length))) { pi = k; break; }
                    }
                }
                var from = (pi >= 0) ? Math.max(0, pi - 1) : Math.max(0, clean.length - 3);
                return clean.slice(from).join(sep);
            } catch (eSf) { return String(fsPath); }
        }
        // Splits a long path into two lines, at the backslash closest to the middle.
        function twoLines(txt) {
            if (txt.length <= 48) return txt;
            var best = -1, mid = txt.length / 2;
            for (var q = 0; q < txt.length; q++) {
                if ((txt.charAt(q) === "\\" || txt.charAt(q) === "/") && q < txt.length - 1) {
                    if (best < 0 || Math.abs(q - mid) < Math.abs(best - mid)) best = q;
                }
            }
            if (best < 0) return txt;
            return txt.substr(0, best + 1) + "\n" + txt.substr(best + 1);
        }
        function projText() { return tProj.text.replace(/\s+/g, ""); }
        function verText() { return tVer.text.replace(/\s+/g, ""); }
        function curName() {
            var pj = projText();
            if (useFile) return cleanDocName + " ";
            return (pj === "") ? (cleanDocName + " ") : (pj + "_" + DEFAULT_MIDDLE + "_v" + verText() + " ");
        }
        function refresh() {
            var prob = "";
            var hasProj = (projText() !== "");
            var fl = twoLines(shortFolder(folderVal, projText())).split("\n");
            lblF.text = fl[0];
            lblF2.text = (fl.length > 1) ? fl[1] : " ";
            lblF.helpTip = folderVal + "  (use Browse... to change it)";
            lblF2.helpTip = lblF.helpTip;
            try { sw.layout.layout(true); } catch (eLy2) {}
            tVer.enabled = hasProj && !useFile;
            tProj.enabled = !useFile;
            bSame.enabled = hasProj && !useFile;
            cAb.enabled = !cComb.value && !useFile;
            cFold.enabled = !cComb.value && !useFile;
            bSame.text = sameOn ? "Next version" : "Same version";
            bName.text = useFile ? "Back to automatic name" : "Use this file's name";
            pvLine.text = "File name: " + curName().replace(/\s+$/, "") + ((cComb.value || !cAb.value) ? "" : " + artboard name") + (useFile ? "  (same as the open file)" : "");
            if (!ddP.selection) prob = "No PDF preset found. Install or pick a PDF preset first.";
            else if (hasProj && !/^\d+$/.test(verText())) prob = "The version must be a number, for example 2.";
            else if (folderVal === "") prob = "Choose an output folder to continue.";
            else if (!(new Folder(folderVal)).exists) prob = "That folder does not exist. Use Browse... to pick another one.";
            bGo.enabled = (prob === "");
            var nextTo = "";
            try { if (useFile && folderVal.toLowerCase() === doc.path.fsName.toLowerCase()) nextTo = " Saved in the open file's folder."; } catch (eNt) {}
            st.text = (prob === "") ? (nextTo !== "" ? ("Ready: " + (cComb.value ? "one combined PDF" : (abTotalCount + " artboard" + (abTotalCount === 1 ? "" : "s"))) + " (PDF, .ai and .eps)." + nextTo) : cComb.value ? ("Ready: " + abTotalCount + " artboard" + (abTotalCount === 1 ? "" : "s") + " in one combined PDF (plus .ai and .eps).")
                : ("Ready: " + abTotalCount + " artboard" + (abTotalCount === 1 ? "" : "s") + ", one file of each type" + (cAb.value ? " (artboard name added to the file name)." : "."))) : prob;
            if (prob === "" && cFold.value && cFold.enabled) st.text += " Each artboard goes in its own folder.";
        }
        bF.onClick = function () {
            var start = new Folder(folderVal !== "" ? folderVal : doc.path.fsName);
            if (!start.exists) start = new Folder(doc.path.fsName);
            var sel = pickFolderBig(start);
            if (sel) { folderVal = sel.fsName; if (useFile) folderPicked = true; }
            refreshVersion();
        };
        // The version is the next one after the highest in the folder, unless you typed one yourself.
        function refreshVersion() {
            var pj = projText();
            if (pj !== "") {
                var nmFound = scanNaming(folderVal, pj);
                var lastV = nmFound.last;
                if (sameOn) tVer.text = String(lastV > 0 ? lastV : 1);
                else if (!verTouched) tVer.text = String(lastV + 1);
            }
            refresh();
        }
        // Same version: keeps the latest version already in the folder (so it is overwritten). Click again for the next one.
        bSame.onClick = function () {
            var pj = projText();
            if (pj === "") return;
            var lastS = lastVersionIn(folderVal, pj);
            if (sameOn) { sameOn = false; verTouched = false; tVer.text = String(lastS + 1); }
            else { sameOn = true; verTouched = true; tVer.text = String(lastS > 0 ? lastS : 1); }
            refresh();
        };
        bName.onClick = function () {
            if (!useFile) {
                abBefore = cAb.value; useFile = true; sameOn = false; cAb.value = false;
                // the files must land next to the open file to overwrite it (Browse still works)
                folderBefore = folderVal; folderPicked = false;
                try { folderVal = doc.path.fsName; } catch (eDp) {}
            } else {
                useFile = false; cAb.value = abBefore;
                if (!folderPicked && folderBefore !== "") folderVal = folderBefore;
            }
            refresh();
        };
        tVer.onChanging = function () { verTouched = true; sameOn = false; refresh(); };
        tProj.onChanging = refresh;
        tProj.onChange = refreshVersion;
        cComb.onClick = refresh;
        cAb.onClick = refresh;
        cFold.onClick = refresh;
        ddP.onChange = refresh;
        bGo.onClick = function () { choice = "export"; sw.close(); };
        bAdv.onClick = function () { choice = "advanced"; sw.close(); };
        bClose.onClick = function () { choice = ""; sw.close(); };

        ddP.helpTip = "The Adobe PDF preset used for the PDF files. Pick the one your printer or the job asks for.";
        bF.helpTip = "Choose the folder where the PDFs will be saved.";
        cRem.helpTip = "Use this folder again the next time the script opens.";
        bSame.helpTip = "Keeps the latest version number already in the folder (for example _v2 stays _v2), so the files of that version are overwritten. Click it again to go back to the next version.";
        tProj.helpTip = "Read from the start of the document name. Change it if the project number is different. Empty = the document name is used.";
        tVer.helpTip = "Filled in with the next version after the highest _v number already in the folder. Type the same number to overwrite that version.";
        bName.helpTip = "Names the new files exactly like the open file (for example 124352_Production Files_v1 S1 OPA), so they overwrite the files with that name. The output folder changes to the open file's folder (Browse still works if you need another one). Use it to fix a file whose artboards were not renamed. Click again to go back to the automatic name and your previous folder.";
        cFold.helpTip = "Saves the PDF, .ai and .eps of each artboard in a folder named after that artboard (for example S1), inside the output folder. Not available for the combined file or when using the open file's name.";
        cAb.helpTip = "Adds the artboard name after the file name, for example _v2 S1. Turn it ON to overwrite files that were saved with the artboard name, even if the document has only one artboard. Not used for the combined file.";
        cComb.helpTip = "Puts all artboards into ONE multi-page PDF instead of one PDF per artboard.";
        bGo.helpTip = "Exports every artboard as a PDF with the preset and folder above.";
        bAdv.helpTip = "Opens the full window: file name, artboards, bleed, extra formats, client profiles...";
        bClose.helpTip = "Closes this window without exporting.";
        refreshVersion();
        // Illustrator re-centers dialogs when they open, so the position is set after it shows.
        sw.onShow = function () {
            try {
                var scr = $.screens[0];
                var sww = scr.right - scr.left, shh = scr.bottom - scr.top;
                var cw = sw.bounds.width, ch = sw.bounds.height;
                var px = 90, py = 140;
                if (px + cw > sww - 10) px = Math.max(10, sww - cw - 10);
                if (py + ch > shh - 40) py = Math.max(10, shh - ch - 40);
                sw.location = [px, py];
            } catch (eSp) {}
        };
        sw.show();

        if (choice === "export" || choice === "advanced") {
            if (ddP.selection) dropdownPresets.selection = ddP.selection.index;
            txtFolder.text = folderVal;
            chkRememberFolder.value = cRem.value;
            simpleName = curName();
            simpleCombined = cComb.value;
            simpleAbName = cAb.value;
            simpleFolders = (cFold.value && cFold.enabled);
            simpleTrim = cTrim.value;
            simpleReg = cReg.value;
            try { refreshStatus(); } catch (eRs) {}
        }
        return choice;
    }

    // Runs the normal export with plain defaults, without touching the remembered advanced settings.
    function runSimpleExport() {
        var keys = ["RememberSettings", "SaveAi", "SaveEps", "SavePng", "SaveSvg", "NoOpen", "IncludeAbName", "PdfBleed",
                    "OpenFolder", "Combined", "Grouped", "FolderMode", "BleedMode", "BleedCustom", "PdfBleedCustom", "TrimMarks", "RegMarks"];
        var saved = {}, k;
        for (k = 0; k < keys.length; k++) saved[keys[k]] = readPref(keys[k]);
        chkSaveAi.value = true; chkSaveEps.value = true; chkSavePng.value = false; chkSaveSvg.value = false;
        chkDisableView.value = false; chkIncludeArtboardName.value = simpleAbName;
        chkPreserveEdit.value = true; chkAiPdfCompatible.value = false; chkOpenFolder.value = false;
        chkPdfBleed.value = false;
        chkTrimMarks.value = simpleTrim; chkRegMarks.value = simpleReg;
        rbBleedNone.value = true; rbBleed125.value = false; rbBleedCustom.value = false;
        dropdownFolderMode.selection = simpleFolders ? 1 : 0;   // 1 = one folder per artboard
        chkCombined.value = simpleCombined;
        chkGrouped.value = false;     // _grouped is only in the advanced window
        rbAbAll.value = true; rbAbSel.value = false;
        txtCustomName.text = (simpleName !== "") ? simpleName : (cleanDocName + " ");
        chkRemember.value = false;      // so the plain defaults are not saved as the remembered settings
        try {
            btnExport.onClick();
        } finally {
            for (k = 0; k < keys.length; k++) writePref(keys[k], saved[keys[k]]);
        }
    }

    var startChoice = "advanced";
    if (readPref("AlwaysAdvanced") !== "1") startChoice = showSimple();
    if (startChoice === "advanced") {
        // carry the simple window's file name and combined choice over
        if (simpleName !== "") {      // (only when the simple window was used)
            txtCustomName.text = simpleName;
            chkIncludeArtboardName.value = simpleAbName;
            if (simpleFolders) dropdownFolderMode.selection = 1;
        }
        if (simpleName !== "") { chkTrimMarks.value = simpleTrim; chkRegMarks.value = simpleReg; }
        if (simpleCombined) { chkCombined.value = true; chkGrouped.value = false; try { refreshCombinedUI(); } catch (eRc) {} }
        try { updatePreview(); refreshStatus(); } catch (eUp) {}
        win.show();
    }
    else if (startChoice === "export") runSimpleExport();
}

exportProductionFilesV2();

// last value of the file = what Sign Pack Tools shows in its status bar
(TSP_RESULT === "" ? ("WARNING: " + TSP_NAME + ": cancelled.") : TSP_RESULT);
