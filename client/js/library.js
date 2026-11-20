var LIBRARY = {

    // version.json that is installed (release notes, date)
    localManifest: null,


    // Progress hook: the app sets it to draw the update bar.
    // onProgress(phase, done, total, name)  phase: "start" | "download" | "write" | "finish"
    onProgress: null,

    // fetch() with a time limit, so a slow network cannot hang the panel
    fetchTimeout: function(url, options, ms){
        var opts = {};
        for(var k in options){ opts[k] = options[k]; }
        var ctl = (typeof AbortController !== "undefined") ? new AbortController() : null;
        var timer = null;
        if(ctl){
            opts.signal = ctl.signal;
            timer = setTimeout(function(){ ctl.abort(); }, ms);
        }
        return fetch(url, opts).then(
            function(r){ if(timer){ clearTimeout(timer); } return r; },
            function(e){
                if(timer){ clearTimeout(timer); }
                if(e && e.name === "AbortError"){ throw new Error("Network timeout."); }
                throw e;
            }
        );
    },


    version: "0.0",

    remoteVersion: null,

    updateType: null,

    // ==========================================
    // BRANCH OF THE LOCAL GIT CLONE
    // ==========================================
    //
    // When the extension folder is a Git clone (developer machines),
    // returns the checked-out branch from .git/HEAD, so "git checkout"
    // also switches where updates come from. Returns "" otherwise
    // (normal installs have no .git folder).

    getCheckedOutBranch: function(){

        try{

            if(typeof CACHE === "undefined" || !CACHE.rootPath){
                return "";
            }

            var r = window.cep.fs.readFile(CACHE.rootPath + "/.git/HEAD");

            if(r.err !== 0){
                return "";
            }

            // "ref: refs/heads/<branch>"; a detached HEAD (commit hash) is ignored
            var m = /^ref:\s*refs\/heads\/(.+?)\s*$/.exec(r.data);

            return m ? m[1] : "";

        }
        catch(e){
            return "";
        }

    },

    // ==========================================
    // BUILD REMOTE REQUEST
    // ==========================================
    //
    // Company private repository, accessed through the GitHub API.
    // owner, repo and token can be set in js/config.js (optional).
    // branch: config.js if set, else the checked-out Git branch, else main.
    // Library files live in the library/ folder of the repository.
    // Throws an error if the configuration is incomplete.

    buildRequest: function(relativePath){

        // Where the library lives. config.js is OPTIONAL: without it (or without a token) the
        // panel reads the public repository directly, no token needed.
        // Branch priority: config.js > checked-out Git branch > main.
        var DEFAULTS = {
            owner: "The-Sign-Pack-Non-Devs",
            repo: "thesignpack-tools",
            branch: "main"
        };

        var cfg =
            (
                typeof TSP_CONFIG !== "undefined" &&
                TSP_CONFIG.github
            ) ||
            {};

        var github = {
            owner: cfg.owner || DEFAULTS.owner,
            repo: cfg.repo || DEFAULTS.repo,
            branch: cfg.branch || LIBRARY.getCheckedOutBranch() || DEFAULTS.branch,
            token: cfg.token || ""
        };

        relativePath =
            relativePath.replace(
                /^[\\/]+/,
                ""
            );

        var encodedPath =
            relativePath
                .split("/")
                .map(encodeURIComponent)
                .join("/");

        // ---- with a token: GitHub API (works for a private repository too) ----
        if(github.token){

            return {

                url:
                    "https://api.github.com/repos/" +
                    encodeURIComponent(github.owner) +
                    "/" +
                    encodeURIComponent(github.repo) +
                    "/contents/library/" +
                    encodedPath +
                    "?ref=" +
                    encodeURIComponent(github.branch),

                options: {

                    cache: "no-store",

                    headers: {

                        "Authorization":
                            "Bearer " +
                            github.token,

                        "Accept":
                            "application/vnd.github.raw+json"

                    }

                }

            };

        }

        // ---- no token: public raw files (no API limit shared by the whole office) ----
        return {

            url:
                "https://raw.githubusercontent.com/" +
                encodeURIComponent(github.owner) +
                "/" +
                encodeURIComponent(github.repo) +
                "/" +
                encodeURIComponent(github.branch) +
                "/library/" +
                encodedPath +
                "?cb=" +
                new Date().getTime(),

            options: {

                cache: "no-store"

            }

        };

    },



    // ==========================================
    // DESCRIBE HTTP ERROR
    // ==========================================

    describeHttpError: function(status){

        if(status === 401){

            return "HTTP 401 - GitHub token is invalid or expired.";

        }


        if(status === 403){

            return "HTTP 403 - GitHub token has no access to the repository.";

        }


        if(status === 404){

            return "HTTP 404 - File or repository not found (or no access).";

        }


        return "HTTP " + status;

    },


    // ==========================================
    // LOAD LOCAL VERSION FROM CACHE
    // ==========================================

    getLocalVersion: function(callback){

        // Read straight from the panel (cep.fs): no trip through Illustrator.
        try{
            var versionPath = CACHE.getFilePath("version.json");
            var r = window.cep.fs.readFile(versionPath);
            if(r && r.err === 0){
                var text = String(r.data || "").replace(/^\uFEFF/, "");
                var data = JSON.parse(text);
                LIBRARY.version = data.version || "0.0";
                LIBRARY.localManifest = data;
                callback(LIBRARY.version);
                return;
            }
        }
        catch(eFs){}

        LIBRARY.getLocalVersionJsx(callback);

    },


    // Old way (through Illustrator), only used if the direct read fails
    getLocalVersionJsx: function(callback){

        var versionPath =
            CACHE.getFilePath(
                "version.json"
            );


        var readFilePath =
            CACHE.getFilePath(
                "system/readFile.jsx"
            );


        var jsx =
            '$.evalFile(' +
            JSON.stringify(
                readFilePath
            ) +
            ');' +

            'readFile(' +
            JSON.stringify(
                versionPath
            ) +
            ');';


        cs.evalScript(
            jsx,
            function(result){

                if(
                    !result
                ){

                    callback(null);

                    return;

                }


                if(
                    result.indexOf(
                        "ERROR:"
                    ) === 0
                ){

                    callback(null);

                    return;

                }


                try{

                    var data =
                        JSON.parse(result);


                    LIBRARY.version =
					data.version ||
					"0.0";


                    callback(
                        LIBRARY.version
                    );

                }
                catch(error){

                    callback(null);

                }

            }
        );

    },


    // ==========================================
    // LOAD REMOTE MANIFEST
    // ==========================================

    getRemoteManifest: function(callback){

        Promise.resolve()
        .then(function(){

            var request =
                LIBRARY.buildRequest(
                    "version.json"
                );


            return LIBRARY.fetchTimeout(request.url, request.options, 8000);

        })
        .then(function(response){

            if(!response.ok){

                throw new Error(
                    LIBRARY.describeHttpError(
                        response.status
                    )
                );

            }


            return response.text();

        })
        .then(function(text){

            callback(
                JSON.parse(text)
            );

        })
        .catch(function(error){

            if(
                window.console
            ){

                console.error(
                    "Library manifest: " +
                    error.message
                );

            }

            var msg = String((error && error.message) || error || "");

            callback(null, {
                offline:
                    (typeof navigator !== "undefined" && navigator.onLine === false) ||
                    /Failed to fetch|NetworkError|Network timeout|Load failed|network/i.test(msg),
                message: msg
            });

        });

    },


    // ==========================================
    // COMPARE VERSIONS
    // ==========================================

    compareVersions: function(localVersion, remoteVersion){

        var local = String(localVersion).split(".").map(Number);
        var remote = String(remoteVersion).split(".").map(Number);
        var max = Math.max(local.length, remote.length);

        for(var i = 0; i < max; i++){

            var localValue = local[i] || 0;
            var remoteValue = remote[i] || 0;

            if(remoteValue > localValue){
                if(i === 0){ return "major"; }
                if(i === 1){ return "minor"; }
                return "patch";
            }

            if(remoteValue < localValue){
                return "none";
            }

        }

        return "none";

    },



    // ==========================================
    // CHECK FOR UPDATES
    // ==========================================

    checkUpdate: function(callback){

        LIBRARY.getLocalVersion(
            function(localVersion){

                if(!localVersion){

                    callback({

                        success: false,

                        hasUpdate: false

                    });

                    return;

                }


                LIBRARY.getRemoteManifest(
                    function(manifest, failure){

                        if(!manifest){

                            callback({
                                success: false,
                                hasUpdate: false,
                                offline: !!(failure && failure.offline),
                                error: failure ? failure.message : ""
                            });

                            return;

                        }


                        var updateType =
                            LIBRARY.compareVersions(
                                localVersion,
                                manifest.version
                            );


                        LIBRARY.updateType =
                            updateType;


                        callback({

                            success: true,

                            hasUpdate:
                                updateType !== "none",

                            updateType:
                                updateType,

                            localVersion:
                                localVersion,

                            remoteVersion:
                                manifest.version,

                            manifest:
                                manifest

                        });

                    }
                );

            }
        );

    },


    // ==========================================
    // DOWNLOAD A FILE
    // ==========================================

    downloadFile: function(
        relativePath,
        callback
    ){

        // Images are binary: they travel as base64 and are written back as binary.
        var isBinary = /\.(png|jpg|jpeg|gif|ico|bmp|zip)$/i.test(relativePath);

        Promise.resolve()
        .then(function(){

            var request =
                LIBRARY.buildRequest(
                    relativePath
                );

            return LIBRARY.fetchTimeout(request.url, request.options, 30000);

        })
        .then(function(response){

            if(!response.ok){

                throw new Error(
                    LIBRARY.describeHttpError(
                        response.status
                    )
                );

            }

            return response.arrayBuffer();

        })
        .then(function(buffer){

            var bytes = new Uint8Array(buffer);
            var content;

            if(isBinary){

                var binary = "";

                for(var i = 0; i < bytes.length; i += 8192){

                    binary += String.fromCharCode.apply(
                        null,
                        bytes.subarray(i, i + 8192)
                    );

                }

                content = { base64: window.btoa(binary) };

            }
            else{

                content = new TextDecoder("utf-8").decode(bytes);

            }

            callback({

                success: true,

                path:
                    relativePath,

                content:
                    content,

                size:
                    bytes.length

            });

        })
        .catch(function(error){

            callback({

                success: false,

                path:
                    relativePath,

                error:
                    error.message

            });

        });

    },



    // ==========================================
    // DOWNLOAD ALL FILES
    // ==========================================

    downloadFiles: function(files, index, downloaded, callback){

        // Up to 4 files at the same time. Nothing is written to the library here:
        // the files are only written after ALL of them arrived.

        var total = files.length;

        if(total === 0){
            callback({ success: true, files: [] });
            return;
        }

        var results = new Array(total);
        var done = 0, next = 0, active = 0, failed = false;

        function launch(){

            if(failed){ return; }

            while(active < 4 && next < total){

                (function(i){

                    active++;

                    LIBRARY.downloadFile(files[i], function(r){

                        active--;

                        if(failed){ return; }

                        if(!r.success){

                            failed = true;

                            notify(
                                "Unable to download:\n" + files[i] + "\n\n" + r.error,
                                "error"
                            );

                            callback({ success: false, error: r.error });
                            return;

                        }

                        // The size listed in version.json must match what arrived (nothing cut off)
                        var expected = LIBRARY.expectedSizes ? LIBRARY.expectedSizes[files[i]] : undefined;

                        if(typeof expected === "number" && r.size !== expected){

                            failed = true;

                            var why = "Incomplete download: " + files[i] +
                                " (" + r.size + " bytes received, " + expected + " expected).";

                            notify(why, "error");

                            callback({ success: false, error: why });

                            return;

                        }

                        results[i] = r;
                        done++;

                        if(LIBRARY.onProgress){
                            LIBRARY.onProgress("download", done, total, files[i]);
                        }

                        if(done === total){
                            callback({ success: true, files: results });
                            return;
                        }

                        launch();

                    });

                })(next++);

            }

        }

        launch();

    },



    // ==========================================
    // WRITE FILE TO CACHE
    // ==========================================

    writeCacheFile: function(
        relativePath,
        content,
        callback
    ){

        var filePath =
            CACHE.getFilePath(
                relativePath
            );


        if(!filePath){

            callback({

                success: false,

                error:
                    "Cache path is not available."

            });

            return;

        }


        // Binary content arrives as { base64: "..." }
        var isBinary = (content !== null && typeof content === "object" && typeof content.base64 === "string");

        // Same content already in the library: nothing to write.
        var existing = isBinary
            ? window.cep.fs.readFile(filePath, window.cep.encoding.Base64)
            : window.cep.fs.readFile(filePath);

        if(
            existing && existing.err === 0 &&
            existing.data === (isBinary ? content.base64 : content)
        ){
            callback({ success: true, path: filePath, skipped: true });
            return;
        }

        // Written by the panel (cep.fs) instead of ExtendScript.
        // Decoding large files in ExtendScript blocks Illustrator
        // for minutes.

        var folderPath =
            filePath.replace(
                /\/[^\/]*$/,
                ""
            );


        // Deferred so the status message can be painted first.

        setTimeout(function(){

            if(
                window.cep.fs.stat(
                    folderPath
                ).err !== 0
            ){

                window.cep.fs.makedir(
                    folderPath
                );

            }


            var result = isBinary
                ? window.cep.fs.writeFile(filePath, content.base64, window.cep.encoding.Base64)
                : window.cep.fs.writeFile(filePath, content);


            if(
                result.err === 0
            ){

                callback({

                    success: true,

                    path:
                        filePath

                });

            }
            else{

                callback({

                    success: false,

                    error:
                        "Unable to write the file (error " +
                        result.err +
                        "):\n" +
                        filePath

                });

            }

        }, 0);

    },


    // ==========================================
    // UPDATE MULTIPLE CACHE FILES
    // ==========================================

    updateCacheFiles: function(
        files,
        index,
        callback
    ){

        if(
            !files ||
            files.length === 0
        ){

            callback({

                success: true

            });

            return;

        }


        if(
            index >= files.length
        ){

            callback({

                success: true

            });

            return;

        }


        var currentFile =
            files[index];


        if(LIBRARY.onProgress){
            LIBRARY.onProgress("write", index, files.length, currentFile.path);
        }


        LIBRARY.writeCacheFile(
            currentFile.path,
            currentFile.content,
            function(result){

                if(
                    !result ||
                    !result.success
                ){

                    notify(
                        "Unable to write:\n" +
                        currentFile.path +
                        "\n\n" +
                        (
                            result
                                ? result.error
                                : "Unknown error."
                        ),
                        "error"
                    );


                    callback({

                        success: false,

                        error:
                            result
                                ? result.error
                                : "Unknown error."

                    });

                    return;

                }


                LIBRARY.updateCacheFiles(
                    files,
                    index + 1,
                    callback
                );

            }
        );

    },


    // ==========================================
    // UPDATE LIBRARY
    // ==========================================

    update: function(
        manifest,
        callback
    ){

        if(
            !manifest
        ){

            callback({

                success: false,

                error:
                    "Invalid manifest."

            });

            return;

        }


        // ==========================================
        // BLOCK MAJOR UPDATES
        // ==========================================

        if(
            LIBRARY.updateType ===
            "major"
        ){

            notify(
                "A new major version is available. " +
                "Please contact support.",
                "warning"
            );


            callback({

                success: false,

                type:
                    "major"

            });

            return;

        }


        var files =
            manifest.files ||
            [];

        // sizes listed in the manifest (optional): used to check each download
        LIBRARY.expectedSizes = manifest.sizes || null;


        // ==========================================
        // DOWNLOAD FILES
        // ==========================================

        if(LIBRARY.onProgress){
            LIBRARY.onProgress("start", 0, files.length, "V" + manifest.version);
        }


        LIBRARY.downloadFiles(
            files,
            0,
            [],
            function(downloadResult){

                if(
                    !downloadResult ||
                    !downloadResult.success
                ){

                    callback({

                        success: false,

                        error:
                            downloadResult &&
                            downloadResult.error
                                ? downloadResult.error
                                : "Unable to download the files."

                    });

                    return;

                }


                // ==========================================
                // WRITE FILES TO CACHE
                // ==========================================

                LIBRARY.updateCacheFiles(
                    downloadResult.files,
                    0,
                    function(cacheResult){

                        if(
                            !cacheResult ||
                            !cacheResult.success
                        ){

                            callback({

                                success: false,

                                error:
                                    cacheResult &&
                                    cacheResult.error
                                        ? cacheResult.error
                                        : "Unable to write the files to the cache."

                            });

                            return;

                        }


                        // ==========================================
                        // UPDATE VERSION.JSON
                        // ==========================================

                        LIBRARY.writeCacheFile(
                            "version.json",
                            JSON.stringify(
                                manifest,
                                null,
                                4
                            ),
                            function(versionResult){

                                if(
                                    !versionResult ||
                                    !versionResult.success
                                ){

                                    callback({

                                        success: false,

                                        error:
                                            versionResult &&
                                            versionResult.error
                                                ? versionResult.error
                                                : "Unable to update version.json."

                                    });

                                    return;

                                }


                                // ==========================================
                                // UPDATE VERSION IN MEMORY
                                // ==========================================

                                LIBRARY.version =
                                    manifest.version;


                                callback({

                                    success: true,

                                    version:
                                        manifest.version

                                });

                            }
                        );

                    }
                );

            }
        );

    },


    // ==========================================
    // GET CURRENT VERSION
    // ==========================================

    getVersion: function(){

        return LIBRARY.version;

    }

};