// ==========================================
// SMALL STORAGE HELPERS (saved on this computer)
// ==========================================

var FAV_KEY = "tspFavorites";
var RECENT_KEY = "tspRecent";
var OPEN_KEY = "tspOpen";
var RECENT_MAX = 4;

var CURRENT_MENU = [];
var FAV_CONTENT = null;
var FAV_ITEM = null;
var RECENT_CONTENT = null;
var RECENT_ITEM = null;

function readJSON(key, fallback){

    try{

        var value = JSON.parse(window.localStorage.getItem(key) || "null");

        return (value === null || value === undefined) ? fallback : value;

    }
    catch(e){

        return fallback;

    }

}

function writeJSON(key, value){

    try{
        window.localStorage.setItem(key, JSON.stringify(value));
    }
    catch(e){}

}

function getList(key){

    var list = readJSON(key, []);

    return (list instanceof Array) ? list : [];

}

function getFavorites(){ return getList(FAV_KEY); }

function isFavorite(id){ return getFavorites().indexOf(id) !== -1; }

function getOpenMap(){

    var map = readJSON(OPEN_KEY, {});

    return (map && typeof map === "object") ? map : {};

}

function setOpenState(id, opened){

    var map = getOpenMap();

    map[id] = opened;

    writeJSON(OPEN_KEY, map);

}

function isLightTheme(){

    return document.body.classList.contains("light");

}

// Gray wolf = not a favorite, white (dark theme) / dark blue (light theme) wolf = favorite
function wolfIcon(on){

    if(!on){ return "icons/wolf_off.svg"; }

    return isLightTheme() ? "icons/wolf_on_light.svg" : "icons/wolf_on.svg";

}

function findTool(id){

    for(var c = 0; c < CURRENT_MENU.length; c++){

        for(var t = 0; t < CURRENT_MENU[c].tools.length; t++){

            if(CURRENT_MENU[c].tools[t].id === id){
                return CURRENT_MENU[c].tools[t];
            }

        }

    }

    return null;

}

// true when the tool has no script file in the library (shown disabled)
function toolMissing(tool){

    try{

        if(typeof TOOLS === "undefined" || !TOOLS[tool.id]){
            return true;
        }

        var path = CACHE.getFilePath("scripts/" + TOOLS[tool.id].file);

        return !path || window.cep.fs.stat(path).err !== 0;

    }
    catch(e){

        return false;

    }

}


// ==========================================
// FAVORITES
// ==========================================

function toggleFavorite(id){

    var list = getFavorites();
    var index = list.indexOf(id);

    if(index === -1){
        list.push(id);
    }
    else{
        list.splice(index, 1);
    }

    writeJSON(FAV_KEY, list);

    refreshFavorites();

}

function paintFavButtons(){

    var buttons = document.querySelectorAll(".fav-btn");

    for(var i = 0; i < buttons.length; i++){

        var fav = isFavorite(buttons[i].getAttribute("data-id"));

        buttons[i].src = wolfIcon(fav);

        buttons[i].title = fav ? "Remove from favorites" : "Add to favorites";

    }

}

function fitBox(item, content){

    if(item && content && item.classList.contains("open")){
        content.style.maxHeight = content.scrollHeight + "px";
    }

}

function refreshFavorites(){

    if(!FAV_CONTENT){
        return;
    }

    FAV_CONTENT.innerHTML = "";

    var shown = 0;
    var list = getFavorites();

    for(var i = 0; i < list.length; i++){

        var tool = findTool(list[i]);

        if(tool){

            FAV_CONTENT.appendChild(makeToolButton(tool, { draggable: true }));

            shown++;

        }

    }

    if(shown === 0){

        var hint = document.createElement("div");

        hint.className = "fav-empty";

        hint.textContent = "Click the wolf next to a tool to add it here.";

        FAV_CONTENT.appendChild(hint);

    }

    paintFavButtons();

    fitBox(FAV_ITEM, FAV_CONTENT);

}

// Drag a favorite onto another one to change the order
function setupFavoriteDrag(content){

    var dragId = null;

    content.addEventListener("dragstart", function(e){

        var btn = e.target.closest ? e.target.closest(".tool") : null;

        if(!btn){ return; }

        dragId = btn.getAttribute("data-id");

        btn.classList.add("dragging");

        try{
            e.dataTransfer.setData("text/plain", dragId);
            e.dataTransfer.effectAllowed = "move";
        }
        catch(err){}

    });

    content.addEventListener("dragover", function(e){

        if(dragId){ e.preventDefault(); }

    });

    content.addEventListener("dragend", function(){

        dragId = null;

        var list = content.querySelectorAll(".dragging");

        for(var i = 0; i < list.length; i++){ list[i].classList.remove("dragging"); }

    });

    content.addEventListener("drop", function(e){

        if(!dragId){ return; }

        e.preventDefault();

        var target = e.target.closest ? e.target.closest(".tool") : null;

        var targetId = target ? target.getAttribute("data-id") : null;

        var list = getFavorites();
        var from = list.indexOf(dragId);

        if(from === -1){ return; }

        list.splice(from, 1);

        var to = targetId ? list.indexOf(targetId) : -1;

        if(to === -1){ list.push(dragId); }
        else{ list.splice(to, 0, dragId); }

        dragId = null;

        writeJSON(FAV_KEY, list);

        refreshFavorites();

    });

}


// ==========================================
// RECENTLY USED
// ==========================================

function addRecent(id){

    var list = getList(RECENT_KEY);

    var index = list.indexOf(id);

    if(index !== -1){ list.splice(index, 1); }

    list.unshift(id);

    if(list.length > RECENT_MAX){ list.length = RECENT_MAX; }

    writeJSON(RECENT_KEY, list);

    refreshRecent();

}

function refreshRecent(){

    if(!RECENT_CONTENT){
        return;
    }

    RECENT_CONTENT.innerHTML = "";

    var shown = 0;
    var list = getList(RECENT_KEY);

    for(var i = 0; i < list.length; i++){

        var tool = findTool(list[i]);

        if(tool){

            RECENT_CONTENT.appendChild(makeToolButton(tool, {}));

            shown++;

        }

    }

    // the box only shows when there is something in it
    RECENT_ITEM.setAttribute("data-empty", shown === 0 ? "1" : "0");

    var searching = document.getElementById("search") && document.getElementById("search").value !== "";

    RECENT_ITEM.style.display = (shown === 0 || searching) ? "none" : "";

    paintFavButtons();

    fitBox(RECENT_ITEM, RECENT_CONTENT);

}


// ==========================================
// ONE TOOL BUTTON (name + help + favorite wolf)
// ==========================================

function makeToolButton(tool, opts){

    opts = opts || {};

    var button = document.createElement("button");

    button.className = "tool";

    button.setAttribute("data-id", tool.id);

    var missing = toolMissing(tool);

    button.title =
        (tool.description || "") +
        (tool.version ? "  (v" + tool.version + ")" : "");

    if(missing){

        button.disabled = true;

        button.classList.add("missing");

        button.title = "Script file not found in the library: " + tool.title;

    }

    // text used by the search box (name, description and tags)
    button.setAttribute(
        "data-search",
        (
            tool.title + " " +
            (tool.description || "") + " " +
            (tool.tags || []).join(" ")
        ).toLowerCase()
    );

    if(opts.draggable){

        button.draggable = true;

        button.classList.add("draggable");

    }

    var label = document.createElement("span");

    label.textContent = tool.title;

    button.appendChild(label);

    var right = document.createElement("div");

    right.className = "tool-right";

    // ---- help button ----
    if(tool.help){

        var help = document.createElement("img");

        help.className = "tool-help";

        help.draggable = false;

        help.src = "icons/help.svg";

        help.title = "Open documentation for " + tool.title;

        right.appendChild(help);

        help.onclick = function(e){

            e.stopPropagation();

            // LOCAL DOCUMENTATION
            if(tool.help && tool.help.type === "local"){

                var localPath = CACHE.getFilePath(tool.help.path);

                if(!localPath){

                    notify("Documentation is not available.", "error");

                    return;

                }

                window.cep.util.openURLInDefaultBrowser(
                    "file:///" + localPath.replace(/\\/g, "/")
                );

                return;

            }

            // EXTERNAL URL
            if(tool.help && tool.help.type === "url"){

                window.cep.util.openURLInDefaultBrowser(tool.help.url);

            }

        };

    }

    // ---- favorite wolf ----
    var fav = document.createElement("img");

    fav.className = "fav-btn";

    fav.draggable = false;

    fav.setAttribute("data-id", tool.id);

    fav.src = wolfIcon(isFavorite(tool.id));

    fav.title = isFavorite(tool.id) ? "Remove from favorites" : "Add to favorites";

    fav.onclick = function(e){

        e.stopPropagation();

        toggleFavorite(tool.id);

    };

    right.appendChild(fav);

    button.appendChild(right);

    // ---- tool action ----
    button.onclick = function(){

        if(missing){ return; }

        runTool(tool.id);

        addRecent(tool.id);

    };

    return button;

}


// ==========================================
// ONE CATEGORY (title + tools)
// ==========================================
// kind: "favorites" | "recent" | undefined

function buildCategory(container, category, kind){

    var item = document.createElement("div");

    item.className = "item";

    var title = document.createElement("button");

    title.className = "title";

    var left = document.createElement("div");

    left.className = "title-left";

    var img = document.createElement("img");

    img.className = "category-icon";

    img.src = category.icon;

    if(kind === "favorites"){
        img.className = "category-icon fav-title-icon";
        img.src = wolfIcon(true);
    }

    var text = document.createElement("span");

    text.textContent = category.title;

    left.appendChild(img);
    left.appendChild(text);

    var arrow = document.createElement("img");

    arrow.className = "arrow";

    arrow.src = "icons/arrow.svg";

    title.appendChild(left);
    title.appendChild(arrow);

    var content = document.createElement("div");

    content.className = "content";

    if(!kind){

        category.tools.forEach(function(tool){

            content.appendChild(makeToolButton(tool, {}));

        });

    }

    item.appendChild(title);
    item.appendChild(content);

    container.appendChild(item);

    // remembered open / closed state (the special boxes start open)
    var map = getOpenMap();

    var startOpen = (category.id in map) ? !!map[category.id] : !!kind;

    item.setAttribute("data-user-open", startOpen ? "1" : "0");

    if(startOpen){
        item.classList.add("open");
    }

    title.onclick = function(){

        item.classList.toggle("open");

        var opened = item.classList.contains("open");

        item.setAttribute("data-user-open", opened ? "1" : "0");

        setOpenState(category.id, opened);

        content.style.maxHeight = opened ? content.scrollHeight + "px" : "0px";

    };

    if(kind){
        item.setAttribute("data-special", kind);
    }

    if(kind === "favorites"){

        FAV_ITEM = item;
        FAV_CONTENT = content;

        setupFavoriteDrag(content);

    }
    else if(kind === "recent"){

        RECENT_ITEM = item;
        RECENT_CONTENT = content;

    }

    return item;

}

function createAccordion(container, menu){

    CURRENT_MENU = menu;

    FAV_ITEM = null;
    FAV_CONTENT = null;
    RECENT_ITEM = null;
    RECENT_CONTENT = null;

    buildCategory(
        container,
        { id: "favorites", title: "Favorites", icon: "icons/wolf_on.svg", tools: [] },
        "favorites"
    );

    buildCategory(
        container,
        { id: "recent", title: "Recently used", icon: "icons/recent.svg", tools: [] },
        "recent"
    );

    menu.forEach(function(category){

        buildCategory(container, category, null);

    });

    refreshFavorites();
    refreshRecent();

    // open boxes get their height now that everything is in place
    var items = container.querySelectorAll(".item");

    for(var i = 0; i < items.length; i++){

        if(items[i].classList.contains("open")){

            var c = items[i].querySelector(".content");

            c.style.maxHeight = c.scrollHeight + "px";

        }

    }

    paintFavButtons();

}

// theme changed: the wolf images need the other color
function refreshThemeIcons(){

    paintFavButtons();

    var t = document.querySelector(".fav-title-icon");

    if(t){ t.src = wolfIcon(true); }

}


// ==========================================
// RENDER MENU
// ==========================================

function renderMenu(menu){

    var accordion = document.getElementById("accordion");

    if(!accordion){
        return;
    }

    accordion.innerHTML = "";

    createAccordion(accordion, menu);

}


// ==========================================
// FILTER MENU (search, in place, no rebuild)
// ==========================================

function filterMenu(){

    var search = document.getElementById("search");
    var accordion = document.getElementById("accordion");

    if(!search || !accordion){
        return;
    }

    var text = search.value.toLowerCase().replace(/^\s+|\s+$/g, "");

    var items = accordion.querySelectorAll(".item");

    for(var i = 0; i < items.length; i++){

        var item = items[i];
        var content = item.querySelector(".content");
        var tools = item.querySelectorAll(".tool");
        var matches = 0;

        // Favorites / Recently used only show when not searching (their tools are in the other boxes too)
        if(item.getAttribute("data-special")){

            if(text === "" && item.getAttribute("data-empty") !== "1"){

                var spOpen = item.getAttribute("data-user-open") === "1";

                item.style.display = "";
                item.classList.toggle("open", spOpen);
                content.style.maxHeight = spOpen ? content.scrollHeight + "px" : "0px";

            }
            else{

                item.style.display = "none";

            }

            continue;

        }

        for(var t = 0; t < tools.length; t++){

            var ok =
                text === "" ||
                (tools[t].getAttribute("data-search") || "").indexOf(text) !== -1;

            tools[t].style.display = ok ? "" : "none";

            if(ok){ matches++; }

        }

        if(text === ""){

            // back to what the person had open before searching
            var wasOpen = item.getAttribute("data-user-open") === "1";

            item.style.display = "";
            item.classList.toggle("open", wasOpen);
            content.style.maxHeight = wasOpen ? content.scrollHeight + "px" : "0px";

        }
        else if(matches > 0){

            // open the categories that have a match
            item.style.display = "";
            item.classList.add("open");
            content.style.maxHeight = content.scrollHeight + "px";

        }
        else{

            item.style.display = "none";

        }

    }

}

// Enter in the search box: run the first tool that matches
function runFirstResult(){

    var accordion = document.getElementById("accordion");

    if(!accordion){ return false; }

    var items = accordion.querySelectorAll(".item");

    for(var i = 0; i < items.length; i++){

        if(items[i].getAttribute("data-special") || items[i].style.display === "none"){
            continue;
        }

        var tools = items[i].querySelectorAll(".tool");

        for(var t = 0; t < tools.length; t++){

            if(tools[t].style.display !== "none" && !tools[t].disabled){

                tools[t].click();

                return true;

            }

        }

    }

    return false;

}


// ==========================================
// UPDATE BAR (bottom of the panel)
// ==========================================

var updateBarTimer = null;

function showUpdateBar(text, percent, state){

    var bar = document.getElementById("updateBar");
    var label = document.getElementById("updateText");
    var fill = document.getElementById("updateFill");

    if(!bar || !label || !fill){
        return;
    }

    if(updateBarTimer){
        clearTimeout(updateBarTimer);
        updateBarTimer = null;
    }

    bar.className = state || "";
    label.textContent = text;
    fill.style.width = Math.max(0, Math.min(100, percent)) + "%";

}

function hideUpdateBar(delayMs){

    var bar = document.getElementById("updateBar");

    if(!bar){
        return;
    }

    if(updateBarTimer){
        clearTimeout(updateBarTimer);
    }

    updateBarTimer = setTimeout(function(){
        bar.className = "hidden";
        updateBarTimer = null;
    }, delayMs || 0);

}


// ==========================================
// WHAT'S NEW WINDOW
// ==========================================

function showWhatsNew(){

    var overlay = document.getElementById("whatsNew");
    var title = document.getElementById("whatsNewTitle");
    var body = document.getElementById("whatsNewBody");

    if(!overlay || !title || !body){
        return;
    }

    var manifest = (typeof LIBRARY !== "undefined" && LIBRARY.localManifest) || {};

    title.textContent =
        "What's new in V" + (manifest.version || (typeof LIBRARY !== "undefined" ? LIBRARY.getVersion() : "")) +
        (manifest.releaseDate ? "  -  " + manifest.releaseDate : "");

    body.textContent = manifest.releaseNotes || "No release notes for this version.";

    overlay.className = "";

}

function hideWhatsNew(){

    var overlay = document.getElementById("whatsNew");

    if(overlay){ overlay.className = "hidden"; }

}
