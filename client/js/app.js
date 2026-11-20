window.onload = function(){

    // ==========================================
    // THEME (follows Illustrator's light / dark interface)
    // ==========================================

    function applyTheme(){

        try{

            var color = cs.getHostEnvironment().appSkinInfo.panelBackgroundColor.color;

            var light = ((color.red + color.green + color.blue) / 3 / 255) > 0.6;

            document.body.classList.toggle("light", light);

            var logo = document.getElementById("logo");

            if(logo){
                logo.src = light ? "icons/logo_light.svg" : "icons/logo.svg";
            }

            if(typeof refreshThemeIcons === "function"){
                refreshThemeIcons();
            }

        }
        catch(eTheme){}

    }

    applyTheme();

    try{
        cs.addEventListener(CSInterface.THEME_COLOR_CHANGED_EVENT, applyTheme);
    }
    catch(eThemeEv){}


    // ==========================================
    // WHAT'S NEW WINDOW: close button, click outside, Esc
    // ==========================================

    var closeNew = document.getElementById("whatsNewClose");
    var overlayNew = document.getElementById("whatsNew");

    if(closeNew){ closeNew.onclick = hideWhatsNew; }

    document.addEventListener("keydown", function(e){

        if(e.key === "Escape"){ hideWhatsNew(); }

    });

    if(overlayNew){

        overlayNew.addEventListener("click", function(e){

            if(e.target === overlayNew){ hideWhatsNew(); }

        });

    }


    // ==========================================
    // RELOAD PLUGIN
    // ==========================================

    function reloadPlugin(){

        location.reload();

    }
	
	


    // ==========================================
    // RELOAD BUTTON = CHECK FOR UPDATES NOW + RELOAD
    // ==========================================

    var reloadButton = document.getElementById("reload");

    if(reloadButton){

        reloadButton.style.display = "flex";

        reloadButton.onclick = function(){

            forceUpdate();

        };

    }


    // ==========================================
    // UI ELEMENTS
    // ==========================================

    var accordion =
        document.getElementById(
            "accordion"
        );


    var search =
        document.getElementById(
            "search"
        );


    if(!accordion){

        console.error(
            "Element #accordion not found."
        );

        return;

    }


    // ==========================================
    // INITIALIZE CACHE
    // ==========================================

    CACHE.initialize(
        function(cacheResult){

            if(
                !cacheResult ||
                !cacheResult.success
            ){

                notify(
                    "Unable to initialize the library.",
                    "error"
                );

                console.error(
                    cacheResult
                );

                return;

            }


            // ==================================
            // LOAD MENU
            // ==================================

            LOADER.load(
                "menu.js",
                function(menuResult){

                    if(
                        !menuResult ||
                        !menuResult.success
                    ){

                        notify(
                            "Unable to load the menu.",
                            "error"
                        );

                        console.error(
                            menuResult
                        );

                        return;

                    }


                    // ==============================
                    // INJECT MENU
                    // ==============================

                    LOADER.inject(
                        menuResult.content,
                        function(menuInjectResult){

                            if(
                                !menuInjectResult ||
                                !menuInjectResult.success
                            ){

                                notify(
                                    "Unable to initialize the menu.",
                                    "error"
                                );

                                console.error(
                                    menuInjectResult
                                );

                                return;

                            }


                            // ==========================
                            // VALIDATE MENU
                            // ==========================

                            if(
                                typeof MENU ===
                                "undefined"
                            ){

                                notify(
                                    "The library did not return the MENU object.",
                                    "error"
                                );

                                return;

                            }


                            // ==========================
                            // LOAD TOOLS
                            // ==========================

                            LOADER.load(
                                "tools.js",
                                function(toolsResult){

                                    if(
                                        !toolsResult ||
                                        !toolsResult.success
                                    ){

                                        notify(
                                            "Unable to load the tools.",
                                            "error"
                                        );

                                        console.error(
                                            toolsResult
                                        );

                                        return;

                                    }


                                    // ======================
                                    // INJECT TOOLS
                                    // ======================

                                    LOADER.inject(
                                        toolsResult.content,
                                        function(toolsInjectResult){

                                            if(
                                                !toolsInjectResult ||
                                                !toolsInjectResult.success
                                            ){

                                                notify(
                                                    "Unable to initialize the tools.",
                                                    "error"
                                                );

                                                console.error(
                                                    toolsInjectResult
                                                );

                                                return;

                                            }


                                            // ==================
                                            // VALIDATE TOOLS
                                            // ==================

                                            if(
                                                typeof TOOLS ===
                                                "undefined"
                                            ){

                                                notify(
                                                    "The library did not return the TOOLS object.",
                                                    "error"
                                                );

                                                return;

                                            }


                                            // ==================
                                            // CREATE MENU
                                            // ==================

                                            try{

                                                createAccordion(
                                                    accordion,
                                                    MENU
                                                );

                                            }
                                            catch(error){

                                                notify(
                                                    "Unable to create the menu.",
                                                    "error"
                                                );

                                                console.error(
                                                    error
                                                );

                                                return;

                                            }


                                            // ==================
                                            // ENABLE SEARCH
                                            // ==================

                                            if(search){

                                                search.addEventListener(
                                                    "input",
                                                    filterMenu
                                                );

                                                // Enter runs the first result, Esc clears the search
                                                search.addEventListener(
                                                    "keydown",
                                                    function(e){

                                                        if(e.key === "Enter"){

                                                            if(runFirstResult()){
                                                                search.value = "";
                                                                filterMenu();
                                                            }

                                                        }
                                                        else if(e.key === "Escape"){

                                                            search.value = "";
                                                            filterMenu();

                                                        }

                                                    }
                                                );

                                                // ready to type
                                                search.focus();

                                            }


                                            // ==================
                                            // PLUGIN READY
                                            // ==================

                                            notify(
                                                "The Sign Pack Tools is ready.",
                                                "success"
                                            );


                                            // ==================
                                            // CHECK FOR UPDATES
                                            // ==================

                                            checkIfDue(true);

                                        }
                                    );

                                }
                            );

                        }
                    );

                }
            );

        }
    );


    // ==========================================
    // CHECK LIBRARY UPDATES
    // ==========================================
    //
    // Checks at 03:00 and 15:00 Brazil time (UTC-3), and straight away when
    // the internet comes back. The time of the last good check is saved, so
    // a check that was missed (Illustrator closed or no internet at that
    // time) is done as soon as the panel is running and online again.
    // Quiet when offline.

    // (the first check can start before this line runs, so these keep a value already set)
    var checking = checking || false;
    var majorWarned = majorWarned || false;

    function setVersionLabel(){

        var el = document.getElementById("plugin-version");

        if(el){
            el.textContent = "V" + LIBRARY.getVersion();
        }

    }


    // Progress: download 0-60%, writing 60-95%, finish 100%
    function onLibraryProgress(phase, done, total, name){

        var pct = 0;
        var text = "Updating library...";

        if(phase === "start"){
            text = "Updating library to " + name + "...";
        }
        else if(phase === "download"){
            pct = total > 0 ? (done / total) * 60 : 0;
            text = "Updating library: downloading " + done + " of " + total;
        }
        else if(phase === "write"){
            pct = 60 + (total > 0 ? (done / total) * 35 : 0);
            text = "Updating library: installing " + (done + 1) + " of " + total;
        }

        showUpdateBar(text, pct, "");

    }


    // Connection state shown under the title
    function setConnection(state, detail){

        var el = document.getElementById("update-state");

        if(!el){
            return;
        }

        el.className = state;

        if(state === "ok"){
            el.textContent = "\u25CF Up to date";
            el.title = "The library is up to date.";
        }
        else if(state === "offline"){
            el.textContent = "\u25CF Offline: cannot check for updates";
            el.title = "No internet connection. The panel keeps working with the library already installed.";
        }
        else if(state === "update"){
            el.textContent = "\u25CF Updating...";
            el.title = "";
        }
        else{
            el.textContent = "\u25CF Cannot reach the library";
            el.title = detail || "";
        }

    }


    var forceRequested = false;

    function checkLibraryUpdate(force){

        if(
            typeof LIBRARY === "undefined" ||
            checking
        ){
            return;
        }

        checking = true;

        LIBRARY.checkUpdate(function(update){

            setVersionLabel();

            var wasForced = (force === true);

            // could not check: offline, no access, ...
            if(!update || !update.success){

                checking = false;

                var offline = !!(update && update.offline);

                setConnection(
                    offline ? "offline" : "error",
                    update && update.error ? update.error : ""
                );

                if(wasForced){

                    try{
                        window.localStorage.setItem(
                            "tspJustChecked",
                            offline ? "offline" : "error"
                        );
                    }
                    catch(eLsF){}

                    location.reload();

                }

                return;

            }

            setConnection("ok");
            markChecked();

            // up to date
            if(!update.hasUpdate){

                checking = false;

                if(wasForced){

                    try{
                        window.localStorage.setItem("tspJustChecked", "ok");
                    }
                    catch(eLsG){}

                    location.reload();

                }

                return;

            }

            // a new major version is never installed by itself
            if(update.updateType === "major"){

                checking = false;

                if(!majorWarned){

                    majorWarned = true;

                    notify(
                        "A new major version is available. " +
                        "Please contact support to update the library.",
                        "warning"
                    );

                }

                return;

            }

            LIBRARY.onProgress = onLibraryProgress;

            setConnection("update");

            showUpdateBar(
                "Update found (V" + update.remoteVersion + "). Starting...",
                0,
                ""
            );

            LIBRARY.update(update.manifest, function(result){

                LIBRARY.onProgress = null;

                if(!result || !result.success){

                    checking = false;

                    setConnection("error", "The update could not be completed.");

                    showUpdateBar("Library update failed. Will try again.", 100, "failed");
                    hideUpdateBar(8000);

                    notify(
                        "Unable to complete the library update.",
                        "error"
                    );

                    return;

                }

                setVersionLabel();

                showUpdateBar("Updated to V" + result.version + ". Reloading...", 100, "done");

                try{
                    window.localStorage.setItem("tspJustUpdated", result.version);
                }
                catch(eLs){}

                setTimeout(function(){

                    location.reload();

                }, 1200);

            });

        });

    }


    // ==========================================
    // AFTER A RELOAD: SHOW THAT IT UPDATED
    // ==========================================

    try{

        var justUpdated = window.localStorage.getItem("tspJustUpdated");
        var justChecked = window.localStorage.getItem("tspJustChecked");

        if(justUpdated){

            window.localStorage.removeItem("tspJustUpdated");

            showUpdateBar("Library updated to V" + justUpdated, 100, "done");
            hideUpdateBar(8000);

            // show what changed (after the menu is ready)
            setTimeout(function(){

                try{ LIBRARY.getLocalVersion(function(){ showWhatsNew(); }); }
                catch(eNew){}

            }, 600);

        }
        else if(justChecked){

            window.localStorage.removeItem("tspJustChecked");

            if(justChecked === "ok"){
                showUpdateBar("Reloaded. The library is up to date.", 100, "done");
                hideUpdateBar(5000);
            }
            else if(justChecked === "offline"){
                showUpdateBar("No internet: the library could not be updated.", 100, "failed");
                hideUpdateBar(8000);
            }
            else{
                showUpdateBar("Could not reach the library to check for updates.", 100, "failed");
                hideUpdateBar(8000);
            }

        }

    }
    catch(eLs2){}


    // ==========================================
    // SCHEDULE: 03:00 AND 15:00 (BRAZIL TIME), OR WHEN BACK ONLINE
    // ==========================================

    var LAST_CHECK_KEY = "tspLastCheck";
    var RETRY_AFTER_MS = 10 * 60 * 1000;
    var BRT_OFFSET_MS = -3 * 60 * 60 * 1000;     // Brazil has no daylight saving time
    var lastAttemptMs = 0;

    // The most recent scheduled moment (03:00 or 15:00 Brazil time) that is not in the future.
    function lastSlotMs(nowMs){

        var shifted = new Date(nowMs + BRT_OFFSET_MS);

        var dayStart = Date.UTC(
            shifted.getUTCFullYear(),
            shifted.getUTCMonth(),
            shifted.getUTCDate()
        );

        var hour = 60 * 60 * 1000;

        var slots = [
            dayStart - 9 * hour,     // yesterday 15:00
            dayStart + 3 * hour,     // today 03:00
            dayStart + 15 * hour     // today 15:00
        ];

        var best = slots[0];

        for(var i = 0; i < slots.length; i++){
            if(slots[i] <= nowMs + BRT_OFFSET_MS){
                best = slots[i];
            }
        }

        return best - BRT_OFFSET_MS;

    }

    function getLastCheckMs(){

        try{
            return parseInt(window.localStorage.getItem(LAST_CHECK_KEY), 10) || 0;
        }
        catch(eLc){
            return 0;
        }

    }

    function markChecked(){

        try{
            window.localStorage.setItem(LAST_CHECK_KEY, String(new Date().getTime()));
        }
        catch(eMc){}

    }

    function checkIsDue(){

        var now = new Date().getTime();

        return getLastCheckMs() < lastSlotMs(now);

    }

    function checkIfDue(atOpen){

        if(navigator.onLine === false){

            setConnection("offline");
            return;

        }

        var now = new Date().getTime();

        if(!checkIsDue()){

            if(atOpen){
                setConnection("ok");
            }

            return;

        }

        if(now - lastAttemptMs < RETRY_AFTER_MS){
            return;
        }

        lastAttemptMs = now;

        checkLibraryUpdate();

    }

    // looks once a minute whether a scheduled check is due (cheap: no network unless it is)
    setInterval(function(){

        checkIfDue(false);

    }, 60 * 1000);


    // ==========================================
    // RELOAD BUTTON: CHECK NOW (does not wait for the schedule)
    // ==========================================

    function forceUpdate(){

        if(checking){

            notify(
                "Already checking for updates...",
                "info"
            );

            return;

        }

        showUpdateBar("Checking for updates...", 10, "");

        checkLibraryUpdate(true);

    }


    // ==========================================
    // INTERNET COMES AND GOES
    // ==========================================

    window.addEventListener("offline", function(){

        setConnection("offline");

    });

    window.addEventListener("online", function(){

        lastAttemptMs = new Date().getTime();

        checkLibraryUpdate();

    });


    // ==========================================
    // ALT + CLICK ON THE VERSION = RELOAD THE PANEL
    // ==========================================

    var versionLabel = document.getElementById("plugin-version");

    if(versionLabel){

        versionLabel.title = "Click to see what is new in this version";

        versionLabel.style.cursor = "pointer";

        versionLabel.addEventListener("click", function(e){

            if(e.altKey){
                reloadPlugin();
            }
            else{
                showWhatsNew();
            }

        });

    }

};
