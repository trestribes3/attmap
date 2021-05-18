var app;
var Darxeal = {
    loadScript: function(options) {
        try {
            var host = options.dev ?
                "http://localhost:8080/tribalwars_scripts/" :
                "https://darxeal.github.io/tribalwars_scripts/";
    
            $.getScript("https://darxeal.github.io/tribalwars_scripts/vue.js");
            options.el.load(host + options.template);
            if (!options.dev) $.get(host + "tracking/update.js", (r) => {eval(r); addlog(options.name);});
            options.vue.data.Darxeal = Darxeal;
    
            function waitForVueToStart() {
                if (typeof Vue === "undefined") setTimeout(waitForVueToStart, 50); else main();
            }
            waitForVueToStart();
    
            function main() {
                app = new Vue(options.vue);
            }
        } catch (error) {
            console.error(error);
        }
    },
    randomChoice: function(array) {
        return array[Math.floor((Math.random()*array.length))];
    },
    sleep: function (ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    get: async function(screen, options) {
        return new Promise((resolve, reject) => {
            TribalWars.get(screen, options, response => resolve(response), () => {resolve(Darxeal.error)});
        });
    },
    post: async function(screen, options, moreOptions) {
        return new Promise((resolve, reject) => {
            TribalWars.post(screen, options, moreOptions, response => resolve(response), () => {resolve(Darxeal.error)});
        });
    },
    sendCommand: async function(targetX, targetY, sourceVillageID, troops, commandType, catapultTarget=null, train=null) {
        let options = $.extend({x: targetX, y: targetY, source_village: sourceVillageID}, troops);
        if (catapultTarget) options.building = catapultTarget;
        if (train) options.train = train;
        options[commandType] = 1;
        let response = await Darxeal.post("place", {ajax: "confirm"}, options);
        if (!response.dialog)
            return response;
        options["ch"] = $(response.dialog).find("input[name='ch']").val();
        return await Darxeal.post("place", {ajaxaction: "popup_command"}, options);
    },
    unitsHome: async function(villageID) {
        return await Darxeal.get("place", {ajax: "home_units", village: villageID});
    },
    unitsInfo: async function() {
        return await Darxeal.get("unit_info", {ajax: "data"});
    },
    build: async function(villageID, building) {
        return await Darxeal.post("main", {ajaxaction: "upgrade_building", type: "main"}, {
            id: building,
            source: villageID
        });
    },
    train: async function(villageID, units) {
        return await Darxeal.post("train", {ajaxaction: "train", mode: "train", village: villageID}, {
            units: units
        });
    },
    research: async function(villageID, unit) {
        return await Darxeal.post("smith", {ajaxaction: "research"}, {
            tech_id: unit,
            source: villageID
        });
    },
    mint: async function (villageID, count) {
        return await Darxeal.post("snob", {action: "coin", village: villageID}, {count: count});
    },
    commandIDs: async function(villageID) {
        let response = await $.get("game.php", {village: villageID, screen: "overview"});

        let result = [];
        $(response).find(".quickedit-out").each((i, el) => {result.push($(el).data("id"))});
        return result;
    },
    commandDetails: async function(commandID) {
        return await Darxeal.get("info_command", {ajax: "details", id: commandID});
    },
    commandInfos: async function(villageID) {
        let commands = await Darxeal.commandIDs(villageID);
        let promises = commands.map(async command => {
            return Darxeal.commandDetails(command);
        });
        return await Promise.all(promises);
    },
    allVillageIDs: async function() {
        let response = await $.get("game.php", {screen:"overview_villages", mode: "combined"});
        let result = [];
        $(response).find(".quickedit-vn").each((i, el) => result.push($(el).data("id")));
        return result;
    },
    groups: async function() {
        return await Darxeal.get("groups", {ajax: "load_group_menu"});
    },
    mapSector: async function() {
        let sectors = {};
        for (let x = 300; x < 700; x+=20) {
            for (let y = 300; y < 700; y+=20) {
                sectors[x + "_" + y] = 1;
            }
        }
        let response = await $.get("map.php", sectors);
    },
    zeropad: function(number, digits) {
        return Array(Math.max(digits - String(number).length + 1, 0)).join(0) + number;
    },
    timeString: function(seconds) {
        return getTimeString(seconds);
    },
    dateTimeString: function(date) {
        var dateString;
        var today = new Date();
        var tomorrow = new Date();
        tomorrow.setDate(today.getDate()+1);
    
        if (date.getDate() == today.getDate())
            dateString = "dnes";
        else if (date.getDate() == tomorrow.getDate())
            dateString = "zítra";
        else
            dateString = date.toLocaleDateString();
        return `<i>${dateString}</i> ${date.toString().substr(16, 8)}<span class='grey small'>:${Darxeal.zeropad(date.getMilliseconds(), 3)}</span>`;
    },
    buildingNames: {
        main: "Hlavní budova",
        barracks: "Kasárna",
        stable: "Stáj",
        smith: "Kovárna",
        place: "Nádvoří",
        statue: "Socha",
        market: "Tržiště",
        wood: "Dřevorubec",
        stone: "Lom na těžbu hlíny",
        iron: "Železný důl",
        garage: "Dílna",
        snob: "Panský dvůr",
        farm: "Selský dvůr",
        storage: "Skladiště",
        hide: "Skrýš",
        wall: "Hradby",
        church: "Kostel",
        church_f: "První kostel",
        university: "Univerzita",
        watchtower: "Strážní věž"
    },
    error: "Nothing yet",
    interceptErrorMessage: function() {
        var originalHandler = UI.ErrorMessage;
        UI.ErrorMessage = function(t, e, i) {
            Darxeal.error = t;
            originalHandler(t, e, i);
        };
    }
}